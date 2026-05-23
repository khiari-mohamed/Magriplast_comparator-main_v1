from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.job import Job, JobStatus, GlobalVerdict
from app.models.document import Document, DocumentType
from app.models.match_result import MatchResult
from app.models.audit_log import AuditLog
from app.workers.pipeline import process_document_pipeline
from app.services.renormalize_service import renormalize_saved_job
from app.services.reference_aliases import (
    approve_reference_alias,
    choose_supplier_alias_key,
)
from app.utils.fuzzy import normalize_ref

router = APIRouter(tags=["admin"])


class ReviewDecision(BaseModel):
    reviewer_id: str
    approved: bool
    notes: Optional[str] = None
    corrected_doc_type: Optional[str] = None  # For page re-classification


class ReferenceAliasApproval(BaseModel):
    reviewer_id: str
    external_ref: str
    internal_ref: str
    supplier_name: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/jobs/{job_id}/review")
async def submit_review(
    job_id: str,
    decision: ReviewDecision,
    db: AsyncSession = Depends(get_db),
):
    """
    Human review endpoint.
    Called by accounting team to approve/reject a flagged job.
    All decisions are written to the immutable audit log.
    """
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status not in (JobStatus.REVIEW_REQUIRED, JobStatus.FAILED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job status is {job.status} — review not applicable",
        )

    audit_entry = AuditLog(
        job_id=job_id,
        event_type="HUMAN_REVIEW_COMPLETED",
        event_data={
            "reviewer_id": decision.reviewer_id,
            "approved": decision.approved,
            "notes": decision.notes,
            "corrected_doc_type": decision.corrected_doc_type,
            "previous_status": job.status,
            "previous_verdict": job.verdict,
        },
        actor=decision.reviewer_id,
    )
    db.add(audit_entry)
    if decision.approved:
        job.status = JobStatus.COMPLETED
        job.verdict = GlobalVerdict.VALIDATED
    else:
        job.status = JobStatus.FAILED
        job.verdict = GlobalVerdict.REJECTED

    await db.commit()

    return {
        "job_id": job_id,
        "new_status": job.status,
        "new_verdict": job.verdict,
        "reviewed_by": decision.reviewer_id,
        "message": "Review decision recorded",
    }


def _alias_payload_matches_line(line: dict, external_ref: str, internal_ref: str) -> bool:
    external_norm = normalize_ref(external_ref)
    internal_norm = normalize_ref(internal_ref)
    line_external = line.get("ref_produit_facture") or line.get("ref_produit_bl")
    return (
        normalize_ref(line.get("ref_produit") or "") == internal_norm
        and normalize_ref(line_external or "") == external_norm
    )


def _line_is_safe_alias_candidate(line: dict) -> bool:
    if line.get("verdict") not in {"LOW_CONFIDENCE", "PARTIAL_MATCH", "MATCH"}:
        return False
    if line.get("mismatch_fields"):
        return False
    if not (line.get("ref_produit") and (line.get("ref_produit_facture") or line.get("ref_produit_bl"))):
        return False

    # Persistent aliases must be learned only from lines where business values
    # corroborate the reference relationship. This prevents a weak textual match
    # from becoming a permanent supplier mapping.
    if line.get("ref_produit_facture"):
        qty_bc = line.get("qty_bc")
        qty_facture = line.get("qty_facture")
        price_bc = line.get("prix_bc")
        price_facture = line.get("prix_facture")
        if qty_bc is None or qty_facture is None or float(qty_bc) != float(qty_facture):
            return False
        if price_bc is None or price_facture is None:
            return False
        return abs(float(price_bc) - float(price_facture)) <= 0.100

    return line.get("qty_bc") is not None and line.get("qty_bl") is not None


@router.post("/jobs/{job_id}/reference-aliases", status_code=status.HTTP_201_CREATED)
async def approve_job_reference_alias(
    job_id: str,
    approval: ReferenceAliasApproval,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a supplier-specific reference alias from a human review.

    The alias is used only for future matching; extracted document references
    remain unchanged for auditability.
    """
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    match_result = (
        await db.execute(select(MatchResult).where(MatchResult.job_id == job_id))
    ).scalar_one_or_none()
    if not match_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job has no match result to approve aliases from",
        )

    source_line = None
    for line in match_result.line_verdicts or []:
        if _alias_payload_matches_line(line, approval.external_ref, approval.internal_ref):
            source_line = line
            break

    if source_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No comparison line matches the requested alias pair",
        )
    if not _line_is_safe_alias_candidate(source_line):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Alias approval is allowed only for safe reference-only matches "
                "with no price, quantity, or TVA mismatch"
            ),
        )

    docs = (
        await db.execute(select(Document).where(Document.job_id == job_id))
    ).scalars().all()
    supplier_doc = next(
        (doc for doc in docs if doc.doc_type == DocumentType.FACTURE),
        None,
    ) or next((doc for doc in docs if doc.doc_type == DocumentType.BL), None)

    supplier_name = (
        approval.supplier_name
        or (supplier_doc.supplier_name_raw if supplier_doc else None)
    )
    supplier_id = supplier_doc.supplier_id if supplier_doc else None
    supplier_key = choose_supplier_alias_key(
        supplier_id=supplier_id,
        supplier_name=supplier_name,
    )
    if not supplier_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot approve alias without a supplier identity",
        )

    try:
        alias, created = await approve_reference_alias(
            db,
            supplier_id=supplier_id,
            supplier_key=supplier_key,
            supplier_name=supplier_name,
            external_ref=approval.external_ref,
            internal_ref=approval.internal_ref,
            approved_by=approval.reviewer_id,
            source_job_id=job_id,
            source_line=source_line,
            description=source_line.get("designation"),
            notes=approval.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    db.add(AuditLog(
        job_id=job_id,
        event_type="REFERENCE_ALIAS_APPROVED",
        event_data={
            "alias_id": alias.id,
            "created": created,
            "supplier_key": supplier_key,
            "supplier_name": supplier_name,
            "external_ref": approval.external_ref,
            "internal_ref": approval.internal_ref,
            "source_verdict": source_line.get("verdict"),
        },
        actor=approval.reviewer_id,
    ))
    await db.commit()
    await db.refresh(alias)

    return {
        "id": alias.id,
        "created": created,
        "supplier_key": alias.supplier_key,
        "supplier_name": alias.supplier_name,
        "external_ref": alias.external_ref,
        "internal_ref": alias.internal_ref,
        "message": "Reference alias approved",
    }


@router.post("/jobs/{job_id}/renormalize")
async def renormalize_job_designations(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Re-apply word_dictionary corrections to all line items of a saved job.

    Use this after adding new entries to word_dictionary to update already-processed
    documents without reprocessing the PDF.
    """
    result = await db.execute(select(Job).where(Job.id == job_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    report = await renormalize_saved_job(job_id, db)
    return report


@router.get("/jobs/{job_id}/audit")
async def get_audit_trail(job_id: str, db: AsyncSession = Depends(get_db)):
    """Return the full immutable audit log for a job."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.job_id == job_id)
        .order_by(AuditLog.created_at.asc())
    )
    logs = result.scalars().all()

    if not logs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No audit logs found")

    return {
        "job_id": job_id,
        "audit_trail": [
            {
                "event_type": log.event_type,
                "actor": log.actor,
                "timestamp": log.created_at.isoformat(),
                "data": log.event_data,
            }
            for log in logs
        ],
    }

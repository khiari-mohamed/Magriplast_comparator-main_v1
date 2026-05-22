import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Float, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class SupplierProfile(Base):
    __tablename__ = "supplier_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Short unique code e.g. "TEG", "BOUDRANT", "MONDIAL" — auto-generated if not set
    supplier_code: Mapped[str] = mapped_column(String(50), nullable=True, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False, unique=True, index=True)
    siret: Mapped[str] = mapped_column(String(14), nullable=True, unique=True, index=True)
    vat_number: Mapped[str] = mapped_column(String(50), nullable=True)
    name_aliases: Mapped[list] = mapped_column(JSONB, default=list)
    field_aliases: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Number format: "fr" (1 200,50) or "en" (1,200.50) or "bare" (1200.50)
    number_locale: Mapped[str] = mapped_column(String(10), default="fr")

    # Date format string: "%d/%m/%Y"
    date_format: Mapped[str] = mapped_column(String(30), default="%d/%m/%Y")
    price_tolerance: Mapped[float] = mapped_column(Float, nullable=True)
    quantity_tolerance: Mapped[float] = mapped_column(Float, nullable=True)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_by: Mapped[str] = mapped_column(String(255), nullable=True)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Dynamic profile fields (populated by SupplierProfileDetector) ──────────

    # JSON array of regex strings for product reference patterns, e.g. ["P\\d{9}", "NPC\\d{2}-\\d{2}"]
    ref_patterns: Mapped[list] = mapped_column(JSONB, default=list)

    # JSON: {"BC": {"columns": [...]}, "BL": {...}, "FACTURE": {...}}
    # Each column entry: {"name": "ref_produit", "header_aliases": [...], "x_min": 0.0, "x_max": 0.2}
    column_layout: Mapped[dict] = mapped_column(JSONB, default=dict)

    # JSON array of {raw, canonical, category} known product mappings
    known_products: Mapped[list] = mapped_column(JSONB, default=list)

    # JSON dict of bad→good OCR correction pairs specific to this supplier
    ocr_corrections: Mapped[dict] = mapped_column(JSONB, default=dict)

    # JSON array of keywords that signal this supplier's documents
    doc_type_keywords: Mapped[list] = mapped_column(JSONB, default=list)

    # Confidence in this profile's data (rises as more documents are processed)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)

    # True when the profile was created automatically by SupplierProfileDetector
    auto_detected: Mapped[bool] = mapped_column(Boolean, default=False)

    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    documents: Mapped[list["Document"]] = relationship("Document", back_populates="supplier")
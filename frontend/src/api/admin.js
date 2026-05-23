import client from "./client";

/**
 * Submit a human review decision.
 * approved: true = mark VALIDATED, false = mark REJECTED
 */
export async function submitReview(jobId, { reviewerId, approved, notes }) {
  const response = await client.patch(`/jobs/${jobId}/review`, {
    reviewer_id: reviewerId,
    approved,
    notes,
  });
  return response.data;
}

export async function approveReferenceAlias(
  jobId,
  { reviewerId, externalRef, internalRef, supplierName, notes }
) {
  const response = await client.post(`/jobs/${jobId}/reference-aliases`, {
    reviewer_id: reviewerId,
    external_ref: externalRef,
    internal_ref: internalRef,
    supplier_name: supplierName,
    notes,
  });
  return response.data;
}

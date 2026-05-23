import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useJobResults } from "../hooks/useJobResults";
import { approveReferenceAlias, submitReview } from "../api/admin";
import PageWrapper from "../components/layout/PageWrapper";
import VerdictBanner from "../components/results/VerdictBanner";
import DocumentSummary from "../components/results/DocumentSummary";
import LineItemTable from "../components/results/LineItemTable";
import Spinner from "../components/ui/Spinner";
import Alert from "../components/ui/Alert";
import { CheckCircle, XCircle, ArrowLeft } from "lucide-react";

export default function ReviewPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { results, loading, error } = useJobResults(jobId);

  const [reviewerId, setReviewerId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [aliasSaving, setAliasSaving] = useState({});
  const [aliasSaved, setAliasSaved] = useState({});

  const handleSubmit = async (approved) => {
    if (!reviewerId.trim()) {
      setSubmitError("Please enter your name or reviewer ID.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitReview(jobId, { reviewerId, approved, notes });
      setSubmitted(true);
      setTimeout(() => navigate(`/results/${jobId}`), 1500);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const supplierName =
    results?.documents?.find((doc) => doc.doc_type === "FACTURE")?.supplier_name ||
    results?.documents?.find((doc) => doc.doc_type === "BL")?.supplier_name ||
    null;

  const aliasCandidates = (results?.match_result?.line_verdicts || []).filter((line) => {
    const externalRef = line.ref_produit_facture || line.ref_produit_bl;
    const internalRef = line.ref_produit;
    const qtyMatches =
      line.qty_bc != null &&
      (line.ref_produit_facture ? line.qty_facture != null : line.qty_bl != null) &&
      Number(line.qty_bc) === Number(line.ref_produit_facture ? line.qty_facture : line.qty_bl);
    const invoicePriceMatches =
      line.ref_produit_facture &&
      line.prix_bc != null &&
      line.prix_facture != null &&
      Math.abs(Number(line.prix_bc) - Number(line.prix_facture)) <= 0.100;
    return (
      externalRef &&
      internalRef &&
      externalRef !== internalRef &&
      ["LOW_CONFIDENCE", "PARTIAL_MATCH", "MATCH"].includes(line.verdict) &&
      (!line.mismatch_fields || line.mismatch_fields.length === 0) &&
      !line.reference_alias_applied &&
      (line.ref_produit_facture ? (qtyMatches && invoicePriceMatches) : qtyMatches)
    );
  });

  const handleApproveAlias = async (line) => {
    if (!reviewerId.trim()) {
      setSubmitError("Please enter your name or reviewer ID before approving an alias.");
      return;
    }

    const externalRef = line.ref_produit_facture || line.ref_produit_bl;
    const internalRef = line.ref_produit;
    const key = `${externalRef}:${internalRef}`;

    setAliasSaving((prev) => ({ ...prev, [key]: true }));
    setSubmitError(null);
    try {
      await approveReferenceAlias(jobId, {
        reviewerId,
        externalRef,
        internalRef,
        supplierName,
        notes: notes || undefined,
      });
      setAliasSaved((prev) => ({ ...prev, [key]: true }));
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setAliasSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <PageWrapper title="Loading…">
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Error">
        <Alert variant="error">{error}</Alert>
      </PageWrapper>
    );
  }

  if (!results) return null;

  if (submitted) {
    return (
      <PageWrapper title="Review Submitted">
        <Alert variant="success" title="Decision recorded">
          Your review has been saved to the audit log. Redirecting…
        </Alert>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Human Review"
      subtitle="Review the extracted data and matching results, then approve or reject."
    >
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate(`/results/${jobId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Back to results
        </button>

        {/* Verdict */}
        <VerdictBanner
          verdict={results.verdict}
          matchResult={results.match_result}
        />

        {/* Documents */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.documents?.map((doc, i) => (
            <DocumentSummary key={i} document={doc} />
          ))}
        </div>

        {/* Line table */}
        {results.match_result?.line_verdicts?.length > 0 && (
          <LineItemTable lineVerdicts={results.match_result.line_verdicts} />
        )}

        {aliasCandidates.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Aliases de references a memoriser
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-semibold">Ref fournisseur</th>
                    <th className="text-left py-2 pr-4 font-semibold">Ref interne</th>
                    <th className="text-left py-2 pr-4 font-semibold">Designation</th>
                    <th className="text-right py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {aliasCandidates.map((line) => {
                    const externalRef = line.ref_produit_facture || line.ref_produit_bl;
                    const internalRef = line.ref_produit;
                    const key = `${externalRef}:${internalRef}`;
                    const saved = aliasSaved[key];
                    return (
                      <tr key={key}>
                        <td className="py-3 pr-4 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {externalRef}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {internalRef}
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-500 max-w-[340px] truncate">
                          {line.designation || "-"}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleApproveAlias(line)}
                            disabled={saved || aliasSaving[key]}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
                          >
                            {aliasSaving[key] ? <Spinner size="sm" /> : <CheckCircle size={14} />}
                            {saved ? "Enregistre" : "Approuver alias"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Review form */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Submit Review Decision
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your name / Reviewer ID *
              </label>
              <input
                type="text"
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                placeholder="e.g. Ahmed Benali"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any comments about this decision…"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {submitError && (
              <Alert variant="error">{submitError}</Alert>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleSubmit(true)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {submitting ? <Spinner size="sm" /> : <CheckCircle size={18} />}
                Approve
              </button>

              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {submitting ? <Spinner size="sm" /> : <XCircle size={18} />}
                Reject
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              This decision is permanent and will be recorded in the immutable audit log.
            </p>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

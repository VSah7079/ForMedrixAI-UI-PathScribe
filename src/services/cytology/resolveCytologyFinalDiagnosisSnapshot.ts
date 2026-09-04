// src/services/cytology/resolveCytologyFinalDiagnosisSnapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for building a CytologyFinalDiagnosisSelection
// snapshot (types/case/Specimen.ts) from a chosen CytologyReviewRecord.
// Real, per direct guidance: "the ability to select one of the reviews
// on record and select that review to be the Final Diagnosis for the
// report." This is the real, shared lookup every future real caller
// should use, rather than re-implementing the field copy.
//
// Deliberately a pure function — it does not persist anything itself.
// The real caller decides when to build this snapshot and when to
// write it onto CytologyScreeningRecord.finalDiagnosis, including who
// made the selection and when.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyFinalDiagnosisSelection } from '@/types/case/Specimen';

/**
 * Builds the real Final Diagnosis snapshot from a chosen
 * CytologyReviewRecord. Deliberately does NOT set selectedBy/
 * selectedByName/selectedAt — those describe who is making THIS
 * selection right now, which this pure function has no way to know;
 * the real caller adds them before persisting. Real, per direct
 * UI-review follow-up: the full, real per-selection comments are
 * carried into the snapshot too — a report-facing Final Diagnosis
 * should show the same real content the underlying review recorded,
 * not a stripped-down copy.
 */
export function resolveCytologyFinalDiagnosisSnapshot(
  reviewRecord: CytologyReviewRecord,
): Omit<CytologyFinalDiagnosisSelection, 'selectedBy' | 'selectedByName' | 'selectedAt'> {
  return {
    reviewRecordId: reviewRecord.id,
    primaryInterpretationId: reviewRecord.primaryInterpretationId,
    primaryInterpretationComment: reviewRecord.primaryInterpretationComment,
    additionalInterpretations: reviewRecord.additionalInterpretations,
    recommendations: reviewRecord.recommendations,
    adequacySelections: reviewRecord.adequacySelections,
    generalCategorizationId: reviewRecord.generalCategorizationId,
  };
}

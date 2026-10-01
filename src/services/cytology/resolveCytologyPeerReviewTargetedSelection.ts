// src/services/cytology/resolveCytologyPeerReviewTargetedSelection.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "CAP mandates secondary review for
// specific high-risk categories (e.g., initial cancer diagnoses,
// frozen section concordances) alongside routine representative
// sampling." Real, deliberate reuse of this module's own established
// diagnosticRank severity axis (same threshold as
// resolveCytologyFiveYearRetrospectiveLookback.ts's own HSIL/AIS/
// malignancy trigger) rather than a second, differently-drawn line —
// "initial cancer diagnoses" is the same real severity tier this
// module already treats as its own high-grade threshold elsewhere.
//
// Real, deliberate pure-function shape: the real caller supplies the
// signed-out diagnosis's own resolved diagnosticRank — this function
// only decides whether that rank clears the real targeting bar.
// ─────────────────────────────────────────────────────────────────────────────

const PEER_REVIEW_TARGETED_TRIGGER_RANK = 4;

export function resolveCytologyPeerReviewTargetedSelection(signedOutDiagnosticRank: number | undefined): boolean {
  if (signedOutDiagnosticRank === undefined) return false;
  return signedOutDiagnosticRank >= PEER_REVIEW_TARGETED_TRIGGER_RANK;
}

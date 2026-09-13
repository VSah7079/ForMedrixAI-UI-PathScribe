// src/services/cytology/resolveCytologyFiveYearRetrospectiveLookback.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per CAP's own mandatory requirement (CYT-QA-03, from direct
// guidance's own supplied QA report specification): "Retrospective
// 5-year lookback of negative cytology history whenever a patient
// receives a new diagnosis of HSIL, AIS, or Malignancy." Real,
// deliberate scope match to that exact language — this triggers on
// HSIL/AIS/malignancy specifically (diagnosticRank >= 4, this
// module's own established severity axis), not on ASC-H/AGC-NOS
// (rank 3), which the given specification's own wording does not
// include.
//
// Real, deliberate pure-function shape, same posture as
// resolvePriorAbnormalPapFactor.ts: the real caller is responsible
// for gathering this patient's own prior reviews across their other
// cases (the same real cross-case lookup pattern
// resolveCytologyHighRiskFactorsForCase.ts already uses) — this
// function only decides which of the reviews it's given should be
// flagged, given a real triggering diagnosis and its own real date.
//
// "Negative/benign" is matched exactly to diagnosticRank === 0
// (real, true NILM-tier) — not "anything less severe than the new
// diagnosis," since a prior ASC-US or LSIL call was never negative in
// the first place and belongs to a real, different QA mechanism
// (this module's own existing cyto-histo correlation work), not this
// one.
// ─────────────────────────────────────────────────────────────────────────────

const RETROSPECTIVE_LOOKBACK_TRIGGER_RANK = 4;
const NEGATIVE_DIAGNOSTIC_RANK = 0;

export interface CytologyPriorNegativeReviewForLookback {
  reviewId: string;
  caseId: string;
  specimenId: string;
  recordedAt: string;
}

export function resolveCytologyFiveYearRetrospectiveLookback(
  triggeringDiagnosticRank: number | undefined,
  priorReviews: { id: string; caseId: string; specimenId: string; recordedAt: string; diagnosticRank: number | undefined }[],
  triggeringDate: Date,
  lookbackYears = 5,
): CytologyPriorNegativeReviewForLookback[] {
  if (triggeringDiagnosticRank === undefined || triggeringDiagnosticRank < RETROSPECTIVE_LOOKBACK_TRIGGER_RANK) {
    return [];
  }

  const cutoff = new Date(triggeringDate);
  cutoff.setFullYear(cutoff.getFullYear() - lookbackYears);

  return priorReviews
    .filter(r => r.diagnosticRank === NEGATIVE_DIAGNOSTIC_RANK && new Date(r.recordedAt) >= cutoff)
    .map(r => ({ reviewId: r.id, caseId: r.caseId, specimenId: r.specimenId, recordedAt: r.recordedAt }));
}

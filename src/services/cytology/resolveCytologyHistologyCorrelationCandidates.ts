// src/services/cytology/resolveCytologyHistologyCorrelationCandidates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: work CYT-QA-04 (Cyto-Histologic Correlation
// and Discrepancy Matrix). Real investigation before building anything:
// surgical pathology's own diagnosis (Case.diagnostic.primaryDiagnosis,
// types/case/Case.ts) is free text, not a structured, ranked category
// system the way cytology's own diagnosticRank is — there is no
// automatic way to compute a comparable severity score from it, and no
// clean, structured "this specimen is a cervical biopsy" signal either
// (SpecimenEntry.type carries organ/tissue values inconsistently, not
// a reliable modality flag). A fully automatic correlation is
// therefore not honestly buildable today without a real data-model
// change to a different module (surgical pathology itself) — not
// attempted here.
//
// What IS honestly automatable: finding WHICH cytology findings should
// be checked for a possible correlation, and WHICH of a patient's
// other real cases are plausible candidates to check against — real,
// mechanical case-selection, leaving the actual diagnosis comparison
// and outcome classification to a real human reviewer, who records it
// via the already-existing, already-seeded "Cytology-Histology
// Correlation" QaActivityType (qa-activity-cyto-histo,
// services/quality/mockQaActivityTypeService.ts) once this candidate
// surfaces it. This mirrors the same real "automate the disciplined,
// mechanical part; never fake the analytical part" boundary already
// drawn elsewhere in this module (Phase 55's own honest split for
// prior cervical procedure history).
//
// Real, deliberate trigger threshold: diagnosticRank >= 1 (ASC-US or
// worse) — CAP's own real requirement is correlation for abnormal
// cytology generally, not only HSIL+ (PPV_HSIL is one real metric
// this data eventually supports, not the only real trigger for
// collecting it).
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyHistologyCorrelationCandidate {
  cytologyCaseId: string;
  cytologySpecimenId: string;
  cytologyReviewId: string;
  /** Real, honest label: a plausible subsequent case for this same
   *  patient, not a confirmed cervical biopsy — a real human reviewer
   *  confirms relevance before recording an actual correlation. */
  candidateCaseId: string;
}

export function resolveCytologyHistologyCorrelationCandidates(
  abnormalCytologyReviews: { id: string; caseId: string; specimenId: string; diagnosticRank: number | undefined; recordedAt: string }[],
  otherPatientCases: { caseId: string; hasNonCytologySpecimen: boolean; earliestSpecimenReceivedAt: string | undefined }[],
  windowDays = 180,
): CytologyHistologyCorrelationCandidate[] {
  const candidates: CytologyHistologyCorrelationCandidate[] = [];

  for (const review of abnormalCytologyReviews) {
    if (review.diagnosticRank === undefined || review.diagnosticRank < 1) continue;

    const cytoDate = new Date(review.recordedAt);
    const windowEnd = new Date(cytoDate);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    for (const otherCase of otherPatientCases) {
      if (!otherCase.hasNonCytologySpecimen || !otherCase.earliestSpecimenReceivedAt) continue;
      const otherDate = new Date(otherCase.earliestSpecimenReceivedAt);
      if (otherDate >= cytoDate && otherDate <= windowEnd) {
        candidates.push({
          cytologyCaseId: review.caseId,
          cytologySpecimenId: review.specimenId,
          cytologyReviewId: review.id,
          candidateCaseId: otherCase.caseId,
        });
      }
    }
  }

  return candidates;
}

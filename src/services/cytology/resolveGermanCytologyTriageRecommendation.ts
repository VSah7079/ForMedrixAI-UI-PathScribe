// src/services/cytology/resolveGermanCytologyTriageRecommendation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own German G-BA triage rules: "If HPV+
// but Pap I/II-a, repeat co-testing after 12 months. If Pap IIID1 or
// higher, prompt secondary triage (colposcopy) is triggered." Real,
// additive suggestion only — same real posture as this module's own
// TBS cross-mapping and QC-suggestion work elsewhere: this never
// forces a recommendation onto a review; the real reviewer still
// selects recommendations themselves. Real, deliberate precedence:
// the colposcopy rule is checked first, since a real IIID1+ finding
// is the more urgent, escalating recommendation and should never be
// silently superseded by the milder 12-month recheck rule even if a
// real hrHPV-positive result also happens to be on file.
//
// Real, confirmed rank boundary (mockCytologyCategoryService.ts):
// Pap I / Pap IIa = diagnosticRank 0; Pap IIID1 = diagnosticRank 2 —
// "IIID1 or higher" is therefore rank >= 2 on this dictionary's own
// real, researched scale (PS-182).
// ─────────────────────────────────────────────────────────────────────────────

export function resolveGermanCytologyTriageRecommendation(
  hpvResult: string | undefined,
  primaryInterpretationDiagnosticRank: number | undefined,
): 'mn3-rec-colposcopy-biopsy' | 'mn3-rec-cotest-12mo' | undefined {
  const rank = primaryInterpretationDiagnosticRank ?? 0;

  if (rank >= 2) return 'mn3-rec-colposcopy-biopsy';
  if (hpvResult === 'Positive' && rank === 0) return 'mn3-rec-cotest-12mo';
  return undefined;
}

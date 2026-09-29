// src/services/validationStudies/computeValidationStudyGrade.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// this grading rule used to live directly inside
// ValidationStudiesSection.tsx (as a local, unexported gradeResult()),
// with no backing service and no tests, even though its output —
// persisted as ValidationStudy.finalGrade the first time a report is
// generated — is real, regulatory-relevant evidence:
// resolveClientAiModel.ts/resolveVoiceAiModel.ts both gate whether an
// AI model is eligible for production use at a client specifically on
// finalGrade === 'PASS'. A grading bug here could silently let an AI
// model into (or keep it out of) production use it shouldn't have.
// Extracted here, unchanged behavior, now with real test coverage.
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStudyGrade = 'PASS' | 'CONDITIONAL PASS' | 'FURTHER REVIEW';

export interface ValidationStudyGradeResult {
  grade: ValidationStudyGrade;
  color: string;
  /** Feeds only the printed/exported validation report and the
   *  persisted ValidationStudy.finalGrade — never rendered as
   *  on-screen UI chrome — so, per this codebase's established
   *  "exported/persisted data stays English" convention (the same
   *  one CSV export headers and audit-log text follow), it stays a
   *  plain English string rather than a translation key. */
  description: string;
}

/**
 * The real PASS / CONDITIONAL PASS / FURTHER REVIEW grading rule for a
 * validation study's parallel-run results:
 *  - PASS: acceptance rate meets its target AND edit ratio stays at or
 *    under its target ceiling.
 *  - CONDITIONAL PASS: acceptance rate reaches at least 85% of its
 *    target, even if the full PASS bar (both conditions) isn't met.
 *  - FURTHER REVIEW: neither of the above.
 */
export function computeValidationStudyGrade(
  acceptanceRate: number,
  targetAcceptanceRate: number,
  editRatio: number,
  targetMaxEditRatio: number,
): ValidationStudyGradeResult {
  const passes = acceptanceRate >= targetAcceptanceRate && editRatio <= targetMaxEditRatio;
  const partial = acceptanceRate >= targetAcceptanceRate * 0.85;
  if (passes)  return { grade: 'PASS',             color: '#10b981', description: 'Performance meets study targets' };
  if (partial) return { grade: 'CONDITIONAL PASS', color: '#f59e0b', description: 'Performance approaches targets — extended study recommended' };
  return        { grade: 'FURTHER REVIEW',         color: '#ef4444', description: 'Performance below targets — review AI configuration' };
}

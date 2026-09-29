// src/services/validationStudies/resolveActiveStudyId.ts
// ─────────────────────────────────────────────────────────────────────────────
// The active Validation Study (if any) whose scope covers a case, resolved at
// the moment a learning signal is captured. Study membership is evaluated
// per case at capture time, never stored ahead of time.
//
// Shared by both Level 1 AI-learning captures in useSignOutWorkflow.ts, so they
// can't disagree on which study a case belongs to:
//   - narrative-edit signals (services/narrativeSignals/), at finalization;
//   - abnormal-detection agreement signals (services/abnormalDetection/,
//     PS-137), when the pathologist confirms or dismisses a flagged finding.
// Extracted in Batch 318 from the inline lookup the narrative capture had.
// ─────────────────────────────────────────────────────────────────────────────

import type { IValidationStudyService } from './IValidationStudyService';

export interface StudyScope {
  /** The ordering facility (case.order.facilityId). */
  clientId: string;
  /** The signing pathologist. */
  pathologistId: string;
  subspecialtyId?: string;
}

/** The covering study's id, or undefined when no active study covers the
 *  case. A failed lookup also gives undefined (the signal still records,
 *  just without a study), and is logged: a missing studyId must never block
 *  or lose the signal itself. */
export async function resolveActiveStudyId(
  scope: StudyScope,
  studyService: Pick<IValidationStudyService, 'getStudyForCase'>,
): Promise<string | undefined> {
  try {
    const result = await studyService.getStudyForCase(scope.clientId, scope.pathologistId, scope.subspecialtyId);
    return result.ok && result.data ? result.data.id : undefined;
  } catch (e) {
    console.error('[ValidationStudy] Study lookup failed; signals will record without a studyId:', e);
    return undefined;
  }
}

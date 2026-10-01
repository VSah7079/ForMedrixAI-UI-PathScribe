// src/services/cytology/ICytologyReviewRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real CRUD for CytologyReviewRecord. Real, per direct correction to an
// earlier "always written, never edited" design (which mirrored
// IQaActivityRecordService's own posture): "a User may edit their own
// review, but no one elses. This way you can safely tie a review to a
// Cytotech." A review IS editable — but only by the person who
// recorded it. Enforced HERE, at the service layer, not left as a
// UI-only convention: attribution integrity (safely tying a review to
// a specific Cytotech) is exactly what this restriction protects, so
// it needs to hold even if a caller bypasses the real capture UI.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

export interface ICytologyReviewRecordService {
  /** Real, per direct guidance's own QA aggregate-reporting work: a
   *  real, bulk-fetch method — the three real, standard QA reports
   *  (resolveCytologyQaReports.ts) need every real review on file to
   *  pair across specimens, and getBySpecimenId/getByCaseId alone
   *  can't support that without an awkward, inefficient per-case
   *  fetch loop. Matches this app's own established pattern
   *  (qaActivityRecordService.getAll() and others already do this). */
  getAll(): Promise<ServiceResult<CytologyReviewRecord[]>>;
  getBySpecimenId(specimenId: string): Promise<ServiceResult<CytologyReviewRecord[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CytologyReviewRecord[]>>;
  create(record: Omit<CytologyReviewRecord, 'id' | 'recordedAt' | 'updatedAt'>): Promise<ServiceResult<CytologyReviewRecord>>;
  /**
   * Real, per direct correction: edits are restricted to the review's
   * own author. `requestingUserId` must match the existing record's
   * `recordedBy.userId`, or this fails — never silently allowed for
   * anyone else, and never bypassable by omitting the check. Real,
   * deliberate exclusions from `changes`: `id`, `recordedBy`,
   * `recordedAt`, `specimenId`, `caseId`, and `role` are never
   * editable — recordedBy in particular must stay fixed, since it's
   * literally what this whole permission model is enforced against;
   * allowing it to change would let someone reassign authorship of an
   * existing review to themselves.
   */
  update(
    id: string,
    requestingUserId: string,
    changes: Partial<Pick<CytologyReviewRecord,
      | 'adequacySelections' | 'generalCategorizationId'
      | 'primaryInterpretationId' | 'primaryInterpretationComment' | 'additionalInterpretations' | 'recommendations'
      | 'requiresPathologistReview' | 'notes' | 'cisoeAScore' | 'synopticData'
    >>,
  ): Promise<ServiceResult<CytologyReviewRecord>>;
}

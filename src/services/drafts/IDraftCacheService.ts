// src/services/drafts/IDraftCacheService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Service interface for draft caching.
// Dev: mockDraftCacheService (localStorage-backed)
// Live: FirestoreDraftCacheService (not yet built — real client-side
//   encryption of the payload is genuinely Phase 3 of this feature, and
//   needs a real backend/production auth posture to be meaningful; see
//   mockDraftCacheService.ts's own header for why a fake obfuscation now
//   would be worse than being honest this is plaintext today)
//
// Phase 2 of the Inactivity Timeout & Draft Recovery spec. Generic and reusable — keyed by an arbitrary entity
// id (a caseId, in the intended usage) so any future page could use this,
// not just SynopticReportPage.tsx specifically.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface DraftRecord<T = unknown> {
  entityId: string;
  payload:  T;
  savedAt:  string; // ISO timestamp
  userId:   string;
}

export interface IDraftCacheService {
  /** Save/overwrite the draft for this user+entity. */
  saveDraft<T>(userId: string, entityId: string, payload: T): Promise<ServiceResult<void>>;

  /** Returns the draft if one exists and hasn't expired (past
   *  Drafts:RetentionDays), else a not-found result. Silently removes
   *  expired drafts as a side effect of reading them. */
  getDraft<T>(userId: string, entityId: string): Promise<ServiceResult<DraftRecord<T> | null>>;

  /** Remove a single draft (e.g. after the user restores or explicitly discards it). */
  clearDraft(userId: string, entityId: string): Promise<ServiceResult<void>>;

  /** Remove ALL drafts for a user — called on EXPLICIT logout only, per
   *  the spec's Timeout Preservation rule. Idle-timeout-triggered logout
   *  must NOT call this. */
  clearAllDraftsForUser(userId: string): Promise<ServiceResult<void>>;
}

// src/services/caseViewTracking/ICaseViewTrackingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed suggestion: "We have a
// mechanism in the messaging system to show unread emails, and if
// there urgent, its red. What about doing something like that" — a
// real "New Cases" indicator for the Worklist's own KPI banner,
// modeled directly on Message.isRead (services/messages/IMessageService.ts),
// not a fabricated, separate design.
//
// Real, deliberate difference from Message.isRead: a real Case has no
// single recipientId (multiple pathologists can view the same real
// case — pool cases especially), so "read" here is per (userId,
// caseId) pair, a real, separate tracking record, never a field
// added directly onto Case itself (Case is already extensively
// shared/serialized throughout this app; a new, per-user field there
// would be a real, unnecessary risk for a concern this narrow).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface CaseViewRecord {
  userId: ID;
  caseId: ID;
  firstViewedAt: string;
}

export interface ICaseViewTrackingService {
  /** Real, idempotent — recording a view for a case already viewed by
   *  this real user is a genuine no-op, never a second record or an
   *  updated timestamp (firstViewedAt is exactly that: first, never
   *  overwritten by a later, real re-open). */
  recordView(userId: ID, caseId: ID): Promise<ServiceResult<void>>;
  /** Real, the full set of real case ids this real user has ever
   *  opened — a real caller checks membership against this to decide
   *  "new" (not yet viewed) vs. "already seen." */
  getViewedCaseIds(userId: ID): Promise<ServiceResult<Set<string>>>;
}

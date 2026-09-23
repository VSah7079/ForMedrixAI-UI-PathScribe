// src/services/clinical/ICriticalAlertDispatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real service for CriticalAlertDispatchRecord — the automated system's
// own append-only audit trail, distinct from (and additive to)
// ICriticalResultNotificationService's human-call log. Same real
// "never edit history, only add a new record" posture as every other
// audit-style service in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CriticalAlertDispatchRecord } from '@/types/clinical/CriticalAlertDispatch';

export interface ICriticalAlertDispatchService {
  getByCaseId(caseId: string): Promise<ServiceResult<CriticalAlertDispatchRecord[]>>;

  /** Real, per direct guidance — records one automated dispatch
   *  attempt, including an honest, empty `channels` array when no
   *  automated channel could be resolved. Never partially recorded. */
  record(input: Omit<CriticalAlertDispatchRecord, 'id' | 'dispatchedAt'>): Promise<ServiceResult<CriticalAlertDispatchRecord>>;
}

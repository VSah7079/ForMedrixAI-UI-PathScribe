// src/services/clinical/ICriticalResultNotificationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real service for CriticalResultNotification records - append-only,
// same real "never edit history, only add a new record" posture as
// ServiceChargeRecord/AmendmentRecord elsewhere in this app. A case
// can genuinely accumulate more than one of these (an intraoperative
// frozen callback, followed later by a real critical value at final
// sign-out) - never a single, overwritable field on Case itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CriticalResultNotification, CriticalNotificationTrigger, NotificationMethod } from '@/types/clinical/CriticalResultNotification';

export interface ICriticalResultNotificationService {
  getByCaseId(caseId: string): Promise<ServiceResult<CriticalResultNotification[]>>;

  /** Real, per direct guidance - records that a critical/abnormal
   *  result (or an intraoperative frozen finding) was actually
   *  communicated. Requires every real field a defensible CAP/Joint
   *  Commission notification record needs - never partially recorded
   *  with a clinician name but no method, or a method but no
   *  timestamp. */
  recordNotification(input: {
    caseId: string;
    specimenId?: string;
    trigger: CriticalNotificationTrigger;
    findingSummary: string;
    clinicianName: string;
    method: NotificationMethod;
    notifiedBy: { userId: string; userName: string };
    readBackConfirmed?: boolean;
  }): Promise<ServiceResult<CriticalResultNotification>>;

  /** Real, per direct guidance's own follow-up: closes the real gap
   *  where IntraoperativeEntry.verbalReportLog never survived
   *  merge() into the real case. Called once, right after a real
   *  merge, only when the session actually has a real
   *  verbalReportLog to carry forward - a session where no verbal
   *  report was ever recorded has nothing to migrate, and this is
   *  not the place to fabricate one. The real session's own
   *  surgeon/performedBy become clinicianName/notifiedBy; the
   *  real note becomes findingSummary; method defaults to
   *  'verbal_phone' since that's the one real, established way an
   *  intraoperative frozen callback is actually made. */
  migrateIntraopVerbalReport(input: {
    caseId: string;
    specimenId?: string;
    surgeon: string;
    note: string;
    notifiedAt: string;
    notifiedBy: { userId: string; userName: string };
  }): Promise<ServiceResult<CriticalResultNotification>>;
}

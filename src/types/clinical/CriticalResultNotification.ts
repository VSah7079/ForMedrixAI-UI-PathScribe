// src/types/clinical/CriticalResultNotification.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Jira PS-105's own "Critical Value
// Alerting" section, plus the direct follow-up on Intraoperative/
// Frozen Section notification): confirmed via direct investigation
// that no real mechanism existed anywhere in this app for recording
// that a critical or abnormal result was actually communicated to a
// clinician - the one real, adjacent thing that DOES exist,
// AmendmentRecord's own ClinicalNotification, is scoped only to
// post-signout amendments, never the initial release of a result.
//
// Also closes a second, separate, real gap found along the way:
// IntraoperativeEntry.verbalReportLog (the frozen-section "surgeon
// was called" note) is captured at the bench but never carried
// forward - confirmed directly that mockIntraoperativeService.ts's
// own merge() only ever sets status/mergedIntoCaseId/mergedAt on the
// session record, never copying verbalReportLog (or
// frozenSectionDiagnosis/frozenCategory) into the real, target case
// at all. Once merged, that verbal notification is permanently gone
// from the case's own record. This is the real, case-level record
// that should exist instead, and mergeIntraopVerbalReport
// (mockCriticalResultNotificationService.ts) is the real fix that
// carries it forward.
//
// Reuses NotificationMethod from AmendmentRecord.ts directly rather
// than duplicating it - same real concept (how a clinician was
// actually reached), same three real values.
// ─────────────────────────────────────────────────────────────────────────────

import type { NotificationMethod } from '@/types/reports/AmendmentRecord';

export type { NotificationMethod };

/** Real, per direct guidance - what actually triggered this
 *  notification. 'intraoperative_frozen' is the real frozen-section
 *  surgeon callback (typically made in real time, in the OR, before
 *  the specimen even leaves for permanent processing).
 *  'critical_value' and 'abnormal_unexpected' are both real, initial-
 *  sign-out findings - kept as two distinct values (rather than one
 *  general "abnormal") because a genuinely life-threatening critical
 *  value (e.g. a real, unexpected malignancy) and a merely abnormal-
 *  but-expected finding carry different real urgency and different
 *  real regulatory notification expectations, even though both can
 *  originate from the same detection pass
 *  (detectCriticalFindings.ts). */
export type CriticalNotificationTrigger = 'intraoperative_frozen' | 'critical_value' | 'abnormal_unexpected';

export interface CriticalResultNotification {
  id: string;
  caseId: string;
  /** Real, per direct guidance - present for a specimen-scoped
   *  finding (e.g. one frozen section among several specimens in the
   *  same case); undefined for a case-wide critical finding with no
   *  single specimen it's more specifically tied to. */
  specimenId?: string;
  trigger: CriticalNotificationTrigger;
  /** Real, human-readable summary of what was actually communicated -
   *  e.g. "Invasive carcinoma on frozen section, margins pending" or
   *  "Unexpected malignancy in routine appendectomy specimen." Free
   *  text, not re-derived from detectCriticalFindings' own output at
   *  read time - what was actually SAID to the clinician is the real
   *  fact this field records, which can differ from (or be a subset
   *  of) whatever the detector originally flagged. */
  findingSummary: string;
  clinicianName: string;
  method: NotificationMethod;
  notifiedAt: string;
  /** Real, per direct guidance's own established attribution pattern
   *  (AmendmentRecord.authoringPathologist, IntraoperativeEntry.performedBy)
   *  - the pathologist who actually made or is recording this
   *  notification, never left as a bare string id. */
  notifiedBy: { userId: string; userName: string };
  /** Real, standard critical-value-reporting practice (CAP/Joint
   *  Commission NPSG.02.03.01) - confirms the receiving clinician
   *  repeated the finding back, not just that a call was placed.
   *  Optional: a real notification can be recorded honestly without
   *  it (e.g. a secure page or direct LIS flag has no real read-back
   *  step at all), never defaulted to true. */
  readBackConfirmed?: boolean;
}

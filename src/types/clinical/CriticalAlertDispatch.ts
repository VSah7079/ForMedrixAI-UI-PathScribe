// src/types/clinical/CriticalAlertDispatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, automated critical-finding alert dispatch — built per direct
// guidance following PS-136 ("Abnormal Detection: Critical Value
// Alerting - SMS/Email/EHR Push"). This is a genuinely different,
// additive mechanism from CriticalResultNotification
// (mockCriticalResultNotificationService.ts): that record is the
// pathologist's own human audit trail of a real verbal phone call they
// made. This is the automated system firing on the physician's own
// configured contact channels the moment a finding is confirmed,
// without requiring a human to compose anything.
//
// Real, explicit scope boundary, per direct guidance and this app's
// own established discipline for external vendor touchpoints (see
// dispatchCassetteLabel.ts, dispatchNetworkPrintJob.ts,
// dispatchInterfaceMessage.ts): the infrastructure here — resolving
// the real recipient, deciding which channels genuinely apply, and
// constructing the real payload each channel would need — is real,
// not a stub. The actual, final network call to a real SMS gateway
// (e.g. Twilio) or a real EHR inbox API (e.g. an Epic In Basket
// integration) requires real vendor credentials this environment does
// not have, so each channel adapter is a disclosed simulation at that
// one boundary only — never silently claiming a real send happened.
// Swapping a real vendor in later is implementation-and-testing work
// against this same, already-sound payload shape, not a redesign.
// ─────────────────────────────────────────────────────────────────────────────

import type { AbnormalSeverity } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';

/** The three real, distinct automated channels this dispatch can use.
 *  Deliberately NOT the same vocabulary as NotificationMethod
 *  (CriticalResultNotification.ts) — that type describes how a HUMAN
 *  reached a clinician (including verbal_phone/secure_page, which
 *  have no automated equivalent here); this type describes which
 *  automated system fired, a strict subset. */
export type AlertChannelType = 'secure_email' | 'sms' | 'ehr_push';

/** Real, resolved recipient for this dispatch — deliberately the
 *  ordering/covering PHYSICIAN, never the patient (see this app's own
 *  established reasoning: a lab does not directly alert a patient of
 *  a critical/malignant finding — that is the physician's own job,
 *  after they can review and discuss it). Carries only what each
 *  channel actually needs to decide availability and to address the
 *  real send — never a bare id a channel adapter would have to
 *  re-resolve itself. */
export interface CriticalAlertRecipient {
  physicianId: string;
  physicianName: string;
  email?: string;
  /** Real, dedicated SMS-capable number — deliberately distinct from
   *  Physician.phone (which may be a landline/front-desk line, not
   *  text-capable). See Physician.smsCapablePhone's own doc comment. */
  smsCapablePhone?: string;
  /** True only when this physician record was synced FROM an
   *  upstream EHR/interface-engine feed (Physician.sourceSystem is
   *  set) — the real, concrete signal that a real EHR inbox
   *  destination is actually known for this person, rather than
   *  assuming every physician has one. */
  hasKnownEhrInbox: boolean;
  preferredContact: 'Email' | 'Fax' | 'Phone';
}

/** Real, minimal payload every channel adapter receives — the same
 *  shape regardless of channel, so swapping in a real vendor later
 *  never requires a different payload per channel beyond what that
 *  channel's own real API demands at the network boundary. */
export interface CriticalAlertPayload {
  caseId: string;
  findingTerm: string;
  findingSeverity: AbnormalSeverity;
  sourceQuote: string;
  confirmedAt: string;
  recipient: CriticalAlertRecipient;
}

/** Real, per-channel result — every adapter returns this same shape.
 *  `dispatched` is always true for a disclosed-simulation adapter
 *  (it genuinely recorded and logged real intent) — it is never used
 *  to imply a real vendor confirmed delivery, which `method: 'stub'`
 *  makes explicit. */
export interface AlertChannelDispatchOutcome {
  channel: AlertChannelType;
  dispatched: boolean;
  /** Always 'stub' until a real, named vendor integration exists for
   *  this specific channel. */
  method: 'stub';
  /** Real, human-readable detail of what would have been sent and to
   *  where — e.g. "Secure email to dr.chen@example.org" — inspectable
   *  in tests and, eventually, in a real audit UI. */
  detail: string;
}

/** Real, persisted record of one automated dispatch attempt — the
 *  system's own audit trail, distinct from (and additive to)
 *  CriticalResultNotification's human-call log. A case can have both:
 *  the automated system fired at confirmation time AND the
 *  pathologist separately recorded a real verbal call. */
export interface CriticalAlertDispatchRecord {
  id: string;
  caseId: string;
  findingTerm: string;
  findingSeverity: AbnormalSeverity;
  physicianId: string;
  physicianName: string;
  /** Real, honest record of every channel this dispatch actually
   *  attempted — empty when no automated channel could be resolved
   *  (e.g. no ordering physician on file, or the physician has no
   *  contact info at all on any channel this system knows about). */
  channels: AlertChannelDispatchOutcome[];
  dispatchedAt: string;
}

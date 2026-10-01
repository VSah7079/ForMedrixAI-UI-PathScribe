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
import type { SmsCarrierId } from '@/services/physicians/IPhysicianService';

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
  /** Real, per direct follow-up ("The carrier gap is a data-model
   *  problem inside this app... address it") — threaded through from
   *  `Physician.smsCarrier`/`smsCarrierOtherDomain` purely so a real
   *  backend consuming the post-GA interface-engine module's own
   *  `CRITICAL_ALERT` envelope (`services/clinical/postGaAlertChannels/`)
   *  has what it needs to route via an email-to-SMS carrier gateway,
   *  without needing a second, separate lookup back to PathScribe.
   *  Genuinely unused by the live `alertChannels/` stubs and by
   *  `resolveCriticalAlertChannels.ts`'s own channel-availability
   *  rules — carrier has no bearing on whether sms is available, only
   *  on how a real backend might deliver it. */
  smsCarrier?: SmsCarrierId;
  smsCarrierOtherDomain?: string;
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
  /** Real, per direct guidance following an engineering review of the
   *  SMS/email transport risk: real telecom SMS carriers generally
   *  will not sign a HIPAA BAA, and a standard transactional email
   *  relay may not either — so neither channel's own message BODY may
   *  carry PHI (patient name/MRN) or clinical detail (findingTerm),
   *  ever, regardless of which real vendor is eventually wired in.
   *  This is the real, opaque reference link
   *  (services/clinical/ICriticalAlertReferenceTokenService.ts) those
   *  two channels use instead — undefined for ehr_push, which never
   *  needs it (that channel hands structured data to the receiving
   *  institution's own interface engine/EHR directly, the same
   *  established trust boundary buildOruR01Payload.ts already relies
   *  on, never a public link). sendSmsAlert.ts/sendSecureEmailAlert.ts
   *  both build their outbound message body from ONLY this url plus a
   *  generic, non-PHI template — never from findingTerm/sourceQuote
   *  above, which exist on this payload for internal use only
   *  (ehr_push's own body, and this dispatch's own persisted audit
   *  detail — never anything actually transmitted over SMS/email). */
  referenceUrl?: string;
}

/** Real, per-channel result — every adapter returns this same shape.
 *  `dispatched` is always true for a disclosed-simulation adapter
 *  (it genuinely recorded and logged real intent) — it is never used
 *  to imply a real vendor confirmed delivery, which `method: 'stub'`
 *  makes explicit. */
export interface AlertChannelDispatchOutcome {
  channel: AlertChannelType;
  dispatched: boolean;
  /** 'stub' — no real vendor integration exists yet; the channel only
   *  logged real intent locally (`alertChannels/*.ts` — what
   *  `dispatchCriticalAlerts.ts` actually calls today).
   *
   *  'interface_engine' — real, per direct follow-up ("Can the
   *  interface engine be used for any post GA modification to fully
   *  implement this feature?"): the channel genuinely POSTed via this
   *  app's one real, generic outbound HTTP transport
   *  (`services/interfaceDispatch/dispatchInterfaceMessage.ts`), the
   *  same real transport six other transaction types already use.
   *  Real, honest limit on what this confirms: a success here means
   *  PathScribe's own outbound message reached the real receiving
   *  endpoint — it does NOT by itself confirm an SMS/email/EHR message
   *  actually reached the physician; that final leg depends on the
   *  real, per-customer interface-engine configuration downstream.
   *  Only ever produced by the separate, deliberately NOT-yet-wired
   *  `services/clinical/postGaAlertChannels/` module — see that
   *  folder's own README for why it isn't active by default. */
  method: 'stub' | 'interface_engine';
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

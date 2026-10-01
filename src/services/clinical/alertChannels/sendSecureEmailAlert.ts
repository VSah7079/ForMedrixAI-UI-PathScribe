// src/services/clinical/alertChannels/sendSecureEmailAlert.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, honest stub for the automated secure-email leg of PS-136's
// critical-alert dispatch — see CriticalAlertDispatch.ts's own header
// for the full scope boundary. This is the ONE, contained place a real
// vendor integration (NHSMail/Paubox/Virtru/Zix/Egress/Accurx — see
// PS-143's own regional vendor research) gets patched in later: same
// discipline as dispatchCassetteLabel.ts/dispatchInterfaceMessage.ts —
// records real, inspectable intent rather than silently doing nothing
// or pretending a real send happened.
//
// Real, per direct guidance's own engineering brief (Sep 2026): despite
// the "secure_email" name, the message body carries NO patient name,
// DOB, MRN, or clinical detail (findingTerm/findingSeverity/case
// identifiers) — a fixed, generic template plus the opaque reference
// link (CriticalAlertPayload.referenceUrl) is the entire content. A
// standard transactional email relay may not sign a HIPAA BAA either,
// so this channel gets the identical zero-PHI treatment as SMS, not a
// weaker one just because "secure" is in its name. The receiving
// physician's own EHR (via the reference link's SMART-on-FHIR/deep-link
// launch, once that real integration exists) is where the actual
// finding is shown, behind that health system's OWN real
// authentication — never here.
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';

const DISPATCHED_LOG: { payload: CriticalAlertPayload; to: string }[] = [];

/** Real, fixed, non-PHI template — same "urgent finding" wording as
 *  sendSmsAlert.ts's own buildSmsBody(), for the same reason (accurate
 *  for either Critical or Malignant without a per-severity branch). */
// Exported for the same reason sendSmsAlert.ts's own buildSmsBody() now
// is — reused as-is by the post-GA, interface-engine-routed variant
// (services/clinical/postGaAlertChannels/sendSecureEmailAlertViaInterfaceEngine.ts)
// rather than duplicated.
export function buildEmailBody(referenceUrl: string | undefined): string {
  if (referenceUrl) {
    return `An urgent finding requires immediate review. Tap to view in EHR: ${referenceUrl}`;
  }
  return 'An urgent finding requires immediate review. Please contact the laboratory.';
}

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed `recipient.email`
 *  is present; this function does not re-check availability itself,
 *  same posture as every other channel adapter in this file's
 *  siblings. */
export async function sendSecureEmailAlert(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const to = payload.recipient.email!;
  DISPATCHED_LOG.push({ payload, to });
  const body = buildEmailBody(payload.referenceUrl);
  const detail = `Secure email to ${to}: "PathScribe Alert" — "${body}"`;
  console.info(
    `[PathScribe] Automated critical-alert dispatch — secure email STUB, no real vendor integration wired yet (PS-136 still open). Would send: ${detail}`,
  );
  return { channel: 'secure_email', dispatched: true, method: 'stub', detail };
}

export function getSentSecureEmailAlerts(): readonly { payload: CriticalAlertPayload; to: string }[] {
  return DISPATCHED_LOG;
}

export function _resetSentSecureEmailAlertsForTests(): void {
  DISPATCHED_LOG.length = 0;
}

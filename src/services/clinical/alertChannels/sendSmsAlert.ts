// src/services/clinical/alertChannels/sendSmsAlert.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, honest stub for the automated SMS leg of PS-136's critical-alert
// dispatch — see CriticalAlertDispatch.ts's own header for the full
// scope boundary. This is the ONE, contained place a real SMS gateway
// integration (e.g. Twilio — no account/credentials exist in this
// environment) gets patched in later. Same discipline as this file's
// siblings: records real, inspectable intent, never a silent no-op or
// a claimed real send.
//
// Real, per direct guidance's own engineering brief (Sep 2026): the
// message body carries NO patient name, DOB, MRN, or clinical detail
// (findingTerm/findingSeverity/case identifiers) whatsoever — a fixed,
// generic template plus the opaque reference link
// (CriticalAlertPayload.referenceUrl) is the entire content. This is
// deliberate, not a regression from the earlier version of this file:
// standard telecom SMS carriers generally will not sign a HIPAA BAA, so
// the message body itself must never be able to carry PHI regardless of
// which real vendor is eventually wired in. The receiving physician's
// own EHR (via the reference link's SMART-on-FHIR/deep-link launch, once
// that real integration exists) is where the actual finding is shown,
// behind that health system's OWN real authentication — never here.
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';

const DISPATCHED_LOG: { payload: CriticalAlertPayload; to: string }[] = [];

/** Real, fixed, non-PHI template — deliberately says "urgent finding"
 *  rather than echoing the specific severity value: resolveCriticalAlertChannels.ts
 *  only ever routes 'sms' for Critical or Malignant, and this wording is
 *  accurate for either without needing a per-severity branch. */
// Exported (not just used locally) so the post-GA, interface-engine-
// routed variant of this channel (services/clinical/postGaAlertChannels/
// sendSmsAlertViaInterfaceEngine.ts) can reuse the exact same zero-PHI
// template rather than maintaining a second, driftable copy of it.
export function buildSmsBody(referenceUrl: string | undefined): string {
  if (referenceUrl) {
    return `PathScribe Alert: An urgent finding requires immediate review. Tap to view in EHR: ${referenceUrl}`;
  }
  // Real, honest degradation — see dispatchCriticalAlerts.ts's own
  // handling of a failed token issuance. No link to give, so this falls
  // back to directing the physician to the lab rather than sending a
  // dead-end message.
  return 'PathScribe Alert: An urgent finding requires immediate review. Please contact the laboratory.';
}

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed
 *  `recipient.smsCapablePhone` is present. */
export async function sendSmsAlert(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const to = payload.recipient.smsCapablePhone!;
  DISPATCHED_LOG.push({ payload, to });
  const body = buildSmsBody(payload.referenceUrl);
  const detail = `SMS to ${to}: "${body}"`;
  console.info(
    `[PathScribe] Automated critical-alert dispatch — SMS STUB, no real SMS gateway wired yet (PS-136 still open). Would send: ${detail}`,
  );
  return { channel: 'sms', dispatched: true, method: 'stub', detail };
}

export function getSentSmsAlerts(): readonly { payload: CriticalAlertPayload; to: string }[] {
  return DISPATCHED_LOG;
}

export function _resetSentSmsAlertsForTests(): void {
  DISPATCHED_LOG.length = 0;
}

// src/services/clinical/alertChannels/sendSmsAlert.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, honest stub for the automated SMS leg of PS-136's critical-alert
// dispatch — see CriticalAlertDispatch.ts's own header for the full
// scope boundary. This is the ONE, contained place a real SMS gateway
// integration (e.g. Twilio — no account/credentials exist in this
// environment) gets patched in later. Same discipline as this file's
// siblings: records real, inspectable intent, never a silent no-op or
// a claimed real send.
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';

const DISPATCHED_LOG: { payload: CriticalAlertPayload; to: string }[] = [];

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed
 *  `recipient.smsCapablePhone` is present. SMS body is deliberately
 *  short and contains no patient-identifying detail — same real
 *  minimal-PHI-in-transit posture as detectCriticalFindings.ts's own
 *  scoped payload — just enough for the physician to know to check
 *  the case urgently. */
export async function sendSmsAlert(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const to = payload.recipient.smsCapablePhone!;
  DISPATCHED_LOG.push({ payload, to });
  const detail = `SMS to ${to}: "PathScribe: urgent ${payload.findingSeverity} finding on case ${payload.caseId} — please review."`;
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

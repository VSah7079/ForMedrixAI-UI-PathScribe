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
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';

const DISPATCHED_LOG: { payload: CriticalAlertPayload; to: string }[] = [];

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed `recipient.email`
 *  is present; this function does not re-check availability itself,
 *  same posture as every other channel adapter in this file's
 *  siblings. */
export async function sendSecureEmailAlert(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const to = payload.recipient.email!;
  DISPATCHED_LOG.push({ payload, to });
  const detail = `Secure email to ${to}: "${payload.findingSeverity} finding — ${payload.findingTerm}" (case ${payload.caseId})`;
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

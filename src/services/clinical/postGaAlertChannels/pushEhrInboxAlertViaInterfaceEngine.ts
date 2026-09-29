// src/services/clinical/postGaAlertChannels/pushEhrInboxAlertViaInterfaceEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — post-GA cutover candidate for the ehr_push channel. NOT
// currently wired into dispatchCriticalAlerts.ts — see this folder's
// own README before activating this.
//
// Real, deliberate difference from this folder's sms/secure_email
// siblings: ehr_push already crosses a different, real trust boundary
// (the receiving institution's own interface engine, never a public
// link — see alertChannels/pushEhrInboxAlert.ts's own header), so it
// keeps carrying real clinical detail (findingTerm/findingSeverity)
// here too, same content alertChannels/pushEhrInboxAlert.ts's own
// `detail` already builds — only the transport changes, from a local
// console.info stub to a real POST via dispatchInterfaceMessage.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';
import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed
 *  `recipient.hasKnownEhrInbox` is true. */
export async function pushEhrInboxAlertViaInterfaceEngine(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const detail = `EHR inbox push to physician ${payload.recipient.physicianName} (${payload.recipient.physicianId}): "${payload.findingSeverity} finding — ${payload.findingTerm}" (case ${payload.caseId})`;

  const queueEntryId = `crit-alert-ehrpush-${payload.caseId}-${Date.now().toString(36)}`;
  const result = await dispatchInterfaceMessage(queueEntryId, 'CRITICAL_ALERT', {
    channel: 'ehr_push',
    physicianId: payload.recipient.physicianId,
    physicianName: payload.recipient.physicianName,
    caseId: payload.caseId,
    findingTerm: payload.findingTerm,
    findingSeverity: payload.findingSeverity,
    confirmedAt: payload.confirmedAt,
  });

  if (!result.ok) {
    return {
      channel: 'ehr_push',
      dispatched: false,
      method: 'interface_engine',
      detail: `${detail} — dispatch failed: ${result.error ?? 'The interface engine returned an unexpected error.'}`,
    };
  }
  return { channel: 'ehr_push', dispatched: true, method: 'interface_engine', detail };
}

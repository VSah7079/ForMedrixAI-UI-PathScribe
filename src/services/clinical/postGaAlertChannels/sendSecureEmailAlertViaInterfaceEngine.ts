// src/services/clinical/postGaAlertChannels/sendSecureEmailAlertViaInterfaceEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — post-GA cutover candidate for the secure_email channel. NOT
// currently wired into dispatchCriticalAlerts.ts — see this folder's
// own README before activating this. Same real reasoning as this
// folder's sendSmsAlertViaInterfaceEngine.ts sibling — reuses
// alertChannels/sendSecureEmailAlert.ts's own exported buildEmailBody()
// zero-PHI template, routed through dispatchInterfaceMessage.ts instead
// of a local console.info stub.
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';
import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { buildEmailBody } from '../alertChannels/sendSecureEmailAlert';

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed `recipient.email`
 *  is present. */
export async function sendSecureEmailAlertViaInterfaceEngine(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const to = payload.recipient.email!;
  const body = buildEmailBody(payload.referenceUrl);
  const detail = `Secure email to ${to}: "PathScribe Alert" — "${body}"`;

  const queueEntryId = `crit-alert-email-${payload.caseId}-${Date.now().toString(36)}`;
  const result = await dispatchInterfaceMessage(queueEntryId, 'CRITICAL_ALERT', {
    channel: 'secure_email',
    to,
    body,
    caseId: payload.caseId,
  });

  if (!result.ok) {
    return {
      channel: 'secure_email',
      dispatched: false,
      method: 'interface_engine',
      detail: `${detail} — dispatch failed: ${result.error ?? 'The interface engine returned an unexpected error.'}`,
    };
  }
  return { channel: 'secure_email', dispatched: true, method: 'interface_engine', detail };
}

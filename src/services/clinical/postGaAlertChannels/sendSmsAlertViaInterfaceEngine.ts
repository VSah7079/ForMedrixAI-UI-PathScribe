// src/services/clinical/postGaAlertChannels/sendSmsAlertViaInterfaceEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — post-GA cutover candidate for the SMS channel. NOT currently
// wired into dispatchCriticalAlerts.ts — see this folder's own README
// before activating this.
//
// Real, per direct follow-up ("Can the interface engine be used for
// any post GA modification to fully implement this feature?"): reuses
// the exact same zero-PHI template alertChannels/sendSmsAlert.ts
// already builds (buildSmsBody(), exported from there specifically so
// this file never maintains a second, driftable copy of it), but sends
// it via this app's one real, generic outbound HTTP transport
// (dispatchInterfaceMessage.ts → receive_interface_message) instead of
// a local console.info stub — the same real transport six other
// transaction types (A08/A40/A47/ORU_R01/LIS_SYNC/ORDER_CREATED/
// REGISTRY_REPORT/PRINT_JOB) already use for real dispatch.
//
// See AlertChannelDispatchOutcome.method's own doc comment
// (types/clinical/CriticalAlertDispatch.ts) for the honest limit on
// what a real 'interface_engine' dispatch success here actually
// confirms — PathScribe's own outbound message reached the real
// receiving endpoint, not that the physician's phone received an SMS.
//
// Real, per direct follow-up ("The carrier gap is a data-model problem
// inside this app... address it"): the envelope now also carries
// `carrier`/`emailToSmsGatewayAddress` — the latter pre-resolved via
// resolveEmailToSmsGatewayAddress.ts as a real, honest best-effort
// convenience (undefined whenever the real data to build one isn't
// there — see that function's own doc comment). A real backend is
// free to ignore both and use interface-engine offloading instead
// (`services/clinical/postGaAlertChannels/README.md`'s own "Real,
// concrete downstream delivery options" section covers both paths);
// neither field is required for that path to work.
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';
import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { buildSmsBody } from '../alertChannels/sendSmsAlert';
import { resolveEmailToSmsGatewayAddress } from '@/services/physicians/resolveEmailToSmsGatewayAddress';

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed
 *  `recipient.smsCapablePhone` is present, same precondition every
 *  sibling channel adapter in this app already relies on without
 *  re-checking it itself. */
export async function sendSmsAlertViaInterfaceEngine(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  const to = payload.recipient.smsCapablePhone!;
  const body = buildSmsBody(payload.referenceUrl);
  const detail = `SMS to ${to}: "${body}"`;

  // Real, synthetic queue-entry id — unlike dispatchPrintJob.ts's own
  // call site, there is no real, pre-existing outbound queue entry for
  // a critical alert to reuse; this app records the completed dispatch
  // afterward (mockCriticalAlertDispatchService), not before, so this
  // id exists only to satisfy dispatchInterfaceMessage()'s own envelope
  // shape, not to be looked up anywhere later.
  const queueEntryId = `crit-alert-sms-${payload.caseId}-${Date.now().toString(36)}`;
  const result = await dispatchInterfaceMessage(queueEntryId, 'CRITICAL_ALERT', {
    channel: 'sms',
    to,
    body,
    caseId: payload.caseId,
    carrier: payload.recipient.smsCarrier,
    emailToSmsGatewayAddress: resolveEmailToSmsGatewayAddress(to, payload.recipient.smsCarrier, payload.recipient.smsCarrierOtherDomain),
  });

  if (!result.ok) {
    return {
      channel: 'sms',
      dispatched: false,
      method: 'interface_engine',
      detail: `${detail} — dispatch failed: ${result.error ?? 'The interface engine returned an unexpected error.'}`,
    };
  }
  return { channel: 'sms', dispatched: true, method: 'interface_engine', detail };
}

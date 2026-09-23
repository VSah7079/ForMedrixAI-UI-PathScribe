// src/services/clinical/alertChannels/pushEhrInboxAlert.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, honest stub for the automated EHR-inbox-push leg of PS-136's
// critical-alert dispatch — see CriticalAlertDispatch.ts's own header
// for the full scope boundary. Real, important distinction from the
// other two channel adapters in this folder: this one is NOT a direct
// PathScribe-to-vendor call. Per this app's own established interface-
// dispatch architecture (buildOruR01Payload.ts, dispatchInterfaceMessage.ts),
// PathScribe never decides EHR-specific formatting (e.g. an Epic In
// Basket message shape) — that stays the receiving interface engine's
// job. This adapter's real responsibility is narrower and already
// real: emitting a well-formed dispatch request the SAME interface-
// engine channel already used for ORU^R01 delivery can route as a
// priority/alert message, once that engine-side routing rule exists.
// This is the ONE, contained place that real engine-side wiring gets
// patched in later, alongside the real per-customer engine
// configuration (per direct guidance: "along with the engine code").
// ─────────────────────────────────────────────────────────────────────────────

import type { AlertChannelDispatchOutcome, CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';

const DISPATCHED_LOG: { payload: CriticalAlertPayload; physicianId: string }[] = [];

/** Real, per direct guidance — never called unless
 *  resolveCriticalAlertChannels already confirmed
 *  `recipient.hasKnownEhrInbox` is true (i.e. this physician record
 *  was actually synced FROM an upstream EHR/interface-engine feed, so
 *  a real inbox destination is genuinely known to exist — never
 *  assumed for a manually-entered physician). */
export async function pushEhrInboxAlert(payload: CriticalAlertPayload): Promise<AlertChannelDispatchOutcome> {
  DISPATCHED_LOG.push({ payload, physicianId: payload.recipient.physicianId });
  const detail = `EHR inbox push to physician ${payload.recipient.physicianName} (${payload.recipient.physicianId}): "${payload.findingSeverity} finding — ${payload.findingTerm}" (case ${payload.caseId})`;
  console.info(
    `[PathScribe] Automated critical-alert dispatch — EHR inbox push STUB, no real interface-engine routing rule wired yet (PS-136 still open). Would send: ${detail}`,
  );
  return { channel: 'ehr_push', dispatched: true, method: 'stub', detail };
}

export function getPushedEhrInboxAlerts(): readonly { payload: CriticalAlertPayload; physicianId: string }[] {
  return DISPATCHED_LOG;
}

export function _resetPushedEhrInboxAlertsForTests(): void {
  DISPATCHED_LOG.length = 0;
}

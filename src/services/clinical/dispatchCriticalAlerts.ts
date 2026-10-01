// src/services/clinical/dispatchCriticalAlerts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real orchestrator for PS-136's automated critical-alert dispatch —
// the one place that resolves the real recipient, decides real
// channels (resolveCriticalAlertChannels.ts, pure), calls each real
// channel adapter, and persists the real audit record
// (mockCriticalAlertDispatchService.ts). Wired into
// useSignOutWorkflow.ts's handleRecordCriticalNotification, firing
// automatically the moment a critical finding is confirmed — additive
// to, never a replacement for, the existing mandatory human
// verbal-notification workflow (PS-105/PS-134). Fire-and-forget, same
// posture as every other background capture in that same function —
// never blocks the actual sign-out action.
//
// Real, honest behavior when there's nothing real to dispatch to: no
// ordering/covering physician on file, or a physician record with no
// contact channels this system knows about, resolves to a genuinely
// empty `channels` array — never a fabricated destination.
// ─────────────────────────────────────────────────────────────────────────────

import type { AbnormalSeverity } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';
import type { CriticalAlertDispatchRecord, CriticalAlertRecipient } from '@/types/clinical/CriticalAlertDispatch';
import type { ServiceResult } from '../types';
import { mockPhysicianService } from '@/services/physicians/mockPhysicianService';
import { resolveCriticalAlertChannels } from './resolveCriticalAlertChannels';
import { mockCriticalAlertDispatchService } from './mockCriticalAlertDispatchService';
import { mockCriticalAlertReferenceTokenService } from './mockCriticalAlertReferenceTokenService';
import { sendSecureEmailAlert } from './alertChannels/sendSecureEmailAlert';
import { sendSmsAlert } from './alertChannels/sendSmsAlert';
import { pushEhrInboxAlert } from './alertChannels/pushEhrInboxAlert';

export interface DispatchCriticalAlertsInput {
  caseId: string;
  /** Real, per direct guidance's own engineering brief: the ONLY
   *  case-identifying value the sms/secure_email reference link's own
   *  resolved page is ever allowed to display — see
   *  ICriticalAlertReferenceTokenService.ts's own header. Required
   *  (unlike Case.orderingPhysicianId below) because every real case
   *  this function ever fires for already has one by the time it
   *  reaches sign-out. */
  accessionNumber: string;
  /** Case.orderingPhysicianId — undefined is real and honest (not
   *  every case has one on file); this function never guesses a
   *  recipient. */
  orderingPhysicianId?: string;
  findingTerm: string;
  findingSeverity: AbnormalSeverity;
  sourceQuote: string;
  confirmedAt: string;
}

/** Real, SSR/test-safe accessor — `window` genuinely does not exist in
 *  this service's own plain node-environment test file
 *  (dispatchCriticalAlerts.test.ts has no @vitest-environment happy-dom
 *  pragma, same default node runtime every other non-component service
 *  test in this app uses). Falls back to a relative path in that case,
 *  same real fallback shape a server-rendered call would need too. */
function resolveBaseUrl(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** Real, per direct guidance — resolves the real Physician record
 *  into the minimal, channel-relevant shape resolveCriticalAlertChannels
 *  and each adapter actually need. `hasKnownEhrInbox` is real, derived
 *  signal (physician.sourceSystem set), not a guess — see
 *  Physician.sourceSystem's own doc comment (IPhysicianService.ts).
 *  `smsCarrier`/`smsCarrierOtherDomain` are passed through unchanged —
 *  real, per direct follow-up closing the data-model gap
 *  services/clinical/postGaAlertChannels/README.md's own research
 *  documented; genuinely unused by this live orchestrator or by
 *  resolveCriticalAlertChannels.ts's own rules, carried only for the
 *  post-GA module's own benefit. */
function toRecipient(physicianId: string, physician: {
  givenNames: string; familyNames: string; email: string; smsCapablePhone?: string;
  sourceSystem?: string; preferredContact: 'Email' | 'Fax' | 'Phone';
  smsCarrier?: CriticalAlertRecipient['smsCarrier']; smsCarrierOtherDomain?: string;
}): CriticalAlertRecipient {
  return {
    physicianId,
    physicianName: `${physician.givenNames} ${physician.familyNames}`.trim(),
    email: physician.email || undefined,
    smsCapablePhone: physician.smsCapablePhone || undefined,
    smsCarrier: physician.smsCarrier,
    smsCarrierOtherDomain: physician.smsCarrierOtherDomain || undefined,
    hasKnownEhrInbox: !!physician.sourceSystem,
    preferredContact: physician.preferredContact,
  };
}

export async function dispatchCriticalAlerts(
  input: DispatchCriticalAlertsInput,
): Promise<ServiceResult<CriticalAlertDispatchRecord | null>> {
  if (!input.orderingPhysicianId) {
    // Real, honest no-op — no ordering physician on file, nothing to
    // dispatch to. Not an error: most of this app's own real usage
    // patterns can leave this unset (see Case.orderingPhysicianId's
    // own doc comment).
    return { ok: true, data: null };
  }

  const physicianResult = await mockPhysicianService.getById(input.orderingPhysicianId);
  if (!physicianResult.ok || !physicianResult.data) {
    return { ok: true, data: null };
  }

  const recipient = toRecipient(input.orderingPhysicianId, physicianResult.data);
  const channels = resolveCriticalAlertChannels(input.findingSeverity, recipient);

  // Real, per direct guidance's own engineering brief: sms/secure_email
  // may never carry PHI or clinical detail in the message body, so both
  // instead get a single, shared, opaque reference link — one token per
  // dispatch, not one per channel, since they point at the exact same
  // underlying finding. Pre-generating the dispatch record's own id here
  // (rather than letting mockCriticalAlertDispatchService.record()
  // generate it after the fact) is what lets the token honestly link
  // back to a real dispatchRecordId from the moment it's issued — see
  // ICriticalAlertDispatchService.ts's own record() doc comment.
  const needsReferenceLink = channels.includes('sms') || channels.includes('secure_email');
  const dispatchRecordId = `cad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let referenceUrl: string | undefined;

  if (needsReferenceLink) {
    const tokenResult = await mockCriticalAlertReferenceTokenService.issue({
      dispatchRecordId,
      caseId: input.caseId,
      accessionNumber: input.accessionNumber,
      physicianId: recipient.physicianId,
      physicianName: recipient.physicianName,
      findingTerm: input.findingTerm,
      findingSeverity: input.findingSeverity,
    });
    // Real, honest degradation: if the token can't be issued for some
    // reason, sms/secure_email still fire with a template that omits
    // the link line entirely (see sendSmsAlert.ts/sendSecureEmailAlert.ts's
    // own handling) rather than failing the whole dispatch.
    if (tokenResult.ok) {
      referenceUrl = `${resolveBaseUrl()}/critical-alert/${tokenResult.data.token}`;
    }
  }

  const outcomes = await Promise.all(channels.map(channel => {
    const payload = {
      caseId: input.caseId,
      findingTerm: input.findingTerm,
      findingSeverity: input.findingSeverity,
      sourceQuote: input.sourceQuote,
      confirmedAt: input.confirmedAt,
      recipient,
      // Deliberately undefined for ehr_push — see CriticalAlertPayload's
      // own doc comment on referenceUrl.
      referenceUrl: channel === 'ehr_push' ? undefined : referenceUrl,
    };
    if (channel === 'secure_email') return sendSecureEmailAlert(payload);
    if (channel === 'sms') return sendSmsAlert(payload);
    return pushEhrInboxAlert(payload);
  }));

  return mockCriticalAlertDispatchService.record({
    id: dispatchRecordId,
    caseId: input.caseId,
    findingTerm: input.findingTerm,
    findingSeverity: input.findingSeverity,
    physicianId: recipient.physicianId,
    physicianName: recipient.physicianName,
    channels: outcomes,
  });
}

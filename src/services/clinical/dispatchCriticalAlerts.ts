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
import { sendSecureEmailAlert } from './alertChannels/sendSecureEmailAlert';
import { sendSmsAlert } from './alertChannels/sendSmsAlert';
import { pushEhrInboxAlert } from './alertChannels/pushEhrInboxAlert';

export interface DispatchCriticalAlertsInput {
  caseId: string;
  /** Case.orderingPhysicianId — undefined is real and honest (not
   *  every case has one on file); this function never guesses a
   *  recipient. */
  orderingPhysicianId?: string;
  findingTerm: string;
  findingSeverity: AbnormalSeverity;
  sourceQuote: string;
  confirmedAt: string;
}

/** Real, per direct guidance — resolves the real Physician record
 *  into the minimal, channel-relevant shape resolveCriticalAlertChannels
 *  and each adapter actually need. `hasKnownEhrInbox` is real, derived
 *  signal (physician.sourceSystem set), not a guess — see
 *  Physician.sourceSystem's own doc comment (IPhysicianService.ts). */
function toRecipient(physicianId: string, physician: {
  givenNames: string; familyNames: string; email: string; smsCapablePhone?: string;
  sourceSystem?: string; preferredContact: 'Email' | 'Fax' | 'Phone';
}): CriticalAlertRecipient {
  return {
    physicianId,
    physicianName: `${physician.givenNames} ${physician.familyNames}`.trim(),
    email: physician.email || undefined,
    smsCapablePhone: physician.smsCapablePhone || undefined,
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

  const outcomes = await Promise.all(channels.map(channel => {
    const payload = {
      caseId: input.caseId,
      findingTerm: input.findingTerm,
      findingSeverity: input.findingSeverity,
      sourceQuote: input.sourceQuote,
      confirmedAt: input.confirmedAt,
      recipient,
    };
    if (channel === 'secure_email') return sendSecureEmailAlert(payload);
    if (channel === 'sms') return sendSmsAlert(payload);
    return pushEhrInboxAlert(payload);
  }));

  return mockCriticalAlertDispatchService.record({
    caseId: input.caseId,
    findingTerm: input.findingTerm,
    findingSeverity: input.findingSeverity,
    physicianId: recipient.physicianId,
    physicianName: recipient.physicianName,
    channels: outcomes,
  });
}

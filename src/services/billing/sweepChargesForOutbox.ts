// src/services/billing/sweepChargesForOutbox.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per Epic: PathScribe Outbound Billing & Charge Event Engine, User
// Story 2 - a pure function, same established pattern as
// checkSignOutBillingDeficiencies.ts: takes real, already-resolved data in,
// returns real findings out, never calls a service or touches storage
// itself. Two real callers: useGrossingCompletion.ts (SPECIMEN_GROSSED,
// scoped to TC) and useSignOutWorkflow.ts (CASE_SIGNED_OUT, scoped to
// 26/Global).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import { BILLING_TYPE_DEFAULT_TRIGGER } from './codeMapTable';
import type { BillingDictionaryEntry } from './RvuTableVersion';
import { getEffectiveChargeStatus } from './mockServiceChargeService';

export interface OutboxSweepResult {
  serviceChargeRecordId: string;
  caseId: string;
  specimenId?: string;
  billingType: 'TC' | '26' | 'Global';
}

/** Real, per direct guidance: which real, net-active (non-reversed)
 *  charges are newly cleared for outbound dispatch at this trigger event -
 *  TC clears at SPECIMEN_GROSSED, 26/Global hold until CASE_SIGNED_OUT
 *  (BILLING_TYPE_DEFAULT_TRIGGER, codeMapTable.ts). alreadyQueuedIds is
 *  the real dedup guard - a charge applied before its own trigger event,
 *  or already swept once, is never enqueued a second time.
 *
 *  Real, per direct follow-up: the epic's own acceptance criteria
 *  ("allow system administrators to specify default release
 *  triggers") is now real - triggerMap is the real, effective mapping
 *  (defaults + any real admin override, resolved by the caller via
 *  mockBillingTypeTriggerConfigService.ts), never computed here.
 *  Defaults to BILLING_TYPE_DEFAULT_TRIGGER so an existing caller
 *  that never resolves an override sees no behavior change. */
export function sweepChargesForOutbox(
  allCharges: ServiceChargeRecord[],
  triggerEvent: 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT',
  alreadyQueuedIds: Set<string>,
  triggerMap: Record<BillingDictionaryEntry['billingType'], 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT'> = BILLING_TYPE_DEFAULT_TRIGGER
): OutboxSweepResult[] {
  const reversedIds = new Set(
    allCharges.filter(c => c.transactionType === 'credit' && c.reversesTransactionId).map(c => c.reversesTransactionId!)
  );
  const activeCharges = allCharges.filter(c => c.transactionType === 'charge' && !reversedIds.has(c.id));

  // Real, per direct guidance's own "Complete the Guardrails" / Export
  // Lock requirement: a real DRAFT, PENDING_APPROVAL, REJECTED, or
  // HOLD charge must never slip into an outbound HL7/EDI dispatch,
  // regardless of trigger event or billingType eligibility below.
  // Every charge created before this feature existed, or created
  // without a facility opting into requireBillingApproval, is
  // EXPORTED via getEffectiveChargeStatus's own real, legacy-mapping
  // default - genuinely eligible, not silently blocked by a change
  // this app never asked those charges to go through.
  const exportEligibleCharges = activeCharges.filter(c => {
    const status = getEffectiveChargeStatus(c);
    return status === 'APPROVED' || status === 'EXPORTED';
  });

  const eligibleBillingTypes = (Object.keys(triggerMap) as Array<BillingDictionaryEntry['billingType']>)
    .filter(ct => triggerMap[ct] === triggerEvent);

  return exportEligibleCharges
    .filter(c => eligibleBillingTypes.includes(c.billingType) && !alreadyQueuedIds.has(c.id))
    .map(c => ({
      serviceChargeRecordId: c.id,
      caseId: c.caseId,
      specimenId: c.specimenId,
      billingType: c.billingType,
    }));
}

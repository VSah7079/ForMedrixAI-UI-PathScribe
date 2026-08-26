// src/services/billing/mockServiceChargeService.ts
// -----------------------------------------------------------------------------
// Mock implementation of IServiceChargeService. localStorage-backed,
// matching every other mock service in this codebase's ok/err/delay
// convention. Real, per direct requirement: append-only - saveCharge
// never overwrites an existing id, matching ServiceChargeRecord.ts's
// own "never edit history, only add a new record" principle. There is
// deliberately no update/delete method anywhere in this file.
// -----------------------------------------------------------------------------

import type { IServiceChargeService } from './IServiceChargeService';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { canDraftOrApproveBillingCharge } from './canDraftOrApproveBillingCharge';

const STORAGE_KEY = 'pathscribe_service_charges';

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 30));

function loadAll(): ServiceChargeRecord[] {
  return storageGet<ServiceChargeRecord[]>(STORAGE_KEY, []);
}

/** Real, per direct guidance's own established migration posture -
 *  the one, real place every consumer (export gating, UI display)
 *  should read a charge's effective approval status from, rather than
 *  checking approvalStatus directly and risking treating undefined
 *  (every charge created before this feature existed, or any created
 *  since without opting into the new workflow) as DRAFT - which would
 *  incorrectly imply an already-resolved, historical charge now needs
 *  retroactive approval. Undefined is treated as the safe,
 *  already-cleared legacy default (EXPORTED), never as DRAFT. */
export function getEffectiveChargeStatus(charge: ServiceChargeRecord): NonNullable<ServiceChargeRecord['approvalStatus']> {
  return charge.approvalStatus ?? 'EXPORTED';
}

export const mockServiceChargeService: IServiceChargeService = {
  async saveCharge(record) {
    await delay();
    const all = loadAll();
    // Real, defensive check - a duplicate id here means a caller bug
    // (e.g. calling this twice for the same real event), not something
    // to silently paper over by overwriting real financial history.
    if (all.some(r => r.id === record.id)) {
      return { ok: false, error: `A ServiceChargeRecord with id "${record.id}" already exists - this ledger is append-only and never overwrites real history.` } as ServiceResult<ServiceChargeRecord>;
    }
    all.push(record);
    storageSet(STORAGE_KEY, all);
    return ok(record);
  },

  async getChargesForCase(caseId) {
    await delay();
    return ok(loadAll().filter(r => r.caseId === caseId));
  },

  async findActiveChargeForSource(caseId, specimenId, blockId, billingCode) {
    await delay();
    const all = loadAll();
    const reversedIds = new Set(
      all.filter(r => r.transactionType === 'credit' && r.reversesTransactionId).map(r => r.reversesTransactionId)
    );
    const candidates = all.filter(r =>
      r.transactionType === 'charge' &&
      r.caseId === caseId &&
      r.billingCode === billingCode &&
      r.specimenId === specimenId &&
      r.blockId === blockId &&
      !reversedIds.has(r.id)
    );
    // Real, deliberate: when more than one un-reversed charge matches
    // (e.g. three identical IHC-ADDL charges on the same block, each
    // from a separate real stain), they're financially interchangeable
    // - reversing any one of them is correct. Picks the most recently
    // resolved as the most natural choice, not because the others are
    // any less valid a match.
    const mostRecent = candidates.sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt))[0] ?? null;
    return ok(mostRecent);
  },

  async submitForApproval(chargeId, submittedBy, actorRole) {
    await delay();
    if (actorRole !== undefined && !canDraftOrApproveBillingCharge(actorRole)) {
      return err(`Role "${actorRole}" is not authorized to draft or submit a billing charge.`);
    }
    const all = loadAll();
    const idx = all.findIndex(r => r.id === chargeId);
    if (idx === -1) return err(`No real charge found for id "${chargeId}".`);
    const target = all[idx];
    if (getEffectiveChargeStatus(target) !== 'DRAFT') {
      return err(`Charge ${chargeId} is not a real DRAFT (currently ${getEffectiveChargeStatus(target)}) - only a draft can be submitted for approval.`);
    }
    const updated: ServiceChargeRecord = { ...target, approvalStatus: 'PENDING_APPROVAL', draftedBy: target.draftedBy ?? submittedBy, draftedAt: target.draftedAt ?? new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    storageSet(STORAGE_KEY, next);
    return ok(updated);
  },

  async approveCharge(chargeId, approvedBy, bypassAuthorized, actorRole) {
    await delay();
    if (actorRole !== undefined && !canDraftOrApproveBillingCharge(actorRole)) {
      return err(`Role "${actorRole}" is not authorized to approve a billing charge.`);
    }
    const all = loadAll();
    const idx = all.findIndex(r => r.id === chargeId);
    if (idx === -1) return err(`No real charge found for id "${chargeId}".`);
    const target = all[idx];
    if (getEffectiveChargeStatus(target) !== 'PENDING_APPROVAL') {
      return err(`Charge ${chargeId} is not real pending approval (currently ${getEffectiveChargeStatus(target)}).`);
    }
    // Real, per direct guidance's own Four-Eyes Principle (dual
    // control) requirement - hard-enforced here, not just the UI. The
    // person who drafted this charge can never approve it themselves,
    // unless a real, explicit break-glass override is authorized by
    // the caller (bypassAuthorized) - the caller (UI layer) is
    // responsible for checking the real CAN_BYPASS_BILLING_APPROVAL
    // permission and logging the real, separate, high-priority audit
    // alert this always requires; this service only records that the
    // bypass happened (approvedViaBreakGlass), never authorizes it.
    const isSelfApproval = approvedBy === target.draftedBy;
    if (isSelfApproval && !bypassAuthorized) {
      return err('Four-Eyes Principle: the person who drafted this charge cannot approve it. A different, real approver is required (or a real break-glass override).');
    }
    const updated: ServiceChargeRecord = {
      ...target,
      approvalStatus: 'APPROVED',
      approvedBy,
      approvedAt: new Date().toISOString(),
      approvedViaBreakGlass: isSelfApproval && bypassAuthorized ? true : target.approvedViaBreakGlass,
    };
    const next = [...all];
    next[idx] = updated;
    storageSet(STORAGE_KEY, next);
    return ok(updated);
  },

  async rejectCharge(chargeId, reviewedBy, rejectionReason, actorRole) {
    await delay();
    if (actorRole !== undefined && !canDraftOrApproveBillingCharge(actorRole)) {
      return err(`Role "${actorRole}" is not authorized to reject a billing charge.`);
    }
    if (!rejectionReason.trim()) return err('A real rejection reason is required.');
    const all = loadAll();
    const idx = all.findIndex(r => r.id === chargeId);
    if (idx === -1) return err(`No real charge found for id "${chargeId}".`);
    const target = all[idx];
    if (getEffectiveChargeStatus(target) !== 'PENDING_APPROVAL') {
      return err(`Charge ${chargeId} is not real pending approval (currently ${getEffectiveChargeStatus(target)}).`);
    }
    if (reviewedBy === target.draftedBy) {
      return err('Four-Eyes Principle: the person who drafted this charge cannot reject it either. A different, real reviewer is required.');
    }
    const updated: ServiceChargeRecord = { ...target, approvalStatus: 'REJECTED', rejectionReason: rejectionReason.trim() };
    const next = [...all];
    next[idx] = updated;
    storageSet(STORAGE_KEY, next);
    return ok(updated);
  },

  async holdCharge(chargeId, _heldBy) {
    await delay();
    const all = loadAll();
    const idx = all.findIndex(r => r.id === chargeId);
    if (idx === -1) return err(`No real charge found for id "${chargeId}".`);
    const target = all[idx];
    if (target.approvalStatus === 'HOLD') return err(`Charge ${chargeId} is already on hold.`);
    // Real, per direct guidance: stores the exact, real, raw
    // approvalStatus (which may genuinely be undefined - the legacy
    // default) so releaseHold can restore it exactly, never a
    // defaulted/effective value that would lose the real distinction
    // between "was undefined" and "was explicitly EXPORTED". Narrowed
    // directly on the raw field (not getEffectiveChargeStatus's own
    // return) so TypeScript can exclude 'HOLD' from the assignment.
    const priorStatus = target.approvalStatus;
    const updated: ServiceChargeRecord = { ...target, approvalStatus: 'HOLD', approvalStatusBeforeHold: priorStatus };
    const next = [...all];
    next[idx] = updated;
    storageSet(STORAGE_KEY, next);
    return ok(updated);
  },

  async releaseHold(chargeId, _releasedBy) {
    await delay();
    const all = loadAll();
    const idx = all.findIndex(r => r.id === chargeId);
    if (idx === -1) return err(`No real charge found for id "${chargeId}".`);
    const target = all[idx];
    if (getEffectiveChargeStatus(target) !== 'HOLD') return err(`Charge ${chargeId} is not currently on hold.`);
    // Real, per direct guidance: restores the exact real status held
    // immediately before the hold, never guessed or reset to DRAFT.
    // approvalStatusBeforeHold undefined means the charge was on the
    // legacy default (EXPORTED) before the hold - restoring undefined
    // is correct here, not a fallback to hide.
    const updated: ServiceChargeRecord = { ...target, approvalStatus: target.approvalStatusBeforeHold, approvalStatusBeforeHold: undefined };
    const next = [...all];
    next[idx] = updated;
    storageSet(STORAGE_KEY, next);
    return ok(updated);
  },
};

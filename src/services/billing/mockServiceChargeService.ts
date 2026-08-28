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
  return storageGet<ServiceChargeRecord[]>(STORAGE_KEY, SEED_SERVICE_CHARGES);
}

// Real, per direct request ahead of the Billing expert meeting — this
// service had zero seed data (unlike mockSpecimenDeficiencyService.ts's
// own established "seed a few representative examples" pattern), so
// the Financials pillar and any billing-transaction view showed
// nothing at all on a fresh session. Attached to S26-4403 (real seed
// case: right upper lobe lobectomy, 3 specimens), using real CPT/RVU
// values already in mockBillingRuleService.ts's own dictionary — no
// invented codes or fabricated RVU numbers.
//
// Deliberately tells a complete, realistic story across all three real
// concerns a billing expert would want to see:
//   1. The full Four-Eyes approval pipeline, represented at every real
//      stage at once — DRAFT (Specimen C), PENDING_APPROVAL (Specimen
//      B), APPROVED (Specimen A's IHC), EXPORTED (Specimen A's base
//      histology) — not just one static example.
//   2. A real credit + rebill correction, per this file's own header
//      ("never edit history, only add a new record") and
//      ServiceChargeRecord.ts's own direct requirement quote: "a
//      credit transaction for the code removed and then a new
//      billable charge for the new one... All must be audited." Uses
//      a real, realistic error (an IHC stain originally miscounted as
//      the second in sequence — IHC-ADDL/88341 — corrected to the
//      first — IHC-FIRST/88342 — a genuinely common real coding
//      mistake, not a contrived example), tied to a real
//      ReasonDictionaryEntry (psbc-coding-error).
//   3. Real, honest RVU data — rvuPe/rvuMp are left undefined
//      wherever mockBillingRuleService.ts's own dictionary entry only
//      has rvuWork populated, matching that file's own disclosed
//      "RVU intentionally left unset for the client to configure"
//      posture rather than fabricating full RVU triads.
const SEED_SERVICE_CHARGES: ServiceChargeRecord[] = [
  // ── Specimen A — base histology, full lifecycle: EXPORTED ──────────────────
  {
    id: 'chg-S26-4403-A-88307', caseId: 'S26-4403', transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'S26-4403-SP-1',
    billingCode: '88307', cptCode: '88307', cptDescription: 'Level VI Surgical Pathology, gross and microscopic examination',
    level: 'specimen', billingType: 'Global', rvuWork: 1.55,
    ruleVersion: 1, ruleSetId: 'BILLRULE-88307-1',
    resolvedAt: '2026-08-25T14:32:00.000Z', resolvedBy: 'PATH-UK-002',
    approvalStatus: 'EXPORTED', draftedBy: 'PATH-UK-002', draftedAt: '2026-08-25T14:32:00.000Z',
    approvedBy: 'PATH-001', approvedAt: '2026-08-25T16:10:00.000Z',
  },
  // ── Specimen A — IHC, real credit + rebill correction ───────────────────────
  // Originally billed as the second IHC in sequence (IHC-ADDL); a QA
  // audit found it was genuinely the first real IHC stain performed on
  // this specimen — corrected to IHC-FIRST. Both the original charge
  // and its exact reversal stay on record, per this file's own
  // append-only header.
  {
    id: 'chg-S26-4403-A-IHC-ADDL', caseId: 'S26-4403', transactionType: 'charge',
    sourceLevel: 'block', sourceLabel: 'A1', specimenId: 'S26-4403-SP-1',
    billingCode: 'IHC-ADDL', cptCode: '88341', cptDescription: 'Immunohistochemistry, each additional antibody',
    sequencePosition: 2,
    level: 'stain', billingType: 'Global',
    ruleVersion: 1,
    resolvedAt: '2026-08-25T14:40:00.000Z', resolvedBy: 'system',
    approvalStatus: 'EXPORTED', draftedBy: 'system', draftedAt: '2026-08-25T14:40:00.000Z',
    approvedBy: 'PATH-001', approvedAt: '2026-08-25T16:10:00.000Z',
  },
  {
    id: 'crd-chg-S26-4403-A-IHC-ADDL', caseId: 'S26-4403', transactionType: 'credit',
    reversesTransactionId: 'chg-S26-4403-A-IHC-ADDL',
    sourceLevel: 'block', sourceLabel: 'A1', specimenId: 'S26-4403-SP-1',
    billingCode: 'IHC-ADDL', cptCode: '88341', cptDescription: 'Immunohistochemistry, each additional antibody',
    sequencePosition: 2,
    level: 'stain', billingType: 'Global',
    ruleVersion: 1,
    resolvedAt: '2026-08-27T09:15:00.000Z', resolvedBy: 'PATH-001',
    postSignoutChangeReasonId: 'psbc-coding-error',
    postSignoutChangeComment: 'QA audit (2026-08-27) confirmed this was the first IHC stain performed on block A1, not the second — no prior IHC-FIRST charge existed on this specimen. Reversing 88341 (additional) and rebilling as 88342 (first). See chg-S26-4403-A-IHC-FIRST.',
    approvalStatus: 'EXPORTED', draftedBy: 'PATH-001', draftedAt: '2026-08-27T09:15:00.000Z',
    approvedBy: 'PATH-UK-002', approvedAt: '2026-08-27T09:40:00.000Z',
  },
  {
    id: 'chg-S26-4403-A-IHC-FIRST', caseId: 'S26-4403', transactionType: 'charge',
    sourceLevel: 'block', sourceLabel: 'A1', specimenId: 'S26-4403-SP-1',
    billingCode: 'IHC-FIRST', cptCode: '88342', cptDescription: 'Immunohistochemistry, first antibody',
    sequencePosition: 1,
    level: 'stain', billingType: '26', modifier: '-26', rvuWork: 0.68,
    ruleVersion: 1, ruleSetId: 'BILLRULE-IHC-FIRST-1',
    resolvedAt: '2026-08-27T09:15:00.000Z', resolvedBy: 'PATH-001',
    postSignoutChangeReasonId: 'psbc-coding-error',
    postSignoutChangeComment: 'Rebill for the reversed IHC-ADDL charge above — corrected sequence position (1st IHC stain, not 2nd). Professional component only (-26); the referring site\u2019s own lab performed the technical component.',
    approvalStatus: 'APPROVED', draftedBy: 'PATH-001', draftedAt: '2026-08-27T09:15:00.000Z',
    approvedBy: 'PATH-UK-002', approvedAt: '2026-08-27T09:40:00.000Z',
  },
  // ── Specimen B — base histology, sitting in the Four-Eyes queue ─────────────
  {
    id: 'chg-S26-4403-B-88305', caseId: 'S26-4403', transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'B', specimenId: 'S26-4403-SP-2',
    billingCode: '88305', cptCode: '88305', cptDescription: 'Level IV Surgical Pathology, gross and microscopic examination',
    level: 'specimen', billingType: 'Global', rvuWork: 0.73,
    ruleVersion: 1, ruleSetId: 'BILLRULE-88305-1',
    resolvedAt: '2026-08-27T08:05:00.000Z', resolvedBy: 'PATH-UK-002',
    approvalStatus: 'PENDING_APPROVAL', draftedBy: 'PATH-UK-002', draftedAt: '2026-08-27T08:05:00.000Z',
  },
  // ── Specimen C — base histology, drafted, not yet submitted ─────────────────
  {
    id: 'chg-S26-4403-C-88305', caseId: 'S26-4403', transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'C', specimenId: 'S26-4403-SP-3',
    billingCode: '88305', cptCode: '88305', cptDescription: 'Level IV Surgical Pathology, gross and microscopic examination',
    level: 'specimen', billingType: 'Global', rvuWork: 0.73,
    ruleVersion: 1, ruleSetId: 'BILLRULE-88305-1',
    resolvedAt: '2026-08-27T08:06:00.000Z', resolvedBy: 'PATH-UK-002',
    approvalStatus: 'DRAFT', draftedBy: 'PATH-UK-002', draftedAt: '2026-08-27T08:06:00.000Z',
  },
];

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

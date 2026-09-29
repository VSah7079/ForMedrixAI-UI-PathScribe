// src/services/billing/IServiceChargeService.ts
// -----------------------------------------------------------------------------
// Service interface for the real billing transaction ledger
// (ServiceChargeRecord, types/billing/). Dev: mockServiceChargeService
// (localStorage-backed). Live: a real backend billing/RCM system, not
// built here.
//
// Real feature, per direct requirement: "the Pathologist has the right
// to update all billing, even those that are deterministic ... we need
// a mechanism to send a credit transaction on billing that gets
// changed ... All must be audited." This is the persistence layer that
// makes that possible - every real charge or credit, once saved, is
// permanent (see ServiceChargeRecord.ts's own header on "never edit
// history, only add a new record"). This interface never exposes an
// update or delete operation for exactly that reason.
// -----------------------------------------------------------------------------

import type { ServiceResult } from '../types';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

export interface IServiceChargeService {
  /** Appends one real, permanent transaction (a charge or a credit) to
   *  the ledger. Never overwrites an existing record - two calls with
   *  the same id are a real bug in the caller, not something this
   *  method silently resolves. */
  saveCharge(record: ServiceChargeRecord): Promise<ServiceResult<ServiceChargeRecord>>;

  /** Every real transaction ever recorded for this case, oldest first -
   *  the full, permanent ledger, charges and credits both. */
  getChargesForCase(caseId: string): Promise<ServiceResult<ServiceChargeRecord[]>>;

  /** PS-89 (Batch 333): every billing rule version any charge resolved
   *  against, as `${billingCode}::${siteId}::${ruleVersion}` keys
   *  (codeEngine/planImportJob.ts → ruleReferenceKey). A code-import
   *  rollback keeps these versions (RETIRED) instead of removing them. */
  listRuleReferenceKeys(): Promise<ServiceResult<string[]>>;

  /** The most recent, real 'charge' transaction for this exact
   *  billingCode on this exact source (specimen or block) that hasn't
   *  already been reversed by a real credit - what a caller removing
   *  that code needs to find before it can generate a correct credit
   *  reversing it. Returns null (never fabricated) when no such,
   *  real, un-reversed charge exists. */
  findActiveChargeForSource(
    caseId: string,
    specimenId: string | undefined,
    blockId: string | undefined,
    billingCode: string
  ): Promise<ServiceResult<ServiceChargeRecord | null>>;

  // ─── Real, per direct guidance's own Feature Specification
  // (Pathology Billing Rules Engine & Audit Logging): the approval
  // lifecycle on an already-saved charge. These mutate ONLY the
  // lifecycle metadata added for this feature (approvalStatus,
  // draftedBy/At, approvedBy/At, rejectionReason) - the exact same
  // narrow, established exception to "append-only" that
  // BillingRuleVersion's own retireVersion/approveVersion/
  // rejectVersion already use (mockBillingRuleService.ts). The real
  // financial substance of a charge (billingCode, cptCode, rvuWork,
  // billingType, etc.) is NEVER touched by any of these - only
  // saveCharge ever creates that content, and it remains immutable
  // once created. ───

  /** Real, per direct guidance's own Four-Eyes Principle requirement -
   *  moves a real DRAFT charge to PENDING_APPROVAL, locking it from
   *  further edits by its own author. Rejects if the charge isn't
   *  currently a real DRAFT. actorRole is optional and backward-
   *  compatible: omitted, this skips the real
   *  canDraftOrApproveBillingCharge permission check entirely
   *  (matching this feature's own "Opt-in Core" default); a real
   *  caller passing the acting user's real role enables real
   *  enforcement. */
  submitForApproval(chargeId: string, submittedBy: string, actorRole?: string): Promise<ServiceResult<ServiceChargeRecord>>;

  /** Real, per direct guidance's own Four-Eyes Principle (dual
   *  control) requirement: approves a real PENDING_APPROVAL charge,
   *  clearing it for export. Hard-enforced here, not just the UI:
   *  rejects if approvedBy matches this charge's own draftedBy,
   *  UNLESS bypassAuthorized is explicitly passed (the real, per
   *  direct guidance "Break-Glass Override Exception" for solo
   *  practitioners/small labs) - every real bypass is recorded on the
   *  charge itself (approvedViaBreakGlass) and must be logged as a
   *  real, separate, high-priority audit alert by the caller (this
   *  service has no audit dependency of its own - see this app's
   *  established UI-layer-logs pattern, mockBillingRuleService.ts's
   *  own callers). actorRole is optional and backward-compatible,
   *  same posture as submitForApproval's own. */
  approveCharge(chargeId: string, approvedBy: string, bypassAuthorized?: boolean, actorRole?: string): Promise<ServiceResult<ServiceChargeRecord>>;

  /** Real, per direct guidance's own Four-Eyes Principle requirement -
   *  declines a real PENDING_APPROVAL charge. Same dual-control
   *  enforcement as approveCharge, plus a required rejectionReason.
   *  Per direct guidance's own state diagram, a rejected charge's
   *  real path back is "Edit & Resubmit" - the caller re-drafts the
   *  underlying charge and calls submitForApproval again; this method
   *  never auto-resubmits anything itself. actorRole is optional and
   *  backward-compatible, same posture as submitForApproval's own. */
  rejectCharge(chargeId: string, reviewedBy: string, rejectionReason: string, actorRole?: string): Promise<ServiceResult<ServiceChargeRecord>>;

  /** Real, per direct guidance's own status enum - a manual, real
   *  pause available from any real state, independent of the main
   *  Draft/Pending/Approved/Rejected flow (e.g. a billing supervisor
   *  holding a charge pending a payer question). releaseHold restores
   *  the exact approvalStatus the charge held immediately before
   *  being placed on hold - never guessed or reset to DRAFT. */
  holdCharge(chargeId: string, heldBy: string): Promise<ServiceResult<ServiceChargeRecord>>;
  releaseHold(chargeId: string, releasedBy: string): Promise<ServiceResult<ServiceChargeRecord>>;
}

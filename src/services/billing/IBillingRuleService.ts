// src/services/billing/IBillingRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real service for the per-billingCode versioned Billing Dictionary
// (types/billing/BillingRuleVersion.ts) - replaces IRvuCodeMapService's
// whole-table versioning with the real, per-rule model, per direct,
// explicit guidance. Follows the same interface/mock/firestore pattern
// as every other governed dictionary in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import type { BillingRuleResolutionOptions } from './resolveBillingRuleAt';

export interface IBillingRuleService {
  /** Every real version, across every billingCode AND every site -
   *  the full audit history, enterprise-wide rows and every real
   *  site's own overrides together. */
  getAll(): Promise<ServiceResult<BillingRuleVersion[]>>;

  /** Every real version for one specific (billingCode, siteId) scope,
   *  in version order - the real per-rule history a "Billing Rule
   *  Change Log" view (per direct guidance) would show. Omitting
   *  siteId returns the enterprise-wide history; a real siteId returns
   *  ONLY that site's own, independent override history - NEVER merged
   *  with the enterprise one, since those are genuinely separate real
   *  sequences (see BillingRuleVersion.ts's own header). */
  getVersionsForBillingCode(billingCode: string, siteId?: string): Promise<ServiceResult<BillingRuleVersion[]>>;

  /** The real rule in effect for a given billingCode on a given real
   *  date of service - the async, storage-backed twin of the pure
   *  resolveBillingRuleAt (resolveBillingRuleAt.ts). This is the one
   *  real call resolveServiceCharge.ts makes at finalization time.
   *  Real, two-tier resolution when siteId is given: prefers that
   *  site's own override when one covers the date, falls back to the
   *  enterprise-wide rule otherwise - exactly resolveBillingRuleAt's
   *  own real algorithm. */
  getActiveRuleAt(billingCode: string, dateOfService: string, siteId?: string, options?: BillingRuleResolutionOptions): Promise<ServiceResult<BillingRuleVersion | null>>;

  /** Creates a new version for a (billingCode, siteId) scope - version
   *  is always auto-computed as (highest existing version within that
   *  SAME scope, or 0) + 1, never accepted from the caller, so
   *  (billingCode, siteId, version) uniqueness can never be violated by
   *  a caller passing the wrong number. A real site creating its FIRST
   *  override of an already-existing enterprise billingCode still gets
   *  its own real version 1 - a genuinely new, independent sequence,
   *  not a continuation of the enterprise row's own version count.
   *  Never edits an existing version in place - the only way to change
   *  a rule. Does NOT automatically retire the prior version - see
   *  retireVersion. Requires a real changeReason for any version beyond
   *  the first WITHIN that same (billingCode, siteId) scope - per
   *  direct guidance's own governance rule ("Changes require: Reason.
   *  Effective date. Approver.").
   *
   *  Real, per direct guidance's own Four-Eyes Principle requirement:
   *  defaults to status 'DRAFT' when the caller doesn't pass one
   *  explicitly - a new rule change no longer goes live on save. An
   *  explicit status is still accepted (the real, initial migration
   *  seed passes 'ACTIVE' directly, since that data predates this
   *  workflow and was never meant to require retroactive approval). */
  createVersion(input: Omit<BillingRuleVersion, 'version' | 'createdAt' | 'status'> & {
    status?: BillingRuleVersion['status'];
  }): Promise<ServiceResult<BillingRuleVersion>>;

  /** Real, per direct guidance's own Four-Eyes Principle requirement:
   *  moves a real DRAFT to PENDING_APPROVAL, locking it from further
   *  edits by its own author and placing it in a real, second
   *  person's review queue. Rejects if the version isn't currently a
   *  real DRAFT - a version already submitted, live, rejected, or
   *  retired can't be re-submitted. */
  submitForApproval(billingCode: string, version: number, siteId: string | undefined, submittedBy: string): Promise<ServiceResult<BillingRuleVersion>>;

  /** Real, per direct guidance's own Four-Eyes Principle (dual
   *  control) requirement: approves a real PENDING_APPROVAL version,
   *  making it genuinely live. Hard-enforced here, not just in the
   *  UI: rejects if reviewedBy matches this version's own createdBy
   *  or submittedForApprovalBy - the person who drafted or submitted
   *  a change can never be the one who approves it. Also retires
   *  whichever version was previously ACTIVE within this same
   *  (billingCode, siteId) scope, if any - real, clean audit history,
   *  not two ACTIVE rows left to quietly compete via
   *  resolveBillingRuleAt's own tie-break. */
  approveVersion(billingCode: string, version: number, siteId: string | undefined, reviewedBy: string): Promise<ServiceResult<BillingRuleVersion>>;

  /** Real, per direct guidance's own Four-Eyes Principle requirement:
   *  declines a real PENDING_APPROVAL version - same dual-control
   *  enforcement as approveVersion, plus a required rejectionReason,
   *  same "a real decision always needs a real reason on record"
   *  posture as changeReason elsewhere in this type. Terminal - the
   *  original author creates a fresh draft to try again, rather than
   *  editing a rejected one back to life. */
  rejectVersion(billingCode: string, version: number, siteId: string | undefined, reviewedBy: string, rejectionReason: string): Promise<ServiceResult<BillingRuleVersion>>;

  /** Marks one specific (billingCode, siteId, version) RETIRED and, if
   *  given, sets its real effectiveTo - the real way a rule change
   *  actually supersedes an old one, at whichever scope (enterprise-
   *  wide, when siteId is omitted, or a specific site) it applies to.
   *  Never deletes the row - real, permanent audit history. */
  retireVersion(billingCode: string, version: number, effectiveTo?: string, siteId?: string): Promise<ServiceResult<BillingRuleVersion>>;
}

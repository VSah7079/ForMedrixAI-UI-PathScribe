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
  getActiveRuleAt(billingCode: string, dateOfService: string, siteId?: string): Promise<ServiceResult<BillingRuleVersion | null>>;

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
   *  Effective date. Approver."). */
  createVersion(input: Omit<BillingRuleVersion, 'version' | 'createdAt' | 'status'> & {
    status?: BillingRuleVersion['status'];
  }): Promise<ServiceResult<BillingRuleVersion>>;

  /** Marks one specific (billingCode, siteId, version) RETIRED and, if
   *  given, sets its real effectiveTo - the real way a rule change
   *  actually supersedes an old one, at whichever scope (enterprise-
   *  wide, when siteId is omitted, or a specific site) it applies to.
   *  Never deletes the row - real, permanent audit history. */
  retireVersion(billingCode: string, version: number, effectiveTo?: string, siteId?: string): Promise<ServiceResult<BillingRuleVersion>>;
}

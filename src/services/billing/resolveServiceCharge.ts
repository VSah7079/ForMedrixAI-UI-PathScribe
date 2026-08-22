// src/services/billing/resolveServiceCharge.ts
// ─────────────────────────────────────────────────────────────────────────────
// The one real place a billingCode ever gets resolved into a real
// CPT/HCPCS/RVU snapshot (ServiceChargeRecord, types/billing/) - per
// direct, explicit guidance: called exactly once, at finalization,
// resolving against the real, per-billingCode versioned Billing
// Dictionary (types/billing/BillingRuleVersion.ts) for the case's real
// date of service - never re-resolved again afterward. A
// ServiceChargeRecord, once created, is a permanent snapshot (see its
// own file's header for the full reasoning).
//
// Real fix, per direct, explicit, fully-specified guidance: resolves
// against resolveBillingRuleAt (the real, per-billingCode
// (billingCode, version)-keyed model) rather than a whole-table
// BillingDictionaryEntry[] snapshot - each billingCode's own rule
// history is now resolved independently, exactly matching the real
// selection algorithm specified: billingCode matches, effectiveFrom <=
// dateOfService, effectiveTo is null or >= dateOfService, status ==
// 'ACTIVE'.
//
// Honest, deliberate behavior: returns null, never a fabricated
// record, when the given billingCode has no real, ACTIVE version
// covering the given date of service - same "never guess, report the
// gap honestly" posture as computeWorkRvuForCodes's own
// unrecognizedCodes. A caller resolving a whole case's worth of
// charges should treat a null result as a real, visible problem (a
// stale/unrecognized billingCode reference, or a real gap in Billing
// Dictionary coverage for that date), not silently drop it.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import { resolveBillingRuleAt } from './resolveBillingRuleAt';

export interface ServiceChargeResolutionContext {
  caseId: string;
  sourceLevel: 'specimen' | 'block';
  sourceLabel: string;
  specimenId?: string;
  blockId?: string;
  sequencePosition?: number;
  /** Real date of service - what resolveBillingRuleAt actually
   *  resolves against (see this file's own header for the exact
   *  algorithm). This is the case's real finalization/service date,
   *  NOT necessarily "now" - a caller resolving a case finalized on a
   *  specific historical date should pass that date, not the current
   *  moment, so the correct historical rule version is selected. */
  dateOfService: string;
  /** Real, two-tier resolution, per direct, explicit guidance: the
   *  real Site.id (services/organisation/organisationService.ts) this
   *  case's charges are being resolved for, if known. When given,
   *  resolveBillingRuleAt prefers a real, site-scoped override for
   *  this site when one covers the date of service; falls back to the
   *  enterprise-wide rule otherwise. Omitting this resolves the
   *  enterprise-wide rule directly, exactly as before site scoping
   *  existed. */
  siteId?: string;
  reportVersionRecordId?: string;
  resolvedBy: string;
  /** When resolution itself actually happened - defaults to now, but
   *  accepted as a real parameter (not always new Date()) so a caller
   *  resolving multiple charges for the same case/event stamps them
   *  all with the exact same resolvedAt, rather than each drifting by
   *  a few milliseconds. Distinct from dateOfService above - a case
   *  can be resolved today for a date of service weeks ago. */
  resolvedAt?: string;
}

/** Real, deterministic id, per this file's own header - reprocessing
 *  the same real event should reliably produce the same
 *  ServiceChargeRecord.id, not a fresh, random one each time. Mirrors
 *  the same composition dftBuilder.ts's own FT1 transactionId already
 *  uses ({caseId}-{label}-{code}), extended with sequencePosition so
 *  two occurrences of the same billingCode on the same source (e.g.
 *  two IHC-ADDL stains) don't collide. */
function buildServiceChargeId(ctx: ServiceChargeResolutionContext, billingCode: string): string {
  const seq = ctx.sequencePosition !== undefined ? `-${ctx.sequencePosition}` : '';
  return `chg-${ctx.caseId}-${ctx.sourceLabel}-${billingCode}${seq}`;
}

/** Real, human-readable composite debug key, per direct guidance's own
 *  example shape ('BILLRULE-IHC-FIRST-3') - derived, never the real
 *  source of truth (billingCode + ruleVersion, and siteId when
 *  present, together already are). Real, site-aware extension: a
 *  site-scoped override's key includes the real site so it's never
 *  confused with the enterprise-wide row's own, independent version
 *  sequence for the same billingCode. */
function buildRuleSetId(billingCode: string, version: number, siteId?: string): string {
  return siteId ? `BILLRULE-${billingCode}-${siteId}-${version}` : `BILLRULE-${billingCode}-${version}`;
}

/** Resolves one real billingCode against the real, per-billingCode
 *  versioned Billing Dictionary for a specific real date of service,
 *  producing an immutable ServiceChargeRecord snapshot. Returns null
 *  (never fabricated) when no real, ACTIVE version of this billingCode
 *  covers the given date. */
export function resolveServiceCharge(
  billingCode: string,
  allVersions: BillingRuleVersion[],
  ctx: ServiceChargeResolutionContext
): ServiceChargeRecord | null {
  const rule = resolveBillingRuleAt(billingCode, ctx.dateOfService, allVersions, ctx.siteId);
  if (!rule) return null;

  return {
    id: buildServiceChargeId(ctx, billingCode),
    caseId: ctx.caseId,
    sourceLevel: ctx.sourceLevel,
    sourceLabel: ctx.sourceLabel,
    specimenId: ctx.specimenId,
    blockId: ctx.blockId,
    billingCode,
    sequencePosition: ctx.sequencePosition,
    cptCode: rule.cpt,
    cptDescription: rule.description,
    hcpcsCode: rule.hcpcsCode,
    modifier: undefined, // real, honest gap: modifiersAllowed is an informational reference list of commonly-associated modifiers, not a decision about which ONE applies to this specific charge — nothing in this app yet decides that, so nothing is auto-assigned here
    rvuWork: rule.rvuWork,
    rvuPe: rule.rvuPe,
    rvuMp: rule.rvuMp,
    // Real, deliberate: stamps the RESOLVED rule's own real siteId
    // (rule.siteId), not ctx.siteId as requested — when no site
    // override existed and resolution fell back to the enterprise-wide
    // rule, rule.siteId is genuinely undefined even though a real
    // ctx.siteId was given, and this record should honestly reflect
    // which tier actually produced it, not merely which site was asked
    // for.
    siteId: rule.siteId,
    suppressionAdvisory: rule.suppressionAdvisory,
    ruleVersion: rule.version,
    ruleSetId: buildRuleSetId(billingCode, rule.version, rule.siteId),
    reportVersionRecordId: ctx.reportVersionRecordId,
    resolvedAt: ctx.resolvedAt ?? new Date().toISOString(),
    resolvedBy: ctx.resolvedBy,
  };
}

/** Real, plural convenience: resolves a whole batch of billingCode
 *  suggestions (e.g. a case's entire set of applied ancillary codes)
 *  against the same version history/context in one pass. Returns both
 *  the real, successfully-resolved records AND which billingCodes (if
 *  any) failed to resolve - same honest-gap-reporting shape as
 *  computeWorkRvuForCodes's own unrecognizedCodes, never silently
 *  dropped. */
export function resolveServiceCharges(
  billingCodes: string[],
  allVersions: BillingRuleVersion[],
  ctx: Omit<ServiceChargeResolutionContext, 'sequencePosition'>
): { charges: ServiceChargeRecord[]; unresolvedBillingCodes: string[] } {
  const charges: ServiceChargeRecord[] = [];
  const unresolvedBillingCodes: string[] = [];
  billingCodes.forEach((billingCode, i) => {
    // sequencePosition only meaningful when the same billingCode
    // repeats within this batch (e.g. two IHC-ADDL on one block) -
    // 1-indexed among occurrences of that exact billingCode, not the
    // batch's own array index, so a single 'SPECIAL-STAIN' among other
    // codes doesn't get a misleading position of e.g. 3.
    const occurrence = billingCodes.slice(0, i + 1).filter(c => c === billingCode).length;
    const repeatsInBatch = billingCodes.filter(c => c === billingCode).length > 1;
    const resolved = resolveServiceCharge(billingCode, allVersions, {
      ...ctx,
      sequencePosition: repeatsInBatch ? occurrence : undefined,
    });
    if (resolved) charges.push(resolved);
    else unresolvedBillingCodes.push(billingCode);
  });
  return { charges, unresolvedBillingCodes };
}

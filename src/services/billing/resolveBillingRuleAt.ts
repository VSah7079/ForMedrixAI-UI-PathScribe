// src/services/billing/resolveBillingRuleAt.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure, synchronous resolver - the real point of the whole per-
// billingCode versioned model (types/billing/BillingRuleVersion.ts):
// given a real billingCode and a real date of service, finds the one
// real rule version that was actually in effect then. Same
// pure-function-plus-async-service-wrapper split already used for
// resolveVersionEffectiveAt/getVersionEffectiveAt (the old
// RvuTableVersion.ts) - kept pure and synchronous here too so it's
// trivially unit-testable without touching the mock service/storage
// layer at all.
//
// Real, two-tier resolution, per direct, explicit guidance: prefers a
// real, site-scoped override for the given siteId when one covers the
// date; falls back to the enterprise-wide row (siteId: undefined) when
// the site has no override of its own for this billingCode/date.
// Never merges the two field-by-field - a site override, when it
// exists for a given date, is used in full; the enterprise row is used
// in full otherwise. Called with no siteId at all (or a siteId with no
// real override anywhere), this resolves the enterprise-wide rule
// exactly as it always did before site scoping existed.
//
// Exact algorithm within each tier, per direct, explicit guidance - not
// an approximation:
//   billingCode matches (and siteId matches, for the site tier)
//   AND effectiveFrom <= dateOfService
//   AND (effectiveTo == null OR effectiveTo >= dateOfService)
//   AND status == 'ACTIVE'
//
// status is checked independently of the date window, not inferred
// from it - a RETIRED row is never selected even if its own
// effectiveFrom/effectiveTo would otherwise match a given date. This
// is a real, deliberate extra safety margin: if a real row was ever
// retired without its effectiveTo being set correctly at the same
// time, the status flag alone still prevents an ambiguous/incorrect
// historical match.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingRuleVersion, CodeVocabulary } from '@/types/billing/BillingRuleVersion';
import { ruleMatchesCountry } from './codeEngine/countryMatch';

/** Real, single-tier match helper - the exact algorithm from this
 *  file's own header, applied within one real siteId scope (a real
 *  site id, or undefined for the enterprise-wide tier). Not exported -
 *  resolveBillingRuleAt below is the real, public two-tier entry
 *  point every real caller should use. */
function matchWithinScope(
  billingCode: string,
  siteId: string | undefined,
  dateOfService: string,
  allVersions: BillingRuleVersion[],
  options: BillingRuleResolutionOptions = {},
): BillingRuleVersion | null {
  const target = new Date(dateOfService).getTime();
  if (isNaN(target)) return null;

  const candidates = allVersions.filter(v => {
    if (v.billingCode !== billingCode) return false;
    if ((v.siteId ?? undefined) !== siteId) return false;
    if (v.status !== 'ACTIVE') return false;
    // PS-89 §8 (Batch 333): extends the filter, never replaces it. A row
    // stored before PS-89 has no vocabulary and is read as CPT.
    if (options.vocabulary && (v.vocabulary ?? 'CPT') !== options.vocabulary) return false;
    if (!ruleMatchesCountry(v.country, options.country)) return false;
    const from = new Date(v.effectiveFrom).getTime();
    if (isNaN(from) || from > target) return false;
    if (v.effectiveTo !== null) {
      const to = new Date(v.effectiveTo).getTime();
      if (isNaN(to) || to < target) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;
  // Real, deliberate tie-break: if more than one real ACTIVE version
  // somehow has an overlapping window within the same scope (shouldn't
  // happen with correctly governed data - effectiveTo should always be
  // set when a newer version starts), the highest version number wins,
  // matching "the most recent real rule" over an older, presumably-
  // should-have-been-retired one.
  return candidates.reduce((a, b) => (b.version > a.version ? b : a));
}

/** Resolves the one real BillingRuleVersion in effect for a given
 *  billingCode on a given real date of service - real, two-tier
 *  resolution, per direct, explicit guidance: prefers a real,
 *  site-scoped override (siteId) when the given site has one covering
 *  this date; falls back to the enterprise-wide rule otherwise.
 *  Omitting siteId entirely resolves the enterprise-wide rule directly
 *  - the exact same behavior as before site scoping existed. Returns
 *  null, never a fabricated match, when nothing real matches at
 *  either tier - a genuine gap (e.g. a billingCode with no version
 *  covering that date at all, at the enterprise level or the given
 *  site) must be visible to a caller, not silently papered over. */
export function resolveBillingRuleAt(
  billingCode: string,
  dateOfService: string,
  allVersions: BillingRuleVersion[],
  siteId?: string,
  options: BillingRuleResolutionOptions = {},
): BillingRuleVersion | null {
  if (siteId) {
    const siteOverride = matchWithinScope(billingCode, siteId, dateOfService, allVersions, options);
    if (siteOverride) return siteOverride;
  }
  return matchWithinScope(billingCode, undefined, dateOfService, allVersions, options);
}

/** PS-89 §8 (Batch 333): optional filters, supplied by the caller. The
 *  resolver stays pure and synchronous; the async site → organisation →
 *  country lookup lives at the service boundary
 *  (mockBillingRuleService.getActiveRuleAt). Omitted = no filtering, the
 *  exact behaviour before PS-89. */
export interface BillingRuleResolutionOptions {
  /** Jurisdiction being billed (see codeEngine/countryMatch.ts). */
  country?: string;
  /** Coding standard (CPT, HCPCS, NHS_OPCS4, LOCAL_LAB). */
  vocabulary?: CodeVocabulary;
}

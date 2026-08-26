// src/services/billing/calculateMolecularUnits.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own worked CPT logic and unit-calculation
// rules (Anatomic FISH 88364-88377, Cytogenetic FISH 88271-88275) - a
// pure function, same established pattern as
// sweepChargesForOutbox.ts/checkSignOutBillingDeficiencies.ts: real data
// in, real billingCodes+units out, never touches storage or resolves a
// CPT value itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { CptMappingRule, MolecularBillingResult } from '@/types/billing/MolecularBillingRule';

const DEFAULT_MULTIPLEX_THRESHOLD = 3;

/** Real, per direct guidance's own worked example and unit-calculation
 *  rules:
 *   BASE_ADDON: 1 target = 1 unit of base. 2+ targets, below the
 *     multiplex threshold = 1 unit of base + (targetCount - 1) units
 *     of add-on. At/above the threshold = 1 unit of the multiplex
 *     code instead (base/add-on not used at all - per direct
 *     guidance's own "3+ Probes / Multiplex Set: 1 unit of Multiplex
 *     Code" rule, not base+addon stacked alongside it).
 *   PER_UNIT_MULTIPLIER: targetCount units of the one real code
 *     (Cytogenetic FISH's own real "88271 x N" pattern).
 *   FLAT_FEE: exactly 1 unit of the one real code, regardless of
 *     target count within whatever tier the dictionary entry itself
 *     represents (a single-gene PCR test and a 50-gene NGS panel are
 *     each their own real, separate dictionary entry/rule - this
 *     function doesn't pick the tier, the dictionary entry chosen
 *     already did). */
export function calculateMolecularUnits(rule: CptMappingRule, targetCount: number): MolecularBillingResult[] {
  if (targetCount <= 0) return [];

  if (rule.billingModel === 'PER_UNIT_MULTIPLIER') {
    if (!rule.perUnitCptCode) return [];
    return [{ billingCode: rule.perUnitCptCode, units: targetCount }];
  }

  if (rule.billingModel === 'FLAT_FEE') {
    if (!rule.flatFeeCptCode) return [];
    return [{ billingCode: rule.flatFeeCptCode, units: 1 }];
  }

  // BASE_ADDON
  const threshold = rule.multiplexThreshold ?? DEFAULT_MULTIPLEX_THRESHOLD;
  if (targetCount >= threshold && rule.multiplexCptCode) {
    return [{ billingCode: rule.multiplexCptCode, units: 1 }];
  }
  const results: MolecularBillingResult[] = [];
  if (rule.baseCptCode) results.push({ billingCode: rule.baseCptCode, units: 1 });
  if (targetCount > 1 && rule.addOnCptCode) {
    results.push({ billingCode: rule.addOnCptCode, units: targetCount - 1 });
  }
  return results;
}

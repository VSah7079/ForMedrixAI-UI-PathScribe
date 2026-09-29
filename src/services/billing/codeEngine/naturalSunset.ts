// src/services/billing/codeEngine/naturalSunset.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 §6 "Natural Sunset" (Batch 333). When a new version of a billing
// rule is approved, the version it supersedes keeps status ACTIVE and gets
// effectiveTo = the moment before the new version's effectiveFrom. Every
// date of service then resolves to the rule actually in force on that date.
//
// Replaces the old approveVersion behaviour, which marked the prior version
// RETIRED immediately: approving a future-dated change (e.g. a 2027 fee
// schedule) left every charge dated before 2027 with no rule at all.
//
// Only an open-ended prior (effectiveTo === null) is closed; a deliberately
// set expiry is never overwritten. A prior that starts on or after the new
// version is left alone (closing it would erase it); the resolver's
// highest-version tie-break covers any overlap.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';

const sameScope = (a: { billingCode: string; siteId?: string }, b: { billingCode: string; siteId?: string }) =>
  a.billingCode === b.billingCode && (a.siteId ?? undefined) === (b.siteId ?? undefined);

/** One millisecond before `effectiveFrom`, as an ISO timestamp. */
export function momentBefore(effectiveFrom: string): string {
  return new Date(new Date(effectiveFrom).getTime() - 1).toISOString();
}

export interface SunsetRecord {
  billingCode: string;
  siteId?: string;
  version: number;
  previousEffectiveTo: string | null;
  closedTo: string;
}

/** Closes the open-ended ACTIVE version that `target` supersedes, if any.
 *  Returns the updated list and what was closed. */
export function applyNaturalSunset(
  versions: BillingRuleVersion[],
  target: BillingRuleVersion,
): { versions: BillingRuleVersion[]; sunset: SunsetRecord | null } {
  const targetFrom = new Date(target.effectiveFrom).getTime();
  let priorIdx = -1;
  versions.forEach((v, i) => {
    if (!sameScope(v, target) || v.version >= target.version || v.status !== 'ACTIVE' || v.effectiveTo !== null) return;
    if (!(new Date(v.effectiveFrom).getTime() < targetFrom)) return;
    if (priorIdx === -1 || v.version > versions[priorIdx].version) priorIdx = i;
  });
  if (priorIdx === -1 || isNaN(targetFrom)) return { versions, sunset: null };

  const prior = versions[priorIdx];
  const closedTo = momentBefore(target.effectiveFrom);
  const next = [...versions];
  next[priorIdx] = { ...prior, effectiveTo: closedTo };
  return {
    versions: next,
    sunset: { billingCode: prior.billingCode, siteId: prior.siteId, version: prior.version, previousEffectiveTo: prior.effectiveTo, closedTo },
  };
}

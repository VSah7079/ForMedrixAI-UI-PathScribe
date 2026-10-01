// src/services/authorization/capabilityDependencies.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): what turning a capability on or off does to the
// others, per Pete: "if I select permission x, but permission x needs
// permission w, then we notify the user and if desired, enable the setting
// for them."
//
//   planGrant   turning keys on: which requirements are missing and would be
//               turned on with them (requirements of requirements included)
//   planRevoke  turning keys off: which granted capabilities depend on them
//               and would be turned off with them
//   unmetRequirements  a grant set's broken pairs; the role service refuses
//               to save a role that has any
//
// Pure: the catalog is passed in (defaults to the real one) so tests can
// use their own.
// ─────────────────────────────────────────────────────────────────────────────

import { CAPABILITY_CATALOG, type CapabilityDefinition } from './capabilityCatalog';

type Catalog = readonly CapabilityDefinition[];

const index = (catalog: Catalog) => new Map(catalog.map(c => [c.key, c]));

/** Every capability `key` needs, directly or through another requirement, in catalog order. */
export function requirementsOf(key: string, catalog: Catalog = CAPABILITY_CATALOG): string[] {
  const byKey = index(catalog);
  const found = new Set<string>();
  const walk = (k: string) => {
    for (const r of byKey.get(k)?.requires ?? []) {
      if (!found.has(r)) { found.add(r); walk(r); }
    }
  };
  walk(key);
  found.delete(key);
  return catalog.map(c => c.key).filter(k => found.has(k));
}

/** Every capability that needs `key`, directly or indirectly, in catalog order. */
export function dependentsOf(key: string, catalog: Catalog = CAPABILITY_CATALOG): string[] {
  return catalog.map(c => c.key).filter(k => k !== key && requirementsOf(k, catalog).includes(key));
}

export interface GrantPlan {
  /** The keys asked for that aren't already granted. */
  requested: string[];
  /** Requirements not yet granted that must come with them. */
  missingRequirements: string[];
  /** The full grant set if the user agrees to turn the requirements on too. */
  withRequirements: string[];
}

/** Turning `keys` on, given what is `granted` now. */
export function planGrant(granted: readonly string[], keys: readonly string[], catalog: Catalog = CAPABILITY_CATALOG): GrantPlan {
  const have = new Set(granted);
  const requested = keys.filter(k => !have.has(k));
  const asked = new Set(requested);
  const missing = new Set<string>();
  for (const k of requested) for (const r of requirementsOf(k, catalog)) if (!have.has(r) && !asked.has(r)) missing.add(r);
  const missingRequirements = catalog.map(c => c.key).filter(k => missing.has(k));
  const all = new Set([...granted, ...requested, ...missingRequirements]);
  return { requested, missingRequirements, withRequirements: inCatalogOrder(all, catalog) };
}

export interface RevokePlan {
  /** The keys asked for that are granted now. */
  requested: string[];
  /** Granted capabilities that stop working without them. */
  affectedDependents: string[];
  /** The full grant set if the user agrees to turn the dependents off too. */
  withDependents: string[];
}

/** Turning `keys` off, given what is `granted` now. */
export function planRevoke(granted: readonly string[], keys: readonly string[], catalog: Catalog = CAPABILITY_CATALOG): RevokePlan {
  const have = new Set(granted);
  const requested = keys.filter(k => have.has(k));
  const asked = new Set(requested);
  const affected = new Set<string>();
  for (const k of requested) for (const d of dependentsOf(k, catalog)) if (have.has(d) && !asked.has(d)) affected.add(d);
  const affectedDependents = catalog.map(c => c.key).filter(k => affected.has(k));
  const remove = new Set([...requested, ...affectedDependents]);
  return { requested, affectedDependents, withDependents: inCatalogOrder(new Set(granted.filter(k => !remove.has(k))), catalog) };
}

export interface UnmetRequirement {
  capability: string;
  missing: string[];
}

/** Granted capabilities whose requirements aren't all granted. Empty when the set is consistent. */
export function unmetRequirements(granted: readonly string[], catalog: Catalog = CAPABILITY_CATALOG): UnmetRequirement[] {
  const have = new Set(granted);
  return inCatalogOrder(have, catalog)
    .map(capability => ({ capability, missing: requirementsOf(capability, catalog).filter(r => !have.has(r)) }))
    .filter(u => u.missing.length > 0);
}

/** Keys in a grant set that aren't in the catalog. */
export function unknownCapabilities(granted: readonly string[], catalog: Catalog = CAPABILITY_CATALOG): string[] {
  const known = index(catalog);
  return granted.filter(k => !known.has(k));
}

function inCatalogOrder(keys: Set<string>, catalog: Catalog): string[] {
  return catalog.map(c => c.key).filter(k => keys.has(k));
}

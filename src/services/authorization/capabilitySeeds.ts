// src/services/authorization/capabilitySeeds.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): the capabilities built-in roles start with, and how
// they reach a site's stored role catalog.
//
// Day-one grants (Pete, Sep 28, 2026: least privilege):
//   Superadmin   every capability in the catalog (no bypass: it is a role)
//   Admin        report change-history export, every QA export, and (Batch
//                370) managing roles and staff and the full demo reset
//   QA Reviewer  the exports only
//   everyone else, Pathologist included: none. A pathologist with QA duties
//   is given QA Reviewer as well.
//   Batch 374: every built-in role (and a hospital's own roles) also starts
//   with the screens it opens (SCREEN_SEEDS, customRoleScreenSeed).
//   Batch 381: every role with case access (built-in or the hospital's own)
//   also starts with placing/releasing holds and delegating a case.
//   Batch 382: and, with Admin, Lab Director and QA Reviewer (who resolve
//   billing deficiencies), correcting an applied billing code, as its own
//   permission apart from case access (Pete: keep today's users).
//
// Seeds are offered once. Each built-in role remembers which seed
// capabilities it has been offered (Role.seededCapabilities), so:
//   • a capability added to the catalog later reaches the built-in roles
//     on their next load;
//   • a capability an administrator removed from a built-in role stays
//     removed.
// Custom roles are offered only screens (Batch 374; customRoleScreenSeed).
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_CAPABILITY_KEYS, CAPABILITY_CATALOG } from './capabilityCatalog';
import { SYSTEM_ROLE_IDS } from '../roles/systemRoles';

const EXPORTS = CAPABILITY_CATALOG
  .filter(c => c.key === 'report:change-history:export' || c.key.startsWith('qa:'))
  .map(c => c.key);

// PS-356 (Batch 370): managing roles and staff, and the full demo reset.
const ADMINISTRATION = CAPABILITY_CATALOG.filter(c => c.group === 'administration').map(c => c.key);

// Batch 372: the hospital's control over support access. Seeded to Admin; a
// hospital can move them to a dedicated IT/security role.
const SUPPORT_ACCESS = CAPABILITY_CATALOG.filter(c => c.group === 'supportAccess').map(c => c.key);

// Batch 374: the screens each built-in role opens (Pete chose this matrix,
// Sep 28, 2026). The Home page and hubs show only these tiles.
const screens = (...names: string[]) => names.map(n => `screen:${n}:open`);
const QUALITY_COMPLIANCE = screens('audit-log', 'quality-assurance');
export const SCREEN_SEEDS: Readonly<Record<string, readonly string[]>> = {
  pathologist: screens('worklist', 'search', 'add-on-orders', 'intraop-queue', 'cytology-qc-queue', 'surgical-qa-worklist', 'my-contributions', 'cytology-workspace'),
  fellow:      screens('worklist', 'search', 'add-on-orders', 'intraop-queue', 'cytology-qc-queue', 'surgical-qa-worklist', 'my-contributions', 'cytology-workspace'),
  resident:    screens('worklist', 'search', 'add-on-orders', 'intraop-queue', 'my-contributions', 'cytology-workspace'),
  pa:          screens('accession', 'worklist', 'search', 'intraop-queue', 'embedding', 'my-contributions'),
  [SYSTEM_ROLE_IDS.ACCESSIONER]:            screens('accession', 'worklist', 'search'),
  [SYSTEM_ROLE_IDS.HISTOTECHNOLOGIST]:      screens('batch-management', 'embedding', 'microtomy', 'slide-distribution', 'search'),
  [SYSTEM_ROLE_IDS.CYTOTECHNOLOGIST]:       screens('cytology-workspace', 'batch-management', 'search'),
  [SYSTEM_ROLE_IDS.MOLECULAR_TECHNOLOGIST]: screens('molecular', 'batch-management', 'search'),
  [SYSTEM_ROLE_IDS.ADMIN]:             [...screens('configuration'), ...QUALITY_COMPLIANCE],
  [SYSTEM_ROLE_IDS.TEMPLATE_AUTHOR]:   screens('configuration'),
  [SYSTEM_ROLE_IDS.TEMPLATE_APPROVER]: screens('configuration'),
  [SYSTEM_ROLE_IDS.LAB_DIRECTOR]:      [...screens('configuration', 'search', 'my-contributions'), ...QUALITY_COMPLIANCE],
  [SYSTEM_ROLE_IDS.QA_REVIEWER]:       QUALITY_COMPLIANCE,
};

const SCREEN_KEYS = CAPABILITY_CATALOG.filter(c => c.group === 'screens').map(c => c.key);

// Batch 382: correcting an applied billing code. Its own list, not part of
// CASE_REPORT_ACTIONS, so it can be taken off the clinical roles later.
const BILLING_CORRECTION = ['billing:applied-code:correct'];
const BILLING_CORRECTION_ROLES: string[] = [
  SYSTEM_ROLE_IDS.ADMIN, SYSTEM_ROLE_IDS.LAB_DIRECTOR, SYSTEM_ROLE_IDS.QA_REVIEWER,
];

// Batch 381: see CASE_REPORT_ACTIONS below.
const CASE_REPORT_ACTIONS_FOR_CUSTOM = ['case:hold:place', 'case:hold:release', 'case:retention-hold:place', 'case:retention-hold:release', 'case:delegation:create'];

/**
 * Batch 374: screens for a role a hospital created itself, so nobody holding
 * one loses a screen they could open before screens were capabilities. A
 * role with case access gets every screen except Configuration and Quality &
 * Compliance; one with configuration access gets those. Offered once, like
 * every seed; an administrator narrows it in the Role Dictionary.
 */
export function customRoleScreenSeed(role: { caseAccess?: boolean; configAccess?: boolean }): string[] {
  const admin = [...screens('configuration'), ...QUALITY_COMPLIANCE];
  return [
    ...(role.caseAccess ? SCREEN_KEYS.filter(k => !admin.includes(k)) : []),
    // Batch 381: and the case report's holds and delegation (Pete: keep today's users).
    ...(role.caseAccess ? [...CASE_REPORT_ACTIONS_FOR_CUSTOM] : []),
    // Batch 382: and correcting an applied billing code (also for the roles that resolve billing deficiencies).
    ...(role.caseAccess || role.configAccess ? [...BILLING_CORRECTION] : []),
    ...(role.configAccess ? admin : []),
  ];
}

/** Built-in role id → the capabilities it starts with. */
// Batch 378: completing grossing, for the people who gross.
const GROSSERS = ['pathologist', 'fellow', 'resident', 'pa'];

// Batch 381 (Pete: "keep today's users"): placing and releasing holds and
// delegating a case, for every role that could open a case report before
// (the roles with case access, built-in and a hospital's own).
export const CASE_REPORT_ACTIONS: readonly string[] = CASE_REPORT_ACTIONS_FOR_CUSTOM;
const CASE_ACCESS_ROLES = [
  ...GROSSERS,
  SYSTEM_ROLE_IDS.ACCESSIONER, SYSTEM_ROLE_IDS.HISTOTECHNOLOGIST, SYSTEM_ROLE_IDS.CYTOTECHNOLOGIST, SYSTEM_ROLE_IDS.MOLECULAR_TECHNOLOGIST,
];

export const CAPABILITY_SEEDS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.entries(SCREEN_SEEDS).map(([r, caps]) => [r, [
    ...caps,
    ...(GROSSERS.includes(r) ? ['case:grossing:complete'] : []),
    ...(CASE_ACCESS_ROLES.includes(r) ? CASE_REPORT_ACTIONS : []),
    ...(CASE_ACCESS_ROLES.includes(r) || BILLING_CORRECTION_ROLES.includes(r) ? BILLING_CORRECTION : []),
  ]])),
  [SYSTEM_ROLE_IDS.SUPERADMIN]: ALL_CAPABILITY_KEYS,
  [SYSTEM_ROLE_IDS.ADMIN]: [...EXPORTS, ...ADMINISTRATION, ...SUPPORT_ACCESS, ...SCREEN_SEEDS[SYSTEM_ROLE_IDS.ADMIN], ...BILLING_CORRECTION],
  [SYSTEM_ROLE_IDS.QA_REVIEWER]: [...EXPORTS, ...SCREEN_SEEDS[SYSTEM_ROLE_IDS.QA_REVIEWER], ...BILLING_CORRECTION],
};

/**
 * Batch 371 (Pete: hospital administrators have no control over
 * Superadmin). The Superadmin role always holds the whole catalog; any
 * stored difference is put back on load. ForMedrixAI decides what it
 * holds, in the catalog, not a hospital in its Role Dictionary.
 */
export function lockPlatformRoles<R extends SeedableRole>(roles: readonly R[]): { roles: R[]; changed: boolean } {
  let changed = false;
  const out = roles.map(r => {
    if (r.id !== SYSTEM_ROLE_IDS.SUPERADMIN) return r;
    const have = r.capabilities ?? [];
    if (have.length === ALL_CAPABILITY_KEYS.length && ALL_CAPABILITY_KEYS.every(k => have.includes(k))) return r;
    changed = true;
    return { ...r, capabilities: [...ALL_CAPABILITY_KEYS], seededCapabilities: [...ALL_CAPABILITY_KEYS] };
  });
  return { roles: out, changed };
}

export interface SeedableRole {
  id: string;
  builtIn?: boolean;
  caseAccess?: boolean;
  configAccess?: boolean;
  capabilities?: string[];
  seededCapabilities?: string[];
}

/** Offers each built-in role the seed capabilities it hasn't been offered yet. */
export function applyCapabilitySeeds<R extends SeedableRole>(roles: readonly R[], seeds: Readonly<Record<string, readonly string[]>> = CAPABILITY_SEEDS): { roles: R[]; changed: boolean } {
  let changed = false;
  const out = roles.map(r => {
    // Batch 374: a hospital's own roles are offered the screens their access implies.
    const custom = r.builtIn ? [] : customRoleScreenSeed(r);
    const seed = r.builtIn ? seeds[r.id] : (custom.length ? custom : undefined);
    const offered = new Set(r.seededCapabilities ?? []);
    const fresh = (seed ?? []).filter(k => !offered.has(k));
    if (fresh.length === 0 && (r.capabilities !== undefined || !seed)) return r;
    changed = true;
    const capabilities = [...new Set([...(r.capabilities ?? []), ...fresh])];
    return { ...r, capabilities, seededCapabilities: [...offered, ...fresh] };
  });
  return { roles: out, changed };
}

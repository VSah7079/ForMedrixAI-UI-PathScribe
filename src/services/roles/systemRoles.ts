// src/services/roles/systemRoles.ts
// ─────────────────────────────────────────────────────────────────────────────
// Built-in (system) roles that PathScribe's own rules depend on, identified
// by fixed role ids (Batch 329, PS-63, per Pete):
//
//   • The ids never change. An administrator may rename a role's display
//     name in Staff → Roles, and the rules still find it by id.
//   • Every site has them out of the box. mergeBuiltInRoles() adds any
//     built-in role missing from a stored catalog (the mock phase's
//     migration; a Firestore seed/migration should reuse it when the real
//     role service exists).
//   • Staff records store role *names* (StaffUser.roles). roleIdsForNames()
//     turns them into ids through the catalog, and a rename is carried over
//     to staff records by the role service (renameRoleInList).
//
// Pure: no storage.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed ids of the built-in roles the rules refer to. */
export const SYSTEM_ROLE_IDS = {
  ADMIN:             'admin',
  TEMPLATE_AUTHOR:   'template-author',
  TEMPLATE_APPROVER: 'template-approver',
  LAB_DIRECTOR:      'lab-director',
  /** PS-355 (Batch 369): exports QA reports and report change history. */
  QA_REVIEWER:       'qa-reviewer',
  /** PS-355 (Batch 369): PathScribe platform support. Held only through a
   *  support sign-in (session role 'superadmin'), never assigned to staff. */
  SUPERADMIN:        'superadmin',
  /** Batch 374: bench roles, so each screen has someone to hold it by default. */
  ACCESSIONER:            'accessioner',
  HISTOTECHNOLOGIST:      'histotechnologist',
  CYTOTECHNOLOGIST:       'cytotechnologist',
  MOLECULAR_TECHNOLOGIST: 'molecular-technologist',
} as const;

export interface CatalogRole {
  id: string;
  name: string;
  builtIn?: boolean;
}

/** Adds every built-in seed role whose id is missing from the stored
 *  catalog. Stored roles are kept as they are (an admin's edits win), so
 *  it is safe to run on every load. */
export function mergeBuiltInRoles<T extends CatalogRole>(stored: T[], seeds: T[]): { roles: T[]; added: string[] } {
  const have = new Set(stored.map(r => r.id));
  const missing = seeds.filter(s => s.builtIn && !have.has(s.id));
  return { roles: missing.length ? [...stored, ...missing] : stored, added: missing.map(r => r.id) };
}

/** Role ids for a staff record's role names. Names are matched to the
 *  catalog without regard to case or surrounding spaces; a name that
 *  matches no role is ignored. */
export function roleIdsForNames(names: readonly string[] | undefined, catalog: readonly CatalogRole[]): string[] {
  const byName = new Map(catalog.map(r => [r.name.trim().toLowerCase(), r.id]));
  const ids = new Set<string>();
  for (const n of names ?? []) {
    const id = byName.get(n.trim().toLowerCase());
    if (id) ids.add(id);
  }
  return [...ids];
}

/** A staff record's role names after a role is renamed. */
export function renameRoleInList(names: readonly string[], oldName: string, newName: string): string[] {
  const old = oldName.trim().toLowerCase();
  const out: string[] = [];
  for (const n of names) {
    const next = n.trim().toLowerCase() === old ? newName : n;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

/** Role fields removed in Batch 370 (PS-356): never enforced. */
export const RETIRED_ROLE_FIELDS = ['canViewPediatric', 'canViewOrchestration', 'facilityIds'] as const;

/** A stored catalog without the retired role fields. */
export function withoutRetiredRoleFields<T extends object>(roles: readonly T[]): { roles: T[]; stripped: boolean } {
  let stripped = false;
  const out = roles.map(r => {
    if (!RETIRED_ROLE_FIELDS.some(f => f in r)) return r;
    stripped = true;
    const copy = { ...r } as Record<string, unknown>;
    for (const f of RETIRED_ROLE_FIELDS) delete copy[f];
    return copy as T;
  });
  return { roles: out, stripped };
}

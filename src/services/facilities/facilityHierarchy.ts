// src/services/facilities/facilityHierarchy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 354: an organisation and everything under it. Facilities form a tree
// through Facility.parentId (an NHS Trust and its hospital sites, say).
// Pete: "Trust-level search to automatically include child organizations and
// specimens underneath them" — choosing a Trust means the Trust and every
// site below it, at any depth. Pure; the parent map is passed in.
// ─────────────────────────────────────────────────────────────────────────────

/** Child facility id → parent facility id, from facilities that have a parent. */
export function parentFacilityIdMap(facilities: ReadonlyArray<{ id: string; parentId?: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of facilities) if (f.parentId) map.set(f.id, f.parentId);
  return map;
}

/**
 * The chosen facilities plus every facility below them. Order: the chosen
 * ids first, then descendants in the parent map's order. A parent loop in
 * bad data can't hang it.
 */
export function withDescendantFacilityIds(
  selected: readonly string[], parentIdById: ReadonlyMap<string, string>,
): string[] {
  const chosen = new Set(selected);
  const out = [...chosen];
  for (const id of parentIdById.keys()) {
    if (chosen.has(id)) continue;
    const seen = new Set<string>([id]);
    for (let p = parentIdById.get(id); p !== undefined && !seen.has(p); p = parentIdById.get(p)) {
      if (chosen.has(p)) { out.push(id); break; }
      seen.add(p);
    }
  }
  return out;
}

type OrgNode = { id: string; isEnterprise?: boolean; parentId?: string; performingLabFacilityId?: string };

/**
 * Batch 372: the organisation (enterprise facility) a facility belongs to:
 * itself if it is one; otherwise up its parents; otherwise, for an ordering
 * client, the organisation of the lab it sends to. Undefined when the chain
 * reaches no organisation. A loop in bad data can't hang it.
 */
export function organisationIdOf(id: string, byId: ReadonlyMap<string, OrgNode>): string | undefined {
  const seen = new Set<string>();
  for (let f = byId.get(id); f && !seen.has(f.id); f = byId.get(f.parentId ?? f.performingLabFacilityId ?? '')) {
    if (f.isEnterprise) return f.id;
    seen.add(f.id);
  }
  return undefined;
}

/**
 * Batch 372: links every hospital id to its organisation. A case records the
 * hospital it came from (Case.originHospitalId), and resolveTenantFacility
 * finds the organisation through Facility.legacyTenantIds. This adds each
 * organisation's own id and the ids of every facility that belongs to it to
 * that list, so a case from a site or an ordering client resolves to its
 * organisation (for access, support access and jurisdiction roll-ups).
 * Existing entries are kept; the input isn't changed.
 */
export function linkFacilitiesToOrganisations<F extends OrgNode & { legacyTenantIds?: string[] }>(facilities: readonly F[]): F[] {
  const byId = new Map(facilities.map(f => [f.id, f] as const));
  const members = new Map<string, string[]>();
  for (const f of facilities) {
    const org = organisationIdOf(f.id, byId);
    if (org) members.set(org, [...(members.get(org) ?? []), f.id]);
  }
  return facilities.map(f => {
    if (!f.isEnterprise) return f;
    const ids = [...(f.legacyTenantIds ?? [])];
    for (const id of members.get(f.id) ?? []) if (!ids.includes(id)) ids.push(id);
    return { ...f, legacyTenantIds: ids };
  });
}

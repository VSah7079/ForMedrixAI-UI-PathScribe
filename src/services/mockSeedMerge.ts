// src/services/mockSeedMerge.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 357: demo data that a browser already stored keeps working when a
// later batch adds a seed record. Seed records whose id isn't stored are
// appended; stored records (and an admin's edits to them) are never
// replaced. Only for lists that can't be deleted from (deactivate instead),
// so a missing id always means "added to the seed since", never "deleted by
// the admin". Nothing stored yet → the seed itself.
// ─────────────────────────────────────────────────────────────────────────────

export function withMissingSeedRecords<T extends { id: string }>(
  stored: readonly T[] | null | undefined, seed: readonly T[],
): { records: T[]; added: number } {
  if (!stored) return { records: seed.map(r => ({ ...r })), added: 0 };
  const have = new Set(stored.map(r => r.id));
  const missing = seed.filter(r => !have.has(r.id)).map(r => ({ ...r }));
  return { records: [...stored, ...missing], added: missing.length };
}

/**
 * Batch 359: a field added to seed records after a browser stored them (e.g.
 * a printer profile's `equipmentId`). Stored records that match a seed
 * record by id and have no value for the field take the seed's; a value the
 * record already has is never replaced.
 */
export function withSeedFieldBackfill<T extends { id: string }, K extends keyof T>(
  stored: readonly T[], seed: readonly T[], field: K,
): { records: T[]; filled: number } {
  const seedById = new Map(seed.map(r => [r.id, r]));
  let filled = 0;
  const records = stored.map(r => {
    const s = seedById.get(r.id);
    if (!s || r[field] !== undefined || s[field] === undefined) return r;
    filled++;
    return { ...r, [field]: s[field] };
  });
  return { records, filled };
}

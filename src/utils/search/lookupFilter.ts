// src/utils/search/lookupFilter.ts
// Batch 350: the text filter and grouping used by the Search page's pickers
// (protocols, flags), moved out of the components.

/** Items where any of the given fields contains the query (case-insensitive). An empty query keeps everything. */
export function filterLookup<T>(items: readonly T[], query: string, fields: (item: T) => ReadonlyArray<string | undefined>): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(item => fields(item).some(f => (f ?? '').toLowerCase().includes(q)));
}

/** Groups items by a label, groups in label order and items by name. */
export function groupLookup<T extends { name: string }>(items: readonly T[], label: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = label(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, xs]) => [k, [...xs].sort((a, b) => a.name.localeCompare(b.name))]);
}

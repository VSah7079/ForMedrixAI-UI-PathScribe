// src/utils/search/suggestSpecimens.ts
// Batch 350: the specimen box's typeahead, from the specimen dictionary
// only. The page used to fall back to a hard-coded list of 24 English names
// when the dictionary had no match; that list is gone.
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';

export function suggestSpecimens(
  dictionary: readonly SpecimenEntry[], query: string, exclude: readonly string[], limit = 8,
): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return dictionary
    .filter(s => s.active && !exclude.includes(s.name) && (
      (s.name ?? '').toLowerCase().includes(q)
      || (s.normalizedLabel ?? '').toLowerCase().includes(q)
      || (s.synonyms ?? []).some(syn => (syn ?? '').toLowerCase().includes(q))
    ))
    .map(s => s.name)
    .slice(0, limit);
}

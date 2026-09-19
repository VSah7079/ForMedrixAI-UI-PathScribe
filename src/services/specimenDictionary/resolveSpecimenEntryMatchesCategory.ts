// src/services/specimenDictionary/resolveSpecimenEntryMatchesCategory.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed correction: "the
// determination is dynamic, it calls a function" — every real call
// site (AccessionPage.tsx's own cytologyRelevant/autopsyRelevant, the
// three real Cytology worklist-membership resolvers) checks a
// specimen dictionary entry's real, closed specimenCategory
// (SpecimenCategory, specimenDictionary/specimenTypes.ts) through
// THIS one, real, shared function — never a raw, duplicated string
// comparison inlined separately at each site, which would drift the
// moment the real category set or matching rule ever changes.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpecimenEntry, SpecimenCategory } from './specimenTypes';

/** Real, per direct guidance's own confirmed design. Returns false
 *  for a real entry with no real specimenCategory set at all — never
 *  a guessed match. Accepts a real, plain Pick so a real caller with
 *  only a partial entry shape (e.g. the three membership resolvers'
 *  own real, narrowed SpecimenDictionary type) can still call this
 *  the same way. */
export function resolveSpecimenEntryMatchesCategory(
  entry: Pick<SpecimenEntry, 'specimenCategory'> | undefined,
  categories: SpecimenCategory[],
): boolean {
  return !!entry?.specimenCategory && categories.includes(entry.specimenCategory);
}

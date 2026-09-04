// src/services/cytology/resolveCytologyReviewRequirement.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for CytologyReviewRecord.requiresPathologistReview
// (types/cytology/CytologyReviewRecord.ts) — computes whether ANY of a
// review's selected interpretation/result categories currently require
// pathologist review, so every real call site (the future screening
// UI, tests, seed/demo data) derives this the same real way rather
// than re-implementing the lookup. Deliberately a pure function over
// an already-fetched category list, not a service call itself — the
// real caller decides when to fetch (mockCytologyCategoryService.getAll())
// and when to snapshot the result onto the record. Real callers combine
// a review's own primaryInterpretationId and additionalInterpretationIds
// via allCytologyInterpretationIds (types/cytology/CytologyReviewRecord.ts)
// before calling this — this function only ever cares about the flat
// set of selected category ids, not which one is primary.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyCategoryEntry } from './ICytologyCategoryService';

/**
 * Real, per the original module's own explicit routing requirement:
 * true if ANY of interpretationResultIds resolves to a category
 * currently flagged requiresPathologistReview: true. An id that
 * doesn't match any real, known category is treated as requiring
 * review — the safe default when a category can't be resolved (e.g.
 * deleted/renamed since the screen), never silently treated as
 * negative.
 */
export function resolveCytologyReviewRequirement(
  interpretationResultIds: string[] | undefined,
  categories: CytologyCategoryEntry[],
): boolean {
  if (!interpretationResultIds || interpretationResultIds.length === 0) return false;
  const byId = new Map(categories.map(c => [c.id, c]));
  return interpretationResultIds.some(id => {
    const category = byId.get(id);
    return category ? category.requiresPathologistReview : true;
  });
}

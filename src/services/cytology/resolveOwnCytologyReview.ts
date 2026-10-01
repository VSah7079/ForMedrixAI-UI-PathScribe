// src/services/cytology/resolveOwnCytologyReview.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct correction: "I created the stored review, so I
// can't be a Secondary Reviewer for my own case. This should put me
// directly into edit mode with the current fields defaulted in from
// my most recent review." resolveCytologyReviewerRole.ts only ever
// looked at whether reviews exist and the current user's own role —
// it never checked whether the CURRENT user is the one who authored
// an existing review. This is the real, missing check: given this
// module's own established "a User may edit their own review, but no
// one else's" posture (PS-153), a user landing on a case they've
// already reviewed should be editing that review, not starting a
// second, separate one under an auto-determined role.
//
// Real, deliberate: returns the MOST RECENT of the current user's own
// reviews if more than one exists (e.g. a real, multi-round review
// history) — never the oldest, and never ambiguous about which one.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

export function resolveOwnCytologyReview<T extends Pick<CytologyReviewRecord, 'recordedBy' | 'recordedAt'>>(
  reviews: T[],
  currentUserId: string,
): T | undefined {
  const own = reviews.filter(r => r.recordedBy.userId === currentUserId);
  if (own.length === 0) return undefined;
  return own.reduce((latest, r) => (r.recordedAt > latest.recordedAt ? r : latest));
}

// src/services/cytologyQc/resolveQcReviewerEligibility.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §2.2's own Self-Review Prevention guardrail — "the
// system enforces a strict system rule blocking the primary sign-out
// provider from being assigned as the QC reviewer." A single, real
// exclusion — kept as its own tiny, pure function rather than folded
// into the criteria matcher, since this is a hard, non-configurable
// system rule, never something an admin-defined rule could override.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveQcReviewerEligibility(candidateReviewerId: string, primarySignOutProviderId: string): boolean {
  return candidateReviewerId !== primarySignOutProviderId;
}

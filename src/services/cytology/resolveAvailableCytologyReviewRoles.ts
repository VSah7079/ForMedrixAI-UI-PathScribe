// src/services/cytology/resolveAvailableCytologyReviewRoles.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for which CytologyReviewRole values are still
// valid to add for a specimen, given its existing reviews. Per direct
// guidance: "There always a single screening event, but there can be
// multiple Secondary Screening events for a case" — the one, real,
// hard constraint is 'primary_screen': exactly one per specimen,
// ever. Every other role (qc_random_selection, qc_targeted_high_risk,
// secondary_reviewer, pathologist_review) is genuinely repeatable —
// no guidance restricts a pathologist to reviewing a specimen only
// once, and Final Diagnosis selection (types/case/Specimen.ts) is
// already the real mechanism for choosing which one is authoritative
// when more than one exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord, CytologyReviewRole } from '@/types/cytology/CytologyReviewRecord';

const ALL_ROLES: CytologyReviewRole[] = [
  'primary_screen', 'qc_random_selection', 'qc_targeted_high_risk', 'secondary_reviewer', 'pathologist_review',
];

export function resolveAvailableCytologyReviewRoles(
  existingReviews: Pick<CytologyReviewRecord, 'role'>[],
): CytologyReviewRole[] {
  const hasPrimaryScreen = existingReviews.some(r => r.role === 'primary_screen');
  return ALL_ROLES.filter(role => role !== 'primary_screen' || !hasPrimaryScreen);
}

/** Real, small convenience: the correct real DEFAULT role to pre-select
 *  when starting a new review — 'primary_screen' if none exists yet
 *  (the common, first-review case), otherwise undefined (the real
 *  user must make a deliberate choice among the remaining, genuinely
 *  ambiguous secondary/pathologist options — never silently guessed). */
export function resolveDefaultCytologyReviewRole(
  existingReviews: Pick<CytologyReviewRecord, 'role'>[],
): CytologyReviewRole | undefined {
  return existingReviews.some(r => r.role === 'primary_screen') ? undefined : 'primary_screen';
}

// src/services/cytology/resolveCytologyRoseEvaluationAdded.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this app's own established pattern for specimen sub-
// records (see resolveCytologyCellBlockMutations.ts) — a pure
// function that computes the real, updated roseEvaluations array; the
// real caller passes the result straight into caseRouter.updateCase.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyRoseEvaluation, CytologyRoseLocation, CytologyRosePass } from '@/types/cytology/CytologyRoseEvaluation';

export function resolveCytologyRoseEvaluationAdded(
  existing: CytologyRoseEvaluation[] | undefined,
  newEvaluation: {
    performedAt: string;
    performedBy: { userId: string; userName: string };
    location: CytologyRoseLocation;
    passes: Omit<CytologyRosePass, 'passNumber'>[];
  },
  newId: string,
): CytologyRoseEvaluation[] {
  const passes: CytologyRosePass[] = newEvaluation.passes.map((p, i) => ({ ...p, passNumber: i + 1 }));
  return [...(existing ?? []), { ...newEvaluation, id: newId, passes }];
}

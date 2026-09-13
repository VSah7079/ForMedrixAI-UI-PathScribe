// src/services/cytologyQc/resolveQcSamplingDecision.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §2.1's own three sampling modes. Pure — the real
// caller injects both the random roll (Math.random(), same "resolve
// at the call site" posture as this app's own existing
// resolveCytologyRandomQcSelection.ts) and each rule's own running
// counter state, rather than this function owning any mutable state
// itself.
//
// Real, deliberate: interval and fixed-volume counters only ever
// advance for a case that already matched this rule's own criteria
// (resolveQcCriteriaMatch.ts) — "every Nth case" means every Nth case
// within this rule's own scope, not literally every case in the lab.
// ─────────────────────────────────────────────────────────────────────────────

import type { QcSamplingLogic } from '@/types/cytologyQc/CytologyQcRule';

export interface QcSamplingState {
  /** Real, for 'interval' mode — how many criteria-matching cases
   *  have been evaluated against this rule since the counter last
   *  reset (on a real selection). */
  casesEvaluatedSinceReset: number;
  /** Real, for 'fixed_volume' mode — how many criteria-matching
   *  cases this rule has already selected, total, ever. Never resets
   *  — "the first N cases for a new provider" is a real, one-time
   *  real-world event, not a recurring window. */
  casesSelectedTotal: number;
}

export const INITIAL_QC_SAMPLING_STATE: QcSamplingState = { casesEvaluatedSinceReset: 0, casesSelectedTotal: 0 };

export interface QcSamplingDecision {
  selected: boolean;
  updatedState: QcSamplingState;
}

export function resolveQcSamplingDecision(
  logic: QcSamplingLogic,
  state: QcSamplingState,
  randomRoll: number,
): QcSamplingDecision {
  switch (logic.type) {
    case 'percentage':
      // Real, same real [0,1) -> [0,100) scaling as this app's own
      // existing resolveCytologyRandomQcSelection.ts.
      return { selected: randomRoll * 100 < logic.ratePercent, updatedState: state };

    case 'interval': {
      const nextCount = state.casesEvaluatedSinceReset + 1;
      if (nextCount >= logic.everyNthCase) {
        return { selected: true, updatedState: { ...state, casesEvaluatedSinceReset: 0 } };
      }
      return { selected: false, updatedState: { ...state, casesEvaluatedSinceReset: nextCount } };
    }

    case 'fixed_volume': {
      if (state.casesSelectedTotal < logic.firstNCases) {
        return { selected: true, updatedState: { ...state, casesSelectedTotal: state.casesSelectedTotal + 1 } };
      }
      return { selected: false, updatedState: state };
    }
  }
}

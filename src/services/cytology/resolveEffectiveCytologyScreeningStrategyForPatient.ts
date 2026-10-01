// src/services/cytology/resolveEffectiveCytologyScreeningStrategyForPatient.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own German G-BA age-stratified screening
// protocol: "Ages 20-34: Annual primary Pap cytology screening...
// Ages 35 and older: Co-testing... every 3 years." The real, second-
// stage resolution step, applied AFTER the existing, real Enterprise/
// Facility cascade (resolveEffectiveCytologyScreeningStrategy.ts)
// already produced the facility's own effective config — this
// function's own real job is only ever to apply that config's real,
// optional age rule against THIS specific patient, for THIS specific
// case. Every real call site that already resolves an effective
// CytologyScreeningStrategy elsewhere (resolveCaseCytologyWorklistMembership,
// resolveCaseCytologyTriagePendingMembership,
// resolveCaseCytologyRecallNeededMembership, resolveCytologyTriageState)
// stays completely unchanged — each still only ever receives one,
// already-resolved CytologyScreeningStrategy value; this function is
// what produces that value for an age-stratified facility, called
// once, by the real caller, before those functions run.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningStrategy, CytologyScreeningStrategyConfig } from './ICytologyScreeningStrategyService';

export function resolveEffectiveCytologyScreeningStrategyForPatient(
  config: CytologyScreeningStrategyConfig,
  patientAge: number | undefined,
): CytologyScreeningStrategy {
  if (!config.ageStratifiedRule) return config.screeningStrategy;
  // Real, safe fallback — an unknown age is never a reason to guess
  // which real bracket applies; the facility's own real, base
  // strategy is used instead, same as a facility with no age rule at
  // all.
  if (patientAge === undefined) return config.screeningStrategy;

  return patientAge < config.ageStratifiedRule.ageThreshold
    ? config.ageStratifiedRule.belowThresholdStrategy
    : config.ageStratifiedRule.atOrAboveThresholdStrategy;
}

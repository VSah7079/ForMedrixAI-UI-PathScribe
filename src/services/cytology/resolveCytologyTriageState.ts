// src/services/cytology/resolveCytologyTriageState.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for the actual "HPV-First" triage state — per
// direct guidance: "the cytology laboratory rarely sees a slide unless
// the automated molecular platform detects high-risk HPV first...
// slides are generated and routed to cytotechnologists only after a
// positive hrHPV result." Reuses the same real hpvResult field PS-172
// already built for co-testing — the difference is not the data, it's
// what that result MEANS: under co-testing it's recorded alongside an
// already-happening screen; under primary_hpv_reflex it's the real
// gate deciding whether a screen happens at all.
//
// Real, per direct guidance's own Australia/NZ NCSP information: "a
// self-collected sample contains vaginal cells rather than cervical
// cells, it cannot be used for Liquid-Based Cytology... The LIS
// suppresses automated LBC reflex ordering. Instead, it auto-generates
// a recommendation flag on the report directing the ordering clinician
// to recall the patient for a follow-up speculum examination." A real,
// distinct outcome from clinician-collected reflex — never the SAME
// specimen becoming screening-eligible, since that's clinically
// impossible for a self-collected sample.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningStrategy } from './ICytologyScreeningStrategyService';

export type CytologyTriageState =
  /** co_testing strategy — no real triage gate; cytology is always
   *  screened regardless of the HPV result. */
  | 'not_applicable'
  /** primary_hpv_reflex, real hrHPV result not yet recorded — no
   *  cytology slide should exist yet. */
  | 'awaiting_hpv_result'
  /** primary_hpv_reflex, real hrHPV result negative — routine recall;
   *  no reflex cytology is ever performed. */
  | 'hpv_negative_complete'
  /** primary_hpv_reflex, real hrHPV result positive, clinician-
   *  collected specimen — reflex cytology is now genuinely required;
   *  the SAME specimen becomes eligible for the real cytology
   *  worklist. */
  | 'reflex_triggered'
  /** primary_hpv_reflex, real hrHPV result positive, SELF-collected
   *  specimen — reflex cytology from this specimen is clinically
   *  impossible (vaginal, not cervical, cells). The case is never
   *  eligible for cytology screening; it needs a real, separate,
   *  later recall workflow (a new patient visit, a new
   *  clinician-collected specimen) that this phase does not build. */
  | 'reflex_requires_new_specimen';

export function resolveCytologyTriageState(
  screeningStrategy: CytologyScreeningStrategy,
  hpvResult: string | undefined,
  isSelfCollected: boolean,
): CytologyTriageState {
  if (screeningStrategy !== 'primary_hpv_reflex') return 'not_applicable';
  if (hpvResult === 'Positive') {
    return isSelfCollected ? 'reflex_requires_new_specimen' : 'reflex_triggered';
  }
  if (hpvResult === 'Negative') return 'hpv_negative_complete';
  // Real, safe default: 'Pending', 'Not Performed', or genuinely
  // unset all mean the same real thing here — no confirmed result yet,
  // so cytology is never assumed eligible. Same "unresolved is never
  // the reassuring answer" posture this module already established
  // (resolveCytologyReviewRequirement, resolvePriorAbnormalPapFactor).
  return 'awaiting_hpv_result';
}

/** Real, small convenience: is a case genuinely eligible for cytology
 *  screening right now, given its own real triage state? A real
 *  co-testing case always is; a real primary_hpv_reflex case only
 *  once reflex has actually been triggered on a clinician-collected
 *  specimen — never for a self-collected one, regardless of result. */
export function isCytologyScreeningEligible(state: CytologyTriageState): boolean {
  return state === 'not_applicable' || state === 'reflex_triggered';
}

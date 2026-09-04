// src/services/cytology/resolveCytologyCategorySetConcordance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared, generic logic for comparing two sets of
// CytologyCategoryEntry.id (interpretation/result category selections)
// and reporting the delta. Deliberately generic — used for more than
// one real comparison in this module: a primary screen against a
// CytologySecondaryScreeningEvent, and (Phase 4) a primary screen
// against the selected CytologyFinalDiagnosisSelection for real
// discordance reporting. Renamed from an earlier, narrower
// "SecondaryScreeningConcordance" name once a second, genuinely
// different real caller needed the identical comparison — same
// function, not a duplicate.
//
// Deliberately returns structured added/missing category ids rather
// than a single "discordant: true" opinion — real severity
// classification (adding HSIL where nothing was found before is a
// genuinely different situation from adding a second, minor organism
// finding) is real, separate, later work, not decided here. What IS
// decided here, per direct guidance on when a discordance genuinely
// warrants CAPA ("a single [] discordance is an isolated diagnostic
// consultation... CAPA is reserved for... recurring trends"): this
// function only ever informs a real QaActivityRecord
// (services/quality/) — it never itself raises a CAPA.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyCategorySetConcordanceResult {
  concordant: boolean;
  /** Category ids present in the comparison set that the primary set
   *  did not have. */
  addedByComparison: string[];
  /** Category ids present in the primary set that the comparison set
   *  did not reproduce. */
  missedByComparison: string[];
}

export function resolveCytologyCategorySetConcordance(
  primaryInterpretationResultIds: string[] | undefined,
  comparisonInterpretationResultIds: string[] | undefined,
): CytologyCategorySetConcordanceResult {
  const primary = new Set(primaryInterpretationResultIds ?? []);
  const comparison = new Set(comparisonInterpretationResultIds ?? []);

  const addedByComparison = [...comparison].filter(id => !primary.has(id));
  const missedByComparison = [...primary].filter(id => !comparison.has(id));

  return {
    concordant: addedByComparison.length === 0 && missedByComparison.length === 0,
    addedByComparison,
    missedByComparison,
  };
}

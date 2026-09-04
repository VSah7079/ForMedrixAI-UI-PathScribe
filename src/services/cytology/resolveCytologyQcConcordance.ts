// src/services/cytology/resolveCytologyQcConcordance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for comparing a primary GYN cytology screen against
// its own QC re-screen (CytologyScreeningRecord.interpretationResultIds
// vs. .qcScreen.interpretationResultIds, types/case/Specimen.ts).
//
// Deliberately returns structured added/removed category ids rather than
// a single "discordant: true" opinion — the real severity classification
// (a QC screen adding HSIL where the primary screen found nothing is a
// genuinely different situation from one adding a second, minor organism
// finding) is real, separate, later work (Module 1's own QC-rescreening
// scope), not decided here. What IS decided here, per direct guidance on
// when a discordance genuinely warrants CAPA ("a single [] discordance is
// an isolated diagnostic consultation... CAPA is reserved for...
// recurring trends"): this function only ever informs a real
// QaActivityRecord (services/quality/) — it never itself raises a CAPA.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyQcConcordanceResult {
  concordant: boolean;
  /** Category ids the QC screen found that the primary screen did not. */
  addedByQc: string[];
  /** Category ids the primary screen found that the QC screen did not
   *  reproduce. */
  missedByQc: string[];
}

export function resolveCytologyQcConcordance(
  primaryInterpretationResultIds: string[] | undefined,
  qcInterpretationResultIds: string[] | undefined,
): CytologyQcConcordanceResult {
  const primary = new Set(primaryInterpretationResultIds ?? []);
  const qc = new Set(qcInterpretationResultIds ?? []);

  const addedByQc = [...qc].filter(id => !primary.has(id));
  const missedByQc = [...primary].filter(id => !qc.has(id));

  return {
    concordant: addedByQc.length === 0 && missedByQc.length === 0,
    addedByQc,
    missedByQc,
  };
}

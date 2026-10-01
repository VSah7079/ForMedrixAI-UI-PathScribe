// src/services/cytology/resolveCytologySecondaryScreeningConcordance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for comparing a primary GYN cytology screen against
// one CytologySecondaryScreeningEvent (types/case/Specimen.ts) — a QC
// rescreen (random or targeted) or a Secondary Reviewer's own look, both
// modeled the same way since the underlying credential is always
// Cytotechnologist, just acting in a different workflow capacity for a
// different reason (see CytologySecondaryScreeningEvent.trigger). Real,
// per direct correction: a case can have MULTIPLE secondary screening
// events — call this once per event, not once per case.
//
// Deliberately returns structured added/removed category ids rather than
// a single "discordant: true" opinion — the real severity classification
// (this event adding HSIL where the primary screen found nothing is a
// genuinely different situation from adding a second, minor organism
// finding) is real, separate, later work (Module 1's own scope), not
// decided here. What IS decided here, per direct guidance on when a
// discordance genuinely warrants CAPA ("a single [] discordance is an
// isolated diagnostic consultation... CAPA is reserved for... recurring
// trends"): this function only ever informs a real QaActivityRecord
// (services/quality/) — it never itself raises a CAPA.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologySecondaryScreeningConcordanceResult {
  concordant: boolean;
  /** Category ids this secondary screening event found that the primary
   *  screen did not. */
  addedByEvent: string[];
  /** Category ids the primary screen found that this secondary
   *  screening event did not reproduce. */
  missedByEvent: string[];
}

export function resolveCytologySecondaryScreeningConcordance(
  primaryInterpretationResultIds: string[] | undefined,
  secondaryInterpretationResultIds: string[] | undefined,
): CytologySecondaryScreeningConcordanceResult {
  const primary = new Set(primaryInterpretationResultIds ?? []);
  const secondary = new Set(secondaryInterpretationResultIds ?? []);

  const addedByEvent = [...secondary].filter(id => !primary.has(id));
  const missedByEvent = [...primary].filter(id => !secondary.has(id));

  return {
    concordant: addedByEvent.length === 0 && missedByEvent.length === 0,
    addedByEvent,
    missedByEvent,
  };
}

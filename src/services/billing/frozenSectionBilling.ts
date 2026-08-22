// src/services/billing/frozenSectionBilling.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, new work for the Charge Capture build: suggests billingCode
// labels for frozen section work performed at the bench
// (services/intraop/), once that data has been merged into a real Case
// (IIntraoperativeService.merge()). Same shape and same "suggest a
// reference, resolve the real CPT/RVU elsewhere" posture as
// suggestAncillaryCodesForStains (codeMapTable.ts) - CPT 88331 (first
// tissue block, frozen section) / 88332 (each additional tissue block)
// is a real, verified, per-SPECIMEN counting rule, confirmed via
// direct search against current AMA/payer coding guidance, same shape
// as the IHC 88342/88341 first/additional rule this mirrors.
//
// AI may suggest, never assign - same principle as every other real
// suggestion in this app (see SpecimenCodingSummaryBlock's own
// appliedAncillaryCodes/unappliedSuggestions split). This function only
// ever returns suggestions; nothing here writes to a case's real
// billing data.
//
// Real fix, resolves PS-82 (Jira) - real, confirmed guidance closed
// the open assumption this file used to carry: counting real
// 'frozen_section_cut' MilestoneEntry timestamps was never reliable,
// since milestones[] tracks WORKFLOW SEQUENCE (did the step happen, in
// what order), not a real, itemized count of what was actually
// produced - a specimen can genuinely have both touch preps and
// frozen blocks, which a single milestone type could never
// distinguish. The real, confirmed source is
// IntraopSpecimen.preparations[] (types/intraop/IntraoperativeEntry.ts)
// - a real, itemized PreparationOutput per thing actually produced,
// each with its own real identifier (e.g. "FS-A1"). This file now
// counts frozen blocks from there, via countFrozenBlocksForSpecimen
// below - never from milestones.length again.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntraopSpecimen } from '@/types/intraop/IntraoperativeEntry';

/** Light, decoupled adapter type - same "just the fields this function
 *  actually needs" posture as StainOrderForCptSuggestion in
 *  codeMapTable.ts, rather than importing the full IntraopSpecimen
 *  type directly into the core counting function below.
 *  frozenSectionCutCount is the REAL, itemized count of frozen_block
 *  PreparationOutput entries for this specimen - see
 *  countFrozenBlocksForSpecimen for the one, real, canonical way to
 *  compute it; a caller should never hand-roll this count from
 *  milestones.length again (that was PS-82's own real, confirmed
 *  gap). */
export interface FrozenSectionSpecimenForCptSuggestion {
  specimenId: string;
  frozenSectionCutCount: number;
}

export interface FrozenSectionCptSuggestion {
  specimenId: string;
  suggestions: string[];
}

/** The one, real, canonical way to count real frozen blocks for a
 *  specimen - resolves PS-82. Counts real PreparationOutput entries of
 *  type 'frozen_block' from preparations[], NOT milestones[] (a
 *  'frozen_section_cut' milestone marks that the workflow STEP
 *  happened at all, not how many real blocks were produced - a
 *  specimen can have one milestone entry and three real frozen
 *  blocks, or vice versa if a step was logged before any real output
 *  existed yet). Every future real caller (a real finalization flow,
 *  once one exists) should use this function, or the higher-level
 *  suggestFrozenSectionCptCodesFromSpecimens below, rather than
 *  re-deriving a count independently. */
export function countFrozenBlocksForSpecimen(specimen: Pick<IntraopSpecimen, 'preparations'>): number {
  return (specimen.preparations ?? []).filter(p => p.type === 'frozen_block').length;
}

/** Real, per-specimen counting - CPT 88331/88332 is a per-specimen
 *  rule (confirmed via direct search, same shape as the IHC
 *  88342/88341 rule this mirrors): the first real frozen block on a
 *  specimen suggests FROZEN-FIRST (88331), every additional real
 *  frozen block on the SAME specimen suggests FROZEN-ADDL (88332). A
 *  specimen with zero frozen blocks contributes no suggestions at all
 *  - "not every case has a Frozen," per direct confirmation.
 *
 *  Deliberately takes the light, decoupled adapter shape
 *  (frozenSectionCutCount: number), not IntraopSpecimen directly -
 *  same reasoning as codeMapTable.ts's own StainOrderForCptSuggestion:
 *  keeps this pure counting logic testable and reusable independent
 *  of the real intraop data shape. Real callers with actual
 *  IntraopSpecimen[] data should use
 *  suggestFrozenSectionCptCodesFromSpecimens below instead of building
 *  this adapter shape by hand. */
export function suggestFrozenSectionCptCodes(
  specimens: FrozenSectionSpecimenForCptSuggestion[]
): FrozenSectionCptSuggestion[] {
  return specimens.map(sp => {
    const suggestions: string[] = [];
    for (let i = 0; i < sp.frozenSectionCutCount; i++) {
      suggestions.push(i === 0 ? 'FROZEN-FIRST' : 'FROZEN-ADDL');
    }
    return { specimenId: sp.specimenId, suggestions };
  });
}

/** Real, high-level entry point - the one a real finalization flow
 *  should actually call once it exists (services/billing has no real
 *  caller of any of this yet - confirmed directly, same as before).
 *  Takes real IntraopSpecimen[] data directly, computes each
 *  specimen's real frozen-block count via countFrozenBlocksForSpecimen
 *  (never milestones.length), and produces the same real
 *  FROZEN-FIRST/FROZEN-ADDL suggestions as the lower-level function
 *  above - this is the version that actually closes PS-82 end to end,
 *  not just in isolation. */
export function suggestFrozenSectionCptCodesFromSpecimens(
  specimens: Pick<IntraopSpecimen, 'id' | 'preparations'>[]
): FrozenSectionCptSuggestion[] {
  return suggestFrozenSectionCptCodes(
    specimens.map(sp => ({ specimenId: sp.id, frozenSectionCutCount: countFrozenBlocksForSpecimen(sp) }))
  );
}

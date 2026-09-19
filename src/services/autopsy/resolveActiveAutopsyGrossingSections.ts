// src/services/autopsy/resolveActiveAutopsyGrossingSections.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "Derived Visibility
// Implementation Logic" — replaces the earlier, narrower
// resolveAutopsyGrossingSectionVisibility.ts preset model
// (whole_body/head_and_neck/thoraco_abdominal, Rule Sets 1-3) with a
// real, general derivation: which sections are active falls out of
// which real organs are actually present among the case's real
// specimens, via Specimen.organCodes and AUTOPSY_ORGAN_TO_SECTION
// (types/autopsy/AutopsyOrganCode.ts). Every combination the original
// spec's own Rule Sets named (and every one it didn't) falls out for
// free — no new preset ever needs adding by hand again.
//
// Real, deliberate scope: resolveAutopsyGrossingSectionVisibility.ts
// and resolveAutopsyTargetedOrganSectionVisibility() are NOT removed
// — they still correctly express the original spec's own 4 named
// rule sets as fixed presets, useful for a real case where specimens
// haven't been organ-coded yet. This function is the real, general
// mechanism a rendering layer should prefer once real organCodes
// exist on the case's own specimens.
// ─────────────────────────────────────────────────────────────────────────────

import { AUTOPSY_ORGAN_TO_SECTION } from '../../types/autopsy/AutopsyOrganCode';
import { AUTOPSY_GROSSING_SECTION_IDS, type AutopsyGrossingSectionId } from './resolveAutopsyGrossingSectionVisibility';

export interface AutopsySpecimenForSectionDerivation {
  organCodes?: string[];
}

/** Real, per direct guidance's own confirmed pseudocode exactly:
 *  External Examination is always active; each real specimen with a
 *  real, recognized organCode adds that organ's own mapped section.
 *  A real, unrecognized organCode (not in AUTOPSY_ORGAN_TO_SECTION —
 *  e.g. stale data from a schema change) is silently skipped, never
 *  thrown on — this is a real, additive visibility derivation, not a
 *  validation gate. */
export function resolveActiveAutopsyGrossingSections(
  specimens: AutopsySpecimenForSectionDerivation[],
): Set<AutopsyGrossingSectionId> {
  const activeSections = new Set<AutopsyGrossingSectionId>(['external_examination']);

  for (const specimen of specimens) {
    for (const organCode of specimen.organCodes ?? []) {
      const section = AUTOPSY_ORGAN_TO_SECTION[organCode as keyof typeof AUTOPSY_ORGAN_TO_SECTION];
      if (section) activeSections.add(section);
    }
  }

  return activeSections;
}

/** Real, per direct guidance's own confirmed convenience: the same
 *  real result as resolveActiveAutopsyGrossingSections(), expressed
 *  as a real, complete visible/hidden list across every real section
 *  — matching resolveAutopsyGrossingSectionVisibility.ts's own
 *  established { sectionId, visible } shape, so a real rendering
 *  layer can treat both real mechanisms identically regardless of
 *  which one produced the result. */
export function resolveActiveAutopsyGrossingSectionVisibility(
  specimens: AutopsySpecimenForSectionDerivation[],
): { sectionId: AutopsyGrossingSectionId; visible: boolean }[] {
  const active = resolveActiveAutopsyGrossingSections(specimens);
  return AUTOPSY_GROSSING_SECTION_IDS.map(sectionId => ({ sectionId, visible: active.has(sectionId) }));
}

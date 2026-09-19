// src/services/specimenDictionary/resolveCaseDisciplineBranch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed framing: "we have three
// main big branches of work, that everything files under. Surg Path,
// Cytology and Autopsy" — the real, pure classification behind the
// Worklist's own branch tabs. Deliberately a closed, 3-way
// classification (never a 4th "Molecular" branch — per direct
// guidance's own explicit "some might make the claim... I'm not one
// of them yet"): Surgical Pathology is the real, remainder bucket —
// any real case that isn't Cytology or Autopsy — not a fabricated,
// separate positive check of its own.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen } from '@/types/case/Specimen';
import type { SpecimenEntry } from './specimenTypes';
import { resolveCaseHasSpecimenCategory } from './resolveCaseHasSpecimenCategory';

export type CaseDisciplineBranch = 'surgpath' | 'cytology' | 'autopsy';

export function resolveCaseDisciplineBranch(
  specimens: Pick<Specimen, 'specimenDictionaryEntryId'>[] | undefined,
  specimenDictionary: Pick<SpecimenEntry, 'id' | 'specimenCategory'>[],
  hasAutopsy: boolean,
): CaseDisciplineBranch {
  if (hasAutopsy) return 'autopsy';
  if (
    resolveCaseHasSpecimenCategory(specimens, specimenDictionary, 'GYN_CYTOLOGY') ||
    resolveCaseHasSpecimenCategory(specimens, specimenDictionary, 'NON_GYN_CYTOLOGY')
  ) {
    return 'cytology';
  }
  return 'surgpath';
}

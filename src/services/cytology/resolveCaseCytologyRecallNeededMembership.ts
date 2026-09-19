// src/services/cytology/resolveCaseCytologyRecallNeededMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for a genuinely distinct real state — per direct
// guidance's own Australia/NZ NCSP information: "The LIS suppresses
// automated LBC reflex ordering. Instead, it auto-generates a
// recommendation flag on the report directing the ordering clinician
// to recall the patient for a follow-up speculum examination." A
// positive result on a self-collected specimen is NEVER eligible for
// cytology screening (resolveCaseCytologyWorklistMembership correctly
// excludes it) — but it must not simply vanish from every real tile
// either, since someone needs to see it and act on the recall. This
// resolver is that real, visible surface.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen } from '@/types/case/Specimen';
import type { SpecimenEntry } from '../specimenDictionary/specimenTypes';
import { resolveSpecimenEntryMatchesCategory } from '../specimenDictionary/resolveSpecimenEntryMatchesCategory';
import { resolveCytologyWorklistRouting } from './resolveCytologyWorklistRouting';
import type { NonGynCytologyRouting } from './ICytologyRoutingSettingsService';
import type { CytologyScreeningStrategy } from './ICytologyScreeningStrategyService';
import { resolveCytologyTriageState } from './resolveCytologyTriageState';

function isCytologySpecimenType(type: string): boolean {
  return type === 'Cytology' || type === 'FNA';
}

export function resolveCaseCytologyRecallNeededMembership(
  specimens: (Pick<Specimen, 'specimenDictionaryEntryId'> & { cytologyScreening?: { hpvResult?: string } })[] | undefined,
  specimenDictionary: Pick<SpecimenEntry, 'id' | 'type' | 'specimenCategory' | 'isSelfCollected'>[],
  nonGynRoutingSetting: NonGynCytologyRouting,
  screeningStrategy: CytologyScreeningStrategy,
): boolean {
  if (screeningStrategy !== 'primary_hpv_reflex') return false;
  if (!specimens || specimens.length === 0) return false;
  const byId = new Map(specimenDictionary.map(e => [e.id, e]));

  return specimens.some(sp => {
    if (!sp.specimenDictionaryEntryId) return false;
    const entry = byId.get(sp.specimenDictionaryEntryId);
    if (!entry || !isCytologySpecimenType(entry.type)) return false;
    const destination = resolveCytologyWorklistRouting(resolveSpecimenEntryMatchesCategory(entry, ['GYN_CYTOLOGY']), nonGynRoutingSetting);
    if (destination !== 'cytology_worklist') return false;
    return resolveCytologyTriageState(screeningStrategy, sp.cytologyScreening?.hpvResult, entry.isSelfCollected === true) === 'reflex_requires_new_specimen';
  });
}

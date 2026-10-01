// src/services/cytology/resolveCaseCytologyTriagePendingMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for the real HPV Triage tile — genuinely distinct
// from resolveCaseCytologyWorklistMembership, which returns cases
// eligible for actual cytology SCREENING. This one returns the
// opposite real state: a case that has a real, qualifying cytology
// specimen but is still awaiting its real molecular hrHPV result under
// 'primary_hpv_reflex' — the case a lab tech needs to see in order to
// record that real result and either trigger reflex cytology or close
// the case out with no slide ever needed.
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

export function resolveCaseCytologyTriagePendingMembership(
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
    return resolveCytologyTriageState(screeningStrategy, sp.cytologyScreening?.hpvResult, entry.isSelfCollected === true) === 'awaiting_hpv_result';
  });
}

// src/services/cytology/resolveCaseCytologyWorklistMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for whether a Case belongs on the Cytology
// worklist — the actual filter behind the Cytology tile's own worklist
// content (PS-159's real follow-up). Checks every real specimen on the
// case against the specimen dictionary (SpecimenEntry.type/
// isGynCytology) and the effective, resolved
// CytologyRoutingSettingsConfig (PS-158) via
// resolveCytologyWorklistRouting.
//
// Deliberately takes the specimen dictionary as a plain array (already
// fetched by the real caller) rather than calling
// mockSpecimenDictionaryService itself — same "resolve at the call
// site, pass already-loaded data in" posture as
// resolveEffectiveCytologyRoutingSettings.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen } from '@/types/case/Specimen';
import type { SpecimenEntry } from '../specimenDictionary/specimenTypes';
import { resolveCytologyWorklistRouting } from './resolveCytologyWorklistRouting';
import type { NonGynCytologyRouting } from './ICytologyRoutingSettingsService';
import type { CytologyScreeningStrategy } from './ICytologyScreeningStrategyService';
import { resolveCytologyTriageState, isCytologyScreeningEligible } from './resolveCytologyTriageState';

/** Real, per direct guidance: a specimen counts as "cytology" for this
 *  worklist's own purposes if its dictionary entry's real `type` is
 *  'Cytology' or 'FNA' — the same two real types this module's own
 *  earlier seed data established (services/cytology/README.md). */
function isCytologySpecimenType(type: string): boolean {
  return type === 'Cytology' || type === 'FNA';
}

/**
 * True if AT LEAST ONE of this case's real specimens is a cytology
 * specimen that, per the effective routing setting, belongs on the
 * Cytology worklist, AND is genuinely eligible for cytology screening
 * right now — under 'primary_hpv_reflex' (this phase's own real HPV-
 * First triage), a case still awaiting its real molecular result, or
 * one that already came back negative, never surfaces here for
 * screening; it only does once reflex has genuinely been triggered.
 * A case with a mix of specimen types (rare, but real) still surfaces
 * here if any one specimen qualifies — the real caller is responsible
 * for only showing/acting on the qualifying specimen(s) within a mixed
 * case, not this function.
 */
export function resolveCaseCytologyWorklistMembership(
  specimens: (Pick<Specimen, 'specimenDictionaryEntryId'> & { cytologyScreening?: { hpvResult?: string } })[] | undefined,
  specimenDictionary: Pick<SpecimenEntry, 'id' | 'type' | 'isGynCytology' | 'isSelfCollected'>[],
  nonGynRoutingSetting: NonGynCytologyRouting,
  screeningStrategy: CytologyScreeningStrategy,
): boolean {
  if (!specimens || specimens.length === 0) return false;
  const byId = new Map(specimenDictionary.map(e => [e.id, e]));

  return specimens.some(sp => {
    if (!sp.specimenDictionaryEntryId) return false;
    const entry = byId.get(sp.specimenDictionaryEntryId);
    if (!entry || !isCytologySpecimenType(entry.type)) return false;
    const destination = resolveCytologyWorklistRouting(entry.isGynCytology === true, nonGynRoutingSetting);
    if (destination !== 'cytology_worklist') return false;
    const triageState = resolveCytologyTriageState(screeningStrategy, sp.cytologyScreening?.hpvResult, entry.isSelfCollected === true);
    return isCytologyScreeningEligible(triageState);
  });
}

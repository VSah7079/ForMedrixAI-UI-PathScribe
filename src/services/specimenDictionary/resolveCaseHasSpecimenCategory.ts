// src/services/specimenDictionary/resolveCaseHasSpecimenCategory.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up recalling a real, prior, explicit
// requirement ("I do not want to send the Pathologist to multiple
// worklist" — services/cytology/README.md's own Phase 8 account) that
// was deliberately deferred as "real, separate, later work" and never
// actually built until now: GYN Cytology / Non-GYN Cytology-FNA
// worklist tiles, surfaced within the existing /worklist itself.
//
// Deliberately a simple, direct specimen-category membership check —
// not resolveCaseCytologyWorklistMembership.ts, which is scoped to
// that module's own, narrower "genuinely eligible for cytology
// screening right now" question (HPV reflex state, routing settings)
// — a genuinely different real question from "does this case have a
// specimen of this category at all," which is all a worklist tile
// filter needs.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen } from '@/types/case/Specimen';
import type { SpecimenEntry } from './specimenTypes';

export function resolveCaseHasSpecimenCategory(
  specimens: Pick<Specimen, 'specimenDictionaryEntryId'>[] | undefined,
  specimenDictionary: Pick<SpecimenEntry, 'id' | 'specimenCategory'>[],
  category: string,
): boolean {
  if (!specimens || specimens.length === 0) return false;
  const byId = new Map(specimenDictionary.map(e => [e.id, e]));
  return specimens.some(sp => {
    if (!sp.specimenDictionaryEntryId) return false;
    return byId.get(sp.specimenDictionaryEntryId)?.specimenCategory === category;
  });
}

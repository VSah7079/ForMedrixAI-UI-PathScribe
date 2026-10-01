// src/services/cytology/resolveCytologyWorklistRouting.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for where a cytology specimen's case should
// surface. Real, per direct guidance: GYN cytology always routes to
// the real, dedicated Cytology worklist — not configurable, since
// that's this whole module's own reason for existing. Only non-GYN
// cytology/FNA has a genuine, real routing choice
// (ICytologyRoutingSettingsService.ts).
//
// Deliberately takes `isGynCytology` as an explicit input rather than
// inferring it here — the real signal for "is this specimen GYN vs.
// non-GYN cytology" lives on the specimen dictionary entry itself
// (services/specimenDictionary/), and this function shouldn't
// duplicate or re-derive that lookup; the real caller resolves the
// specimen's own dictionary entry and passes the answer in.
// ─────────────────────────────────────────────────────────────────────────────

import type { NonGynCytologyRouting } from './ICytologyRoutingSettingsService';

export type CytologyWorklistDestination = 'cytology_worklist' | 'surgical_pathology_worklist';

export function resolveCytologyWorklistRouting(
  isGynCytology: boolean,
  nonGynRoutingSetting: NonGynCytologyRouting,
): CytologyWorklistDestination {
  if (isGynCytology) return 'cytology_worklist';
  return nonGynRoutingSetting === 'cytology_worklist' ? 'cytology_worklist' : 'surgical_pathology_worklist';
}

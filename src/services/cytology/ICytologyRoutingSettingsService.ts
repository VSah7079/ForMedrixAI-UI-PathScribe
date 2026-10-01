// src/services/cytology/ICytologyRoutingSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct guidance: "Some customers treat non gyn
// cytology like Surgicals, and some treat them like cytotech" —
// corrected by direct follow-up: "the non gyn cytology is an
// enterprise and performing facility decision and not determined by
// their customers." Real, two-tier cascade — Enterprise default
// (this file, Tier 1) + a real, performing-Facility override (Tier 2,
// IFacilityCytologyRoutingOverrideService.ts) — same real cascade
// shape as ICytologyQcSettingsService.ts's own Tier 1/Tier 2 (PS-157),
// deliberately WITHOUT that one's third, Staff-level tier: direct
// guidance names only Enterprise and performing Facility as the real
// decision-makers here, never an individual staff member.
//
// Real, per direct guidance: GYN cytology (Pap/HPV co-testing) always
// routes to the real, dedicated Cytology worklist — that's not
// configurable, since it's this whole module's own real reason for
// existing. Only NON-GYN cytology (FNA, non-GYN body-site cytology)
// has a genuine, real routing choice.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** Real, per direct guidance's own two real options — "like Surgicals"
 *  (the existing, general WorklistPage/WorklistTable a Pathologist
 *  and PA already use for every non-cytology specimen) or "like
 *  cytotech" (this module's own new, dedicated Cytology worklist,
 *  alongside GYN cases). */
export type NonGynCytologyRouting = 'surgical_pathology_worklist' | 'cytology_worklist';

export interface CytologyRoutingSettingsConfig {
  nonGynCytologyRouting: NonGynCytologyRouting;
}

/** Real, per direct guidance's own comparison table earlier this
 *  module ("Cytotech vs. Pathologist Correlation" etc.) and general
 *  lab practice: FNA/non-GYN cytology most commonly follows the same
 *  general worklist as surgical pathology unless a lab has a
 *  dedicated cytology service handling it — a sensible, real default,
 *  never silently assumed to be the ONLY correct choice (an admin can
 *  always change it). */
export const DEFAULT_CYTOLOGY_ROUTING_SETTINGS: CytologyRoutingSettingsConfig = {
  nonGynCytologyRouting: 'surgical_pathology_worklist',
};

export interface ICytologyRoutingSettingsService {
  get(): Promise<ServiceResult<CytologyRoutingSettingsConfig>>;
  update(patch: Partial<CytologyRoutingSettingsConfig>): Promise<ServiceResult<CytologyRoutingSettingsConfig>>;
  reset(): Promise<ServiceResult<CytologyRoutingSettingsConfig>>;
}

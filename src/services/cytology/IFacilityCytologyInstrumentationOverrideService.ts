// src/services/cytology/IFacilityCytologyInstrumentationOverrideService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "each performing facility could identify
// their own [instrumentation] mode... is it possible that an
// individual system could have both types?" — high priority, given
// this app now supports multiple facilities.
//
// Real Tier 2 (facility-level override) — same real shape as this
// module's own established siblings for exactly this kind of
// cascade: IFacilityCytologyNomenclatureOverrideService.ts,
// IFacilityCytologyWorkloadCapOverrideService.ts,
// IFacilityCytologyQcOverrideService.ts. `ICytologyInstrumentationService.ts`
// (unchanged by this work) remains Tier 1, the Enterprise-wide
// default — this is the Tier 2 override on top of it.
//
// Real, deliberate consequence of this shape: because the override is
// a per-facility record (not a single, second global value), a real
// system genuinely CAN have both instrumentation modalities in use at
// once — one facility overridden to 'traditional_guided' while another
// stays on the Enterprise 'wsi' default (or is itself overridden to
// 'wsi' explicitly) — resolved independently per case via
// resolveEffectiveCytologyInstrumentationModality.ts, keyed off that
// case's own performing facility. This is the real, structural fix for
// both of direct guidance's own questions at once: per-facility
// identification, and a system genuinely running mixed modalities.
//
// At most one real record per facility — getForFacility/create/
// update/remove all key on facilityId directly, same as every sibling
// override service above.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologyInstrumentationConfig } from './ICytologyInstrumentationService';

export interface FacilityCytologyInstrumentationOverride {
  id: string;
  /** Real FK to Facility.id. Unique per facility; a second create()
   *  for the same facility is a real error, not a silent second
   *  record — same real invariant every sibling override service
   *  enforces. */
  facilityId: string;
  overrides: Partial<CytologyInstrumentationConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCytologyInstrumentationOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCytologyInstrumentationOverride | null>>;
  /** Real, deliberate signature: takes the FULL, starting-point config
   *  up front (the admin UI seeds this from the current Enterprise
   *  value), same reasoning as every sibling override service's own
   *  create() — a facility choosing to override starts from a real,
   *  complete, known-good baseline, not a half-defined record. */
  create(facilityId: string, overrides: CytologyInstrumentationConfig): Promise<ServiceResult<FacilityCytologyInstrumentationOverride>>;
  update(facilityId: string, changes: Partial<CytologyInstrumentationConfig>): Promise<ServiceResult<FacilityCytologyInstrumentationOverride>>;
  /** Real "revert to Enterprise Default" — deletes the override record
   *  outright; getForFacility genuinely returns null afterward. */
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

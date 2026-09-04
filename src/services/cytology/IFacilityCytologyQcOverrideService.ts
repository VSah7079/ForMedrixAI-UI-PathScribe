// src/services/cytology/IFacilityCytologyQcOverrideService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Tier 2 (facility-level override) — same real shape as
// IFacilityPrintSettingsService.ts. A record is a PARTIAL override,
// not a second full config — only the fields a facility has actually
// chosen to diverge on are ever set; everything else genuinely
// inherits Tier 1's own Enterprise default.
//
// At most one real record per facility — getForFacility/create/
// update/remove all key on facilityId directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologyQcSettingsConfig } from './ICytologyQcSettingsService';

export interface FacilityCytologyQcOverride {
  id: string;
  /** Real FK to Facility.id. Unique per facility; a second create()
   *  for the same facility is a real error, not a silent second
   *  record. */
  facilityId: string;
  overrides: Partial<CytologyQcSettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCytologyQcOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCytologyQcOverride | null>>;
  /** Real, deliberate signature: takes the FULL, starting-point config
   *  up front (the admin UI seeds this from the current Enterprise
   *  values) rather than creating an empty override and patching it —
   *  same reasoning as IFacilityPrintSettingsService.create's own doc
   *  comment: a facility choosing to override starts from a real,
   *  complete, known-good baseline, not a half-defined record. */
  create(facilityId: string, overrides: CytologyQcSettingsConfig): Promise<ServiceResult<FacilityCytologyQcOverride>>;
  update(facilityId: string, changes: Partial<CytologyQcSettingsConfig>): Promise<ServiceResult<FacilityCytologyQcOverride>>;
  /** Real "revert to Enterprise Default" — deletes the override record
   *  outright; getForFacility genuinely returns null afterward. */
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

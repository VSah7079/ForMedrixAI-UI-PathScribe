// src/services/cytology/IFacilityCytologyWorkloadCapOverrideService.ts
// Real Tier 2 (facility-level override) — same real shape as
// IFacilityCytologyQcOverrideService.ts (PS-157). Real, per direct
// guidance: "make it universal but configurable at the enterprise,
// facility and staff level" — a facility can set its own real default
// cap (e.g. a lab running an especially high-throughput, well-
// automated workflow choosing a higher facility-wide cap), which a
// named individual's own Staff override can still further refine.
import type { ServiceResult } from '../types';
import type { CytologyWorkloadCapSettingsConfig } from './ICytologyWorkloadCapSettingsService';

export interface FacilityCytologyWorkloadCapOverride {
  id: string;
  facilityId: string;
  overrides: Partial<CytologyWorkloadCapSettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCytologyWorkloadCapOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCytologyWorkloadCapOverride | null>>;
  create(facilityId: string, overrides: CytologyWorkloadCapSettingsConfig): Promise<ServiceResult<FacilityCytologyWorkloadCapOverride>>;
  update(facilityId: string, changes: Partial<CytologyWorkloadCapSettingsConfig>): Promise<ServiceResult<FacilityCytologyWorkloadCapOverride>>;
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

// src/services/cytology/IFacilityCytologyNomenclatureOverrideService.ts
// Real Tier 2 (facility-level override) — same real shape as
// IFacilityCytologyRoutingOverrideService.ts (PS-158).
import type { ServiceResult } from '../types';
import type { CytologyNomenclatureSettingsConfig } from './ICytologyNomenclatureSettingsService';

export interface FacilityCytologyNomenclatureOverride {
  id: string;
  facilityId: string;
  overrides: Partial<CytologyNomenclatureSettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCytologyNomenclatureOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCytologyNomenclatureOverride | null>>;
  create(facilityId: string, overrides: CytologyNomenclatureSettingsConfig): Promise<ServiceResult<FacilityCytologyNomenclatureOverride>>;
  update(facilityId: string, changes: Partial<CytologyNomenclatureSettingsConfig>): Promise<ServiceResult<FacilityCytologyNomenclatureOverride>>;
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

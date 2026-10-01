// src/services/cytology/IFacilityCytologyRegistryOverrideService.ts
// Real Tier 2 (facility-level override) — same real shape as this
// module's own established facility-override services.
import type { ServiceResult } from '../types';
import type { CytologyRegistrySettingsConfig } from './ICytologyRegistrySettingsService';

export interface FacilityCytologyRegistryOverride {
  id: string;
  facilityId: string;
  overrides: Partial<CytologyRegistrySettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCytologyRegistryOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCytologyRegistryOverride | null>>;
  create(facilityId: string, overrides: CytologyRegistrySettingsConfig): Promise<ServiceResult<FacilityCytologyRegistryOverride>>;
  update(facilityId: string, changes: Partial<CytologyRegistrySettingsConfig>): Promise<ServiceResult<FacilityCytologyRegistryOverride>>;
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

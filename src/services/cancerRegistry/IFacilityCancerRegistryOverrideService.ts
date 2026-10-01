// src/services/cancerRegistry/IFacilityCancerRegistryOverrideService.ts
// Real Tier 2 (facility-level override) — same real shape as
// services/cytology/IFacilityCytologyRegistryOverrideService.ts.
import type { ServiceResult } from '../types';
import type { CancerRegistrySettingsConfig } from './ICancerRegistrySettingsService';

export interface FacilityCancerRegistryOverride {
  id: string;
  facilityId: string;
  overrides: Partial<CancerRegistrySettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCancerRegistryOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCancerRegistryOverride | null>>;
  create(facilityId: string, overrides: CancerRegistrySettingsConfig): Promise<ServiceResult<FacilityCancerRegistryOverride>>;
  update(facilityId: string, changes: Partial<CancerRegistrySettingsConfig>): Promise<ServiceResult<FacilityCancerRegistryOverride>>;
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

// src/services/facilities/IFacilityRegistryOverrideService.ts
// Real, generalized Tier 2 (facility-level override) — see
// IRegistrySettingsService.ts's own header for the full reasoning
// behind moving this out of services/cytology/. Same real shape as
// this module's own established facility-override services.
import type { ServiceResult } from '../types';
import type { RegistrySettingsConfig } from './IRegistrySettingsService';

export interface FacilityRegistryOverride {
  id: string;
  facilityId: string;
  overrides: Partial<RegistrySettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityRegistryOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityRegistryOverride | null>>;
  create(facilityId: string, overrides: RegistrySettingsConfig): Promise<ServiceResult<FacilityRegistryOverride>>;
  update(facilityId: string, changes: Partial<RegistrySettingsConfig>): Promise<ServiceResult<FacilityRegistryOverride>>;
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

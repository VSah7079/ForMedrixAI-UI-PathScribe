// src/services/cytology/IFacilityCytologyScreeningStrategyOverrideService.ts
// Real Tier 2 (facility-level override) — same real shape as this
// phase's own IFacilityCytologyNomenclatureOverrideService.ts.
import type { ServiceResult } from '../types';
import type { CytologyScreeningStrategyConfig } from './ICytologyScreeningStrategyService';

export interface FacilityCytologyScreeningStrategyOverride {
  id: string;
  facilityId: string;
  overrides: Partial<CytologyScreeningStrategyConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityCytologyScreeningStrategyOverrideService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityCytologyScreeningStrategyOverride | null>>;
  create(facilityId: string, overrides: CytologyScreeningStrategyConfig): Promise<ServiceResult<FacilityCytologyScreeningStrategyOverride>>;
  update(facilityId: string, changes: Partial<CytologyScreeningStrategyConfig>): Promise<ServiceResult<FacilityCytologyScreeningStrategyOverride>>;
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

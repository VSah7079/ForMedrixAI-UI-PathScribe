// src/services/cytology/IStaffCytologyWorkloadCapOverrideService.ts
// Real Tier 2 (per-staff-member override) — same real shape as
// IStaffCytologyQcOverrideService.ts (PS-157).
import type { ServiceResult } from '../types';
import type { CytologyWorkloadCapSettingsConfig } from './ICytologyWorkloadCapSettingsService';

export interface StaffCytologyWorkloadCapOverride {
  id: string;
  staffUserId: string;
  overrides: Partial<CytologyWorkloadCapSettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IStaffCytologyWorkloadCapOverrideService {
  getForStaff(staffUserId: string): Promise<ServiceResult<StaffCytologyWorkloadCapOverride | null>>;
  create(staffUserId: string, overrides: CytologyWorkloadCapSettingsConfig): Promise<ServiceResult<StaffCytologyWorkloadCapOverride>>;
  update(staffUserId: string, changes: Partial<CytologyWorkloadCapSettingsConfig>): Promise<ServiceResult<StaffCytologyWorkloadCapOverride>>;
  remove(staffUserId: string): Promise<ServiceResult<void>>;
}

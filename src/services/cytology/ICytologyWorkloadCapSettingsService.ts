// src/services/cytology/ICytologyWorkloadCapSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CLIA workload specification:
// "Individual Cap (C_user) = Default 100, or lower (e.g., 80) if
// assigned by Medical Director." Real, two-tier cascade — Enterprise
// default + a real, per-staff-member override, mirroring
// IStaffCytologyQcOverrideService.ts's own established shape exactly,
// since this is the same real kind of decision (a named individual's
// own, real, assigned limit) that setting's cascade already models.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface CytologyWorkloadCapSettingsConfig {
  dailySlideCap: number;
}

export const DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS: CytologyWorkloadCapSettingsConfig = {
  dailySlideCap: 100,
};

export interface ICytologyWorkloadCapSettingsService {
  get(): Promise<ServiceResult<CytologyWorkloadCapSettingsConfig>>;
  update(patch: Partial<CytologyWorkloadCapSettingsConfig>): Promise<ServiceResult<CytologyWorkloadCapSettingsConfig>>;
  reset(): Promise<ServiceResult<CytologyWorkloadCapSettingsConfig>>;
}

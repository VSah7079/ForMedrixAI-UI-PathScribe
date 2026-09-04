// src/services/cytology/IStaffCytologyQcOverrideService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Tier 3 (per-staff-member override), per direct guidance: "This
// gives us the flexibility to assign higher rates of QC for new
// employees or students." A genuinely new tier — this app's own
// established settings-cascade precedent (print settings) only ever
// went two levels (Enterprise → Facility); this is the first real
// per-person override in that same cascade shape.
//
// Same real "partial override, at most one record per real owner"
// pattern as Tier 2 (IFacilityCytologyQcOverrideService.ts), keyed on
// StaffUser.id (types/index.ts) instead of facilityId.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologyQcSettingsConfig } from './ICytologyQcSettingsService';

export interface StaffCytologyQcOverride {
  id: string;
  /** Real FK to StaffUser.id. Unique per staff member; a second
   *  create() for the same person is a real error, not a silent
   *  second record. */
  staffUserId: string;
  overrides: Partial<CytologyQcSettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IStaffCytologyQcOverrideService {
  getForStaff(staffUserId: string): Promise<ServiceResult<StaffCytologyQcOverride | null>>;
  /** Real, deliberate signature — same reasoning as Tier 2's own
   *  create(): takes the FULL, starting-point config, not a bare
   *  patch. */
  create(staffUserId: string, overrides: CytologyQcSettingsConfig): Promise<ServiceResult<StaffCytologyQcOverride>>;
  update(staffUserId: string, changes: Partial<CytologyQcSettingsConfig>): Promise<ServiceResult<StaffCytologyQcOverride>>;
  /** Real "revert to the next tier down" (Facility override if one
   *  exists, otherwise Enterprise Default) — deletes the override
   *  record outright; getForStaff genuinely returns null afterward. */
  remove(staffUserId: string): Promise<ServiceResult<void>>;
}

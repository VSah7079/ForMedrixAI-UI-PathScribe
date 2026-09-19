// src/services/qualitySettings/IStaffConcordanceReviewOverrideService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Tier 3 (per-staff-member override), per direct follow-up
// ("after wiring do this settings have the usual fallback
// Enterprise→performing facility→staff?"). Checked directly: this
// app's own established settings-cascade precedent (Print Settings,
// Post-Sign-Out Release Buffer) only ever goes two levels
// (Enterprise/org default → Facility) — the one real precedent for a
// third, staff-level tier is IStaffCytologyQcOverrideService.ts,
// built for a specific, named reason ("flexibility to assign higher
// rates of QC for new employees or students"). Concordance review is
// closer in kind to that case (individual pathologist review
// behavior) than to Release Buffer (an operational hold), so this
// mirrors that same, real Tier 3 shape exactly rather than the
// two-tier one.
//
// Same real "partial override, at most one record per real owner"
// pattern as the facility tier, keyed on StaffUser.id instead of
// facilityId.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { ConcordanceReviewOrgConfig } from './IConcordanceReviewSettingsService';

export interface StaffConcordanceReviewOverride {
  id: string;
  /** Real FK to StaffUser.id. Unique per staff member; a second
   *  create() for the same person is a real error, not a silent
   *  second record. */
  staffUserId: string;
  overrides: Partial<ConcordanceReviewOrgConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IStaffConcordanceReviewOverrideService {
  getForStaff(staffUserId: string): Promise<ServiceResult<StaffConcordanceReviewOverride | null>>;
  /** Real, deliberate signature — same reasoning as the facility
   *  tier's own create(): takes the FULL, starting-point config, not
   *  a bare patch. */
  create(staffUserId: string, overrides: ConcordanceReviewOrgConfig): Promise<ServiceResult<StaffConcordanceReviewOverride>>;
  update(staffUserId: string, changes: Partial<ConcordanceReviewOrgConfig>): Promise<ServiceResult<StaffConcordanceReviewOverride>>;
  /** Real "revert to the next tier down" (Facility override if one
   *  exists, otherwise the Enterprise/org default) — deletes the
   *  override record outright; getForStaff genuinely returns null
   *  afterward. */
  remove(staffUserId: string): Promise<ServiceResult<void>>;
}

// src/services/cytology/ISnomedCervicalHistologySeverityMappingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Implement a real settings layer for the
// mapping table" — the real, persisted, admin-managed counterpart to
// resolveCytologyHistologySeverityFromSnomed.ts's own
// SnomedSeverityMappingEntry parameter type. Same real CRUD shape this
// codebase already establishes for other admin-managed dictionaries
// (ICytologyCategoryService.ts's own add/update/remove pattern),
// deliberately simpler here: no active/deactivate soft-delete concept,
// since a mapping entry is either present or it isn't — an admin who
// no longer wants one removes it outright.
//
// Real, deliberate design match to the already-established, already-
// respected policy this module's own resolvers already follow
// (Case.ts's own syntheticAbnormalCoding doc comment: no real,
// licensed SNOMED CT code value is ever hardcoded anywhere in this
// codebase): the mock implementation of this interface never ships a
// real code value, seed data included. Per direct follow-up, it IS
// seeded — with real, structurally-safe synthetic entries (every code
// prefixed "TEST-SNOMED-", every description leading "[SYNTHETIC —
// TEST ONLY]", same established convention as
// services/abnormalDetection/resolveSyntheticCoding.ts) so a demo can
// show the real mapping mechanism working end to end before a real
// customer/admin replaces these with real codes, once they have real
// SNOMED CT terminology access, through the real admin UI this
// interface backs.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface SnomedCervicalHistologySeverityMappingEntry {
  id: string;
  snomedCode: string;
  /** Real, human-readable label for what this code represents — an
   *  admin managing this list needs to know what they're mapping to a
   *  severity rank, not just a bare code number (e.g. "CIN III /
   *  High-grade squamous intraepithelial lesion"). */
  description: string;
  /** Real, same 0-5 scale as cytology's own diagnosticRank, for direct
   *  comparability — see resolveCytologyHistologySeverityFromSnomed.ts's
   *  own doc comment for the real, worked example scale. */
  severityRank: number;
  createdAt: string;
  createdBy?: { userId: string; userName: string };
}

export type NewSnomedCervicalHistologySeverityMappingEntry = Omit<SnomedCervicalHistologySeverityMappingEntry, 'id' | 'createdAt'>;

export interface ISnomedCervicalHistologySeverityMappingService {
  getAll(): Promise<ServiceResult<SnomedCervicalHistologySeverityMappingEntry[]>>;
  add(entry: NewSnomedCervicalHistologySeverityMappingEntry): Promise<ServiceResult<SnomedCervicalHistologySeverityMappingEntry>>;
  /** Real, deliberate restriction: snomedCode itself is not editable
   *  here — changing the real code a mapping applies to is, in
   *  effect, creating a different real mapping; an admin who needs
   *  that removes the old entry and adds a new one, keeping the real
   *  audit trail (createdAt/createdBy) honest for each. */
  update(id: string, changes: Partial<Pick<SnomedCervicalHistologySeverityMappingEntry, 'description' | 'severityRank'>>): Promise<ServiceResult<SnomedCervicalHistologySeverityMappingEntry>>;
  remove(id: string): Promise<ServiceResult<void>>;
}

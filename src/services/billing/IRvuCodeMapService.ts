// src/services/billing/IRvuCodeMapService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real service for the versioned CPT-to-wRVU code map - follows the same
// interface/mock/firestore pattern as every other governed dictionary in
// this app (see services/README.md's core pattern section).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { RvuTableVersion, CptWorkRvuEntry } from './RvuTableVersion';

export interface IRvuCodeMapService {
  getAllVersions(): Promise<ServiceResult<RvuTableVersion[]>>;

  /** The version new, going-forward calculations should use. */
  getActiveVersion(): Promise<ServiceResult<RvuTableVersion | null>>;

  /** Real fix for the core versioning concern: resolves the real
   *  version that was actually effective on a given date - e.g. the
   *  rates in force when a historical case was genuinely finalized, not
   *  whatever version happens to be active today. Picks the version
   *  with the latest effectiveDate that is still <= the given date; if
   *  none qualifies (asking about a date before any version existed),
   *  returns null rather than guessing. */
  getVersionEffectiveAt(isoDate: string): Promise<ServiceResult<RvuTableVersion | null>>;

  /** Creates a new, immutable version - the only way to change the code
   *  map. Never edits an existing version's entries in place, matching
   *  RvuTableVersion.ts's own documented reasoning. Does NOT
   *  automatically activate the new version - see activateVersion. */
  createVersion(input: {
    label: string;
    effectiveDate: string;
    entries: CptWorkRvuEntry[];
    uploadedBy: string;
    sourceFileName?: string;
  }): Promise<ServiceResult<RvuTableVersion>>;

  /** Marks one version active, deactivating all others - exactly one
   *  version is active at a time. Does not affect historical resolution
   *  (getVersionEffectiveAt) at all, which is date-based, not
   *  active-flag-based - activating a version only changes what NEW
   *  calculations default to. Real, per direct follow-up: only ever
   *  called internally by approveVersion below now - a version is
   *  never activated except through the real approval gate. */
  activateVersion(versionId: string): Promise<ServiceResult<RvuTableVersion>>;

  /** Real, per direct follow-up: "we just need to track the changes
   *  so we know who is responsible and have it go through the
   *  approval process." Mirrors mockModifierDictionaryService.ts's
   *  own approveVersion exactly - a different, real reviewer than the
   *  one who created this version must approve it before it becomes
   *  the real, active table. Hard-enforced here, not just in the UI. */
  approveVersion(versionId: string, reviewedBy: string): Promise<ServiceResult<RvuTableVersion>>;

  /** Same real, hard-enforced dual-control gate as approveVersion.
   *  Requires a real rejection reason - never activates. */
  rejectVersion(versionId: string, reviewedBy: string, rejectionReason: string): Promise<ServiceResult<RvuTableVersion>>;
}

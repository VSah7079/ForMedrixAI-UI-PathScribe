// src/services/billing/IModifierDictionaryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real service for the versioned CPT modifier dictionary - follows the
// same interface/mock/firestore pattern as every other governed
// dictionary in this app (see services/README.md's core pattern
// section), mirroring IRvuCodeMapService.ts's own real shape exactly.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { ModifierTableVersion, CptModifierTableEntry } from './ModifierTableVersion';

export interface IModifierDictionaryService {
  getAllVersions(): Promise<ServiceResult<ModifierTableVersion[]>>;

  /** The version new, going-forward modal pickers should use. */
  getActiveVersion(): Promise<ServiceResult<ModifierTableVersion | null>>;

  /** Creates a new, immutable version - the only way to change the
   *  dictionary. Never edits an existing version's entries in place.
   *  Does NOT automatically activate the new version - see
   *  activateVersion. Real, per direct guidance's own "Isolate
   *  Synthetic Data" best practice: licenseStatus is required, never
   *  inferred or defaulted - the uploading admin must affirmatively
   *  state whether this version's own description text is a real,
   *  licensed AMA import or still synthetic placeholder content. */
  createVersion(input: {
    label: string;
    effectiveDate: string;
    entries: CptModifierTableEntry[];
    uploadedBy: string;
    licenseStatus: 'synthetic' | 'licensed';
    sourceFileName?: string;
  }): Promise<ServiceResult<ModifierTableVersion>>;

  /** Marks one version active, deactivating all others - exactly one
   *  version is active at a time. Real, per direct follow-up: only
   *  ever called internally by approveVersion below now - a version
   *  is never activated except through the real approval gate. Kept
   *  as its own method (rather than inlined) since it's also how the
   *  original seed version became active with no approval history to
   *  satisfy. */
  activateVersion(versionId: string): Promise<ServiceResult<ModifierTableVersion>>;

  /** Real, per direct follow-up: "we just need to track the changes
   *  so we know who is responsible and have it go through the
   *  approval process" - a different, real reviewer than the one who
   *  created this version must approve it before it becomes the real,
   *  active table. Hard-enforced here, not just in the UI - mirrors
   *  mockBillingRuleService.ts's own approveVersion exactly. */
  approveVersion(versionId: string, reviewedBy: string): Promise<ServiceResult<ModifierTableVersion>>;

  /** Same real, hard-enforced dual-control gate as approveVersion.
   *  Requires a real rejection reason - never activates. */
  rejectVersion(versionId: string, reviewedBy: string, rejectionReason: string): Promise<ServiceResult<ModifierTableVersion>>;
}

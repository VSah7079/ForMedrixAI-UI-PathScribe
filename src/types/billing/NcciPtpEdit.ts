// src/types/billing/NcciPtpEdit.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: PathScribe does not ship with real NCCI PTP
// edit data baked in - CMS's own "How to Use the NCCI Tools" guide is
// explicit that downloading the real Practitioner PTP Edits / PTP
// Modifier Indicators tables requires accepting AMA copyright terms
// first, the same real constraint PS-92 already tracks for CPT
// descriptions. The real, intended mechanism (per direct confirmation)
// is a genuine customer-driven import: whoever holds the real license
// downloads the current quarter's real files from CMS.gov and uploads
// them here - mirroring the same real bulk-upload pattern
// RvuCodeMapSection.tsx already uses for its own generic CMS RVU
// spreadsheet import (parseRvuUploadRows/uploadPreview), not a new,
// separate mechanism invented for this file.
//
// This type describes one real NCCI PTP edit pair - "Column One" code
// is eligible for payment, "Column Two" is denied unless a clinically
// appropriate modifier is reported and modifierIndicator allows it.
// ─────────────────────────────────────────────────────────────────────────────

export interface NcciPtpEditPair {
  id: string;
  /** The real "Column One" code - eligible for payment when both codes
   *  of the pair are reported together. */
  columnOneCode: string;
  /** The real "Column Two" code - denied unless a modifier bypasses
   *  the edit and modifierIndicator allows it. */
  columnTwoCode: string;
  /** Real NCCI modifier indicator:
   *   '0' - edit can NEVER be bypassed with a modifier - a genuine,
   *         hard bundling violation if both codes are reported together.
   *   '1' - edit CAN be bypassed with an appropriate modifier (e.g.
   *         XE/XS/XP/XU/59) when clinically justified - not itself a
   *         violation, a real judgment call for the coder.
   *   '9' - the edit does not apply (a real placeholder CMS uses for
   *         a pair that's been deleted/superseded but kept in the
   *         table for reference). */
  modifierIndicator: '0' | '1' | '9';
  effectiveDate: string;
  deletionDate?: string;
}

/** Real, per-quarter import metadata - matches the real, quarterly
 *  refresh cadence CMS itself uses ("Remember to replace the NCCI
 *  tables quarterly"). Deliberately NOT append-only/permanently-kept
 *  like BillingRuleVersion - a stale, superseded import is never
 *  resolved against historically, so old ones exist here only as
 *  approval/audit history, not as a source of truth to look back at.
 *
 *  Real, per direct follow-up ("we just need to track the changes so
 *  we know who is responsible and have it go through the approval
 *  process"): restructured to carry its own real pairs and isActive
 *  flag, mirroring ModifierTableVersion's own real "one array, one
 *  active record, Four-Eyes approval before activation" pattern
 *  exactly - a wholesale-replace import or a single-pair manual edit
 *  is staged as a new, PENDING_APPROVAL record here, never replacing
 *  the real active table until a different, real reviewer approves
 *  it. */
export interface NcciPtpEditImport {
  id: string;
  /** e.g. "2026Q3" - matches CMS's own real quarterly file naming, or
   *  a real, honest label like "Manual edit — 88305/88300" for a
   *  single-pair correction. */
  quarterVersion: string;
  importedAt: string;
  importedBy: string;
  pairCount: number;
  /** The real, full pair set this import represents - either a whole
   *  newly-uploaded quarter, or the prior active set with one real
   *  pair corrected. */
  pairs: NcciPtpEditPair[];
  /** Real, honest disclosure carried with the data itself - true for
   *  the seeded, synthetic demo set; false once a real customer import
   *  has actually replaced it. Surfaced directly in the admin UI so
   *  nobody mistakes the seed for real, current CMS data. */
  isSyntheticSeed: boolean;
  /** Exactly one import is active at a time - mirrors
   *  ModifierTableVersion.isActive exactly. */
  isActive: boolean;
  /** Undefined for the initial seed and any import that predates this
   *  feature - mirrors ModifierTableVersion.approvalStatus exactly. */
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  submittedForApprovalBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

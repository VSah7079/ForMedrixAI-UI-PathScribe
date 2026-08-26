// src/services/billing/ModifierTableVersion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, versioned modifier dictionary - mirrors RvuTableVersion.ts's
// own, already-established pattern exactly (same real reasoning:
// append-only, never edited in place, exactly one active version at a
// time, real upload provenance). Same real licensing posture as that
// file's own header: the real code letters/numbers are accurate;
// description text is synthetic (cptModifierDictionary.ts's own
// DEFAULT_CPT_MODIFIERS) until a real, licensed customer imports the
// real AMA text themselves via their own quarterly download.
// ─────────────────────────────────────────────────────────────────────────────

export interface CptModifierTableEntry {
  code: string;
  description: string;
}

export interface ModifierTableVersion {
  id: string;
  label: string;
  effectiveDate: string;
  entries: CptModifierTableEntry[];
  isActive: boolean;
  uploadedAt: string;
  uploadedBy: string;
  /** Real, per direct follow-up: "we just need to track the changes
   *  so we know who is responsible and have it go through the
   *  approval process" - mirrors BillingRuleVersion's own real,
   *  hard-enforced Four-Eyes state machine exactly (mockBillingRuleService.ts's
   *  own approveVersion/rejectVersion). A version created by a manual
   *  edit or upload starts PENDING_APPROVAL, not immediately active -
   *  it only becomes the real, active table once a different,
   *  real reviewer approves it. Optional and defaults to undefined
   *  for the initial seed version, matching the same "no approval
   *  step existed before this feature" honesty as approvalStatus
   *  elsewhere in this app. */
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  submittedForApprovalBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  /** Real, per direct guidance's own "Isolate Synthetic Data" best
   *  practice: an explicit, structural flag - never inferred from
   *  label text or filename - so any real, future downstream consumer
   *  (a real claims export, once Story 3's real dispatch exists) can
   *  check whether this version's own description text is still
   *  synthetic placeholder content or a real, licensed import before
   *  ever treating it as real, transmittable data. 'synthetic' for
   *  the initial seed and any version created without a real BYOL
   *  upload; 'licensed' only when set explicitly by the real BYOL
   *  import flow (ModifierDictionarySection.tsx), which requires the
   *  uploading admin to affirmatively confirm they hold a real,
   *  current AMA license before it's ever set. */
  licenseStatus: 'synthetic' | 'licensed';
  /** Real, per direct guidance's own established provenance pattern
   *  (RvuTableVersion.ts's own sourceFileName) - the real, original
   *  filename a licensed admin uploaded, when this version came from
   *  a real file rather than the initial, synthetic seed. */
  sourceFileName?: string;
}

// src/types/cytology/CytologySignOutRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the actual Sign Out action, following this
// module's own established "always written, never edited" real,
// auditable-record posture (CytologyReviewRecord, Phase 5; QaActivityRecord
// before it). One real, immutable record per real sign-out event.
//
// Real, honest scoping: this is this app's "immutable record of
// release" concept (ReportVersionRecord, types/reports/) applied to
// cytology — but simpler, since it carries structured report content
// (CytologyReportContent) directly rather than a rendered PDF.
// (Batch 366, PS-68: this used to point at ReportSnapshot, an unused
// earlier design that has been removed.)
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReportContent } from './CytologyReportContent';

export interface CytologySignOutRecord {
  id: string;
  caseId: string;
  specimenId: string;
  /** The real CytologyReviewRecord this sign-out released — always
   *  the one currently selected as the specimen's own Final Diagnosis
   *  at the moment of signing. */
  reviewRecordId: string;
  /** The real, assembled report content at the moment of signing —
   *  a genuine snapshot, per this module's own "always written, never
   *  edited" posture: if the underlying dictionary's own description
   *  text changes later, this sign-out record still shows exactly
   *  what was actually released. */
  reportContent: CytologyReportContent;
  signedBy: { userId: string; userName: string; isPathologist: boolean };
  signedAt: string;
  /** Real, per direct follow-up ("Cytology has no amendment mechanism
   *  at all... work this") — a real correction is never a mutation of
   *  an existing record (this whole type's own "always written, never
   *  edited" posture, stated above, forbids that); it's a genuinely
   *  new, separate CytologySignOutRecord, linked back to the real
   *  record it corrects. Undefined on every original, initial sign-out
   *  — only ever set on a record created by
   *  services/cytology/releaseCytologyCorrection.ts. The specimen's
   *  own real, current result is always the most recently signed
   *  record for it, regardless of how many corrections came before —
   *  the full, real chain stays queryable via getBySpecimenId() rather
   *  than being collapsed or overwritten. */
  amendsRecordId?: string;
  /** Real, per direct correction ("Cytology cases can have addendums...
   *  Addendum: appends new, additional data or subsequent test results
   *  to the report while leaving the original diagnosis intact.
   *  Amendment: used when correcting an error... in the original final
   *  report") — kept as a genuinely separate field from amendsRecordId
   *  rather than one shared "supersedes" concept, since the two mean
   *  different things clinically and a reader needs to tell them apart
   *  at a glance: an amendment replaces what was reported; an addendum
   *  leaves it standing and adds to it. Set only by
   *  releaseCytologyAddendum.ts. A record is never both an amendment
   *  and an addendum — the two fields are mutually exclusive in
   *  practice, though nothing in this type enforces that mechanically. */
  addsToRecordId?: string;
}

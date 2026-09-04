// src/types/cytology/CytologySignOutRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the actual Sign Out action, following this
// module's own established "always written, never edited" real,
// auditable-record posture (CytologyReviewRecord, Phase 5; QaActivityRecord
// before it). One real, immutable record per real sign-out event.
//
// Real, honest scoping: this is this app's own real, generic
// "immutable record of release" concept (ReportSnapshot,
// types/case/ReportSnapshot.ts) applied to cytology — but genuinely
// simpler, since it carries real, structured report content
// (CytologyReportContent) directly rather than a PDF blob reference.
// The real PDF-rendering/storage infrastructure ReportSnapshot assumes
// is separate, substantial work this phase does not build.
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
}

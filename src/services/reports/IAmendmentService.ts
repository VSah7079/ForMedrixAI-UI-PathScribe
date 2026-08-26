// src/services/reports/IAmendmentService.ts
import { ServiceResult } from '../types';
import type { AmendmentRecord, AmendmentType, ClinicalNotification } from '@/types/reports/AmendmentRecord';

export interface IAmendmentService {
  getByCaseId(caseId: string): Promise<ServiceResult<AmendmentRecord[]>>;

  /** Every amendment/correction/addendum record across all cases, released
   *  or still in draft — real fix, added for QualityTab.tsx's "Recently
   *  Amended" list, which previously had no way to query amendments
   *  across cases at all (getByCaseId requires already knowing the case;
   *  getOpenDraftsForPathologist is scoped to one pathologist's open
   *  drafts, not a released-amendment history). */
  getAll(): Promise<ServiceResult<AmendmentRecord[]>>;

  /** Every open (status: 'draft') amendment or addendum a pathologist
   *  currently has in progress, across all their cases — this is what
   *  the worklist triage tile queries to keep an active draft "firmly
   *  rooted" in that view until it's actually re-finalized/released,
   *  per the exit-gate rule: an open draft can't be cleared by review,
   *  only committed. */
  getOpenDraftsForPathologist(pathologistId: string): Promise<ServiceResult<AmendmentRecord[]>>;

  /** Opens a draft — captures initiatedAt immediately, matching the
   *  spec's explicit "date/time the workspace was opened" requirement,
   *  distinct from whenever it eventually gets released. */
  startDraft(input: {
    caseId: string;
    type: AmendmentType;
    authoringPathologist: { userId: string; userName: string };
    triggeredByLisNotice?: boolean;
    /** Real, per direct guidance's own follow-up on structured
     *  linkage - see AmendmentRecord.reportInstanceId's own doc
     *  comment for the full reasoning. Optional, same posture as the
     *  record field itself. */
    reportInstanceId?: string;
    specimenId?: string;
  }): Promise<ServiceResult<AmendmentRecord>>;

  /** Stage 1 of the amendment/correction pipeline — fires when "Amend" or
   *  "Correct" is clicked, before any editing happens. Record stays
   *  'draft' — nothing transmitted yet, purely internal tracking while
   *  the template is unlocked for editing. Addenda skip this and release
   *  in a single step via release() below.
   *
   *  The Clinical Notification hard gate is 'amendment'-only: CAP focuses
   *  clinical notification on changes that alter patient management or
   *  diagnostic interpretation, not clerical fixes where the diagnosis is
   *  unchanged. A 'correction' record still requires explanationOfChange
   *  (the audit trail — what/why, who), just not the notification log.
   *  See AMENDMENT_STATUS_REDESIGN_BRIEF.md. */
  captureFields(id: string, fields: {
    explanationOfChange: string;
    /** Required for 'amendment', not required for 'correction'. */
    notification?: ClinicalNotification;
    /** The real "immutable archive" snapshot — must be captured here,
     *  at Stage 1, before the template unlocks for editing. There's no
     *  reliable way to recover it later. */
    originalReportSnapshot: unknown;
    /** Real, per direct guidance's own detailed post-sign-out revision
     *  taxonomy - required for every real AmendmentType, this record's
     *  own AmendmentRecord.reasonId doc comment for the full
     *  reasoning. */
    reasonId: string;
  }): Promise<ServiceResult<AmendmentRecord>>;

  /** Stage 2 — fires at actual re-sign-out (amendment) or immediately
   *  (addendum, single-stage). Marks the record 'released', which is
   *  the moment a real external transmission would happen. If
   *  captureFields already ran, this only needs the final body; if it
   *  didn't (the addendum path, or a direct amendment call bypassing
   *  Stage 1), the same hard gate is checked here so it can't be skipped. */
  release(id: string, fields: {
    addendumTitle?: string;
    explanationOfChange?: string;
    notification?: ClinicalNotification;
    body: string;
    /** Real, per direct guidance - required for the addendum single-
     *  stage path (this is the only call for those); already captured
     *  in Stage 1 for amendment/correction, so optional here for
     *  those - same pattern explanationOfChange above already uses. */
    reasonId?: string;
  }): Promise<ServiceResult<AmendmentRecord>>;
}

// src/services/intraop/IIntraoperativeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real interface for the Intraop Pre-Check queue's desktop-side service —
// same interface+implementation split every other service in this app
// follows (IFlagService/mockFlagService, IContainerTypeService/
// mockContainerTypeService, etc.).
//
// Session/specimen split: createSession makes the shell (patient/OR/
// surgeon, no specimens yet), addSpecimen adds one, and both
// addMilestone and setFrozenSectionDiagnosis operate on a specific
// specimen within a session — not the session as a whole, since
// different specimens in the same session can be at genuinely different
// points in their own workflow.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceResult } from '../types';
import type { IntraoperativeEntry, MatchCandidate, MilestoneType, SkipReason, EntryMatch, FrozenCategory, MergeResolutionContext, PreparationType } from '@/types/intraop/IntraoperativeEntry';

export interface IIntraoperativeService {
  /** Simulated ADT feed lookup by MRN — real, deterministic result for
   *  a known MRN (e.g. '12345' for demo purposes), null when there's no
   *  match, same as a real hospital registry returning nothing found. */
  lookupAdtRecord(mrn: string): Promise<ServiceResult<{ patientName: string; dateOfBirth: string } | null>>;

  getAll(): Promise<ServiceResult<IntraoperativeEntry[]>>;
  getPending(): Promise<ServiceResult<IntraoperativeEntry[]>>;

  createSession(input: {
    patientMatch: { source: 'barcode' | 'adt_match'; patientName: string; mrn: string; dateOfBirth?: string };
    performedBy: { userId: string; userName: string };
    orNumber: string;
    surgeon: string;
    /** Real feature, per direct confirmation: "Let's wire in Facility
     *  and Location (Room) for Intraop." */
    facilityId?: string;
    locationId?: string;
  }): Promise<ServiceResult<IntraoperativeEntry>>;

  addSpecimen(sessionId: string, specimenLabel: string): Promise<ServiceResult<IntraoperativeEntry>>;

  /** Inverse direction — called by AccessionPage right after a formal
   *  accession succeeds, to check for any pending intraop session that
   *  might belong to the case that was just created. */
  findMatchesForNewCase(caseInfo: { patientName: string; mrn: string; surgeon: string; accessionedAt: string }): Promise<ServiceResult<EntryMatch[]>>;

  getMatchCandidates(entryId: string): Promise<ServiceResult<MatchCandidate[]>>;

  addMilestone(
    sessionId: string,
    specimenId: string,
    milestone: MilestoneType,
    skipReason?: SkipReason,
    skipReasonNote?: string,
    /** Required content when milestone is 'gross_logged' — enforced as
     *  a real, hard requirement in the implementation, not optional. */
    quickGrossText?: string
  ): Promise<ServiceResult<IntraoperativeEntry>>;

  setFrozenSectionDiagnosis(sessionId: string, specimenId: string, diagnosis: string, category?: FrozenCategory): Promise<ServiceResult<IntraoperativeEntry>>;

  /** Real, new method, per direct guidance — resolves PS-82's real,
   *  confirmed gap: the itemized, countable record of what was
   *  actually produced at the bench (a specific frozen block, a
   *  specific touch prep slide), distinct from addMilestone's own
   *  workflow-sequence tracking. identifier is auto-generated
   *  (specimen-scoped, e.g. "FS-A1"/"FS-A-TP1") when not explicitly
   *  given. This is the real source suggestFrozenSectionCptCodes()
   *  (services/billing/frozenSectionBilling.ts) counts frozen blocks
   *  from - never milestones.length. */
  addPreparationOutput(sessionId: string, specimenId: string, type: PreparationType, identifier?: string): Promise<ServiceResult<IntraoperativeEntry>>;

  merge(entryId: string, caseId: string, resolution: MergeResolutionContext): Promise<ServiceResult<IntraoperativeEntry>>;

  /** Real capture point for the verbal report to the surgeon — the
   *  moment a Frozen Section TAT metric actually needs, and the one
   *  that genuinely can't be inferred from any other system event (unlike
   *  merge, which is automatic). Before this, verbalReportLog only ever
   *  existed in hardcoded seed data with no real way to set it for a live
   *  case — this is that missing capture path. */
  recordVerbalReport(sessionId: string, note?: string): Promise<ServiceResult<IntraoperativeEntry>>;
}

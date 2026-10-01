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
import type { DigitalAsset } from '@/types/case/Material';

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

  /** Real, per direct follow-up on the image/PDF architecture
   *  scoping's own item 3 — real gross/frozen-section photo capture
   *  for a specimen still in the intraop workflow, before it's
   *  merged into a formal Case. `asset.url` must already be a real,
   *  uploaded reference (services/imageAssociation/IImageUploadService.ts)
   *  by the time this is called — this method only ever appends an
   *  already-resolved DigitalAsset, never performs the upload itself. */
  addDigitalAsset(sessionId: string, specimenId: string, asset: DigitalAsset): Promise<ServiceResult<IntraoperativeEntry>>;

  setFrozenSectionDiagnosis(sessionId: string, specimenId: string, diagnosis: string, category?: FrozenCategory): Promise<ServiceResult<IntraoperativeEntry>>;
  /** Real, per the OR Suite Live Board's own dismissal workflow spec —
   *  the real, two-step-confirmed action that removes one specimen's
   *  own row from the active board once its frozen diagnosis has been
   *  rendered and the mandatory surgeon read-back has genuinely been
   *  confirmed. Refuses honestly (never silently no-ops) when the
   *  diagnosis hasn't actually been rendered yet, or when the checkbox
   *  wasn't genuinely checked — this is a real safety gate, not a
   *  formality. */
  dismissFromBoard(sessionId: string, specimenId: string, dismissedByUserId: string, dismissedByUserName: string, surgeonReadbackConfirmed: boolean): Promise<ServiceResult<IntraoperativeEntry>>;

  /** Real, per direct request: sales needs a realistic, populated OR
   *  Suite Live Board to show customers — the existing SEED_ENTRIES
   *  are dated months in the past (real bench-workflow test fixtures,
   *  never meant for a live board), which would show as absurdly
   *  overdue rather than a believable in-progress case. Clearly
   *  separate from real session creation (createSession/addSpecimen)
   *  — never called from any real clinical workflow, only from the
   *  OR Suite Live Board's own explicit "Start demo" control. Removes
   *  any previous demo sessions at this location first, so repeated
   *  demos don't pile up stale ones. Returns the four seeded sessions
   *  (one per real board state: normal, warning, overdue, completed-
   *  awaiting-dismissal) so the caller can target the first one for
   *  live simulation via advanceDemoSpecimen below. */
  seedOrBoardDemoData(locationId: string, facilityId: string | undefined, orNumberPrefix: string): Promise<ServiceResult<IntraoperativeEntry[]>>;

  /** Real, per the same direct request's own "simulate the changes"
   *  ask — advances one demo specimen exactly one real step
   *  (gross_logged -> touch_prep_performed -> frozen_section_cut ->
   *  frozenSectionDiagnosis rendered), reusing addMilestone/
   *  setFrozenSectionDiagnosis's own already-tested logic rather than
   *  a separate, parallel mutation path. A no-op, honestly reported,
   *  once a specimen has already reached a rendered diagnosis — never
   *  loops back to the start on its own. */
  advanceDemoSpecimen(sessionId: string, specimenId: string): Promise<ServiceResult<{ entry: IntraoperativeEntry; advanced: boolean }>>;

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

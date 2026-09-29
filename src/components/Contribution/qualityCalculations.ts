// src/components/Contribution/qualityCalculations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, from a direct product review: QualityTab.tsx's discordant-case
// and amended-case lists were entirely hardcoded (mockDiscordant,
// mockAmended) - detailed, realistic-looking fake clinical data (fake case
// IDs, fake frozen/final diagnoses, fake amendment reasons) shown to every
// pathologist identically, with zero disclosure this was demo data.
//
// Both now come from real, already-built systems this app has elsewhere:
//   - Discordant cases: services/quality/mockReconciliationService.ts's
//     real ReconciliationRecord data (the Frozen-to-Permanent
//     Reconciliation Gate built earlier this project).
//   - Amended cases: services/reports/mockAmendmentService.ts's real
//     AmendmentRecord data (the Amendment/Correction/Addendum system
//     built earlier this project).
//
// The four turnaround-time outlier sections (first-touch, total case,
// frozen section, grossing) are NOT addressed here - they need the real
// TAT Configuration system's 8-level most-specific-wins target resolution
// (components/Config/System/TATConfigSection.tsx) cross-referenced
// against real per-milestone case timestamps, which is genuinely more
// investigation/work than this pass covers. Flagged clearly in
// QualityTab.tsx and this folder's README rather than silently left as
// still-fake data with no indication it wasn't addressed.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityRecord, QaDiscordanceDelta } from '@/types/quality/QaActivityRecord';
import type { AmendmentRecord } from '@/types/reports/AmendmentRecord';

export type Severity = 'low' | 'medium' | 'high';

export interface RealDiscordantCase {
  id: string;
  caseType: string;
  frozenDx: string;
  finalDx: string;
  /** Display text for the UI - real fix: the old fake data only ever had
   *  "Upgraded"/"Concordant", but ReconciliationRecord.delta genuinely
   *  has a third real value (minor_variance) that needs its own label,
   *  not silently falling into the "upgraded" styling bucket. */
  delta: string;
  date: string;
  severity: Severity;
  daysAgo: number;
}

export interface RealAmendedCase {
  id: string;
  caseType: string;
  reason: string;
  date: string;
  severity: Severity;
  daysAgo: number;
}

function daysAgo(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / (1000 * 60 * 60 * 24)));
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DELTA_LABELS: Record<QaDiscordanceDelta, string> = {
  upgrade:         'Upgraded',
  downgrade:        'Downgraded',
  minor_variance:  'Minor Variance',
};

/** Real fix: filters to genuinely discordant reconciliations only (a
 *  'concordant' record is real evidence a check happened, per
 *  ReconciliationRecord's own design intent, but isn't itself a
 *  discordant case to flag here) and maps the real record shape onto
 *  what the UI already expects.
 *
 *  PS-113, Stage 4: migrated from ReconciliationRecord[] to
 *  QaActivityRecord[] - frozenDx/finalDx now read from fieldValues
 *  (activity-specific comparison data), not fixed top-level
 *  properties. Callers are responsible for filtering to the real
 *  Frozen vs Final activity type before calling this - this function
 *  itself doesn't filter by activityTypeId, since a future caller
 *  might reasonably want discordant cases across more than one real
 *  review-with-outcome activity at once. */
export function reconciliationRecordsToDiscordantCases(
  records: QaActivityRecord[],
  now: Date = new Date()
): RealDiscordantCase[] {
  return records
    .filter(r => r.outcome === 'discordant')
    .map(r => ({
      id:       r.id,
      caseType: r.caseType,
      frozenDx: String(r.fieldValues.frozenDx ?? ''),
      finalDx:  String(r.fieldValues.finalDx ?? ''),
      delta:    r.delta ? DELTA_LABELS[r.delta] : 'Discordant',
      date:     formatShortDate(r.recordedAt),
      severity: r.severity ?? 'medium',
      daysAgo:  daysAgo(r.recordedAt, now),
    }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

/** Real fix: severity isn't a field AmendmentRecord itself has (unlike
 *  ReconciliationRecord) - derived from the real, documented semantic
 *  difference between revision types instead of an arbitrary guess:
 *  'amendment' means finalized diagnostic content was wrong (highest
 *  clinical significance), 'correction' is explicitly administrative/
 *  clerical only with the diagnosis unchanged, 'addendum' is
 *  supplemental, non-corrective information. */
function severityForAmendmentType(type: AmendmentRecord['type']): Severity {
  switch (type) {
    case 'amendment':  return 'high';
    case 'correction': return 'low';
    case 'addendum':   return 'low';
  }
}

/** Real fix, caught during this same pass: AmendmentRecord only stores
 *  caseId, not a specimen-type label - an earlier version of this
 *  function mistakenly displayed the raw case ID in the "case type"
 *  column. caseTypeByCaseId is an optional lookup the caller builds from
 *  real Case records (Case.specimens[0].description, e.g. "Left breast
 *  biopsy") - falls back to the real case ID itself (never a fabricated
 *  label) when a case isn't in the lookup. */
export function amendmentRecordsToAmendedCases(
  records: AmendmentRecord[],
  caseTypeByCaseId: Record<string, string> = {},
  now: Date = new Date()
): RealAmendedCase[] {
  return records
    .filter(r => r.status === 'released' && !!r.releasedAt)
    .map(r => ({
      id:       r.id,
      caseType: caseTypeByCaseId[r.caseId] ?? r.caseId,
      reason:   r.explanationOfChange || r.addendumTitle || 'No reason recorded',
      date:     formatShortDate(r.releasedAt!),
      severity: severityForAmendmentType(r.type),
      daysAgo:  daysAgo(r.releasedAt!, now),
    }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAT (turnaround time) outliers
//
// Real fix for the one genuinely, cleanly buildable TAT type out of the
// eight QualityTab.tsx tracks: TOTAL_CASE (receivedDate → issuedDate).
// The other seven need real timestamp data that doesn't exist anywhere
// in the type system yet (first touch, sign-out, cold ischemia,
// consultation response/awaiting), or only have partial/scoped data that
// can't support an honest calculation (frozen section has a "cut"
// milestone but no "diagnosis rendered" one; grossing milestones are
// intraop-only, not general) - deliberately not addressed here rather
// than build something that looks real but isn't.
// ─────────────────────────────────────────────────────────────────────────────

// Batch 353: the target resolver moved to services/tatConfig/tatTargetResolution.ts.
import { resolveTatTargetHours, type TatEntryForResolution } from '@/services/tatConfig/tatTargetResolution';
export { specificityScore, resolveTatEntry, resolveTatTargetHours } from '@/services/tatConfig/tatTargetResolution';
export type { TatEntryForResolution, TatResolutionContext } from '@/services/tatConfig/tatTargetResolution';

export interface RealTotalTatOutlier {
  id: string;
  caseType: string;
  date: string;
  tatHrs: number;
  targetHrs: number;
  overByHrs: number;
  assigningAuthority: string;
  daysAgo: number;
}

export interface CaseForTatCalc {
  id: string;
  firstOpenedAt?: string;
  grossCompletedAt?: string;
  /** Real fix: receivedDate genuinely lives under Case.order
   *  (OrderMetadata), not as a top-level field - confirmed against both
   *  the real type definition and actual seed data. An earlier version
   *  of this file had it at the top level, which would have made every
   *  function depending on it silently find zero real cases, regardless
   *  of seed data quality. */
  order?: { priority?: string; facilityId?: string; receivedDate?: string; assignedTo?: string };
  /**
   * Real, per direct guidance: this case's own real performing lab —
   * genuinely distinct from order.facilityId above (the ordering/
   * referring facility). Pre-resolved by the real caller (QualityTab.tsx)
   * via resolvePerformingLabFacilityId(), once per distinct facility, not
   * computed here — these are synchronous, pure calculation functions,
   * and resolving a performing lab requires a real, async facility
   * lookup. A case whose ordering facility itself has no resolvable
   * performing lab correctly leaves this undefined, not defaulted to
   * order.facilityId — that would silently conflate the two real,
   * separate dimensions this fix exists to keep apart.
   */
  performingLabFacilityId?: string;
  specimens?: { description?: string }[];
  subspecialtyId?: string;
  /** Real fix: issuedDate genuinely lives under Case.diagnostic, not as
   *  a top-level field - an earlier version of this file had it wrong,
   *  which would have made every function depending on it silently
   *  return zero results against real Case data regardless of seed data
   *  quality, since the 'as any' cast at the call site hid the mismatch
   *  from tsc. */
  diagnostic?: { issuedDate?: string };
}

/** Real fix: computes actual total-case TAT from real receivedDate/
 *  issuedDate fields and resolves the real target via
 *  resolveTatTargetHours, replacing the entirely hardcoded
 *  mockTotalTATOutliers array. Only flags a case when a real target was
 *  actually resolved AND actual time genuinely exceeded it - a case with
 *  no matching TATEntry at all is silently excluded, not defaulted to
 *  some fabricated target that would risk a false "breach". */
export function computeTotalCaseTatOutliers(
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealTotalTatOutlier[] {
  const outliers: RealTotalTatOutlier[] = [];

  for (const c of cases) {
    if (!c.order?.receivedDate || !c.diagnostic?.issuedDate) continue;
    const received = new Date(c.order!.receivedDate!).getTime();
    const issued   = new Date(c.diagnostic!.issuedDate!).getTime();
    if (isNaN(received) || isNaN(issued) || issued <= received) continue;

    const tatHrs = (issued - received) / (1000 * 60 * 60);
    const urgency: 'ROUTINE' | 'STAT' = c.order?.priority === 'STAT' ? 'STAT' : 'ROUTINE';
    const target = resolveTatTargetHours(tatEntries, 'TOTAL_CASE', {
      facilityId:     c.order?.facilityId,
      performingLabFacilityId: c.performingLabFacilityId,
      subspecialtyId: c.subspecialtyId,
      urgency,
    });
    if (target === null || tatHrs <= target) continue;

    outliers.push({
      id:                 c.id,
      caseType:           c.specimens?.[0]?.description ?? c.id,
      date:               formatShortDate(c.diagnostic!.issuedDate!),
      tatHrs:             Math.round(tatHrs * 10) / 10,
      targetHrs:          target,
      overByHrs:          Math.round((tatHrs - target) * 10) / 10,
      assigningAuthority: (c.order?.facilityId && clientNameById[c.order.facilityId]) || 'Unknown',
      daysAgo:            daysAgo(c.diagnostic!.issuedDate!, now),
    });
  }

  return outliers.sort((a, b) => a.daysAgo - b.daysAgo);
}

export interface RealGenericTatOutlier {
  id: string;
  caseType: string;
  date: string;
  actualHrs: number;
  targetHrs: number;
  overByHrs: number;
  assigningAuthority: string;
  daysAgo: number;
}

export interface RealFirstTouchOutlier {
  id: string;
  caseType: string;
  date: string;
  firstTouchHrs: number;
  targetHrs: number;
  overByHrs: number;
  assigningAuthority: string;
  daysAgo: number;
}

/** Shared logic for the three TAT types with a genuine start/end
 *  timestamp pair now available (FIRST_TOUCH, GROSSING, SIGN_OUT) -
 *  extracted rather than tripled, since the real calculation itself
 *  (elapsed hours, target resolution, outlier gating) is identical
 *  across all three; only which two real timestamps are being compared
 *  differs. Same honest-exclusion behavior as computeTotalCaseTatOutliers:
 *  a case missing either real timestamp, or with no resolvable target,
 *  is excluded rather than defaulted to a fabricated number. */
function computeGenericTatOutliers(
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  tatType: string,
  getStart: (c: CaseForTatCalc) => string | undefined,
  getEnd: (c: CaseForTatCalc) => string | undefined,
  now: Date
): RealGenericTatOutlier[] {
  const outliers: RealGenericTatOutlier[] = [];

  for (const c of cases) {
    const startIso = getStart(c);
    const endIso   = getEnd(c);
    if (!startIso || !endIso) continue;
    const start = new Date(startIso).getTime();
    const end   = new Date(endIso).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) continue;

    const actualHrs = (end - start) / (1000 * 60 * 60);
    const urgency: 'ROUTINE' | 'STAT' = c.order?.priority === 'STAT' ? 'STAT' : 'ROUTINE';
    const target = resolveTatTargetHours(tatEntries, tatType, {
      facilityId:     c.order?.facilityId,
      performingLabFacilityId: c.performingLabFacilityId,
      subspecialtyId: c.subspecialtyId,
      urgency,
    });
    if (target === null || actualHrs <= target) continue;

    outliers.push({
      id:                 c.id,
      caseType:           c.specimens?.[0]?.description ?? c.id,
      date:               formatShortDate(endIso),
      actualHrs:          Math.round(actualHrs * 10) / 10,
      targetHrs:          target,
      overByHrs:          Math.round((actualHrs - target) * 10) / 10,
      assigningAuthority: (c.order?.facilityId && clientNameById[c.order.facilityId]) || 'Unknown',
      daysAgo:            daysAgo(endIso, now),
    });
  }

  return outliers.sort((a, b) => a.daysAgo - b.daysAgo);
}

/** Real fix: replaces the hardcoded mockFirstTouchOutliers array.
 *  receivedDate → firstOpenedAt, both real fields now (firstOpenedAt
 *  added to Case specifically for this - see SynopticReportPage.tsx's
 *  case-load effect). */
export function computeFirstTouchOutliers(
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealFirstTouchOutlier[] {
  return computeGenericTatOutliers(
    cases, tatEntries, clientNameById, 'FIRST_TOUCH',
    c => c.order?.receivedDate, c => c.firstOpenedAt, now
  ).map(o => ({
    id: o.id, caseType: o.caseType, date: o.date,
    firstTouchHrs: o.actualHrs, targetHrs: o.targetHrs, overByHrs: o.overByHrs,
    assigningAuthority: o.assigningAuthority, daysAgo: o.daysAgo,
  }));
}

/** Real fix: replaces the hardcoded mockGrossingOutliers array.
 *  receivedDate → grossCompletedAt, both real fields (grossCompletedAt
 *  added to Case specifically for this - see SynopticReportPage.tsx's
 *  handleGrossComplete, set once on genuine first completion only). */
export function computeGrossingOutliers(
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealGenericTatOutlier[] {
  return computeGenericTatOutliers(
    cases, tatEntries, clientNameById, 'GROSSING',
    c => c.order?.receivedDate, c => c.grossCompletedAt, now
  );
}

/** Real fix: replaces the hardcoded mockSignOutOutliers array.
 *  grossCompletedAt → issuedDate ("gross-to-final-signout", matching the
 *  UI's own existing subtitle text for this section). */
export function computeSignOutOutliers(
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealGenericTatOutlier[] {
  return computeGenericTatOutliers(
    cases, tatEntries, clientNameById, 'SIGN_OUT',
    c => c.grossCompletedAt, c => c.diagnostic?.issuedDate, now
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FROZEN_SECTION TAT — real fix, closing the gap flagged earlier: the
// 'frozen_section_cut' milestone already had a real timestamp, but
// nothing captured when the diagnosis was actually rendered, so no true
// interval existed. Now closed by frozenDiagnosisRenderedAt (added to
// IntraopSpecimen, set at mockIntraoperativeService.ts's
// setFrozenSectionDiagnosis).
//
// Genuinely different shape from the other four TAT functions: frozen-
// section data lives in its own, separate intraoperative-session store
// (services/intraop/), not denormalized onto Case - cross-referenced at
// read time via IntraoperativeEntry.mergedIntoCaseId, matching the same
// pattern the Frozen-to-Permanent Reconciliation Gate itself already
// uses (see SynopticReportPage.tsx's own merged-session lookup). Also
// per-specimen, not per-case - a case with three specimens where only
// one had a delayed frozen section should surface that one specimen,
// not flag the whole case.
// ─────────────────────────────────────────────────────────────────────────────

export interface IntraopSpecimenForTatCalc {
  id: string;
  arrivalTimestamp: string;
  milestones: { milestone: string; timestamp: string }[];
  frozenDiagnosisRenderedAt?: string;
}

export interface IntraopEntryForTatCalc {
  id: string;
  status: string;
  mergedIntoCaseId?: string;
  specimens: IntraopSpecimenForTatCalc[];
}

/** Real fix: replaces the hardcoded mockFrozenSectionOutliers array.
 *  arrivalTimestamp → frozenDiagnosisRenderedAt is the real, full
 *  interval (specimen arrival in the intraop suite to the actual
 *  diagnostic conclusion) - deliberately not cut→diagnosis, since
 *  arrival is the real clinical start of the turnaround-time clock a
 *  surgeon waiting in the OR actually experiences. */
export function computeFrozenSectionOutliers(
  entries: IntraopEntryForTatCalc[],
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealGenericTatOutlier[] {
  const caseById = new Map(cases.map(c => [c.id, c]));
  const outliers: RealGenericTatOutlier[] = [];

  for (const entry of entries) {
    if (entry.status !== 'merged' || !entry.mergedIntoCaseId) continue;
    const c = caseById.get(entry.mergedIntoCaseId);
    if (!c) continue;

    const urgency: 'ROUTINE' | 'STAT' = c.order?.priority === 'STAT' ? 'STAT' : 'ROUTINE';
    const target = resolveTatTargetHours(tatEntries, 'FROZEN_SECTION', {
      facilityId:     c.order?.facilityId,
      performingLabFacilityId: c.performingLabFacilityId,
      subspecialtyId: c.subspecialtyId,
      urgency,
    });
    if (target === null) continue;

    for (const sp of entry.specimens) {
      if (!sp.frozenDiagnosisRenderedAt) continue;
      const start = new Date(sp.arrivalTimestamp).getTime();
      const end   = new Date(sp.frozenDiagnosisRenderedAt).getTime();
      if (isNaN(start) || isNaN(end) || end <= start) continue;

      const actualHrs = (end - start) / (1000 * 60 * 60);
      if (actualHrs <= target) continue;

      outliers.push({
        id:                 `${entry.id}-${sp.id}`,
        caseType:           c.specimens?.[0]?.description ?? c.id,
        date:               formatShortDate(sp.frozenDiagnosisRenderedAt),
        actualHrs:          Math.round(actualHrs * 10) / 10,
        targetHrs:          target,
        overByHrs:          Math.round((actualHrs - target) * 10) / 10,
        assigningAuthority: (c.order?.facilityId && clientNameById[c.order.facilityId]) || 'Unknown',
        daysAgo:            daysAgo(sp.frozenDiagnosisRenderedAt, now),
      });
    }
  }

  return outliers.sort((a, b) => a.daysAgo - b.daysAgo);
}

// ─────────────────────────────────────────────────────────────────────────────
// COLD_ISCHEMIA TAT — real fix. Uses Specimen.collectedAt (already real,
// already used throughout seed data) → Specimen.processing.processedAt
// ("when fixative was added — the end of the cold ischemia window
// (collection → fixation), tracked per CAP/ASCO biomarker guidance" per
// that field's own existing doc comment - this data model was already
// purpose-built for exactly this metric, just never wired up).
//
// Per-specimen, like FROZEN_SECTION above, not per-case - different
// specimens on the same case can have genuinely different collection/
// fixation times. Deliberately excludes any processedAt value flagged
// processedAtIsEstimated: an estimate isn't a verified data point, and
// including it in a real compliance-adjacent TAT metric would risk
// presenting a guess as a fact - the same reasoning
// ReconciliationRecord already applies elsewhere in this app to keeping
// estimated/uncertain data visibly distinct from verified data.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecimenForTatCalc {
  id: string;
  description?: string;
  collectedAt?: string;
  processing?: { processedAt?: string; processedAtIsEstimated?: boolean };
}

export interface CaseWithSpecimensForTatCalc extends CaseForTatCalc {
  specimens?: SpecimenForTatCalc[];
}

/** Real fix: replaces the hardcoded mockColdIschemiaOutliers array. */
export function computeColdIschemiaOutliers(
  cases: CaseWithSpecimensForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealGenericTatOutlier[] {
  const outliers: RealGenericTatOutlier[] = [];

  for (const c of cases) {
    const urgency: 'ROUTINE' | 'STAT' = c.order?.priority === 'STAT' ? 'STAT' : 'ROUTINE';
    const target = resolveTatTargetHours(tatEntries, 'COLD_ISCHEMIA', {
      facilityId:     c.order?.facilityId,
      performingLabFacilityId: c.performingLabFacilityId,
      subspecialtyId: c.subspecialtyId,
      urgency,
    });
    if (target === null) continue;

    for (const sp of c.specimens ?? []) {
      if (!sp.collectedAt || !sp.processing?.processedAt) continue;
      if (sp.processing.processedAtIsEstimated) continue; // never treat an estimate as verified compliance data

      const start = new Date(sp.collectedAt).getTime();
      const end   = new Date(sp.processing.processedAt).getTime();
      if (isNaN(start) || isNaN(end) || end <= start) continue;

      const actualHrs = (end - start) / (1000 * 60 * 60);
      if (actualHrs <= target) continue;

      outliers.push({
        id:                 `${c.id}-${sp.id}`,
        caseType:           sp.description ?? c.id,
        date:               formatShortDate(sp.processing.processedAt),
        actualHrs:          Math.round(actualHrs * 100) / 100, // cold ischemia targets are sub-hour - keep 2 decimals
        targetHrs:          target,
        overByHrs:          Math.round((actualHrs - target) * 100) / 100,
        assigningAuthority: (c.order?.facilityId && clientNameById[c.order.facilityId]) || 'Unknown',
        daysAgo:            daysAgo(sp.processing.processedAt, now),
      });
    }
  }

  return outliers.sort((a, b) => a.daysAgo - b.daysAgo);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTATION_RESPONSE / CONSULTATION_AWAITING TAT — real fix, built on
// the actual, existing delegation system (services/cases/mockCaseService.ts's
// DelegationRecord/delegateCase/getDelegations), not invented data.
//
// Per Pete's direct correction: these were always meant to track
// informal review requests specifically - this app's own delegation-type
// dictionary already distinguishes 'CASUAL_REVIEW' ("Informal Review")
// from the more formal 'SECOND_OPINION' path
// (services/delegationTypes/mockDelegationTypeService.ts) - so both
// functions below filter to CASUAL_REVIEW only.
//
// Closed a real, separate gap to make this possible at all:
// DelegationRecord.status included 'completed' as a valid value, but
// nothing anywhere in this codebase ever actually transitioned a
// delegation there (every one ever created stayed 'pending' forever) -
// silently broke WorklistPage.tsx's own existing "Delegated to Me" count
// too, not just this new metric. Real completeDelegation() function and
// completedAt timestamp added (now delegationService.complete()). The
// "Mark Review Complete" banner built for it was deleted in Batch 355
// (PS-346): informal reviews moved to InformalReviewRequest, which
// consultation TAT also counts (services/quality/qualityTatInputs.ts).
//
// CONSULTATION_RESPONSE: how fast the current user responds when asked -
// timestamp (request) -> completedAt (their real response), scoped to
// records where they are toUserId.
// CONSULTATION_AWAITING: how long the current user has been waiting for
// someone else's response - genuinely different shape from every other
// TAT function here, since this measures an ONGOING wait, not a
// completed interval: timestamp -> now, for records still pending where
// they are fromUserId. daysAgo is based on the original request instant,
// since that's the real event being tracked.
// ─────────────────────────────────────────────────────────────────────────────

export interface DelegationForTatCalc {
  id: string;
  caseId: string;
  fromUserId: string;
  toUserId?: string;
  delegationType: string;
  timestamp: string;
  status: string;
  completedAt?: string;
}

function resolveConsultTarget(
  tatEntries: TatEntryForResolution[],
  type: 'CONSULTATION_RESPONSE' | 'CONSULTATION_AWAITING',
  c: CaseForTatCalc | undefined
): number | null {
  const urgency: 'ROUTINE' | 'STAT' = c?.order?.priority === 'STAT' ? 'STAT' : 'ROUTINE';
  return resolveTatTargetHours(tatEntries, type, {
    facilityId:     c?.order?.facilityId,
    performingLabFacilityId: c?.performingLabFacilityId,
    subspecialtyId: c?.subspecialtyId,
    urgency,
  });
}

/** Real fix: replaces the hardcoded mockConsultResponseOutliers array. */
export function computeConsultResponseOutliers(
  delegations: DelegationForTatCalc[],
  cases: CaseForTatCalc[],
  currentUserId: string,
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealGenericTatOutlier[] {
  const caseById = new Map(cases.map(c => [c.id, c]));
  const outliers: RealGenericTatOutlier[] = [];

  for (const d of delegations) {
    if (d.delegationType !== 'CASUAL_REVIEW' || d.toUserId !== currentUserId) continue;
    if (d.status !== 'completed' || !d.completedAt) continue;

    const c = caseById.get(d.caseId);
    const target = resolveConsultTarget(tatEntries, 'CONSULTATION_RESPONSE', c);
    if (target === null) continue;

    const start = new Date(d.timestamp).getTime();
    const end   = new Date(d.completedAt).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) continue;

    const actualHrs = (end - start) / (1000 * 60 * 60);
    if (actualHrs <= target) continue;

    outliers.push({
      id:                 d.id,
      caseType:           c?.specimens?.[0]?.description ?? d.caseId,
      date:               formatShortDate(d.completedAt),
      actualHrs:          Math.round(actualHrs * 10) / 10,
      targetHrs:          target,
      overByHrs:          Math.round((actualHrs - target) * 10) / 10,
      assigningAuthority: (c?.order?.facilityId && clientNameById[c.order.facilityId]) || 'Unknown',
      daysAgo:            daysAgo(d.completedAt, now),
    });
  }

  return outliers.sort((a, b) => a.daysAgo - b.daysAgo);
}

/** Real fix: replaces the hardcoded mockConsultAwaitingOutliers array.
 *  Genuinely different from every other TAT function here - measures an
 *  ongoing wait (request -> now), not a completed interval, since a
 *  still-pending request has no real end timestamp yet. */
export function computeConsultAwaitingOutliers(
  delegations: DelegationForTatCalc[],
  cases: CaseForTatCalc[],
  currentUserId: string,
  tatEntries: TatEntryForResolution[],
  clientNameById: Record<string, string>,
  now: Date = new Date()
): RealGenericTatOutlier[] {
  const caseById = new Map(cases.map(c => [c.id, c]));
  const outliers: RealGenericTatOutlier[] = [];

  for (const d of delegations) {
    if (d.delegationType !== 'CASUAL_REVIEW' || d.fromUserId !== currentUserId) continue;
    if (d.status !== 'pending') continue; // already resolved - not "awaiting" anymore

    const c = caseById.get(d.caseId);
    const target = resolveConsultTarget(tatEntries, 'CONSULTATION_AWAITING', c);
    if (target === null) continue;

    const start = new Date(d.timestamp).getTime();
    if (isNaN(start)) continue;

    const actualHrs = (now.getTime() - start) / (1000 * 60 * 60);
    if (actualHrs <= target) continue;

    outliers.push({
      id:                 d.id,
      caseType:           c?.specimens?.[0]?.description ?? d.caseId,
      date:               formatShortDate(d.timestamp),
      actualHrs:          Math.round(actualHrs * 10) / 10,
      targetHrs:          target,
      overByHrs:          Math.round((actualHrs - target) * 10) / 10,
      assigningAuthority: (c?.order?.facilityId && clientNameById[c.order.facilityId]) || 'Unknown',
      daysAgo:            daysAgo(d.timestamp, now),
    });
  }

  return outliers.sort((a, b) => a.daysAgo - b.daysAgo);
}

export interface RealClientTatRow {
  id: string;
  name: string;
  assigningAuthority: string;
  target: { firstTouch: number | null; total: number | null };
  mine: { firstTouch: number | null; total: number | null };
  peer: { firstTouch: number; total: number };
  breaches: { firstTouch: number; total: number };
  caseCount: number;
}

/** Real fix: replaces the entirely hardcoded mockTatByClient array
 *  (QualityTab.tsx). "mine" and "target" are fully real - averaged
 *  from the current pathologist's own real cases (order.assignedTo)
 *  for this client, and resolved via the same real
 *  resolveTatTargetHours every other TAT function in this file already
 *  uses. "peer" is honestly NOT real: no real cross-pathologist
 *  aggregation service exists yet (same, already-documented limitation
 *  as TAT_TYPE_TARGETS in QualityTab.tsx itself - "In production these
 *  come from ITATConfigService + ITATResultService"). Rather than
 *  fabricate a new, separate placeholder number here, peer is derived
 *  from that SAME already-acknowledged global estimate ratio
 *  (peer/target), applied to this client's own real target - one
 *  documented estimate source, not two different fabrications.
 *  A client with zero real cases for this pathologist is honestly
 *  omitted rather than shown with an empty/fabricated row. */
export function computeTatByClient(
  cases: CaseForTatCalc[],
  tatEntries: TatEntryForResolution[],
  clients: { id: string; name: string; assigningAuthority: string }[],
  currentUserId: string
): RealClientTatRow[] {
  // Same real global estimate already documented in QualityTab.tsx's
  // own TAT_TYPE_TARGETS, expressed as a ratio so it scales honestly
  // to each client's own real target rather than reusing one flat number.
  const PEER_RATIO_FIRST_TOUCH = 3.8 / 5;
  const PEER_RATIO_TOTAL       = 24.2 / 30;

  const rows: RealClientTatRow[] = [];

  for (const client of clients) {
    const myCases = cases.filter(c => c.order?.facilityId === client.id && c.order?.assignedTo === currentUserId);
    if (myCases.length === 0) continue;

    // Real, deliberate scope boundary: this is a per-ORDERING-CLIENT
    // breakdown of the current user's own cases, not per-case TAT-
    // breach detection — myCases can genuinely span more than one real
    // performing lab (a pathologist working across facilities), so
    // there's no single, well-defined performingLabFacilityId to
    // resolve for the whole row the way there is for one specific
    // case above. Left as client-only resolution; a real per-(client,
    // performing lab) breakdown would need its own, separate grouping,
    // not a silent guess at "the" lab for this row.
    const targetFirstTouch = resolveTatTargetHours(tatEntries, 'FIRST_TOUCH', {
      facilityId: client.id, specimenId: null, subspecialtyId: null, urgency: null,
    });
    const targetTotal = resolveTatTargetHours(tatEntries, 'TOTAL_CASE', {
      facilityId: client.id, specimenId: null, subspecialtyId: null, urgency: null,
    });

    let firstTouchSum = 0, firstTouchCount = 0, firstTouchBreaches = 0;
    let totalSum = 0, totalCount = 0, totalBreaches = 0;

    for (const c of myCases) {
      if (c.order?.receivedDate && c.firstOpenedAt) {
        const start = new Date(c.order.receivedDate).getTime();
        const end   = new Date(c.firstOpenedAt).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          const hrs = (end - start) / (1000 * 60 * 60);
          firstTouchSum += hrs; firstTouchCount++;
          if (targetFirstTouch !== null && hrs > targetFirstTouch) firstTouchBreaches++;
        }
      }
      if (c.order?.receivedDate && c.diagnostic?.issuedDate) {
        const start = new Date(c.order.receivedDate).getTime();
        const end   = new Date(c.diagnostic.issuedDate).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          const hrs = (end - start) / (1000 * 60 * 60);
          totalSum += hrs; totalCount++;
          if (targetTotal !== null && hrs > targetTotal) totalBreaches++;
        }
      }
    }

    const mineFirstTouch = firstTouchCount > 0 ? Math.round((firstTouchSum / firstTouchCount) * 10) / 10 : null;
    const mineTotal       = totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : null;

    rows.push({
      id: client.id,
      name: client.name,
      assigningAuthority: client.assigningAuthority,
      target: { firstTouch: targetFirstTouch, total: targetTotal },
      mine: { firstTouch: mineFirstTouch, total: mineTotal },
      peer: {
        firstTouch: targetFirstTouch !== null ? Math.round(targetFirstTouch * PEER_RATIO_FIRST_TOUCH * 10) / 10 : 0,
        total:      targetTotal !== null ? Math.round(targetTotal * PEER_RATIO_TOTAL * 10) / 10 : 0,
      },
      breaches: { firstTouch: firstTouchBreaches, total: totalBreaches },
      caseCount: myCases.length,
    });
  }

  return rows.sort((a, b) => b.caseCount - a.caseCount);
}

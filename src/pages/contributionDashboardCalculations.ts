// src/pages/contributionDashboardCalculations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, from a direct product review: ContributionDashboardPage.tsx's
// Overview tab had seven separate hardcoded datasets (mockKpis,
// mockCaseMixData, mockRvu30, mockClientTatData, mockTatTargets,
// mockTatPerf, mockDaily) shown identically to every pathologist,
// including one KPI tile whose underlying number (128) was fake even
// though its label ("CASE_LABEL_PLACEHOLDER") was actually a working,
// intentional sentinel, not itself a bug.
//
// This file covers the five genuinely, cleanly computable pieces: the
// three overview KPI tiles, the case-mix breakdown, the org-wide TAT
// performance aggregate (mockClientTatData/mockTatTargets/mockTatPerf),
// and RVU tracking (mockRvu30, mockDaily) - the last of these built on
// the real, now-versioned Code_Map_Table (services/billing/) that
// didn't exist anywhere in this app before this pass. Each case's real
// work RVU resolves against the real version that was genuinely in
// effect on its real finalization date (via resolveVersionEffectiveAt),
// not whatever version happens to be marked active today - see that
// file's own header for the full reasoning on why this needed to be
// versioned at all. See services/billing/README.md for the honest scope
// limits on what "real RVU" means here (workload/productivity tracking,
// not a billing system; a curated subset of codes, not the full CMS
// file; a rule-based default when a case has no real, manually-assigned
// CPT codes, since no manual-entry UI exists yet - a genuine, separate
// product/UX decision, not something to invent unilaterally here).
// ─────────────────────────────────────────────────────────────────────────────

import { resolveTatTargetHours, type TatEntryForResolution } from '../components/Contribution/qualityCalculations';
import { getFacilityDateParts, getFacilityMidnightUtc } from '../utils/facilityTime';

export interface CaseForDashboardCalc {
  id: string;
  status?: string;
  subspecialtyId?: string;
  order?: { assignedTo?: string; receivedDate?: string; facilityId?: string; priority?: string };
  diagnostic?: { finalizedBy?: string; issuedDate?: string };
  synopticReports?: { aiSuggestions?: Record<string, unknown> }[];
  firstOpenedAt?: string;
}

export interface RealOverviewKpis {
  casesFinalized30d: number;
  casesFinalizedDeltaPct: number | null; // null when no real prior-period baseline exists (e.g. a brand new user)
  casesInProgress: number;
  aiAssistedCases30d: number;
  aiAssistedDeltaPct: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isWithin(iso: string | undefined, start: number, end: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= start && t < end;
}

/** True whenever any real synoptic report on this case has real,
 *  populated aiSuggestions - the actual signal already used elsewhere
 *  in this app (e.g. the AI confidence badge) for "AI touched this
 *  case," not a fabricated new one. */
export function wasAiAssisted(c: CaseForDashboardCalc): boolean {
  return (c.synopticReports ?? []).some(r => r.aiSuggestions && Object.keys(r.aiSuggestions).length > 0);
}

/** Real fix: replaces the hardcoded mockKpis array. Deltas compare the
 *  last 30 real days against the 30 real days before that - null
 *  (never a fabricated percentage) when the prior period has no real
 *  cases to compare against, e.g. a pathologist too new to have a real
 *  baseline yet. */
export function computeOverviewKpis(
  cases: CaseForDashboardCalc[],
  userId: string,
  now: Date = new Date()
): RealOverviewKpis {
  const mine = cases.filter(c => c.order?.assignedTo === userId);
  const nowMs = now.getTime();
  const periodStart = nowMs - 30 * DAY_MS;
  const priorStart  = nowMs - 60 * DAY_MS;

  const finalizedThis  = mine.filter(c => c.diagnostic?.finalizedBy === userId && isWithin(c.diagnostic?.issuedDate, periodStart, nowMs));
  const finalizedPrior = mine.filter(c => c.diagnostic?.finalizedBy === userId && isWithin(c.diagnostic?.issuedDate, priorStart, periodStart));

  const aiThis  = finalizedThis.filter(wasAiAssisted);
  const aiPrior = finalizedPrior.filter(wasAiAssisted);

  const inProgress = mine.filter(c => c.status && !['finalized', 'closed'].includes(c.status)).length;

  const pctDelta = (curr: number, prior: number): number | null =>
    prior === 0 ? null : Math.round(((curr - prior) / prior) * 100);

  return {
    casesFinalized30d:      finalizedThis.length,
    casesFinalizedDeltaPct: pctDelta(finalizedThis.length, finalizedPrior.length),
    casesInProgress:        inProgress,
    aiAssistedCases30d:     aiThis.length,
    aiAssistedDeltaPct:     pctDelta(aiThis.length, aiPrior.length),
  };
}

export interface RealCaseMixData {
  breast: number;
  gi:     number;
  gu:     number;
  derm:   number;
  other:  number;
}

const SUBSPECIALTY_TO_BUCKET: Record<string, keyof RealCaseMixData> = {
  breast: 'breast',
  gi:     'gi',
  uro:    'gu', // real seeded id is 'uro' (Urological) - same clinical concept as GU
  derm:   'derm',
};

/** Real fix: replaces the hardcoded mockCaseMixData object. Every
 *  subspecialty without a direct bucket (neuro, heme, gyn, thoracic,
 *  oncology-pool, or unset) rolls into 'other', matching what the UI's
 *  own five-bucket shape already assumes. */
export function computeCaseMixData(cases: CaseForDashboardCalc[], userId: string): RealCaseMixData {
  const mine = cases.filter(c => c.order?.assignedTo === userId);
  const mix: RealCaseMixData = { breast: 0, gi: 0, gu: 0, derm: 0, other: 0 };

  for (const c of mine) {
    const bucket = (c.subspecialtyId && SUBSPECIALTY_TO_BUCKET[c.subspecialtyId]) || 'other';
    mix[bucket] += 1;
  }

  return mix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Org-wide TAT performance aggregate — real fix, replacing
// mockClientTatData/mockTatTargets/mockTatPerf. Genuinely different
// shape from qualityCalculations.ts's per-pathologist outlier lists:
// this is a weighted average across ALL real cases org-wide (every
// client, every pathologist), not one person's breach list - matching
// what TatPerformanceTile.tsx's own "weighted across N clients" label
// already promises. Reuses the real resolveTatTargetHours resolver
// rather than duplicating target-resolution logic.
// ─────────────────────────────────────────────────────────────────────────────

export interface RealTatPerformance {
  firstTouchAvgHrs: number;
  totalCaseAvgHrs:  number;
  firstTouchTargetHrs: number;
  totalTargetHrs:      number;
  onTargetPct: number;
  facilityCount: number;
}

/** Real fix: replaces mockClientTatData/mockTatTargets/mockTatPerf.
 *  For each real case with both real timestamps (receivedDate +
 *  firstOpenedAt for first-touch; receivedDate + issuedDate for total
 *  case), resolves its own real target and elapsed time, then computes
 *  a case-count-weighted average across every case org-wide - matching
 *  the same weighting approach the original mock data used, just with
 *  real numbers instead of four fabricated client rows. Cases missing
 *  either real timestamp, or with no resolvable target, are excluded
 *  from that specific average rather than defaulting to a fabricated
 *  value - same honest-exclusion principle as every TAT function in
 *  qualityCalculations.ts. */
export function computeOrgWideTatPerformance(
  cases: CaseForDashboardCalc[],
  tatEntries: TatEntryForResolution[]
): RealTatPerformance {
  const facilityIds = new Set<string>();
  let ftHrsSum = 0, ftTargetSum = 0, ftOnTargetCount = 0, ftCount = 0;
  let tcHrsSum = 0, tcTargetSum = 0, tcOnTargetCount = 0, tcCount = 0;

  for (const c of cases) {
    if (c.order?.facilityId) facilityIds.add(c.order.facilityId);
    const urgency: 'ROUTINE' | 'STAT' = c.order?.priority === 'STAT' ? 'STAT' : 'ROUTINE';
    const receivedMs = c.order?.receivedDate ? new Date(c.order.receivedDate).getTime() : NaN;

    if (!isNaN(receivedMs) && c.firstOpenedAt) {
      const openedMs = new Date(c.firstOpenedAt).getTime();
      const target = resolveTatTargetHours(tatEntries, 'FIRST_TOUCH', {
        facilityId: c.order?.facilityId, subspecialtyId: c.subspecialtyId, urgency,
      });
      if (target !== null && !isNaN(openedMs) && openedMs > receivedMs) {
        const hrs = (openedMs - receivedMs) / (1000 * 60 * 60);
        ftHrsSum += hrs; ftTargetSum += target; ftCount += 1;
        if (hrs <= target) ftOnTargetCount += 1;
      }
    }

    if (!isNaN(receivedMs) && c.diagnostic?.issuedDate) {
      const issuedMs = new Date(c.diagnostic.issuedDate).getTime();
      const target = resolveTatTargetHours(tatEntries, 'TOTAL_CASE', {
        facilityId: c.order?.facilityId, subspecialtyId: c.subspecialtyId, urgency,
      });
      if (target !== null && !isNaN(issuedMs) && issuedMs > receivedMs) {
        const hrs = (issuedMs - receivedMs) / (1000 * 60 * 60);
        tcHrsSum += hrs; tcTargetSum += target; tcCount += 1;
        if (hrs <= target) tcOnTargetCount += 1;
      }
    }
  }

  const pctFirst = ftCount > 0 ? Math.round((ftOnTargetCount / ftCount) * 100) : null;
  const pctTotal = tcCount > 0 ? Math.round((tcOnTargetCount / tcCount) * 100) : null;
  const realPcts = [pctFirst, pctTotal].filter((p): p is number => p !== null);

  return {
    firstTouchAvgHrs:    ftCount > 0 ? +(ftHrsSum / ftCount).toFixed(1) : 0,
    totalCaseAvgHrs:     tcCount > 0 ? +(tcHrsSum / tcCount).toFixed(1) : 0,
    firstTouchTargetHrs: ftCount > 0 ? +(ftTargetSum / ftCount).toFixed(1) : 0,
    totalTargetHrs:      tcCount > 0 ? +(tcTargetSum / tcCount).toFixed(1) : 0,
    onTargetPct:         realPcts.length > 0 ? Math.round(realPcts.reduce((a, b) => a + b, 0) / realPcts.length) : 0,
    facilityCount:       facilityIds.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RVU calculations — real fix for mockRvu30/mockDaily's RVU half, using
// the real Code_Map_Table (services/billing/codeMapTable.ts) that
// didn't exist before this pass. When a case has real, assigned CPT
// codes (Case.coding.cpt), those are used; when it doesn't (true for
// essentially all cases today, since no manual-entry UI exists yet -
// see codeMapTable.ts's own header for why that's deliberately not
// built here), falls back to the honest, rule-based default
// (ruleBasedDefaultCptCodes) rather than showing zero everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { computeWorkRvuForCodes, ruleBasedDefaultCptCodes, resolveSpecimenDictionaryBaseCptCode, type SpecimenEntryForCptResolution, CODE_MAP_TABLE } from '../services/billing/codeMapTable';
import { resolveVersionEffectiveAt, type RvuTableVersion } from '../services/billing/RvuTableVersion';
import type { AppliedBlockCode } from '@/types/case/Specimen';

export interface SpecimenForRvuCalc {
  id: string;
  coding?: { cpt?: string[] };
  blocks?: { coding?: { cpt?: AppliedBlockCode[] } }[];
  specimenDictionaryEntryId?: string;
}

export interface CaseForRvuCalc extends CaseForDashboardCalc {
  specimens?: SpecimenForRvuCalc[];
}

/** Real fix, Phase 1 of specimen/block-level CPT association: sums real
 *  work RVU across every real specimen's own base code(s) plus every
 *  real block's own ancillary code(s) - matching the real, confirmed
 *  LIS pattern (specimen-level base codes, block-level ancillary
 *  codes), not a flat, undifferentiated case-level bucket. Falls back
 *  to the honest, rule-based default only for specimens with no real
 *  codes assigned at all - a specimen with real codes never has the
 *  rule-based default layered on top of it. */
export function realWorkRvuForCase(c: CaseForRvuCalc, versions: RvuTableVersion[], dictionaryEntries: SpecimenEntryForCptResolution[] = []): number {
  const resolvedVersion = c.diagnostic?.issuedDate ? resolveVersionEffectiveAt(versions, c.diagnostic.issuedDate) : null;
  const entries = resolvedVersion?.entries ?? CODE_MAP_TABLE;

  let total = 0;
  for (const sp of c.specimens ?? []) {
    let specimenCodes: string[];
    if (sp.coding?.cpt && sp.coding.cpt.length > 0) {
      specimenCodes = sp.coding.cpt; // real, manually-assigned code(s) - always wins
    } else {
      // Real fix: a real coder's dictionary-configured default (per
      // direct guidance - the lab's own AMA license covers this) wins
      // over the generic, honest rule-based fallback.
      const dictionaryCode = resolveSpecimenDictionaryBaseCptCode(sp, dictionaryEntries);
      specimenCodes = dictionaryCode ? [dictionaryCode] : ruleBasedDefaultCptCodes(1);
    }
    total += computeWorkRvuForCodes(specimenCodes, entries).totalWorkRvu;

    for (const block of sp.blocks ?? []) {
      if (block.coding?.cpt && block.coding.cpt.length > 0) {
        total += computeWorkRvuForCodes(block.coding.cpt.map(c => c.code), entries).totalWorkRvu;
      }
    }
  }
  return +total.toFixed(2);
}

export interface RealRvu30 {
  total: number;
  deltaPct: number | null;
  avgPerCase: number;
}

/** Real fix: replaces the hardcoded mockRvu30 object. Only counts real,
 *  genuinely finalized-by-this-user cases within the real last-30-day
 *  window - same finalization signal as computeOverviewKpis, not a
 *  separate, inconsistent definition of "this user's case" elsewhere in
 *  this same dashboard. versions is the full, real version history
 *  (fetched once by the caller, not per-case) - see
 *  realWorkRvuForCase for why each case resolves its own real,
 *  historical version rather than always using today's active one. */
export function computeRvu30(
  cases: CaseForRvuCalc[],
  userId: string,
  versions: RvuTableVersion[] = [],
  now: Date = new Date(),
  dictionaryEntries: SpecimenEntryForCptResolution[] = []
): RealRvu30 {
  const nowMs = now.getTime();
  const periodStart  = nowMs - 30 * DAY_MS;
  const priorStart   = nowMs - 60 * DAY_MS;

  const finalizedThis  = cases.filter(c => c.order?.assignedTo === userId && c.diagnostic?.finalizedBy === userId && isWithin(c.diagnostic?.issuedDate, periodStart, nowMs));
  const finalizedPrior = cases.filter(c => c.order?.assignedTo === userId && c.diagnostic?.finalizedBy === userId && isWithin(c.diagnostic?.issuedDate, priorStart, periodStart));

  const totalThis  = finalizedThis.reduce((s, c) => s + realWorkRvuForCase(c, versions, dictionaryEntries), 0);
  const totalPrior = finalizedPrior.reduce((s, c) => s + realWorkRvuForCase(c, versions, dictionaryEntries), 0);

  return {
    total:      +totalThis.toFixed(2),
    deltaPct:   totalPrior === 0 ? null : Math.round(((totalThis - totalPrior) / totalPrior) * 100),
    avgPerCase: finalizedThis.length > 0 ? +(totalThis / finalizedThis.length).toFixed(2) : 0,
  };
}

export interface RealDailyRvu { day: string; cases: number; rvus: number; }

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Real fix: replaces the hardcoded mockDaily array. "This Week" per
 *  the UI's own real label - the real current Mon-Fri, not an average
 *  across multiple weeks. versions - see computeRvu30's own doc.
 *  Real fix, facility-timezone effort: "this week" and each day's real
 *  boundaries are now computed in the real, configured facility
 *  timezone, not the viewing device's own local time - the same real
 *  bug class as the month-bucketing fixes elsewhere (a real, stored
 *  case's issuedDate was being bucketed into the wrong calendar day
 *  depending on nothing but the viewing device). */
export function computeWeeklyDaily(
  cases: CaseForRvuCalc[],
  userId: string,
  timezone: string,
  versions: RvuTableVersion[] = [],
  now: Date = new Date(),
  dictionaryEntries: SpecimenEntryForCptResolution[] = []
): RealDailyRvu[] {
  const mine = cases.filter(c => c.order?.assignedTo === userId && c.diagnostic?.finalizedBy === userId && c.diagnostic?.issuedDate);

  // Real Monday of the current real week, in the real facility
  // timezone. Day-of-week is derived via a "floating" UTC date built
  // from the real, facility-local Y/M/D (getUTCDay() - not restricted,
  // and safe here since day-of-week only depends on the calendar date
  // itself, never time-of-day or offset).
  const { year: todayYear, month: todayMonth, day: todayDay } = getFacilityDateParts(now, timezone);
  const dow = new Date(Date.UTC(todayYear, todayMonth, todayDay)).getUTCDay(); // 0 = Sunday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const days: RealDailyRvu[] = [];
  for (let i = 0; i < 5; i++) {
    const day = todayDay + diffToMonday + i;
    const dayStart = getFacilityMidnightUtc(todayYear, todayMonth, day, timezone);
    const dayEnd   = getFacilityMidnightUtc(todayYear, todayMonth, day + 1, timezone);
    const dayCases = mine.filter(c => isWithin(c.diagnostic!.issuedDate, dayStart.getTime(), dayEnd.getTime()));
    const dowForLabel = new Date(Date.UTC(todayYear, todayMonth, day)).getUTCDay();
    days.push({
      day:   WEEKDAY_LABELS[dowForLabel],
      cases: dayCases.length,
      rvus:  +dayCases.reduce((s, c) => s + realWorkRvuForCase(c, versions, dictionaryEntries), 0).toFixed(2),
    });
  }
  return days;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality Flags (top-3, per-pathologist)
//
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// ContributionDashboardPage.tsx's "Quality Flags" widget — real, unresolved
// deficiencies and high/medium-severity Frozen/Final discordances for the
// CURRENT pathologist, scored and sliced to the top 3 — used to be computed
// directly inline in a useEffect, with no backing resolver and no tests,
// unlike this same directory's sibling QA pages (CytologyQcQueuePage.tsx,
// SurgicalQaWorklistPage.tsx), which already delegate equivalent logic to
// resolve*.ts functions.
// ─────────────────────────────────────────────────────────────────────────────

export type QualityFlagSeverity = 'low' | 'medium' | 'high';

export interface QualityFlagCandidate {
  id: string;
  kind: 'deficiency' | 'discordance';
  caseId: string;
  value: string;
  /** Undefined only reaches here for a discordant activity record with
   *  no severity captured — real, per QaActivityRecord.ts's own doc,
   *  severity is only ever absent when outcome !== 'discordant', so a
   *  discordant record with no severity shouldn't occur in practice;
   *  preserved as a possibility here rather than silently defaulted,
   *  matching this widget's pre-existing behavior exactly. */
  severity: QualityFlagSeverity | undefined;
}

export interface DeficiencyForQualityFlags {
  id: string;
  caseId: string;
  status: 'open' | 'pending-verification' | 'closed';
  deficiencyTypeId: string;
  specimenLabel?: string;
  verificationDueDate?: string;
  reopenCount?: number;
  raisedAt: string;
}

export interface DiscordanceRecordForQualityFlags {
  id: string;
  caseId: string;
  activityTypeId: string;
  outcome: string;
  severity?: QualityFlagSeverity;
  caseType: string;
  recordedBy?: { userId: string };
  recordedAt: string;
}

export interface CaseForQualityFlagsScoping {
  id: string;
  order?: { assignedTo?: string };
}

/** Real, deliberate severity derivation — SpecimenDeficiency has no real
 *  `severity` field anywhere (checked directly), so this is derived from
 *  real, existing signals rather than invented: overdue
 *  pending-verification, or anything reopened at least once, reads as
 *  high; a fresh open item as medium; anything else shown (non-overdue
 *  pending-verification) as low. */
function deficiencySeverity(d: DeficiencyForQualityFlags, now: number): QualityFlagSeverity {
  const isOverdue = !!d.verificationDueDate && new Date(d.verificationDueDate).getTime() < now;
  if (isOverdue || (d.reopenCount ?? 0) > 0) return 'high';
  if (d.status === 'open') return 'medium';
  return 'low';
}

/**
 * The real "top 3 Quality Flags for this pathologist" selection: open/
 * pending-verification deficiencies on the pathologist's OWN cases (cross-
 * referenced via each case's real `order.assignedTo`, never
 * SpecimenDeficiency.raisedBy — often a tech/accessioner flagging the
 * issue, not the case's owning pathologist, the wrong signal for "is this
 * MY quality issue"), plus this pathologist's own high/medium-severity
 * Frozen/Final discordances (low-severity, Tier-1-no-clinical-impact
 * discordances deliberately excluded — not the kind of thing that belongs
 * in a short, urgent flag list). Both pools are scored (overdue/reopened
 * deficiencies and high-severity discordances score highest), merged,
 * sorted by score then recency, and sliced to the top `limit` (default 3).
 */
export function computeTopQualityFlags(
  deficiencies: DeficiencyForQualityFlags[],
  deficiencyTypeNameById: Record<string, string>,
  discordanceRecords: DiscordanceRecordForQualityFlags[],
  frozenFinalActivityTypeId: string,
  cases: CaseForQualityFlagsScoping[],
  userId: string,
  limit = 3,
  now: number = Date.now(),
): QualityFlagCandidate[] {
  const myCaseIds = new Set(cases.filter(c => c.order?.assignedTo === userId).map(c => c.id));

  const deficiencyFlags = deficiencies
    .filter(d => d.status !== 'closed' && myCaseIds.has(d.caseId))
    .map(d => {
      const severity = deficiencySeverity(d, now);
      return {
        id: d.id,
        kind: 'deficiency' as const,
        caseId: d.caseId,
        value: `${deficiencyTypeNameById[d.deficiencyTypeId] ?? d.deficiencyTypeId}${d.specimenLabel ? ` — Specimen ${d.specimenLabel}` : ' — case-level'}`,
        severity,
        sortKey: d.raisedAt,
        score: severity === 'high' ? 2 : severity === 'medium' ? 1 : 0,
      };
    });

  const discordanceFlags = discordanceRecords
    .filter(d => d.activityTypeId === frozenFinalActivityTypeId && d.outcome === 'discordant' && d.severity !== 'low' && d.recordedBy?.userId === userId)
    .map(d => ({
      id: d.id,
      kind: 'discordance' as const,
      caseId: d.caseId,
      value: `Frozen/Final discordance — ${d.caseType}`,
      severity: d.severity,
      sortKey: d.recordedAt,
      score: d.severity === 'high' ? 2 : 1,
    }));

  return [...deficiencyFlags, ...discordanceFlags]
    .sort((a, b) => b.score - a.score || b.sortKey.localeCompare(a.sortKey))
    .slice(0, limit)
    .map(({ sortKey: _sortKey, score: _score, ...flag }) => flag);
}

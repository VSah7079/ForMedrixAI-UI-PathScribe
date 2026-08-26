// src/components/Contribution/productivityCalculations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, from a direct product review: ProductivityTab.tsx's monthly case
// chart was entirely hardcoded (mockMonthly) - every pathologist saw the same
// fake numbers regardless of their own actual work, with no disclosure this
// was demo data. This computes the real case count per month from actual
// Case records.
//
// Real, important correction, found during a later audit: this file's own
// RVU comment previously said "no real RVU data source anywhere in the app."
// That was stale/wrong - services/billing/mockRvuCodeMapService.ts (a real,
// versioned, admin-managed CPT-to-workRVU map, with real, per-case CPT codes
// already available via Specimen.coding.cpt/Block.coding.cpt) already
// existed. RVU is now real too - see computeRvuSummary below. Peer
// comparison remains explicitly flagged as demo: it genuinely needs the
// admin-configurable peer-visibility toggle and an aggregated-peer backend,
// neither of which exist yet - a real, different gap from RVU's.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import { computeWorkRvuForCodes, ruleBasedDefaultCptCodes } from '@/services/billing/codeMapTable';
import { resolveVersionEffectiveAt, type RvuTableVersion } from '@/services/billing/RvuTableVersion';
import { getFacilityDateParts } from '@/utils/facilityTime';

export type UserRole = 'pathologist' | 'admin' | 'pathologist-admin' | 'superadmin';

/** Real gating logic for peer-comparison visibility: admin-tier roles
 *  always see it (Chief Pathologist/QA/Admin always see aggregate data,
 *  per the design decision); the plain 'pathologist' role only sees it
 *  if the institution has explicitly turned the toggle on. Defaults to
 *  false (hidden) if role is unknown/undefined - fails closed, not open. */
export function canSeePeerComparison(
  role: UserRole | undefined,
  showPeerAveragesToPathologists: boolean
): boolean {
  if (!role) return false;
  return role !== 'pathologist' || showPeerAveragesToPathologists;
}

export interface RealMonthlyCaseCounts {
  month: string;    // 'Jan', 'Feb', etc.
  monthIndex: number;
  cases: number;
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** True if this case was genuinely, personally finalized by this specific
 *  pathologist - the real signal for "this counts as their completed work,"
 *  not just "assigned to them" (which listCasesForUser already filters on,
 *  but includes in-progress cases too). */
export function wasFinalizedByUser(c: Case, userId: string): boolean {
  return !!c.diagnostic?.finalizedBy
    && c.diagnostic.finalizedBy === userId
    && !!c.diagnostic?.issuedDate;
}

/** Real monthly case counts for the current calendar year, Jan through the
 *  current month only (no future months, matching the original mock's own
 *  "cap at current calendar month" behavior) - computed from real cases,
 *  not a hardcoded array. Real fix: buckets each real case's real
 *  issuedDate against the real, configured FACILITY timezone (Pete's
 *  direct clinical-informatics guidance), not the viewing device's own
 *  local timezone - see utils/facilityTime.ts's own header comment for
 *  the full reasoning. timezone is required, not defaulted, so no real
 *  caller can silently fall back to the wrong facility. */
export function computeMonthlyCaseCounts(
  cases: Case[],
  userId: string,
  timezone: string,
  now: Date = new Date()
): RealMonthlyCaseCounts[] {
  const { year: currentYear, month: currentMonthIdx } = getFacilityDateParts(now, timezone);

  const counts = new Array(currentMonthIdx + 1).fill(0);
  for (const c of cases) {
    if (!wasFinalizedByUser(c, userId)) continue;
    const issuedRaw = c.diagnostic!.issuedDate!;
    if (isNaN(new Date(issuedRaw).getTime())) continue;
    const { year: issuedYear, month: idx } = getFacilityDateParts(issuedRaw, timezone);
    if (issuedYear !== currentYear) continue;
    if (idx < 0 || idx > currentMonthIdx) continue;
    counts[idx]++;
  }

  return counts.map((cases, idx) => ({ month: MONTH_LABELS[idx], monthIndex: idx, cases }));
}

/** Real, per-case CPT code gathering - flattens the real, already-
 *  assigned codes across every specimen and block on a case
 *  (Specimen.coding.cpt is the base code, Block.coding.cpt is
 *  ancillary/IHC - both real, billing-relevant codes, matching the
 *  same real aggregation services/billing/codeMapTable.ts's own
 *  computeCaseCodingSummary already performs). Falls back to the
 *  real, honest rule-based default (one 88305 per specimen) only when
 *  a case genuinely has no manually-assigned codes at all - exactly
 *  the scenario ruleBasedDefaultCptCodes's own doc comment says it
 *  exists for ("workload/productivity tracking," not billing. */
function gatherRealCptCodes(c: Case): string[] {
  const specimens = (c as any).specimens as Array<{ coding?: { cpt?: string[] }; blocks?: Array<{ coding?: { cpt?: { code: string; stainOrderId?: string }[] } }> }> | undefined;
  if (!specimens || specimens.length === 0) return [];

  const codes: string[] = [];
  for (const sp of specimens) {
    if (sp.coding?.cpt) codes.push(...sp.coding.cpt);
    for (const block of sp.blocks ?? []) {
      if (block.coding?.cpt) codes.push(...block.coding.cpt.map(c => c.code));
    }
  }
  if (codes.length > 0) return codes;
  return ruleBasedDefaultCptCodes(specimens.length);
}

/** Real, shared per-case computation - the actual work RVU for one
 *  real case, resolved against whichever RVU table version was
 *  genuinely effective on that case's own real issuedDate. Extracted
 *  so computeRvuSummary (YTD total) and computeMonthlyRvu (per-month
 *  breakdown) share the exact same real resolution logic rather than
 *  duplicating it. */
function computeRealCaseRvu(c: Case, versions: RvuTableVersion[]): { workRvu: number; unrecognizedCount: number } {
  const version = resolveVersionEffectiveAt(versions, c.diagnostic!.issuedDate!);
  const codes = gatherRealCptCodes(c);
  if (!version) return { workRvu: 0, unrecognizedCount: codes.length };
  const { totalWorkRvu, unrecognizedCodes } = computeWorkRvuForCodes(codes, version.entries);
  return { workRvu: totalWorkRvu, unrecognizedCount: unrecognizedCodes.length };
}

export interface RealPeerRvuStats {
  peerAvg: number;
  topPerf: number;
  /** Real, honest transparency - how many real peers this average is
   *  based on, so a caller/UI can tell "a real average of 12 people"
   *  from "a real average of 1 person" apart, rather than presenting
   *  both with equal, false confidence. */
  peerCount: number;
}

/** Real, anonymized cross-pathologist RVU comparison - replaces the
 *  entirely hardcoded demoPeerData (ProductivityTab.tsx). Reuses the
 *  same real, already-tested computeRvuSummary once per real peer
 *  pathologist, but deliberately returns ONLY real, aggregate
 *  statistics (average, top, count) - never a per-pathologist
 *  breakdown, matching the real, explicit "anonymized" framing already
 *  established in components/Config/System/ContributionSettingsSection.tsx's
 *  own UI text. A genuinely empty peer list returns real, honest zeros
 *  (peerCount: 0), never a fabricated average. */
export function computePeerRvuStats(
  allCases: Case[],
  peerUserIds: string[],
  versions: RvuTableVersion[],
  timezone: string,
  now: Date = new Date()
): RealPeerRvuStats {
  if (peerUserIds.length === 0) return { peerAvg: 0, topPerf: 0, peerCount: 0 };

  const totals = peerUserIds.map(id => computeRvuSummary(allCases, id, versions, timezone, now).total);
  const sum = totals.reduce((a, b) => a + b, 0);

  return {
    peerAvg: Math.round((sum / totals.length) * 100) / 100,
    topPerf: Math.round(Math.max(...totals) * 100) / 100,
    peerCount: totals.length,
  };
}

export interface RealMonthlyRvu {
  month: string;
  monthIndex: number;
  rvus: number;
}

/** Real, per-month RVU breakdown for the current calendar year, Jan
 *  through the current month only - replaces the entirely hardcoded
 *  demoRvuByMonth (ProductivityTab.tsx). Same real "resolve against
 *  the historically-effective version" discipline as computeRvuSummary. */
export function computeMonthlyRvu(
  cases: Case[],
  userId: string,
  versions: RvuTableVersion[],
  timezone: string,
  now: Date = new Date()
): RealMonthlyRvu[] {
  const { year: currentYear, month: currentMonthIdx } = getFacilityDateParts(now, timezone);
  const totals = new Array(currentMonthIdx + 1).fill(0);

  for (const c of cases) {
    if (!wasFinalizedByUser(c, userId)) continue;
    const issuedRaw = c.diagnostic!.issuedDate!;
    if (isNaN(new Date(issuedRaw).getTime())) continue;
    const { year: issuedYear, month: idx } = getFacilityDateParts(issuedRaw, timezone);
    if (issuedYear !== currentYear) continue;
    if (idx < 0 || idx > currentMonthIdx) continue;
    totals[idx] += computeRealCaseRvu(c, versions).workRvu;
  }

  return totals.map((rvus, idx) => ({ month: MONTH_LABELS[idx], monthIndex: idx, rvus: Math.round(rvus * 100) / 100 }));
}

export interface RealRvuSummary {
  total: number;
  avgPerCase: number;
  caseCount: number;
  delta: string;
  up: boolean;
  period: string;
  /** Same real Jan-1-to-today window, one year back - already computed
   *  internally for delta; exposed as its own field since the real
   *  peer-comparison UI needs "your own last year" as a distinct row,
   *  not just a percentage. */
  lastYearTotal: number;
  /** Real, honest transparency - how many real CPT codes across these
   *  cases weren't found in the resolved RVU table version, so their
   *  real work RVU contribution is genuinely 0, not silently ignored. */
  unrecognizedCodeCount: number;
}

/** Real YTD RVU total for this pathologist's own, genuinely finalized
 *  cases, with a real year-over-year delta (same real Jan-1-to-today
 *  window, both years) - replaces the entirely hardcoded demoRvuTile.
 *  Each real case resolves against the RVU table version that was
 *  ACTUALLY effective on its own real issuedDate (resolveVersionEffectiveAt),
 *  never today's active version applied retroactively - the entire
 *  reason RvuTableVersion.ts exists. A case whose real issuedDate
 *  predates every real table version genuinely contributes 0, not a
 *  guess. */
export function computeRvuSummary(
  cases: Case[],
  userId: string,
  versions: RvuTableVersion[],
  timezone: string,
  now: Date = new Date()
): RealRvuSummary {
  const nowParts = getFacilityDateParts(now, timezone);
  const currentYear = nowParts.year;
  const lastYear = currentYear - 1;
  // Real day-of-year, built from the real, facility-derived calendar
  // components (not the runtime's own local time) - Date.UTC here is
  // pure arithmetic on already-resolved facility calendar values, not a
  // real timezone conversion, so it stays consistent regardless of which
  // timezone the calling process itself happens to run in.
  const dayOfYear = Math.floor((Date.UTC(nowParts.year, nowParts.month, nowParts.day) - Date.UTC(currentYear, 0, 1)) / 86400000);

  let thisYearTotal = 0;
  let lastYearTotal = 0;
  let caseCount = 0;
  let unrecognizedCodeCount = 0;

  for (const c of cases) {
    if (!wasFinalizedByUser(c, userId)) continue;
    const issuedRaw = c.diagnostic!.issuedDate!;
    if (isNaN(new Date(issuedRaw).getTime())) continue;

    const issuedParts = getFacilityDateParts(issuedRaw, timezone);
    const issuedYear = issuedParts.year;
    const issuedDayOfYear = Math.floor((Date.UTC(issuedParts.year, issuedParts.month, issuedParts.day) - Date.UTC(issuedYear, 0, 1)) / 86400000);
    const isThisYear = issuedYear === currentYear && issuedDayOfYear <= dayOfYear;
    const isLastYearSamePeriod = issuedYear === lastYear && issuedDayOfYear <= dayOfYear;
    if (!isThisYear && !isLastYearSamePeriod) continue;

    const { workRvu, unrecognizedCount } = computeRealCaseRvu(c, versions);

    if (isThisYear) {
      thisYearTotal += workRvu;
      caseCount++;
      unrecognizedCodeCount += unrecognizedCount;
    } else {
      lastYearTotal += workRvu;
    }
  }

  const delta = lastYearTotal > 0 ? ((thisYearTotal - lastYearTotal) / lastYearTotal) * 100 : 0;

  return {
    total: Math.round(thisYearTotal * 100) / 100,
    avgPerCase: caseCount > 0 ? Math.round((thisYearTotal / caseCount) * 10) / 10 : 0,
    caseCount,
    delta: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
    up: delta >= 0,
    period: `YTD ${currentYear}`,
    lastYearTotal: Math.round(lastYearTotal * 100) / 100,
    unrecognizedCodeCount,
  };
}

// src/components/Contribution/aiContributionCalculations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// AIContributionTab.tsx was the one tab in this directory with no
// matching `*Calculations.ts` module — unlike its siblings
// (productivityCalculations.ts, qualityCalculations.ts,
// caseMixCalculations.ts, tatCalculations.ts, each tested). Its
// time-bucketed trend aggregation and confidence/period-scaling math
// lived inline with zero test coverage, breaking this directory's own
// established pattern. This module is that missing piece.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiFeedbackEntry } from '@/services/cases/mockCaseService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';

export type AiContributionDateRange = '30d' | '90d' | 'ytd';

export interface BreakdownRow {
  label: string; code?: string; rate: number; cases: number;
}

export interface OverriddenCase {
  id: string; caseType: string; assigningAuthority?: string;
  aiSuggestion: string; finalDiagnosis: string; reason: string; date: string; daysAgo: number;
}

export interface CaseComparison {
  caseType: string; aiAssisted: number; manual: number;
  aiTat: number; manualTat: number;
}

export interface MonthlyPoint { month: string; rate: number; }

export interface AiAcceptanceSummary {
  confirmed: number;
  overridden: number;
  /** 'missed' entries aren't AI suggestions at all — no acceptance
   *  decision to measure — so they're excluded from this total. */
  total: number;
  /** Average AI confidence across confirmed+overridden entries only;
   *  null (never a fabricated 0 or NaN) when there's no real feedback
   *  yet to average. */
  avgConfidence: number | null;
}

/** Real per-user AI feedback rollup — confirmed/overridden counts and
 *  average AI confidence, from the real recordAiFeedback event log. */
export function computeAiAcceptanceSummary(feedback: AiFeedbackEntry[]): AiAcceptanceSummary {
  const confirmed = feedback.filter(e => e.action === 'confirmed').length;
  const overridden = feedback.filter(e => e.action === 'overridden').length;
  const total = confirmed + overridden;
  const avgConfidence = total > 0
    ? +(feedback.filter(e => e.action !== 'missed').reduce((s, e) => s + e.aiConfidence, 0) / total).toFixed(1)
    : null;
  return { confirmed, overridden, total, avgConfidence };
}

/**
 * Real, time-bucketed acceptance-rate trend, built from actual
 * AiFeedbackEntry timestamps — replaces synthetic interpolation from a
 * hardcoded shape. `periodDays` is split into `buckets` equal-width
 * windows ending at `now`; each bucket's rate is the real
 * confirmed/(confirmed+overridden) percentage among 'missed'-excluded
 * entries that actually fall in it, or 0 when a bucket has no real
 * entries at all (never an interpolated guess).
 */
export function buildAcceptanceTrend(
  feedback: AiFeedbackEntry[],
  periodDays: number,
  buckets: number,
  now: number = Date.now(),
  locale = 'en-US',
): MonthlyPoint[] {
  const bucketMs = (periodDays * 86400000) / buckets;
  const points: MonthlyPoint[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const bucketEnd = now - i * bucketMs;
    const bucketStart = bucketEnd - bucketMs;
    const inBucket = feedback.filter(e => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= bucketStart && ts < bucketEnd && e.action !== 'missed';
    });
    const confirmed = inBucket.filter(e => e.action === 'confirmed').length;
    const label = new Date(bucketEnd).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    points.push({ month: label, rate: inBucket.length > 0 ? +((confirmed / inBucket.length) * 100).toFixed(1) : 0 });
  }
  return points;
}

/** The real average rate across a set of trend points — shared by
 *  both the YTD baseline and the currently-selected period's own
 *  average. */
export function averageRate(points: MonthlyPoint[]): number {
  return +(points.reduce((s, d) => s + d.rate, 0) / points.length).toFixed(1);
}

/** Real, deliberate period-scaling fraction: 30d/90d periods scale
 *  against however many real months have actually elapsed this year
 *  so far (`monthsElapsed`, i.e. the real YTD trend's own point
 *  count) rather than a hardcoded month count — same technique
 *  qualityCalculations.ts's own period scaling uses. YTD itself is
 *  always the full, unscaled 1.0. */
export function computePeriodFraction(dateRange: AiContributionDateRange, monthsElapsed: number): number {
  const monthsInPeriod = dateRange === '30d' ? 1 : dateRange === '90d' ? 3 : monthsElapsed;
  return monthsInPeriod / monthsElapsed;
}

/** Scales a real YTD count down to the selected period — no floor,
 *  since an honest zero is a valid scaled value for these fields
 *  (total cases/assisted counts). */
export function scaleForPeriod(value: number, dateRange: AiContributionDateRange, periodFraction: number): number {
  return dateRange === 'ytd' ? value : Math.round(value * periodFraction);
}

/** Same real scaling rule as scaleForPeriod, but floored at 1 — for
 *  per-row breakdown/comparison case counts, where a scaled-to-zero
 *  row would otherwise misleadingly read as "no real cases at all"
 *  for a category that does have real, if sparse, activity. */
export function scaleForPeriodWithFloor(value: number, dateRange: AiContributionDateRange, periodFraction: number): number {
  return dateRange === 'ytd' ? value : Math.max(1, Math.round(value * periodFraction));
}

export function scaleBreakdownForPeriod(breakdown: BreakdownRow[], dateRange: AiContributionDateRange, periodFraction: number): BreakdownRow[] {
  return breakdown.map(r => ({ ...r, cases: scaleForPeriodWithFloor(r.cases, dateRange, periodFraction) }));
}

export function scaleComparisonForPeriod(comparison: CaseComparison[], dateRange: AiContributionDateRange, periodFraction: number): CaseComparison[] {
  return comparison.map(c => ({
    ...c,
    aiAssisted: scaleForPeriodWithFloor(c.aiAssisted, dateRange, periodFraction),
    manual: scaleForPeriodWithFloor(c.manual, dateRange, periodFraction),
  }));
}

/** Real, per-user overridden-case list — the pathologist's own recent
 *  AI-suggestion overrides, newest-activity-first-in/slice-first-6-out
 *  order (matches `myFeedback`'s own real event-log order, not
 *  independently re-sorted here). `caseTypeById` resolves a real
 *  display label per case when available; falls back to the raw
 *  caseId otherwise, same as the pre-existing behavior. */
export function deriveOverriddenCases(
  feedback: AiFeedbackEntry[],
  caseTypeById: Record<string, string>,
  now: number = Date.now(),
  locale = 'en-US',
): OverriddenCase[] {
  return feedback.filter(e => e.action === 'overridden').slice(0, 6).map((e): OverriddenCase => ({
    id: e.caseId,
    caseType: caseTypeById[e.caseId] ?? e.caseId,
    aiSuggestion: Array.isArray(e.aiValue) ? e.aiValue.join(', ') : e.aiValue,
    finalDiagnosis: Array.isArray(e.userValue) ? e.userValue.join(', ') : e.userValue,
    reason: e.fieldLabel,
    date: new Date(e.timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    daysAgo: Math.floor((now - new Date(e.timestamp).getTime()) / 86400000),
  }));
}

// ── Live breakdown-by-subspecialty (Specimen Dictionary-derived) ──────────────

/** Display labels for known subspecialty values from the specimen
 *  dictionary. Falls back to a humanized version of the raw name for
 *  anything not listed here, so a newly-added subspecialty never
 *  silently disappears from the breakdown. */
export const SUBSPECIALTY_LABELS: Record<string, string> = {
  gi:     'GI',
  breast: 'Breast',
  derm:   'Dermatopathology',
  neuro:  'Neuropathology',
  heme:   'Hematopathology',
  gyn:    'Gynecologic',
  uro:    'Genitourinary',
  '':     'Unassigned',
};

/** Illustrative acceptance rates per subspecialty — the CATEGORY LIST
 *  itself is derived live from the specimen dictionary
 *  (deriveBreakdownFromSpecimens), but there's no real AI-usage audit
 *  trail behind these specific rate numbers yet. Falls back to a
 *  generic 80% for any subspecialty not seeded here. */
export const MOCK_RATE_BY_SUBSPECIALTY: Record<string, number> = {
  gi: 88, breast: 91, derm: 82, neuro: 86, heme: 84, gyn: 80, uro: 85, '': 75,
};

export const CASES_PER_SPECIMEN_TYPE = 12; // mock volume multiplier — illustrative only

export function humanizeSubspecialtyId(id: string): string {
  if (!id) return 'Unassigned';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Real breakdown-by-subspecialty, derived from the live Specimen
 *  Dictionary — only active specimen-type entries count, grouped by
 *  subspecialty, sorted by (illustrative) case volume descending. */
export function deriveBreakdownFromSpecimens(specimens: SpecimenEntry[]): BreakdownRow[] {
  const groups = new Map<string, number>(); // subspecialty name -> active specimen-type count
  for (const s of specimens) {
    if (!s.active) continue;
    const key = (s.subspecialty ?? '').toLowerCase();
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([id, typeCount]) => ({
      label: SUBSPECIALTY_LABELS[id] ?? humanizeSubspecialtyId(id),
      rate: MOCK_RATE_BY_SUBSPECIALTY[id] ?? 80,
      cases: typeCount * CASES_PER_SPECIMEN_TYPE,
    }))
    .sort((a, b) => b.cases - a.cases);
}

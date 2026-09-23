// src/services/quality/resolveQaActivityDashboardReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-108, Story 5.1/5.2 — the one real, generic QA Dashboard this ticket's
// own acceptance criteria call for: "dashboards show all QA activity types,"
// "discrepancy trends by activity type, organ system, and reviewer." Every
// existing QA reporting surface in this app (CytologyQaTab.tsx, the CAPA
// trend chart in QualityAssurancePage.tsx) is scoped to one domain — this is
// the first cross-specialty rollup built directly on the generic QA Activity
// Engine (QaActivityRecord/QaActivityType, PS-113/PS-117), covering every
// activity type the engine has ever recorded a review against — Frozen vs
// Final, Cyto-Histo, Abnormal Finding Confirmation, GYN Secondary Screening,
// Surgical Peer Review, Surgical Biopsy-Resection Correlation, and any future
// activity a QA Lead defines with zero code changes (per Story 2.1).
//
// Real, honest scope note on "completion rate": PS-108's own Story 5.1 asks
// for "completion rates for all QA activities." This app's real QA Activity
// Engine (resolveQaActivitySelectionForCase.ts) computes which cases are
// CURRENTLY eligible for review at query time — it does not persist a
// standing "assigned, not yet completed" worklist entry anywhere a
// completion rate could be measured against later. Fabricating a completion
// percentage against a denominator this app doesn't track would be a
// fictional number, not a real one. What IS real and honestly computable
// from QaActivityRecord — every review that has actually been completed,
// concordant or discordant — is activity volume and discordance/concordance
// rate. That is what this resolver reports, consistent with this app's own
// established "0% agreement, 0 compared, never a fabricated 100%" honesty
// convention (see resolveCytologyQaAggregateReport.ts's own header).
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { Subspecialty } from '@/services/subspecialties/ISubspecialtyService';

export interface QaDashboardGroupRow {
  id: string;
  name: string;
  total: number;
  concordant: number;
  discordant: number;
  concordantPercent: number;
  /** Real, per QaActivityRecord.escalationRequired — set exactly when
   *  severity === 'high' on a discordant record. A real, distinct count
   *  from raw discordance: not every discordance needs mandatory
   *  follow-up, only the high-severity ones do. */
  escalationRequiredCount: number;
}

export interface QaDashboardMonthlyTrendPoint {
  month: string;
  total: number;
  discordant: number;
}

export interface QaActivityDashboardReport {
  totalRecords: number;
  concordantCount: number;
  discordantCount: number;
  overallConcordantPercent: number;
  escalationRequiredCount: number;
  byActivityType: QaDashboardGroupRow[];
  bySubspecialty: QaDashboardGroupRow[];
  byReviewer: QaDashboardGroupRow[];
  /** Real, last 6 months — same real window
   *  QualityAssurancePage.tsx's own CAPA trend chart already uses, for
   *  visual/UX consistency across this page's tabs, not picked fresh. */
  monthlyTrend: QaDashboardMonthlyTrendPoint[];
}

function pct(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function buildGroups(
  records: QaActivityRecord[],
  keyOf: (r: QaActivityRecord) => string | undefined,
  nameOf: (key: string) => string,
  /** Real, per direct convention this app already uses elsewhere
   *  (Subspecialty/QaActivityType ordering) — an unresolvable key still
   *  produces a real, visible row (never silently dropped), labeled with
   *  its own raw id so a genuine data gap (e.g. a deleted activity type)
   *  stays honestly visible rather than disappearing from the report. */
  unassignedLabel: string,
): QaDashboardGroupRow[] {
  const byKey = new Map<string, QaActivityRecord[]>();
  for (const r of records) {
    const key = keyOf(r) ?? '__unassigned__';
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }
  const rows: QaDashboardGroupRow[] = [];
  for (const [key, recs] of byKey) {
    const discordant = recs.filter(r => r.outcome === 'discordant').length;
    const concordant = recs.length - discordant;
    rows.push({
      id: key,
      name: key === '__unassigned__' ? unassignedLabel : nameOf(key),
      total: recs.length,
      concordant,
      discordant,
      concordantPercent: pct(concordant, recs.length),
      escalationRequiredCount: recs.filter(r => r.escalationRequired).length,
    });
  }
  // Real, highest-volume-first — the same real "what needs attention
  // first" ordering a QA Lead scanning this dashboard actually wants,
  // rather than an arbitrary insertion or alphabetical order.
  return rows.sort((a, b) => b.total - a.total);
}

export function resolveQaActivityDashboardReport(
  records: QaActivityRecord[],
  activityTypes: QaActivityType[],
  subspecialties: Subspecialty[],
): QaActivityDashboardReport {
  const activityTypeName = (id: string) => activityTypes.find(t => t.id === id)?.name ?? id;
  const subspecialtyName = (id: string) => subspecialties.find(s => s.id === id)?.name ?? id;
  const reviewerName = (id: string) => records.find(r => r.recordedBy.userId === id)?.recordedBy.userName ?? id;

  const discordantCount = records.filter(r => r.outcome === 'discordant').length;
  const concordantCount = records.length - discordantCount;

  const months: QaDashboardMonthlyTrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const inMonth = records.filter(r => {
      const t = new Date(r.recordedAt).getTime();
      return t >= monthStart && t < monthEnd;
    });
    months.push({ month: monthKey, total: inMonth.length, discordant: inMonth.filter(r => r.outcome === 'discordant').length });
  }

  return {
    totalRecords: records.length,
    concordantCount,
    discordantCount,
    overallConcordantPercent: pct(concordantCount, records.length),
    escalationRequiredCount: records.filter(r => r.escalationRequired).length,
    byActivityType: buildGroups(records, r => r.activityTypeId, activityTypeName, 'Unknown Activity Type'),
    bySubspecialty: buildGroups(records, r => r.subspecialtyId, subspecialtyName, 'Unassigned Organ System'),
    byReviewer: buildGroups(records, r => r.recordedBy.userId, reviewerName, 'Unknown Reviewer'),
    monthlyTrend: months,
  };
}

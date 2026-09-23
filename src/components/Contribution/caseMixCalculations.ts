// src/components/Contribution/caseMixCalculations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the resident/mentor differentiator review
// ("I would like the Residents to know how they are doing relative to the
// expectations. Are they reviewing the right types of cases. Same for the
// mentors."). Two deliberate scope decisions, both per direct confirmation:
//
// 1. No "expected" case mix exists anywhere in this app's own data model
//    (QaSupervisionAssignmentType carries only an end condition — case
//    count or duration — never a per-subspecialty target). Inventing a
//    plausible-looking target here would be exactly the kind of
//    fabrication this whole review has been checking against elsewhere —
//    so `buildSubspecialtyBreakdown` reports real, actual coverage only,
//    never a judgment of "enough" or "right." A real target can be
//    layered on top of this later, once one actually exists to compare
//    against.
// 2. `buildSubspecialtyBreakdown` itself is extracted from
//    ContributionDashboardPage.tsx's own TeachingCasesTile, where it
//    already existed inline for a resident's own records — pulled out
//    here so the new Mentor tab reuses the exact same logic per
//    supervisee rather than a second, independently-maintained copy.
//    Same real lesson as the countersign-gate consolidation fix earlier
//    this same review: one calculation, not two that can silently drift.
//
// Update — expected case mix, per direct follow-up ("Are they reviewing
// the right types of cases. Same for the mentors."). An org-wide target
// (ExpectedCaseMixTarget, set once per QaSupervisionAssignmentType — see
// that file's own doc comment) can now be layered on top of real
// coverage via applyExpectedCaseMix, below. Still no fabrication: when a
// type has no targets configured, coverage renders exactly as before
// (real numbers, no judgment) — a target only ever comes from what an
// admin actually configured.
//
// Update — CSV export (buildCaseMixExportRows). Real, deliberate
// framing decision: NOT an "ACGME export." Checked directly against
// ACGME's own documentation before this feature existed at all (see
// exportCaseLog's own comment in ContributionDashboardPage.tsx) — no
// public vendor bulk-import schema exists, and ACGME's Non-Endorsement
// Policy specifically discourages third-party tools claiming to speak
// its format. This is a flat, denormalized progress/case-mix summary a
// resident can hand to a mentor or program coordinator, or open in
// Excel/a BI tool — not a file meant to be uploaded to ACGME directly.
// PGY_Level was requested but deliberately left out: no field for it
// exists anywhere in StaffUser (checked directly) — adding a plausible-
// looking value would be exactly the fabrication this whole feature
// has been built to avoid.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';
import type { ExpectedCaseMixTarget } from '@/types/quality/QaSupervisionAssignmentType';
import type { Subspecialty } from '@/services';

export interface SubspecialtyBreakdownRow {
  id: string;
  name: string;
  total: number;
  concordant: number;
  rate: number;
}

/** Real per-subspecialty coverage from a set of frozen-section
 *  reconciliation records — how many cases, in which subspecialty, and
 *  the concordance rate within each. Records with no subspecialtyId set
 *  group under "Unspecified" rather than being silently dropped. Sorted
 *  lowest-concordance-first (unchanged from the original inline logic) —
 *  that's the real learning opportunity, surface it first. */
export function buildSubspecialtyBreakdown(
  records: QaActivityRecord[],
  subspecialties: Subspecialty[]
): SubspecialtyBreakdownRow[] {
  const bySubspecialty = new Map<string, { total: number; concordant: number }>();
  records.forEach(r => {
    const key = r.subspecialtyId ?? '__unspecified__';
    const bucket = bySubspecialty.get(key) ?? { total: 0, concordant: 0 };
    bucket.total += 1;
    if (r.outcome === 'concordant') bucket.concordant += 1;
    bySubspecialty.set(key, bucket);
  });
  const subspecialtyName = (id: string) =>
    id === '__unspecified__' ? 'Unspecified' : (subspecialties.find(s => s.id === id)?.name ?? id);
  return [...bySubspecialty.entries()]
    .map(([id, b]) => ({ id, name: subspecialtyName(id), total: b.total, concordant: b.concordant, rate: (b.concordant / b.total) * 100 }))
    .sort((a, b) => a.rate - b.rate);
}

export interface CaseMixCoverageRow extends SubspecialtyBreakdownRow {
  /** Present only when an admin actually configured a target for this
   *  subspecialty on the assignment's type — never invented. */
  target?: number;
  metTarget?: boolean;
}

/** Layers real ExpectedCaseMixTarget config onto real coverage rows.
 *  Three deliberate rules, all per direct confirmation of the
 *  "real coverage only, no fabricated target" scope:
 *  1. No targets configured (undefined/empty) → returns `breakdown`
 *     completely unchanged. This is the default, common case.
 *  2. A target subspecialty with ZERO real records still appears, at
 *     0 of N — the whole point is to surface a case type nobody has
 *     reviewed yet, not just annotate ones that already have some
 *     coverage.
 *  3. Sort puts unmet targets first (the actionable gap), then met
 *     targets, then anything with no target at all (falls back to the
 *     original lowest-concordance-first ordering) — so the one thing
 *     someone should act on is always what they see first. */
export function applyExpectedCaseMix(
  breakdown: SubspecialtyBreakdownRow[],
  targets: ExpectedCaseMixTarget[] | undefined,
  subspecialties: Subspecialty[]
): CaseMixCoverageRow[] {
  if (!targets || targets.length === 0) return breakdown;

  const rows: CaseMixCoverageRow[] = breakdown.map(b => {
    const t = targets.find(tg => tg.subspecialtyId === b.id);
    return t ? { ...b, target: t.minCount, metTarget: b.total >= t.minCount } : b;
  });

  const covered = new Set(breakdown.map(b => b.id));
  targets.forEach(t => {
    if (!covered.has(t.subspecialtyId)) {
      const name = subspecialties.find(s => s.id === t.subspecialtyId)?.name ?? t.subspecialtyId;
      rows.push({ id: t.subspecialtyId, name, total: 0, concordant: 0, rate: 0, target: t.minCount, metTarget: false });
    }
  });

  return rows.sort((a, b) => {
    const aGap = a.target !== undefined && !a.metTarget;
    const bGap = b.target !== undefined && !b.metTarget;
    if (aGap !== bGap) return aGap ? -1 : 1;
    if (a.target !== undefined && b.target !== undefined) return (a.total - a.target) - (b.total - b.target);
    if (a.target !== undefined) return -1;
    if (b.target !== undefined) return 1;
    return a.rate - b.rate;
  });
}

/** One flat, denormalized row per subspecialty — shape and column names
 *  per direct spec, for downstream use in Excel or a BI tool. `null`
 *  (not 0, not a placeholder string) wherever there's genuinely nothing
 *  real to report: no target configured, so no variance or compliance
 *  verdict to give. */
export interface CaseMixExportRow {
  Resident_ID: string;
  Category_Code: string;
  Category_Description: string;
  Logged_Count: number;
  Enterprise_Target_Goal: number | null;
  Variance: number | null;
  Concordance_Status: 'Verified' | 'Discrepant' | 'Unchecked';
  Compliance_Status: 'Met' | 'Deficit' | null;
}

/** Same 90%-concordant threshold already used to color every
 *  subspecialty-breakdown row across TeachingCasesTile and MentorTab
 *  (`ps-contrib-teaching-row-rate--low`/`--ok`) — reused here rather
 *  than picking a second, different cutoff for the same real signal. */
const CONCORDANCE_THRESHOLD_PCT = 90;

export function buildCaseMixExportRows(residentId: string, breakdown: CaseMixCoverageRow[]): CaseMixExportRow[] {
  return breakdown.map(b => ({
    Resident_ID: residentId,
    Category_Code: b.id,
    Category_Description: b.name,
    Logged_Count: b.total,
    Enterprise_Target_Goal: b.target ?? null,
    Variance: b.target !== undefined ? b.total - b.target : null,
    Concordance_Status: b.total === 0 ? 'Unchecked' : b.rate >= CONCORDANCE_THRESHOLD_PCT ? 'Verified' : 'Discrepant',
    Compliance_Status: b.target !== undefined ? (b.metTarget ? 'Met' : 'Deficit') : null,
  }));
}

export interface SupervisionProgress {
  label: string;
  /** 0-100, clamped. Never exceeds 100 even once a threshold is passed —
   *  a completed/near-complete assignment reads as "done," not overflow. */
  pct: number;
}

/** Real progress toward an active QaSupervisionAssignment's own end
 *  condition — case count, duration, or whichever of the two (under
 *  'either') is actually closer to being met. Deliberately reads
 *  `casesReviewedCount` straight off the assignment record rather than
 *  recomputing it from case data — that field is the real, already-
 *  maintained source of truth (`recordCaseReviewed()`), not something to
 *  re-derive and risk disagreeing with. */
export function describeSupervisionProgress(assignment: QaSupervisionAssignment, now: Date = new Date()): SupervisionProgress {
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(assignment.startedAt).getTime()) / 86400000));
  const cond = assignment.endCondition;

  if (cond.type === 'case_count') {
    return {
      label: `${assignment.casesReviewedCount} of ${cond.threshold} cases reviewed`,
      pct: Math.min(100, (assignment.casesReviewedCount / cond.threshold) * 100),
    };
  }
  if (cond.type === 'duration_days') {
    return {
      label: `${daysElapsed} of ${cond.threshold} days elapsed`,
      pct: Math.min(100, (daysElapsed / cond.threshold) * 100),
    };
  }
  // 'either' — report whichever condition is actually closer to being
  // met, since that's the one that will end the assignment first.
  const casePct = (assignment.casesReviewedCount / cond.caseCountThreshold) * 100;
  const dayPct = (daysElapsed / cond.durationDaysThreshold) * 100;
  return casePct >= dayPct
    ? { label: `${assignment.casesReviewedCount} of ${cond.caseCountThreshold} cases reviewed`, pct: Math.min(100, casePct) }
    : { label: `${daysElapsed} of ${cond.durationDaysThreshold} days elapsed`, pct: Math.min(100, dayPct) };
}

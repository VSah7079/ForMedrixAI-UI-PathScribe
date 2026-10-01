// src/services/cytologyQc/resolveCytologyQcComplianceReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §4's own Regulatory Audit Logs requirement —
// "real-time compliance reports tracking overall rescreening
// percentages, provider-specific QC rates, and inter-observer
// variability metrics to satisfy ISO 15189, CAP, and CLIA audit
// requirements." Pure aggregation over a real set of
// CytologyQcCaseAssignment records — genuinely different granularity
// from services/cytology/resolveCytologyQcConcordance.ts (which
// compares one primary screen against its own single QC re-screen);
// this function reports across many real assignments at once, the
// real lab-wide/provider-wide picture an auditor actually needs.
//
// Real, deliberate: "provider-specific QC rates" here means each real
// reviewer's own discrepancy rate on cases they reviewed — a
// provider's OWN cases being sent to QC (as the primary sign-out
// provider) is a genuinely different, separate real metric
// (primarySignOutProviderId), not conflated with their own reviewing
// track record here.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcCaseAssignment, QcPeerReviewPriorityTier, QcTriggerSource } from '@/types/cytologyQc/CytologyQcRule';

export interface CytologyQcProviderReviewStats {
  reviewerId: string;
  casesReviewed: number;
  concordanceCount: number;
  discrepancyCount: number;
  majorDiscrepancyCount: number;
  minorDiscrepancyCount: number;
  discrepancyRatePercent: number;
}

export interface CytologyQcComplianceReport {
  totalAssignments: number;
  byPriorityTier: Record<QcPeerReviewPriorityTier, number>;
  byTriggerSource: Record<QcTriggerSource, number>;
  totalResolved: number;
  totalConcordant: number;
  totalDiscrepancies: number;
  /** Real, per spec's own "inter-observer variability metrics" —
   *  genuinely undefined (never a fabricated 0%) when no real
   *  resolved cases exist yet to compute a rate from. */
  discrepancyRatePercent: number | undefined;
  majorDiscrepancyCount: number;
  minorDiscrepancyCount: number;
  totalSlaBreachEscalations: number;
  totalSupervisorBypasses: number;
  byReviewer: CytologyQcProviderReviewStats[];
}

function zeroTierRecord(): Record<QcPeerReviewPriorityTier, number> {
  return { high_escalation: 0, targeted_high_consequence: 0, routine_random: 0 };
}
function zeroTriggerRecord(): Record<QcTriggerSource, number> {
  return { rule_match: 0, ct_escalation: 0, rose_discrepancy: 0 };
}

export function resolveCytologyQcComplianceReport(assignments: CytologyQcCaseAssignment[]): CytologyQcComplianceReport {
  const byPriorityTier = zeroTierRecord();
  const byTriggerSource = zeroTriggerRecord();
  const reviewerStatsById = new Map<string, CytologyQcProviderReviewStats>();

  let totalResolved = 0;
  let totalConcordant = 0;
  let totalDiscrepancies = 0;
  let majorDiscrepancyCount = 0;
  let minorDiscrepancyCount = 0;
  let totalSlaBreachEscalations = 0;
  let totalSupervisorBypasses = 0;

  for (const assignment of assignments) {
    byPriorityTier[assignment.priorityTier]++;
    byTriggerSource[assignment.triggerSource]++;
    totalSlaBreachEscalations += assignment.slaEscalationCount;
    if (assignment.supervisorBypass) totalSupervisorBypasses++;

    const isResolved = assignment.state === 'FINAL_APPROVED' || assignment.state === 'QC_DISCREPANCY_REVISE';
    if (!isResolved || !assignment.assignedReviewerId) continue;

    totalResolved++;
    const isDiscrepancy = assignment.state === 'QC_DISCREPANCY_REVISE';
    if (isDiscrepancy) {
      totalDiscrepancies++;
      if (assignment.discrepancy?.severity === 'major') majorDiscrepancyCount++;
      if (assignment.discrepancy?.severity === 'minor') minorDiscrepancyCount++;
    } else {
      totalConcordant++;
    }

    const reviewerId = assignment.assignedReviewerId;
    const stats = reviewerStatsById.get(reviewerId) ?? {
      reviewerId, casesReviewed: 0, concordanceCount: 0, discrepancyCount: 0,
      majorDiscrepancyCount: 0, minorDiscrepancyCount: 0, discrepancyRatePercent: 0,
    };
    stats.casesReviewed++;
    if (isDiscrepancy) {
      stats.discrepancyCount++;
      if (assignment.discrepancy?.severity === 'major') stats.majorDiscrepancyCount++;
      if (assignment.discrepancy?.severity === 'minor') stats.minorDiscrepancyCount++;
    } else {
      stats.concordanceCount++;
    }
    reviewerStatsById.set(reviewerId, stats);
  }

  const byReviewer = [...reviewerStatsById.values()].map(stats => ({
    ...stats,
    discrepancyRatePercent: stats.casesReviewed > 0 ? (stats.discrepancyCount / stats.casesReviewed) * 100 : 0,
  }));

  return {
    totalAssignments: assignments.length,
    byPriorityTier,
    byTriggerSource,
    totalResolved,
    totalConcordant,
    totalDiscrepancies,
    discrepancyRatePercent: totalResolved > 0 ? (totalDiscrepancies / totalResolved) * 100 : undefined,
    majorDiscrepancyCount,
    minorDiscrepancyCount,
    totalSlaBreachEscalations,
    totalSupervisorBypasses,
    byReviewer,
  };
}

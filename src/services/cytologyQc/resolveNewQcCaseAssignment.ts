// src/services/cytologyQc/resolveNewQcCaseAssignment.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §3's own PRIMARY_COMPLETE -> QC_EVALUATION -> QC_PENDING
// transition, and per direct resolution of the ROSE/FNA discrepancy
// question — two genuinely distinct real ways a new QC assignment
// record gets built, kept as two separate, real functions rather than
// one with a confusing "which kind is this" branch, since a
// rule-match assignment's own real SLA/tier come from the matched
// rule, while a ROSE discrepancy's are fixed, per direct guidance's
// own resolution ("high priority / urgent SLA tag").
//
// Pure — produces the initial record only; does not persist it. See
// mockCytologyQcCaseAssignmentService.ts for the real service that
// actually stores this.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcCaseAssignment, QcPeerReviewPriorityTier } from '@/types/cytologyQc/CytologyQcRule';
import type { QcEvaluationResult } from './resolveQcRuleEvaluation';

/** Real, per direct guidance's own resolution — a ROSE/FNA
 *  discrepancy is a fixed, always-on system behavior, not a
 *  configurable rule; it always lands in the real, highest urgency
 *  tier with a fixed, real 4-hour SLA (matching spec §2.3's own
 *  "4 hours for urgent/FNA" figure), never something an admin's own
 *  rule priority ordering could change or delay. */
const ROSE_DISCREPANCY_PRIORITY_TIER: QcPeerReviewPriorityTier = 'high_escalation';
const ROSE_DISCREPANCY_SLA_HOURS = 4;
const ROSE_DISCREPANCY_BADGE = 'ROSE Discrepancy';

function nowIso(): string { return new Date().toISOString(); }
function addHoursIso(hours: number): string { return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(); }

export function resolveNewQcCaseAssignmentFromRuleMatch(
  caseId: string,
  specimenId: string,
  primarySignOutProviderId: string,
  evaluation: Extract<QcEvaluationResult, { matched: true }>,
  isCtEscalation: boolean,
): Omit<CytologyQcCaseAssignment, 'id'> {
  return {
    caseId,
    specimenId,
    triggerSource: isCtEscalation ? 'ct_escalation' : 'rule_match',
    matchedRuleId: evaluation.ruleId,
    priorityTier: evaluation.priorityTier,
    badges: isCtEscalation ? ['CT Escalation'] : [],
    state: 'QC_PENDING',
    primarySignOutProviderId,
    slaDeadline: addHoursIso(evaluation.slaHours),
    slaEscalationCount: 0,
    createdAt: nowIso(),
  };
}

export function resolveNewQcCaseAssignmentFromRoseDiscrepancy(
  caseId: string,
  specimenId: string,
  primarySignOutProviderId: string,
): Omit<CytologyQcCaseAssignment, 'id'> {
  return {
    caseId,
    specimenId,
    triggerSource: 'rose_discrepancy',
    priorityTier: ROSE_DISCREPANCY_PRIORITY_TIER,
    badges: [ROSE_DISCREPANCY_BADGE],
    state: 'QC_PENDING',
    primarySignOutProviderId,
    slaDeadline: addHoursIso(ROSE_DISCREPANCY_SLA_HOURS),
    slaEscalationCount: 0,
    createdAt: nowIso(),
  };
}

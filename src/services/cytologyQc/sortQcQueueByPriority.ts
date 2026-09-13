// src/services/cytologyQc/sortQcQueueByPriority.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct resolution: "One Unified Peer Review Queue backed
// by dynamic rule prioritization... automatically sorted by an
// Urgency Matrix." Pure sort — real tier ordering first (Priority 1
// high_escalation, then targeted_high_consequence, then
// routine_random), then real SLA deadline ascending within a tier —
// the case closest to breaching its own real deadline surfaces first
// within its own tier, never sorted by creation time.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcCaseAssignment, QcPeerReviewPriorityTier } from '@/types/cytologyQc/CytologyQcRule';

const TIER_ORDER: Record<QcPeerReviewPriorityTier, number> = {
  high_escalation: 0,
  targeted_high_consequence: 1,
  routine_random: 2,
};

export function sortQcQueueByPriority(assignments: CytologyQcCaseAssignment[]): CytologyQcCaseAssignment[] {
  return [...assignments].sort((a, b) => {
    const tierDiff = TIER_ORDER[a.priorityTier] - TIER_ORDER[b.priorityTier];
    if (tierDiff !== 0) return tierDiff;
    return new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime();
  });
}

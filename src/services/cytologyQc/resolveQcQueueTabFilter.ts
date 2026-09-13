// src/services/cytologyQc/resolveQcQueueTabFilter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct resolution: "give the pathologist quick top-level
// tabs and visual badge pills to slice their view instantly... While
// the queue backend is unified." This is the real, pure filter behind
// those tabs — the queue itself (sortQcQueueByPriority.ts) never
// changes; only which subset of it a given tab shows. Per direct
// guidance ("no business logic in the UI"), this stays out of the
// queue component entirely.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcCaseAssignment } from '@/types/cytologyQc/CytologyQcRule';

export type QcQueueTab = 'all' | 'escalations_discrepancies' | 'routine_random';

export function resolveQcQueueTabFilter(assignments: CytologyQcCaseAssignment[], tab: QcQueueTab): CytologyQcCaseAssignment[] {
  switch (tab) {
    case 'all':
      return assignments;
    case 'escalations_discrepancies':
      // Real, per direct resolution's own real Priority 1/2 grouping
      // ("Escalations & Discrepancies (ROSE, High-Risk, Intra-
      // departmental Consults)") — both non-routine tiers together.
      return assignments.filter(a => a.priorityTier === 'high_escalation' || a.priorityTier === 'targeted_high_consequence');
    case 'routine_random':
      return assignments.filter(a => a.priorityTier === 'routine_random');
  }
}

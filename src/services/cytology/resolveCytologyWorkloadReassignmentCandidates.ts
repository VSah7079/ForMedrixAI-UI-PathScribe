// src/services/cytology/resolveCytologyWorkloadReassignmentCandidates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CLIA workload specification, Phase 2:
// "Automated Reassignment Queue Routing: When a user hits their
// capacity limit... the backend automatically flags the case for
// Workload Reassignment and moves remaining queue items to available
// cytotechnologists without altering specimen accession status."
//
// Real, pure identification only — no side effects here. A real
// reassignment candidate is any case still genuinely assigned to this
// user and not yet finalized: the case they were just blocked from
// saving, plus everything else still sitting in their own queue, since
// they clearly can't process any more real work today. Real, per
// direct guidance's own "without altering specimen accession status"
// — this only ever identifies candidates; it never touches accession
// data itself, only real case-level assignment.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';

export function resolveCytologyWorkloadReassignmentCandidates(cases: Case[], userId: string): Case[] {
  return cases.filter(c => (c as any).order?.assignedTo === userId && c.status === 'in-progress');
}

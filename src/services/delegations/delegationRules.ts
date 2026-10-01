// src/services/delegations/delegationRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: the delegation decisions screens used to make themselves, as
// pure functions:
//   - which delegations are waiting on a user (Worklist's "Delegated to me");
//   - informal review requests as delegation-shaped records, so the quality
//     dashboard's consultation TAT counts them (QualityTab.tsx);
//   - what a Delegate dialog request turns into: a case delegation or a
//     synoptic assignment (DelegateModal.tsx).
// ─────────────────────────────────────────────────────────────────────────────
import type { InformalReviewRequest } from '@/types/reports/InformalReviewRequest';
import type { DelegationRecord, DelegationRequest } from './IDelegationService';

/** Delegations still pending that were sent to this user. */
export function pendingDelegationsTo(records: readonly DelegationRecord[], userId: string): DelegationRecord[] {
  return records.filter(d => d.toUserId === userId && d.status === 'pending');
}

/**
 * Informal review requests (services/reports/, the path that replaced
 * CASUAL_REVIEW delegations) as delegation records, so consultation
 * response and awaiting TAT keep counting them. A published or closed
 * review counts as completed when it was published.
 */
export function informalReviewsAsDelegations(reviews: readonly InformalReviewRequest[]): DelegationRecord[] {
  return reviews.map(r => ({
    id: r.id,
    caseId: r.caseId,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    delegationType: 'CASUAL_REVIEW',
    note: r.note,
    timestamp: r.requestedAt,
    status: r.status === 'published' || r.status === 'closed' ? 'completed' : 'pending',
    completedAt: r.publishedAt,
  }));
}

/** What a delegation request does. */
export type DelegationPlan =
  | {
      kind: 'assignSynoptic';
      caseId: string; instanceId: string;
      assignedTo: string; assignedToName: string; assignedBy: string;
      requiresCountersign: true; note?: string;
    }
  | {
      kind: 'delegateCase';
      payload: {
        caseId: string; requestorId: string; delegationType: string;
        targetUserId?: string; targetUserName?: string;
        targetPoolId?: string; targetPoolName?: string;
        note?: string;
      };
    };

/**
 * SYNOPTIC_ASSIGN with a chosen synoptic report hands that report to a
 * user, who finalises it for the attending to countersign. Anything else,
 * including SYNOPTIC_ASSIGN on a case with no synoptic to choose (as the
 * Delegate dialog always did), delegates the case to the user or pool.
 */
export function planDelegation(request: DelegationRequest): DelegationPlan {
  const note = request.note?.trim() ? request.note : undefined;
  const { recipient } = request;
  if (request.delegationType === 'SYNOPTIC_ASSIGN' && request.synopticInstanceId && recipient.kind === 'user') {
    return {
      kind: 'assignSynoptic',
      caseId: request.caseId, instanceId: request.synopticInstanceId,
      assignedTo: recipient.id, assignedToName: recipient.name ?? '', assignedBy: request.requestorId,
      requiresCountersign: true, note,
    };
  }
  return {
    kind: 'delegateCase',
    payload: {
      caseId: request.caseId, requestorId: request.requestorId, delegationType: request.delegationType,
      ...(recipient.kind === 'user'
        ? { targetUserId: recipient.id, targetUserName: recipient.name }
        : { targetPoolId: recipient.id, targetPoolName: recipient.name }),
      note,
    },
  };
}

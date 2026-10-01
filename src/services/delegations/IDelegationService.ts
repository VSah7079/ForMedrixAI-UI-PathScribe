// src/services/delegations/IDelegationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: case delegations (hand-offs, consults, reviews, pool sends,
// synoptic assignments) behind a service. Before this, the records and the
// functions that read and wrote them lived inside the demo case service
// (mockCaseService.ts: getDelegations, completeDelegation, delegateCase,
// assignSynoptic), and screens imported that file directly. The API server
// implements this contract; see docs/architecture/TAT_AND_DELEGATION_API.md.
//
// The delegation types themselves (labels, whether a type transfers
// ownership) are a separate dictionary: services/delegationTypes/.
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';

export type DelegationStatus = 'pending' | 'accepted' | 'passed' | 'completed';

export interface DelegationRecord {
  id: string;
  caseId: string;
  fromUserId: string;
  toUserId?: string;
  toPoolId?: string;
  toPoolName?: string;
  delegationType: string;
  note?: string;
  timestamp: string;
  status: DelegationStatus;
  /** Real fix: status alone was never actually transitioned anywhere in
   *  this codebase - every delegation ever created stayed 'pending'
   *  forever, which silently broke WorklistPage.tsx's existing
   *  "delegated to me" count (it could only ever grow, never shrink,
   *  even after someone genuinely responded). Also needed, separately,
   *  for real CONSULTATION_RESPONSE/CONSULTATION_AWAITING TAT
   *  calculation (components/Contribution/qualityCalculations.ts) -
   *  timestamp above is the request moment; this is the real completion
   *  moment, set once by delegationService.complete(). */
  completedAt?: string;
}

/** Who a case is being handed to. */
export type DelegationRecipient =
  | { kind: 'user'; id: string; name?: string }
  | { kind: 'pool'; id: string; name?: string };

/** What the Delegate dialog sends. */
export interface DelegationRequest {
  caseId: string;
  requestorId: string;
  /** A delegation type id (services/delegationTypes/), e.g. 'CASUAL_REVIEW', 'POOL', 'SYNOPTIC_ASSIGN'. */
  delegationType: string;
  recipient: DelegationRecipient;
  /** SYNOPTIC_ASSIGN: the synoptic report handed over (to a user). Without one, the case is delegated. */
  synopticInstanceId?: string;
  note?: string;
}

export type DelegationError =
  /** No delegation has this id. */
  | 'notFound'
  /** delegate(): the case, or the synoptic report being assigned, was not found. */
  | 'caseNotFound'
  /** delegate(): the signed-in user lacks case:delegation:create (Batch 381). */
  | 'notPermitted';

export interface IDelegationService {
  /** Every delegation record, or one case's. Newest last, as recorded. */
  list(filter?: { caseId?: string }): Promise<ServiceResult<DelegationRecord[]>>;
  /**
   * Hands a case (or one synoptic report) to a user or pool, updating the
   * case as the delegation type requires, and records the delegation.
   */
  delegate(request: DelegationRequest): Promise<ServiceResult<DelegationRecord>>;
  /** Marks a delegation completed, once, with the time. Completing it again is a no-op success. */
  complete(id: string): Promise<ServiceResult<DelegationRecord>>;
}

// src/types/access/AccessRequest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Do we Track the request to gain
// access? I would think that would be a good quality metric. How long
// did the Admins take, Do we generate a ticket system that has its own
// status." Confirmed directly before building this: the existing
// "request access" flow (sendAccessRequestToAdmins, src/utils/
// accessRequests.ts) only ever sent a message — no real, tracked
// record existed anywhere. The pool flow's own "already requested"
// check was a bare, per-browser localStorage boolean keyed by pool
// name, not a real, status-bearing ticket.
//
// Covers both real request types that already share the same
// underlying message-send helper: pediatric access (a case-level,
// per-client authorization), pool access (subspecialty/workgroup
// membership), and orchestration access (the user-level
// canViewOrchestration flag) — found while wiring pediatric and pool
// in; leaving it untracked would have meant two of three request
// types got a real ticket and the third stayed an invisible message,
// a confusing, inconsistent half-system.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessRequestType = 'pediatric' | 'pool' | 'orchestration';
export type AccessRequestStatus = 'pending' | 'granted' | 'denied';

export interface AccessRequest {
  id: string;
  type: AccessRequestType;
  requestingUserId: string;
  requestingUserName: string;
  organisationId?: string;
  /** The real case that prompted this request — context for the admin,
   *  not itself part of the grant condition. */
  caseId?: string;

  /** Pediatric only — the request is genuinely resolved only once BOTH
   *  the user-level canViewPediatric flag AND this client's own
   *  authorizedPediatricPathologistIds list include the requester (the
   *  same real, two-part condition the request message itself already
   *  explains to the admin). */
  clientId?: string;
  clientName?: string;

  /** Pool only — the real Subspecialty this request is asking to join. */
  poolId?: string;
  poolName?: string;

  requestedAt: string;
  status: AccessRequestStatus;
  resolvedAt?: string;
  resolvedByUserId?: string;
  resolvedByUserName?: string;
}

export type NewAccessRequest = Pick<
  AccessRequest,
  'type' | 'requestingUserId' | 'requestingUserName' | 'organisationId' | 'caseId'
  | 'clientId' | 'clientName' | 'poolId' | 'poolName'
>;

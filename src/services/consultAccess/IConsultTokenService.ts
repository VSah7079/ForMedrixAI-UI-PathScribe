// src/services/consultAccess/IConsultTokenService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-290 — External Consult / Second-Opinion Access.
//
// IMPORTANT CAVEAT — read before treating this as real security. Same
// caveat services/auth/caseAccessControl.ts's own header carries, for the
// same underlying reason, but sharper here:
//
// This follows this app's own established mock-first pattern (interface/
// mock/real triplet — see services/README.md), but this particular mock is
// categorically different from most of the others in this app: it models
// a security BOUNDARY (who can read a case's PHI from OUTSIDE PathScribe's
// own authenticated session), not just a data shape waiting on a real
// backend.
//
// `token` below is an opaque, client-generated random string. There is NO
// real cryptographic signing and NO server-side validation — nothing stops
// anyone who obtains this string (a forwarded email, a browser-history
// entry, a shared screenshot) from resolving it and reading the scoped
// case data, for as long as `expiresAt`/`isActive` says it's valid. PS-290's
// own investigation is explicit and was independently re-verified before
// building this: real token issuance/validation needs a real, PathScribe-
// operated backend — PS-291's own Interface Engine direction is the named,
// natural home for it, and that does not exist yet.
//
// DO NOT hand a link built from this service to a real external party
// outside a trusted demo/pilot environment. What's built here models the
// correct SHAPE (scoped, time-limited, revocable, audited) so a real
// backend implementation has an already-reasoned spec to match — exactly
// the relationship caseAccessControl.ts's own header describes for its own,
// internal-user access model.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';

export interface ConsultTokenScope {
  caseId: string;
  /** Cached, PHI-free display value — real, existing AccessionMetadata.
   *  accessionNumber. Carried here (not re-looked-up) so the issued-links
   *  list and the audit trail can both show/log a real accession without
   *  either component needing its own case fetch just to render a label. */
  caseAccessionNumber: string;
  /** Optional fine-grained narrowing — undefined/empty means full-case
   *  access, per the spec's own "defaulting to full case context." Real
   *  StainOrder.id values (a "slide" in this app's own data model), not a
   *  separate identifier space. */
  slideIds?: string[];
}

export type ConsultTokenStatus = 'Active' | 'Expired' | 'Revoked';

export interface ConsultToken {
  id: ID;
  /** The opaque bearer string itself — see this file's own header
   *  caveat. Never a real JWT. */
  token: string;
  scope: ConsultTokenScope;
  issuedByUserId: string;
  issuedByName: string;
  issuedAt: string;
  expiresAt: string;
  isActive: boolean;
  revokedAt?: string;
  revokedByUserId?: string;
  /** Free text — who this was issued to. There is no real external-
   *  identity model anywhere in this codebase to attach it to instead
   *  (confirmed by direct search before building this). */
  consultantIdentifier: string;
  consultantOrganization?: string;
  note?: string;
  lastAccessedAt?: string;
  accessCount: number;
}

export type NewConsultToken = Pick<
  ConsultToken,
  'scope' | 'issuedByUserId' | 'issuedByName' | 'consultantIdentifier' | 'consultantOrganization' | 'note'
> & {
  /** Caller-supplied override of the default 24h/72h-weekend lifespan —
   *  see computeDefaultConsultTokenExpiry.ts. Optional; issue() applies
   *  the real default when omitted. */
  expiresAt?: string;
};

/** Phase 1 (Hybrid) payload — free-text opinion + structured metadata,
 *  per spec §3. Phase 2 (mapping a diagnosticCategory selection directly
 *  into the real concordance engine, recordAiHumanConcordance.ts's own
 *  shape) is a deliberate, disclosed scope cut for this pass — see this
 *  domain's own README. */
export type ConsultOpinionSignedStatus = 'Draft' | 'Signed';

export interface ConsultOpinion {
  id: ID;
  tokenId: ID;
  caseId: string;
  consultantIdentifier: string;
  diagnosticCategory?: string;
  signedStatus: ConsultOpinionSignedStatus;
  opinionText: string;
  submittedAt: string;
}

export type NewConsultOpinion = Omit<ConsultOpinion, 'id' | 'submittedAt'>;

export interface IConsultTokenService {
  issue(draft: NewConsultToken): Promise<ServiceResult<ConsultToken>>;
  getByCaseId(caseId: string): Promise<ServiceResult<ConsultToken[]>>;
  /** Resolves a bearer token string to its record, WITHOUT any internal
   *  session/case-access check — the token itself is the entire
   *  authorization for this read. Returns ok:false with one, deliberately
   *  uniform message whether the token is unknown, expired, or revoked
   *  (OWASP-aligned "don't confirm which" posture — same choice
   *  caseAccessControl.ts's own header documents) — but the underlying
   *  audit entry still distinguishes the real reason, same as that file's
   *  own established discipline. */
  resolve(token: string): Promise<ServiceResult<ConsultToken>>;
  revoke(id: ID, revokedByUserId: string): Promise<ServiceResult<ConsultToken>>;
  /** Records a real, successful external view — separate from resolve()
   *  so a validity check alone never inflates the access count/audit
   *  trail; callers invoke this once, after a resolved token has actually
   *  been shown to the consultant. */
  recordAccess(id: ID): Promise<ServiceResult<ConsultToken>>;
  submitOpinion(draft: NewConsultOpinion): Promise<ServiceResult<ConsultOpinion>>;
  getOpinionsByCaseId(caseId: string): Promise<ServiceResult<ConsultOpinion[]>>;
}

export function resolveConsultTokenStatus(t: Pick<ConsultToken, 'isActive' | 'expiresAt'>): ConsultTokenStatus {
  if (!t.isActive) return 'Revoked';
  if (new Date(t.expiresAt).getTime() <= Date.now()) return 'Expired';
  return 'Active';
}

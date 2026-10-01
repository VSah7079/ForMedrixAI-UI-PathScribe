// src/services/clinical/ICriticalAlertReferenceTokenService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — the real, opaque reference token behind the SMS/secure-email
// "tap to view" deep link, per direct guidance's own engineering brief:
// neither channel's message body may carry PHI or clinical detail
// (real SMS carriers generally won't sign a HIPAA BAA; a standard
// transactional email relay may not either), so both send only a
// generic, non-PHI template plus this token's own reference link —
// resolving it is what a real backend/interface-engine would do to
// route the physician to the actual finding, once real infrastructure
// exists.
//
// IMPORTANT CAVEAT — read before treating this as real security. Same
// caveat services/consultAccess/IConsultTokenService.ts's own header
// carries, for the identical underlying reason (this app has no real
// physician-facing login/session/MFA/SSO of any kind, confirmed by
// direct search before building this):
//
// `token` below is an opaque, client-generated random string. There is
// NO real cryptographic signing, NO real SSO/MFA, and NO server-side
// validation — nothing stops anyone who obtains this string from
// resolving it, for as long as `expiresAt` says it's valid. Per direct
// guidance's own engineering brief, the real, intended production
// architecture routes this handoff through the RECEIVING physician's
// own EHR (SMART on FHIR launch / that health system's own real SSO),
// with PathScribe's backend only ever exchanging the opaque token for
// an accession/MRN reference over a real, authenticated TLS call —
// never itself hosting a page that displays the clinical finding to an
// unauthenticated bearer. This service models that narrow, real,
// buildable piece — issuing and resolving the opaque reference — and
// deliberately nothing more: CriticalAlertReferencePage.tsx (the one
// real page that resolves this token) never renders findingTerm/
// findingSeverity/sourceQuote, precisely because no real authentication
// gate exists here to justify showing them. See that page's own header
// for the full reasoning, and PS-290's own App.tsx route comment
// ("do not treat this route as a precedent for any other
// unauthenticated PHI-bearing page without the same explicit caveat")
// — this file's own design is the direct answer to that warning, not
// a violation of it.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { AbnormalSeverity } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';

export type CriticalAlertReferenceTokenStatus = 'Active' | 'Expired';

export interface CriticalAlertReferenceToken {
  id: ID;
  /** The opaque bearer string itself — see this file's own header
   *  caveat. Never a real JWT, never cryptographically signed. */
  token: string;
  /** Links back to the real dispatch attempt this token was issued
   *  for — services/clinical/mockCriticalAlertDispatchService.ts's own
   *  CriticalAlertDispatchRecord.id. */
  dispatchRecordId: string;
  caseId: string;
  /** Cached, PHI-free display value — same real reasoning as
   *  ConsultTokenScope.caseAccessionNumber (IConsultTokenService.ts):
   *  carried here so the resolved reference page and the internal
   *  audit trail can both show a real accession without either one
   *  needing its own case fetch just to render a label. This is the
   *  ONLY case-identifying value the public reference page ever
   *  displays — see this file's own header. */
  accessionNumber: string;
  physicianId: string;
  physicianName: string;
  /** Real clinical detail, carried for the INTERNAL audit trail only
   *  (CriticalAlertAuditSection.tsx, behind this app's own normal,
   *  authenticated session) — never rendered by the public,
   *  token-gated reference page. See this file's own header. */
  findingTerm: string;
  findingSeverity: AbnormalSeverity;
  issuedAt: string;
  expiresAt: string;
  lastAccessedAt?: string;
  accessCount: number;
  /** Real, per direct guidance's own "Complete Audit Trail... when
   *  they acknowledged/read the critical result" ask — set once the
   *  physician actively confirms review on the resolved reference
   *  page, distinct from a mere resolve/view (lastAccessedAt), the
   *  same "viewed vs. actually acted on" distinction
   *  AbnormalDetectionSignal.outcome already draws for the discrete/
   *  narrative detection paths. */
  acknowledgedAt?: string;
}

export type NewCriticalAlertReferenceToken = Pick<
  CriticalAlertReferenceToken,
  'dispatchRecordId' | 'caseId' | 'accessionNumber' | 'physicianId' | 'physicianName' | 'findingTerm' | 'findingSeverity'
>;

export interface ICriticalAlertReferenceTokenService {
  issue(draft: NewCriticalAlertReferenceToken): Promise<ServiceResult<CriticalAlertReferenceToken>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CriticalAlertReferenceToken[]>>;
  /** Real, per direct guidance's own "Complete Audit Trail" ask
   *  (PS-136) — the full, cross-case token history for the internal
   *  Critical Alerts audit viewer (CriticalAlertAuditSection.tsx), so
   *  each dispatch record can be joined with its own reference link's
   *  real access/acknowledgement status. Same small-dataset,
   *  local-storage-scoped posture as ICriticalAlertDispatchService.ts's
   *  own getAll(). */
  getAll(): Promise<ServiceResult<CriticalAlertReferenceToken[]>>;
  /** Resolves a bearer token string to its record, WITHOUT any internal
   *  session/case-access check — the token itself is the entire
   *  authorization for this resolution (never for viewing clinical
   *  detail — see this file's own header). Returns ok:false with one,
   *  deliberately uniform message whether the token is unknown or
   *  expired (same OWASP-aligned "don't confirm which" posture as
   *  IConsultTokenService.ts's own resolve()). */
  resolve(token: string): Promise<ServiceResult<CriticalAlertReferenceToken>>;
  /** Records a real, successful resolution — separate from resolve()
   *  so a validity check alone never inflates the access count/audit
   *  trail; the reference page calls this once, after a resolved
   *  token has actually been shown. */
  recordAccess(id: ID): Promise<ServiceResult<CriticalAlertReferenceToken>>;
  /** Records the physician's own active "reviewed" confirmation — see
   *  acknowledgedAt's own doc comment. */
  recordAcknowledged(id: ID): Promise<ServiceResult<CriticalAlertReferenceToken>>;
}

export function resolveCriticalAlertReferenceTokenStatus(
  t: Pick<CriticalAlertReferenceToken, 'expiresAt'>,
): CriticalAlertReferenceTokenStatus {
  return new Date(t.expiresAt).getTime() <= Date.now() ? 'Expired' : 'Active';
}

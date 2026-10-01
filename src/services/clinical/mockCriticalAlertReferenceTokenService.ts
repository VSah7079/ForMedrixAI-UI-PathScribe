// src/services/clinical/mockCriticalAlertReferenceTokenService.ts
// See ICriticalAlertReferenceTokenService.ts's own header for the full,
// load-bearing caveat: this is NOT real token security. Read that before
// wiring this into anything beyond a trusted demo/pilot environment.

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type {
  CriticalAlertReferenceToken, NewCriticalAlertReferenceToken, ICriticalAlertReferenceTokenService,
} from './ICriticalAlertReferenceTokenService';
import { resolveCriticalAlertReferenceTokenStatus } from './ICriticalAlertReferenceTokenService';
import { computeCriticalAlertReferenceTokenExpiry } from './computeCriticalAlertReferenceTokenExpiry';
import { mockAuditService } from '../auditlog/mockAuditService';

const TOKENS_KEY = 'critical_alert_reference_tokens_v1';

const loadTokens    = (): CriticalAlertReferenceToken[]   => storageGet<CriticalAlertReferenceToken[]>(TOKENS_KEY, []);
const persistTokens = (data: CriticalAlertReferenceToken[]) => storageSet(TOKENS_KEY, data);

/** Real, deliberately non-cryptographic opaque bearer string — see this
 *  file's own header caveat and ICriticalAlertReferenceTokenService.ts's.
 *  Same shape/discipline as consultAccess/mockConsultTokenService.ts's
 *  own generateOpaqueToken(), a distinct prefix so the two token families
 *  are never visually ambiguous in logs/URLs. */
function generateOpaqueToken(): string {
  return 'cat_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Same "single enforcement point" discipline mockConsultTokenService.ts's
// own logConsultAuditEvent documents — `detail` is always PHI-safe: no
// patient name/DOB/MRN, only the case's accessionNumber and the
// physician's own name, never a finding's clinical content (the resolve
// path especially never logs findingTerm/findingSeverity in the audit
// `detail` string, even though the record itself carries them for the
// internal viewer — see this service's own resolve()).
function logReferenceTokenAuditEvent(event: string, detail: string, userLabel: string, accessionNumber: string | null) {
  mockAuditService.logEvent({
    type: 'user',
    event,
    detail,
    user: userLabel,
    caseId: accessionNumber,
    confidence: null,
  }).catch(() => {});
}

export const mockCriticalAlertReferenceTokenService: ICriticalAlertReferenceTokenService = {
  async issue(draft: NewCriticalAlertReferenceToken): Promise<ServiceResult<CriticalAlertReferenceToken>> {
    if (!draft.caseId) return { ok: false, error: 'A case is required to issue a critical-alert reference token.' };
    if (!draft.dispatchRecordId) return { ok: false, error: 'A dispatch record is required to issue a critical-alert reference token.' };

    const now = new Date();
    const newToken: CriticalAlertReferenceToken = {
      id: 'crit-alert-ref-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      token: generateOpaqueToken(),
      dispatchRecordId: draft.dispatchRecordId,
      caseId: draft.caseId,
      accessionNumber: draft.accessionNumber,
      physicianId: draft.physicianId,
      physicianName: draft.physicianName,
      findingTerm: draft.findingTerm,
      findingSeverity: draft.findingSeverity,
      issuedAt: now.toISOString(),
      expiresAt: computeCriticalAlertReferenceTokenExpiry(now).toISOString(),
      accessCount: 0,
    };

    const data = loadTokens();
    data.push(newToken);
    persistTokens(data);

    logReferenceTokenAuditEvent(
      'critical_alert.reference_token.issued',
      `Critical-alert reference link issued for physician="${newToken.physicianName}", expires ${newToken.expiresAt}.`,
      'System (automated critical-alert dispatch)',
      newToken.accessionNumber,
    );

    return { ok: true, data: newToken };
  },

  async getByCaseId(caseId: string): Promise<ServiceResult<CriticalAlertReferenceToken[]>> {
    return { ok: true, data: loadTokens().filter(t => t.caseId === caseId) };
  },

  async getAll(): Promise<ServiceResult<CriticalAlertReferenceToken[]>> {
    return { ok: true, data: loadTokens() };
  },

  async resolve(token: string): Promise<ServiceResult<CriticalAlertReferenceToken>> {
    const found = loadTokens().find(t => t.token === token);
    // Deliberately uniform caller-facing message whether the token is
    // unknown or expired — same OWASP-aligned "don't confirm which"
    // posture as consultAccess/mockConsultTokenService.ts's own resolve().
    const DENIED_MESSAGE = 'This link is invalid or no longer active.';

    if (!found) {
      logReferenceTokenAuditEvent('critical_alert.reference_token.access_denied', 'Access attempt with an unrecognized critical-alert reference token.', 'Unknown', null);
      return { ok: false, error: DENIED_MESSAGE };
    }

    if (resolveCriticalAlertReferenceTokenStatus(found) === 'Expired') {
      logReferenceTokenAuditEvent('critical_alert.reference_token.access_attempt_expired', `Access attempt on an expired critical-alert reference link (expired ${found.expiresAt}).`, found.physicianName, found.accessionNumber);
      return { ok: false, error: DENIED_MESSAGE };
    }

    return { ok: true, data: found };
  },

  async recordAccess(id: ID): Promise<ServiceResult<CriticalAlertReferenceToken>> {
    const data = loadTokens();
    const idx = data.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, error: `Critical-alert reference token ${id} not found` };

    const updated: CriticalAlertReferenceToken = { ...data[idx], accessCount: data[idx].accessCount + 1, lastAccessedAt: new Date().toISOString() };
    data[idx] = updated;
    persistTokens(data);

    logReferenceTokenAuditEvent('critical_alert.reference_token.accessed', `Critical-alert reference link viewed (view #${updated.accessCount}).`, updated.physicianName, updated.accessionNumber);
    return { ok: true, data: updated };
  },

  async recordAcknowledged(id: ID): Promise<ServiceResult<CriticalAlertReferenceToken>> {
    const data = loadTokens();
    const idx = data.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, error: `Critical-alert reference token ${id} not found` };
    if (data[idx].acknowledgedAt) return { ok: true, data: data[idx] };

    const updated: CriticalAlertReferenceToken = { ...data[idx], acknowledgedAt: new Date().toISOString() };
    data[idx] = updated;
    persistTokens(data);

    logReferenceTokenAuditEvent('critical_alert.reference_token.acknowledged', 'Physician confirmed review via the critical-alert reference link.', updated.physicianName, updated.accessionNumber);
    return { ok: true, data: updated };
  },
};

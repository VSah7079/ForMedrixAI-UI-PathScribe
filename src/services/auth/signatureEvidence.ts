// src/services/auth/signatureEvidence.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 345 (PS-60 follow-up): turning a signer confirmation into a
// signature that is checked when the signed record is saved, and stored
// with it.
//
// Batch 344 made the signing screens confirm who is signing. This is the
// other half, the check the API server will make (AUTHENTICATION_OIDC.md
// §5.4), done here at the save for now so the mock services behave the
// way the server will:
//
//   accept(confirmation, expected)  before the signed state change:
//     • the signer is the signed-in user, for this action and this case;
//     • the confirmation is recent (5 minutes) and hasn't backed another
//       signature (one confirmation, one signature);
//     • SSO: the proof is the provider's ID token for this app, for the
//       session's own account, authenticated after the confirmation was
//       requested; its hash hasn't been used before.
//     A screen that pauses the signing (a data gate, a reconciliation)
//     resumes with accept(undefined, …), which reuses the confirmation
//     already accepted for that case for up to 15 minutes.
//   commit(caseId, outcome, link)   once the signed state is saved:
//     writes the signature record (services/signatures/) and audits it.
//
// What the browser can't do: check the ID token's cryptographic signature.
// That is the server's job; evidence records say `verifiedBy: 'browser'`
// until the server takes over.
// ─────────────────────────────────────────────────────────────────────────────

import type { IAuditService } from '../auditlog/IAuditService';
import { findProvider, type AuthConfig } from './authConfig';
import { identityFromClaims } from './externalIdentity';
import type { SessionProfile } from './sessionProfile';
import type { SignatureConfirmation, SigningAction } from './signerConfirmation';
import { SIGNING_ACTION_AUDIT_TEXT } from './signerConfirmation';
import type { ISignatureRecordService, SignatureOutcome, SignatureRecord, SignatureRecordLink } from '../signatures/ISignatureRecordService';

/** What is stored with a signed record. Never the ID token itself. */
export interface SignatureEvidence {
  confirmationId: string;
  signerId: string;
  signerName: string;
  action: SigningAction;
  caseRef: string | null;
  method: SignatureConfirmation['method'];
  confirmedAt: string;
  verifiedAt: string;
  /** SSO: the account that confirmed, when, and a SHA-256 of the ID token. */
  sso: { issuer: string; subject: string; authTime: number | null; tokenSha256: string } | null;
  /** 'browser' until the API server verifies signatures itself. */
  verifiedBy: 'browser' | 'server';
}

export const SIGNATURE_REFUSALS = [
  'missing', 'no_session', 'wrong_signer', 'wrong_action', 'wrong_case', 'expired', 'replayed',
  'proof_missing', 'proof_invalid', 'different_account', 'not_fresh',
] as const;
export type SignatureRefusal = typeof SIGNATURE_REFUSALS[number];

export const SIGNATURE_MAX_AGE_SECONDS = 300;
/** How long a paused signing (a gate to resolve first) may resume with the same confirmation. */
export const SIGNATURE_RESUME_SECONDS = 900;
const SKEW_SECONDS = 60;

/** The claims in a JWT, without checking its signature (the server does that). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = decodeURIComponent(Array.from(atob(b64), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const claims = JSON.parse(json);
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

export interface VerifyExpected {
  profile: SessionProfile;
  actions: readonly SigningAction[];
  caseRef: string | null;
  config: AuthConfig;
  now: Date;
}

/**
 * Checks a confirmation (pure apart from the digest). The one-time-use
 * checks take the ids already used; the caller records the new ones.
 */
export async function verifySignatureConfirmation(
  c: SignatureConfirmation,
  expected: VerifyExpected,
  used: { confirmationIds: ReadonlySet<string>; tokenHashes: ReadonlySet<string> },
  sha256: (text: string) => Promise<string>,
): Promise<{ ok: true; evidence: SignatureEvidence } | { ok: false; reason: SignatureRefusal }> {
  const { profile } = expected;
  if (c.signerId !== profile.id) return { ok: false, reason: 'wrong_signer' };
  if (!expected.actions.includes(c.action)) return { ok: false, reason: 'wrong_action' };
  if (c.caseRef && expected.caseRef && c.caseRef !== expected.caseRef) return { ok: false, reason: 'wrong_case' };
  const nowS = Math.floor(expected.now.getTime() / 1000);
  const confirmedS = Math.floor(Date.parse(c.confirmedAt) / 1000);
  if (!Number.isFinite(confirmedS) || confirmedS > nowS + SKEW_SECONDS || nowS - confirmedS > SIGNATURE_MAX_AGE_SECONDS) return { ok: false, reason: 'expired' };
  if (used.confirmationIds.has(c.confirmationId)) return { ok: false, reason: 'replayed' };

  let sso: SignatureEvidence['sso'] = null;
  if (c.method === 'sso') {
    if (c.proof?.kind !== 'oidc-id-token' || !c.proof.idToken) return { ok: false, reason: 'proof_missing' };
    const claims = decodeJwtPayload(c.proof.idToken);
    const provider = findProvider(expected.config, profile.ssoProviderId);
    if (!claims || !provider || !profile.ssoIssuer || !profile.ssoSubject) return { ok: false, reason: 'proof_invalid' };
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const exp = typeof claims.exp === 'number' ? claims.exp : NaN;
    if (!aud.includes(provider.clientId) || !Number.isFinite(exp) || exp + SKEW_SECONDS < nowS) return { ok: false, reason: 'proof_invalid' };
    const identity = identityFromClaims(provider, claims);
    const trim = (s: string) => s.replace(/\/+$/, '');
    if (!identity || trim(identity.issuer) !== trim(profile.ssoIssuer) || identity.subject !== profile.ssoSubject) return { ok: false, reason: 'different_account' };
    const authTime = typeof claims.auth_time === 'number' ? claims.auth_time : null;
    const at = authTime ?? (typeof claims.iat === 'number' ? claims.iat : NaN);
    if (!Number.isFinite(at) || at < confirmedS - SIGNATURE_MAX_AGE_SECONDS || nowS - at > SIGNATURE_MAX_AGE_SECONDS) return { ok: false, reason: 'not_fresh' };
    const tokenSha256 = await sha256(c.proof.idToken);
    if (used.tokenHashes.has(tokenSha256)) return { ok: false, reason: 'replayed' };
    sso = { issuer: identity.issuer, subject: identity.subject, authTime, tokenSha256 };
  }

  return {
    ok: true,
    evidence: {
      confirmationId: c.confirmationId, signerId: c.signerId, signerName: c.signerName, action: c.action,
      caseRef: c.caseRef, method: c.method, confirmedAt: c.confirmedAt, verifiedAt: expected.now.toISOString(),
      sso, verifiedBy: 'browser',
    },
  };
}

// ── The gate ───────────────────────────────────────────────────────────────

export interface SignatureGateDeps {
  config: AuthConfig;
  readProfile: () => SessionProfile | null;
  recordService: Pick<ISignatureRecordService, 'record'>;
  auditService: Pick<IAuditService, 'logEvent'>;
  usedStore: { read(): { confirmationIds: string[]; tokenHashes: string[] }; add(confirmationId: string, tokenHash: string | null): void };
  sha256?: (text: string) => Promise<string>;
  now?: () => Date;
}

export type AcceptResult = { ok: true; evidence: SignatureEvidence } | { ok: false; reason: SignatureRefusal };

async function webSha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function createSignatureGate(deps: SignatureGateDeps) {
  const now = deps.now ?? (() => new Date());
  const sha256 = deps.sha256 ?? webSha256;
  /** The accepted confirmation per case, waiting for the signed state to be saved. */
  const pending = new Map<string, SignatureEvidence>();

  const audit = (profile: Pick<SessionProfile, 'name'>, event: string, detail: string, caseRef: string | null) => {
    void deps.auditService.logEvent({ type: 'user', event, detail, user: profile.name, caseId: caseRef, confidence: null }).catch(() => {});
  };

  return {
    /**
     * Before a signed state change. With a confirmation: verifies it and
     * holds it for this case. Without one (resuming after a gate): the
     * confirmation already held for this case, if it still fits.
     */
    async accept(
      confirmation: SignatureConfirmation | null | undefined,
      expected: { caseId: string; caseRef: string | null; actions: readonly SigningAction[] },
    ): Promise<AcceptResult> {
      const profile = deps.readProfile();
      if (!profile) return { ok: false, reason: 'no_session' };
      const at = now();

      if (!confirmation) {
        const held = pending.get(expected.caseId);
        const fits = held && held.signerId === profile.id && expected.actions.includes(held.action)
          && at.getTime() - Date.parse(held.verifiedAt) <= SIGNATURE_RESUME_SECONDS * 1000;
        return fits ? { ok: true, evidence: held! } : { ok: false, reason: 'missing' };
      }

      const usedNow = deps.usedStore.read();
      const r = await verifySignatureConfirmation(
        confirmation,
        { profile, actions: expected.actions, caseRef: expected.caseRef, config: deps.config, now: at },
        { confirmationIds: new Set(usedNow.confirmationIds), tokenHashes: new Set(usedNow.tokenHashes) },
        sha256,
      );
      if (r.ok === false) {
        audit(profile, 'Signature refused', `Signature for ${SIGNING_ACTION_AUDIT_TEXT[confirmation.action] ?? confirmation.action} refused when saving (${r.reason}).`, expected.caseRef);
        return r;
      }
      deps.usedStore.add(r.evidence.confirmationId, r.evidence.sso?.tokenSha256 ?? null);
      pending.set(expected.caseId, r.evidence);
      return r;
    },

    /** Once the signed state is saved: stores the signature record. Null if nothing was accepted. */
    async commit(caseId: string, outcome: SignatureOutcome, link?: SignatureRecordLink): Promise<SignatureRecord | null> {
      const evidence = pending.get(caseId);
      if (!evidence) return null;
      pending.delete(caseId);
      const saved = await deps.recordService.record({ caseId, outcome, evidence, link: link ?? null });
      if (saved.ok === false) return null;
      audit({ name: evidence.signerName }, 'Signature recorded',
        `Signature recorded for ${SIGNING_ACTION_AUDIT_TEXT[evidence.action]} (${outcome}); confirmed by ${evidence.method}.`, evidence.caseRef);
      return saved.data;
    },

    /** The confirmation held for a case (for the record being saved to reference). */
    held(caseId: string): SignatureEvidence | null {
      return pending.get(caseId) ?? null;
    },

    /** Drops a held confirmation (the signing was abandoned). */
    release(caseId: string): void {
      pending.delete(caseId);
    },
  };
}

export type SignatureGate = ReturnType<typeof createSignatureGate>;

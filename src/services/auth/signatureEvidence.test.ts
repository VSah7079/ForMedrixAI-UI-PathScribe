// src/services/auth/signatureEvidence.test.ts — Batch 345 (PS-60 follow-up)
import { describe, it, expect } from 'vitest';
import type { NewAuditLog } from '../auditlog/IAuditService';
import { resolveAuthConfig } from './authConfig';
import type { SessionProfile } from './sessionProfile';
import type { SignatureConfirmation } from './signerConfirmation';
import type { SignatureRecord } from '../signatures/ISignatureRecordService';
import { createSignatureGate, decodeJwtPayload, verifySignatureConfirmation } from './signatureEvidence';

const ISS = 'https://login.microsoftonline.com/tenant-1/v2.0';
const config = resolveAuthConfig({ VITE_AUTH_MICROSOFT_AUTHORITY: ISS, VITE_AUTH_MICROSOFT_CLIENT_ID: 'spa' }, true);
const NOW = new Date('2026-09-26T12:00:00Z');
const NOW_S = NOW.getTime() / 1000;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`;
const goodClaims = { iss: ISS, aud: 'spa', sub: 'x', oid: 'oid-1', exp: NOW_S + 3600, iat: NOW_S - 20, auth_time: NOW_S - 20, name: 'Zoë Ångström' };

const sso: SessionProfile = { id: '1', name: 'Sarah Chen', email: 's@h.org', role: 'pathologist', initials: 'SC', voiceProfile: 'EN-US', authMethod: 'sso', ssoProviderId: 'microsoft', ssoIssuer: ISS, ssoSubject: 'oid-1' };
const pw: SessionProfile = { ...sso, id: 'PATH-001', authMethod: 'password', ssoProviderId: undefined, ssoIssuer: undefined, ssoSubject: undefined };

const confirmation = (over: Partial<SignatureConfirmation> = {}): SignatureConfirmation => ({
  confirmationId: 'c-1', signerId: '1', signerName: 'Sarah Chen', method: 'sso', action: 'case-sign-out',
  caseRef: 'S26-0001', confirmedAt: new Date(NOW.getTime() - 30_000).toISOString(),
  proof: { kind: 'oidc-id-token', idToken: jwt(goodClaims) }, ...over,
});
const expected = (profile = sso) => ({ profile, actions: ['case-sign-out', 'countersign'] as const, caseRef: 'S26-0001', config, now: NOW });
const none = { confirmationIds: new Set<string>(), tokenHashes: new Set<string>() };
const sha = async (s: string) => `h:${s.length}:${s.slice(-6)}`;

describe('decodeJwtPayload', () => {
  it('reads the claims (UTF-8 included) and refuses junk', () => {
    expect(decodeJwtPayload(jwt(goodClaims))).toMatchObject({ oid: 'oid-1', name: 'Zoë Ångström' });
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });
});

describe('verifySignatureConfirmation', () => {
  it('accepts a fresh SSO confirmation by the signed-in account; evidence keeps a hash, not the token', async () => {
    const r = await verifySignatureConfirmation(confirmation(), expected(), none, sha);
    expect(r).toMatchObject({ ok: true, evidence: { confirmationId: 'c-1', method: 'sso', verifiedBy: 'browser', sso: { issuer: ISS, subject: 'oid-1', authTime: NOW_S - 20 } } });
    if (r.ok === false) throw new Error('unreachable');
    expect(JSON.stringify(r.evidence)).not.toContain(confirmation().proof!.idToken);
  });

  it('refuses the wrong signer, action or case, and a stale or reused confirmation', async () => {
    expect(await verifySignatureConfirmation(confirmation({ signerId: '2' }), expected(), none, sha)).toEqual({ ok: false, reason: 'wrong_signer' });
    expect(await verifySignatureConfirmation(confirmation({ action: 'autopsy-fad' }), expected(), none, sha)).toEqual({ ok: false, reason: 'wrong_action' });
    expect(await verifySignatureConfirmation(confirmation({ caseRef: 'S26-9999' }), expected(), none, sha)).toEqual({ ok: false, reason: 'wrong_case' });
    expect(await verifySignatureConfirmation(confirmation({ confirmedAt: new Date(NOW.getTime() - 6 * 60_000).toISOString() }), expected(), none, sha)).toEqual({ ok: false, reason: 'expired' });
    expect(await verifySignatureConfirmation(confirmation(), expected(), { ...none, confirmationIds: new Set(['c-1']) }, sha)).toEqual({ ok: false, reason: 'replayed' });
    const hash = await sha(confirmation().proof!.idToken);
    expect(await verifySignatureConfirmation(confirmation({ confirmationId: 'c-2' }), expected(), { ...none, tokenHashes: new Set([hash]) }, sha)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('refuses a missing or bad proof, another account, or a login that was not fresh', async () => {
    expect(await verifySignatureConfirmation(confirmation({ proof: null }), expected(), none, sha)).toEqual({ ok: false, reason: 'proof_missing' });
    expect(await verifySignatureConfirmation(confirmation({ proof: { kind: 'oidc-id-token', idToken: 'junk' } }), expected(), none, sha)).toEqual({ ok: false, reason: 'proof_invalid' });
    expect(await verifySignatureConfirmation(confirmation({ proof: { kind: 'oidc-id-token', idToken: jwt({ ...goodClaims, aud: 'other' }) } }), expected(), none, sha)).toEqual({ ok: false, reason: 'proof_invalid' });
    expect(await verifySignatureConfirmation(confirmation({ proof: { kind: 'oidc-id-token', idToken: jwt({ ...goodClaims, oid: 'oid-2' }) } }), expected(), none, sha)).toEqual({ ok: false, reason: 'different_account' });
    expect(await verifySignatureConfirmation(confirmation({ proof: { kind: 'oidc-id-token', idToken: jwt({ ...goodClaims, auth_time: NOW_S - 3600 }) } }), expected(), none, sha)).toEqual({ ok: false, reason: 'not_fresh' });
  });

  it('a password confirmation needs no proof', async () => {
    const r = await verifySignatureConfirmation(confirmation({ signerId: 'PATH-001', method: 'password', proof: null }), expected(pw), none, sha);
    expect(r).toMatchObject({ ok: true, evidence: { method: 'password', sso: null } });
  });
});

describe('createSignatureGate', () => {
  function gate(profile: SessionProfile | null = sso) {
    const records: SignatureRecord[] = [];
    const audit: NewAuditLog[] = [];
    const used = { confirmationIds: [] as string[], tokenHashes: [] as string[] };
    let now = NOW;
    const g = createSignatureGate({
      config, readProfile: () => profile, sha256: sha, now: () => now,
      recordService: { record: async input => { const r = { ...input, id: `SIG-${records.length + 1}`, recordedAt: now.toISOString() }; records.push(r); return { ok: true, data: r }; } },
      auditService: { logEvent: async e => { audit.push(e); return { ok: true, data: { ...e, id: 'a', timestamp: '' } }; } },
      usedStore: { read: () => used, add: (id, h) => { used.confirmationIds.push(id); if (h) used.tokenHashes.push(h); } },
    });
    return { g, records, audit, used, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
  }
  const exp = { caseId: 'case-1', caseRef: 'S26-0001', actions: ['case-sign-out', 'countersign'] as const };

  it('accepts once, holds it for the case, records it on commit, and can never reuse it', async () => {
    const t = gate();
    expect(await t.g.accept(confirmation(), exp)).toMatchObject({ ok: true });
    expect(t.used.confirmationIds).toEqual(['c-1']);
    expect(t.used.tokenHashes).toHaveLength(1);
    const rec = await t.g.commit('case-1', 'signed', { kind: 'report-version' });
    expect(rec).toMatchObject({ id: 'SIG-1', caseId: 'case-1', outcome: 'signed', link: { kind: 'report-version' }, evidence: { confirmationId: 'c-1' } });
    expect(t.audit.slice(-1)[0]).toMatchObject({ event: 'Signature recorded', caseId: 'S26-0001' });
    expect(await t.g.commit('case-1', 'signed')).toBeNull(); // nothing held any more
    expect(await t.g.accept(confirmation(), exp)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('a resume after a gate reuses the held confirmation for 15 minutes, for the same case and kind of action', async () => {
    const t = gate();
    await t.g.accept(confirmation(), exp);
    expect(await t.g.accept(undefined, exp)).toMatchObject({ ok: true });
    expect(await t.g.accept(undefined, { ...exp, caseId: 'case-2' })).toEqual({ ok: false, reason: 'missing' });
    expect(await t.g.accept(undefined, { ...exp, actions: ['report-finalize'] })).toEqual({ ok: false, reason: 'missing' });
    t.advance(16 * 60_000);
    expect(await t.g.accept(undefined, exp)).toEqual({ ok: false, reason: 'missing' });
  });

  it('without any confirmation nothing can be signed; a refusal is audited', async () => {
    const t = gate();
    expect(await t.g.accept(undefined, exp)).toEqual({ ok: false, reason: 'missing' });
    expect(await t.g.accept(confirmation({ caseRef: 'S26-0002' }), exp)).toEqual({ ok: false, reason: 'wrong_case' });
    expect(t.audit).toEqual([expect.objectContaining({ event: 'Signature refused', detail: 'Signature for case sign-out refused when saving (wrong_case).' })]);
    expect(await gate(null).g.accept(confirmation(), exp)).toEqual({ ok: false, reason: 'no_session' });
  });

  it('release drops a held confirmation (the signing was refused further on)', async () => {
    const t = gate();
    await t.g.accept(confirmation(), exp);
    t.g.release('case-1');
    expect(t.g.held('case-1')).toBeNull();
    expect(await t.g.commit('case-1', 'signed')).toBeNull();
  });
});

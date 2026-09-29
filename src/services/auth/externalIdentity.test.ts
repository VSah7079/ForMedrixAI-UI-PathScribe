// src/services/auth/externalIdentity.test.ts — PS-60 (Batch 343)
import { describe, it, expect } from 'vitest';
import type { StaffUser } from '../users/IUserService';
import { checkIdTokenClaims, identityFromClaims, isSsoDenialReason, matchStaffToIdentity, type ExternalIdentity } from './externalIdentity';

const staff = (id: string, email: string, extra: Partial<StaffUser> = {}): StaffUser => ({
  id, firstName: 'A', lastName: id, email, roles: ['Pathologist'], npi: '', license: '', phone: '', status: 'Active', ...extra,
});
const ISS = 'https://login.microsoftonline.com/tid/v2.0';
const identity = (over: Partial<ExternalIdentity> = {}): ExternalIdentity => ({
  providerId: 'microsoft', issuer: ISS, subject: 'oid-1', email: 'schen@hospital.org', emailTrusted: true, ...over,
});
const now = new Date('2026-09-26T12:00:00Z');

describe('checkIdTokenClaims', () => {
  const good = { sub: 's', iss: 'https://idp/', aud: 'client', exp: 1_000 };
  const expected = { issuer: 'https://idp', clientId: 'client', nowSeconds: 900 };
  it('accepts matching issuer (trailing slash ignored), audience (string or list) and expiry', () => {
    expect(checkIdTokenClaims(good, expected)).toBeNull();
    expect(checkIdTokenClaims({ ...good, aud: ['other', 'client'] }, expected)).toBeNull();
  });
  it('names what is wrong', () => {
    expect(checkIdTokenClaims({ ...good, sub: '' }, expected)).toBe('missing_subject');
    expect(checkIdTokenClaims({ ...good, iss: 'https://evil' }, expected)).toBe('wrong_issuer');
    expect(checkIdTokenClaims({ ...good, iss: undefined }, expected)).toBe('wrong_issuer');
    expect(checkIdTokenClaims({ ...good, aud: 'other' }, expected)).toBe('wrong_audience');
    expect(checkIdTokenClaims({ ...good, exp: 500 }, expected)).toBe('expired');
    expect(checkIdTokenClaims({ ...good, exp: 'soon' }, expected)).toBe('expired');
  });
  it('allows five minutes of clock skew', () => {
    expect(checkIdTokenClaims({ ...good, exp: 700 }, expected)).toBeNull();
    expect(checkIdTokenClaims({ ...good, exp: 599 }, expected)).toBe('expired');
  });
});

describe('identityFromClaims', () => {
  it('Entra ID: keyed on oid, not the per-app sub; email trusted from the tenant', () => {
    expect(identityFromClaims({ id: 'microsoft', trustEmailClaim: true }, { iss: ISS, sub: 'pairwise', oid: 'oid-1', email: ' SChen@Hospital.org ' }))
      .toEqual(identity());
  });
  it('Entra ID without oid identifies nobody', () => {
    expect(identityFromClaims({ id: 'microsoft', trustEmailClaim: true }, { iss: ISS, sub: 'x' })).toBeNull();
  });
  it('generic OIDC: keyed on sub; email trusted only when verified', () => {
    const p = { id: 'oidc' as const, trustEmailClaim: false };
    expect(identityFromClaims(p, { iss: 'https://okta', sub: 'u1', email: 'a@b.org', email_verified: true })).toMatchObject({ subject: 'u1', emailTrusted: true });
    expect(identityFromClaims(p, { iss: 'https://okta', sub: 'u1', email: 'a@b.org' })).toMatchObject({ emailTrusted: false });
    expect(identityFromClaims(p, { iss: 'https://okta', sub: 'u1', email: 'a@b.org', email_verified: 'true' })).toMatchObject({ emailTrusted: false });
    expect(identityFromClaims(p, { iss: 'https://okta', sub: 'u1', email: 'not-an-email' })).toMatchObject({ email: null, emailTrusted: false });
    expect(identityFromClaims(p, { sub: 'u1' })).toBeNull();
  });
});

describe('matchStaffToIdentity', () => {
  const opts = { linkByEmail: true, now };
  const link = { providerId: 'microsoft' as const, issuer: ISS, subject: 'oid-1', linkedAt: '2026-01-01T00:00:00Z', linkedBy: 'admin' as const };

  it('an already-linked account signs in as that person, whatever the email now says', () => {
    const people = [staff('1', 'old@hospital.org', { externalIdentities: [link] }), staff('2', 'schen@hospital.org')];
    expect(matchStaffToIdentity(identity(), people, opts)).toEqual({ ok: true, staffId: '1', newLink: null });
  });

  it('a linked but inactive person is refused, even with linking by email', () => {
    const people = [staff('1', 'schen@hospital.org', { externalIdentities: [link], status: 'Inactive' })];
    expect(matchStaffToIdentity(identity(), people, opts)).toEqual({ ok: false, reason: 'inactive' });
  });

  it('first sign-in links by trusted email to the one active record', () => {
    const r = matchStaffToIdentity(identity(), [staff('1', ' SCHEN@hospital.org'), staff('2', 'other@hospital.org')], opts);
    expect(r).toEqual({ ok: true, staffId: '1', newLink: { providerId: 'microsoft', issuer: ISS, subject: 'oid-1', linkedAt: now.toISOString(), linkedBy: 'first-sign-in' } });
  });

  it('never provisions: no matching staff record is refused', () => {
    expect(matchStaffToIdentity(identity(), [staff('1', 'other@hospital.org')], opts)).toEqual({ ok: false, reason: 'not_provisioned' });
    expect(matchStaffToIdentity(identity(), [], opts)).toEqual({ ok: false, reason: 'not_provisioned' });
  });

  it('does not link by email when linking is off, the email is untrusted, or absent', () => {
    const people = [staff('1', 'schen@hospital.org')];
    expect(matchStaffToIdentity(identity(), people, { ...opts, linkByEmail: false })).toEqual({ ok: false, reason: 'not_provisioned' });
    expect(matchStaffToIdentity(identity({ emailTrusted: false }), people, opts)).toEqual({ ok: false, reason: 'not_provisioned' });
    expect(matchStaffToIdentity(identity({ email: null, emailTrusted: false }), people, opts)).toEqual({ ok: false, reason: 'not_provisioned' });
  });

  it('inactive-only matches are refused as inactive; an inactive duplicate does not block the active one', () => {
    expect(matchStaffToIdentity(identity(), [staff('1', 'schen@hospital.org', { status: 'Inactive' })], opts)).toEqual({ ok: false, reason: 'inactive' });
    expect(matchStaffToIdentity(identity(), [staff('1', 'schen@hospital.org', { status: 'Inactive' }), staff('2', 'schen@hospital.org')], opts))
      .toMatchObject({ ok: true, staffId: '2' });
  });

  it('two active records with the same email are ambiguous', () => {
    expect(matchStaffToIdentity(identity(), [staff('1', 'schen@hospital.org'), staff('2', 'schen@hospital.org')], opts)).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('two records linked to the same account are ambiguous', () => {
    expect(matchStaffToIdentity(identity(), [staff('1', 'a@x', { externalIdentities: [link] }), staff('2', 'b@x', { externalIdentities: [link] })], opts))
      .toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('a record already linked to a different account at the same provider is not taken over by email', () => {
    const other = { ...link, subject: 'oid-OTHER' };
    expect(matchStaffToIdentity(identity(), [staff('1', 'schen@hospital.org', { externalIdentities: [other] })], opts)).toEqual({ ok: false, reason: 'already_linked' });
    // A link at a different provider doesn't block it.
    const okta = { ...link, providerId: 'oidc' as const, issuer: 'https://okta' };
    expect(matchStaffToIdentity(identity(), [staff('1', 'schen@hospital.org', { externalIdentities: [okta] })], opts)).toMatchObject({ ok: true });
  });
});

describe('isSsoDenialReason', () => {
  it('accepts only known reasons', () => {
    expect(isSsoDenialReason('inactive')).toBe(true);
    expect(isSsoDenialReason('toString')).toBe(false);
    expect(isSsoDenialReason(undefined)).toBe(false);
  });
});

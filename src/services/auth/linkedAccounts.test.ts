// src/services/auth/linkedAccounts.test.ts — Batch 345 (PS-60 follow-up)
import { describe, it, expect } from 'vitest';
import type { StaffUser } from '../users/IUserService';
import type { NewAuditLog } from '../auditlog/IAuditService';
import { describeLinkedAccounts, unlinkExternalIdentity } from './linkedAccounts';

const ISS = 'https://login.microsoftonline.com/t/v2.0';
const links = [
  { providerId: 'oidc' as const, issuer: 'https://okta', subject: 'short', linkedAt: '2026-09-20T00:00:00Z', linkedBy: 'admin' as const },
  { providerId: 'microsoft' as const, issuer: ISS, subject: '0f9e8d7c-1111-2222-3333-444455556666', linkedAt: '2026-09-01T00:00:00Z', linkedBy: 'first-sign-in' as const },
];
const staff = (): StaffUser => ({ id: '1', firstName: 'S', lastName: 'C', email: 'e', roles: [], npi: '', license: '', phone: '', status: 'Active', externalIdentities: links.map(l => ({ ...l })) });

describe('describeLinkedAccounts', () => {
  it('lists oldest first, with long account ids shortened', () => {
    const v = describeLinkedAccounts(staff());
    expect(v.map(a => a.providerId)).toEqual(['microsoft', 'oidc']);
    expect(v[0].subjectShort).toBe('0f9e8d7c…6666');
    expect(v[1].subjectShort).toBe('short');
    expect(describeLinkedAccounts(null)).toEqual([]);
  });
});

describe('unlinkExternalIdentity', () => {
  function deps(record: StaffUser | null = staff(), saveOk = true) {
    const audit: NewAuditLog[] = [];
    const updates: Partial<StaffUser>[] = [];
    return {
      audit, updates,
      d: {
        userService: {
          getById: async () => (record ? { ok: true as const, data: record } : { ok: false as const, error: 'nope' }),
          update: async (_id: string, changes: Partial<StaffUser>) => { updates.push(changes); return saveOk ? { ok: true as const, data: { ...record!, ...changes } } : { ok: false as const, error: 'x' }; },
        },
        auditService: { logEvent: async (e: NewAuditLog) => { audit.push(e); return { ok: true as const, data: { ...e, id: 'a', timestamp: '' } }; } },
      },
    };
  }

  it('removes only that link, and audits it', async () => {
    const t = deps();
    const r = await unlinkExternalIdentity({ staffId: '1', issuer: ISS, subject: links[1].subject, actorName: 'Admin' }, t.d);
    expect(r.ok).toBe(true);
    expect(t.updates).toEqual([{ externalIdentities: [links[0]] }]);
    expect(t.audit).toEqual([expect.objectContaining({ event: 'SSO account unlinked', detail: 'Account at Microsoft Entra ID unlinked from staff record 1.', user: 'Admin' })]);
  });

  it('reports a missing record, a link that is not there, or a failed save', async () => {
    expect(await unlinkExternalIdentity({ staffId: '1', issuer: ISS, subject: 'x', actorName: 'A' }, deps(null).d)).toEqual({ ok: false, reason: 'not_found' });
    expect(await unlinkExternalIdentity({ staffId: '1', issuer: ISS, subject: 'nope', actorName: 'A' }, deps().d)).toEqual({ ok: false, reason: 'not_linked' });
    const failing = deps(staff(), false);
    expect(await unlinkExternalIdentity({ staffId: '1', issuer: ISS, subject: links[1].subject, actorName: 'A' }, failing.d)).toEqual({ ok: false, reason: 'save_failed' });
    expect(failing.audit).toEqual([]);
  });
});

// src/services/consultAccess/mockConsultTokenService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockConsultTokenService } from './mockConsultTokenService';

// Real, minimal localStorage mock — same established pattern every
// other storage-backed service test in this app uses (confirmed
// directly against mockQaActivityTypeService.test.ts) — this
// project's real test environment provides no real localStorage global
// at all.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockConsultTokenService — real, per PS-290', () => {
  it('issue() creates an Active token with a real, computed default expiry', async () => {
    const res = await mockConsultTokenService.issue({
      scope: { caseId: 'case-issue-1', caseAccessionNumber: 'S26-9001' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson',
      consultantIdentifier: 'Dr. Consult Reviewer',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.isActive).toBe(true);
      expect(res.data.accessCount).toBe(0);
      expect(new Date(res.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(res.data.token).toBeTruthy();
    }
  });

  it('issue() rejects a blank consultant identifier — no real external-identity directory to fall back on', async () => {
    const res = await mockConsultTokenService.issue({
      scope: { caseId: 'case-issue-2', caseAccessionNumber: 'S26-9002' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson',
      consultantIdentifier: '   ',
    });
    expect(res.ok).toBe(false);
  });

  it('resolve() finds a real, just-issued Active token by its own opaque bearer string', async () => {
    const issued = await mockConsultTokenService.issue({
      scope: { caseId: 'case-resolve-1', caseAccessionNumber: 'S26-9003' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson',
      consultantIdentifier: 'Dr. Consult Reviewer',
    });
    if (!issued.ok) throw new Error('setup failed');
    const resolved = await mockConsultTokenService.resolve(issued.data.token);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.id).toBe(issued.data.id);
  });

  it('resolve() gives one uniform, non-distinguishing denial for a token that never existed', async () => {
    const res = await mockConsultTokenService.resolve('ct_this_token_was_never_issued');
    expect(res.ok).toBe(false);
  });

  it('resolve() denies an already-revoked token, even though it has not expired', async () => {
    const issued = await mockConsultTokenService.issue({
      scope: { caseId: 'case-revoke-1', caseAccessionNumber: 'S26-9004' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson',
      consultantIdentifier: 'Dr. Consult Reviewer',
    });
    if (!issued.ok) throw new Error('setup failed');
    const revoked = await mockConsultTokenService.revoke(issued.data.id, 'u1');
    expect(revoked.ok && revoked.data.isActive).toBe(false);

    const resolved = await mockConsultTokenService.resolve(issued.data.token);
    expect(resolved.ok).toBe(false);
  });

  it('resolve() denies an expired token, even though it was never revoked', async () => {
    const issued = await mockConsultTokenService.issue({
      scope: { caseId: 'case-expire-1', caseAccessionNumber: 'S26-9005' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson',
      consultantIdentifier: 'Dr. Consult Reviewer',
      expiresAt: new Date(Date.now() - 1000).toISOString(), // already in the past
    });
    if (!issued.ok) throw new Error('setup failed');
    const resolved = await mockConsultTokenService.resolve(issued.data.token);
    expect(resolved.ok).toBe(false);
  });

  it('recordAccess() increments accessCount and stamps lastAccessedAt, separately from resolve()', async () => {
    const issued = await mockConsultTokenService.issue({
      scope: { caseId: 'case-access-1', caseAccessionNumber: 'S26-9006' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson',
      consultantIdentifier: 'Dr. Consult Reviewer',
    });
    if (!issued.ok) throw new Error('setup failed');
    // Multiple resolves must NOT by themselves inflate the access count.
    await mockConsultTokenService.resolve(issued.data.token);
    await mockConsultTokenService.resolve(issued.data.token);
    const recorded = await mockConsultTokenService.recordAccess(issued.data.id);
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(recorded.data.accessCount).toBe(1);
      expect(recorded.data.lastAccessedAt).toBeTruthy();
    }
  });

  it('getByCaseId() scopes to only the given case’s own tokens', async () => {
    await mockConsultTokenService.issue({
      scope: { caseId: 'case-scope-a', caseAccessionNumber: 'S26-9007' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson', consultantIdentifier: 'Dr. A',
    });
    await mockConsultTokenService.issue({
      scope: { caseId: 'case-scope-b', caseAccessionNumber: 'S26-9008' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson', consultantIdentifier: 'Dr. B',
    });
    const res = await mockConsultTokenService.getByCaseId('case-scope-a');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.every(t => t.scope.caseId === 'case-scope-a')).toBe(true);
      expect(res.data.some(t => t.scope.caseId === 'case-scope-b')).toBe(false);
    }
  });

  it('submitOpinion() rejects a blank opinion, and a real one round-trips through getOpinionsByCaseId()', async () => {
    const issued = await mockConsultTokenService.issue({
      scope: { caseId: 'case-opinion-1', caseAccessionNumber: 'S26-9009' },
      issuedByUserId: 'u1', issuedByName: 'Dr. Sarah Johnson', consultantIdentifier: 'Dr. Consult Reviewer',
    });
    if (!issued.ok) throw new Error('setup failed');

    const blank = await mockConsultTokenService.submitOpinion({
      tokenId: issued.data.id, caseId: 'case-opinion-1', consultantIdentifier: 'Dr. Consult Reviewer',
      signedStatus: 'Draft', opinionText: '   ',
    });
    expect(blank.ok).toBe(false);

    const real = await mockConsultTokenService.submitOpinion({
      tokenId: issued.data.id, caseId: 'case-opinion-1', consultantIdentifier: 'Dr. Consult Reviewer',
      signedStatus: 'Signed', diagnosticCategory: 'Benign', opinionText: 'Concur with original diagnosis.',
    });
    expect(real.ok).toBe(true);

    const list = await mockConsultTokenService.getOpinionsByCaseId('case-opinion-1');
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.some(o => o.opinionText === 'Concur with original diagnosis.')).toBe(true);
  });
});

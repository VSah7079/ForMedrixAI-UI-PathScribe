// src/services/cases/canUserClaimPoolCase.test.ts
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { canUserClaimPoolCase } = await import('./mockCaseService');
const { mockSubspecialtyService } = await import('../subspecialties/mockSubspecialtyService');

describe('canUserClaimPoolCase — real fix: claim-time enforcement was completely missing before this', () => {
  it('allows claiming when poolId is undefined (no pool at all)', async () => {
    const result = await canUserClaimPoolCase(undefined, 'user-1');
    expect(result.allowed).toBe(true);
  });

  it('allows claiming when the poolId does not resolve to a real Subspecialty record (e.g. the "general" fallback pool)', async () => {
    const result = await canUserClaimPoolCase('general', 'user-1');
    expect(result.allowed).toBe(true);
  });

  it('allows claiming when the subspecialty exists but isWorkgroupEnabled is off (today\'s default for every seeded subspecialty — backward compatible)', async () => {
    const created = await mockSubspecialtyService.add({
      name: 'Test Pool Unrestricted', isWorkgroup: true, isWorkgroupEnabled: false,
      active: true, status: 'Active', userIds: ['member-only'],
    } as any);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await canUserClaimPoolCase(created.data.id, 'someone-not-in-the-list');
    expect(result.allowed).toBe(true);
  });

  it('blocks a non-member when isWorkgroupEnabled is on — the real, previously-missing enforcement', async () => {
    const created = await mockSubspecialtyService.add({
      name: 'Test Pool Restricted', isWorkgroup: true, isWorkgroupEnabled: true,
      active: true, status: 'Active', userIds: ['member-1', 'member-2'],
    } as any);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await canUserClaimPoolCase(created.data.id, 'not-a-member');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Test Pool Restricted');
  });

  it('allows a real member when isWorkgroupEnabled is on', async () => {
    const created = await mockSubspecialtyService.add({
      name: 'Test Pool Restricted 2', isWorkgroup: true, isWorkgroupEnabled: true,
      active: true, status: 'Active', userIds: ['member-1', 'member-2'],
    } as any);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await canUserClaimPoolCase(created.data.id, 'member-1');
    expect(result.allowed).toBe(true);
  });

  // Real, critical bug found during a direct product review: every real,
  // seeded pool case's own poolId field ('GI-UK', 'URO-UK', 'GYN-MPA')
  // never matches any real Subspecialty record's own id ('gi', 'uro',
  // 'gyn') — only poolName ever did. The original single-key getById()
  // lookup silently found nothing for every real pool case in the app,
  // meaning membership enforcement never actually blocked anyone,
  // regardless of isWorkgroupEnabled. These reproduce that exact real
  // shape directly, not a synthetic id match.
  it('real bug this closes: blocks a non-member when only poolName matches the real Subspecialty record, even though the given poolId matches nothing', async () => {
    const created = await mockSubspecialtyService.add({
      name: 'GI Pool Name Match Test', isWorkgroup: true, isWorkgroupEnabled: true,
      active: true, status: 'Active', userIds: ['member-1'],
    } as any);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // 'GI-UK' deliberately matches no real Subspecialty id or name —
    // the exact real shape a seeded case's own poolId carries.
    const result = await canUserClaimPoolCase('GI-UK', 'not-a-member', created.data.name);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('GI Pool Name Match Test');
  });

  it('real bug this closes: a genuine member is still allowed through the same poolName-only match path', async () => {
    const created = await mockSubspecialtyService.add({
      name: 'GI Pool Name Match Test 2', isWorkgroup: true, isWorkgroupEnabled: true,
      active: true, status: 'Active', userIds: ['member-1'],
    } as any);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await canUserClaimPoolCase('GI-UK', 'member-1', created.data.name);
    expect(result.allowed).toBe(true);
  });
});

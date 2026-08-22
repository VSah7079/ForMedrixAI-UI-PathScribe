// src/services/billing/mockRvuCodeMapService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockRvuCodeMapService } from './mockRvuCodeMapService';

// Real, minimal localStorage mock - this suite genuinely exercises the
// storage-backed service, not just pure functions.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockRvuCodeMapService — real fix: the versioned RVU table that never existed before', () => {
  it('seeds a real, active version out of the box, not empty', async () => {
    const res = await mockRvuCodeMapService.getActiveVersion();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).not.toBeNull();
      expect(res.data!.entries.length).toBeGreaterThan(0);
    }
  });

  it('creates a new version without activating it - never auto-activated', async () => {
    const created = await mockRvuCodeMapService.createVersion({
      label: 'Test 2027 update',
      effectiveDate: '2027-01-01T00:00:00.000Z',
      entries: [{ code: '99999', billingCode: '99999', description: 'Test code', workRvu: 1.0 }],
      uploadedBy: 'test-admin',
    });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.data.isActive).toBe(false);

    // Real, still-original active version, unaffected
    const active = await mockRvuCodeMapService.getActiveVersion();
    if (active.ok) expect(active.data?.label).not.toBe('Test 2027 update');
  });

  it('rejects creating a version with no real entries', async () => {
    const res = await mockRvuCodeMapService.createVersion({
      label: 'Empty', effectiveDate: '2027-01-01T00:00:00.000Z', entries: [], uploadedBy: 'test-admin',
    });
    expect(res.ok).toBe(false);
  });

  it('rejects an entry with a non-positive work RVU value - never silently accepted', async () => {
    const res = await mockRvuCodeMapService.createVersion({
      label: 'Bad data', effectiveDate: '2027-01-01T00:00:00.000Z',
      entries: [{ code: '12345', billingCode: '12345', description: 'x', workRvu: 0 }],
      uploadedBy: 'test-admin',
    });
    expect(res.ok).toBe(false);
  });

  it('activating a version deactivates every other version - exactly one active at a time', async () => {
    const created = await mockRvuCodeMapService.createVersion({
      label: 'New version', effectiveDate: '2027-01-01T00:00:00.000Z',
      entries: [{ code: '11111', billingCode: '11111', description: 'x', workRvu: 1.0 }], uploadedBy: 'test-admin',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockRvuCodeMapService.activateVersion(created.data.id);

    const all = await mockRvuCodeMapService.getAllVersions();
    if (all.ok) {
      const activeOnes = all.data.filter(v => v.isActive);
      expect(activeOnes).toHaveLength(1);
      expect(activeOnes[0].id).toBe(created.data.id);
    }
  });

  it('never deletes a version when a new one is created - old versions stay retrievable', async () => {
    const before = await mockRvuCodeMapService.getAllVersions();
    const beforeCount = before.ok ? before.data.length : 0;

    await mockRvuCodeMapService.createVersion({
      label: 'Another version', effectiveDate: '2027-06-01T00:00:00.000Z',
      entries: [{ code: '22222', billingCode: '22222', description: 'x', workRvu: 1.0 }], uploadedBy: 'test-admin',
    });

    const after = await mockRvuCodeMapService.getAllVersions();
    expect(after.ok && after.data.length).toBe(beforeCount + 1);
  });

  describe('getVersionEffectiveAt — the real, core reason this needed to be versioned at all', () => {
    it('resolves the real version that was actually in effect on a historical date, not whatever is active today', async () => {
      // Seed version effective 2026-01-01. Add a later version effective 2027-01-01.
      await mockRvuCodeMapService.createVersion({
        label: '2027 update', effectiveDate: '2027-01-01T00:00:00.000Z',
        entries: [{ code: '88305', billingCode: '88305', description: 'Updated 2027 value', workRvu: 0.80 }],
        uploadedBy: 'test-admin',
      });

      // A case genuinely finalized mid-2026 should resolve to the 2026 rates, not the 2027 ones.
      const historical = await mockRvuCodeMapService.getVersionEffectiveAt('2026-06-15T00:00:00.000Z');
      expect(historical.ok).toBe(true);
      if (historical.ok) {
        expect(historical.data?.label).toContain('2026');
      }
    });

    it('resolves to the newer version for a date after it took effect', async () => {
      await mockRvuCodeMapService.createVersion({
        label: '2027 update', effectiveDate: '2027-01-01T00:00:00.000Z',
        entries: [{ code: '88305', billingCode: '88305', description: 'Updated 2027 value', workRvu: 0.80 }],
        uploadedBy: 'test-admin',
      });

      const result = await mockRvuCodeMapService.getVersionEffectiveAt('2027-03-01T00:00:00.000Z');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data?.label).toBe('2027 update');
    });

    it('returns null (never guesses) for a date before any real version existed', async () => {
      const result = await mockRvuCodeMapService.getVersionEffectiveAt('2020-01-01T00:00:00.000Z');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBeNull();
    });

    it('resolving a date does not depend on which version happens to be marked active', async () => {
      const created = await mockRvuCodeMapService.createVersion({
        label: '2027 update', effectiveDate: '2027-01-01T00:00:00.000Z',
        entries: [{ code: '88305', billingCode: '88305', description: 'x', workRvu: 0.80 }], uploadedBy: 'test-admin',
      });
      if (!created.ok) throw new Error('setup failed');
      // Deliberately do NOT activate the 2027 version - it stays inactive.
      const result = await mockRvuCodeMapService.getVersionEffectiveAt('2027-06-01T00:00:00.000Z');
      // Still resolves the real 2027 version by date, regardless of active flag.
      expect(result.ok && result.data?.id).toBe(created.data.id);
    });
  });
});

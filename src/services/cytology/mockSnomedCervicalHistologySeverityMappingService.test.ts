// src/services/cytology/mockSnomedCervicalHistologySeverityMappingService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockSnomedCervicalHistologySeverityMappingService — real, per direct guidance ("implement a real settings layer for the mapping table")', () => {
  it('starts with real, structurally-safe synthetic seed data — never empty, never a real licensed SNOMED code', async () => {
    const { mockSnomedCervicalHistologySeverityMappingService } = await import('./mockSnomedCervicalHistologySeverityMappingService');
    const res = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.length).toBeGreaterThan(0);
      // Real, structural safety check — every seeded code is
      // unmistakably fake even read alone, same convention as
      // resolveSyntheticCoding.ts.
      for (const entry of res.data) {
        expect(entry.snomedCode.startsWith('TEST-SNOMED-')).toBe(true);
        expect(entry.description.startsWith('[SYNTHETIC — TEST ONLY]')).toBe(true);
      }
    }
  });

  it('a real, admin-added entry is correctly persisted alongside the seed data', async () => {
    const { mockSnomedCervicalHistologySeverityMappingService } = await import('./mockSnomedCervicalHistologySeverityMappingService');
    const before = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    const seedCount = before.ok ? before.data.length : 0;
    const added = await mockSnomedCervicalHistologySeverityMappingService.add({
      snomedCode: 'TEST-CIN3-001', description: 'CIN III (test)', severityRank: 4,
      createdBy: { userId: 'u1', userName: 'Admin User' },
    });
    expect(added.ok).toBe(true);
    const all = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    if (all.ok) {
      expect(all.data).toHaveLength(seedCount + 1);
      expect(all.data.find(e => e.snomedCode === 'TEST-CIN3-001')).toBeTruthy();
    }
  });

  it('a real, duplicate SNOMED code is rejected with an honest error, never silently overwritten or duplicated', async () => {
    const { mockSnomedCervicalHistologySeverityMappingService } = await import('./mockSnomedCervicalHistologySeverityMappingService');
    const before = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    const seedCount = before.ok ? before.data.length : 0;
    await mockSnomedCervicalHistologySeverityMappingService.add({ snomedCode: 'TEST-CIN2-001', description: 'CIN II (test)', severityRank: 2 });
    const dup = await mockSnomedCervicalHistologySeverityMappingService.add({ snomedCode: 'TEST-CIN2-001', description: 'Duplicate attempt', severityRank: 3 });
    expect(dup.ok).toBe(false);
    const all = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    if (all.ok) expect(all.data).toHaveLength(seedCount + 1);
  });

  it('a real update changes only the given fields, never the snomedCode itself', async () => {
    const { mockSnomedCervicalHistologySeverityMappingService } = await import('./mockSnomedCervicalHistologySeverityMappingService');
    const added = await mockSnomedCervicalHistologySeverityMappingService.add({ snomedCode: 'TEST-CIN1-001', description: 'CIN I (test)', severityRank: 1 });
    if (!added.ok) throw new Error('setup failed');
    const updated = await mockSnomedCervicalHistologySeverityMappingService.update(added.data.id, { description: 'CIN I, revised label', severityRank: 1 });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.description).toBe('CIN I, revised label');
      expect(updated.data.snomedCode).toBe('TEST-CIN1-001');
    }
  });

  it('updating a real, non-existent id returns an honest error', async () => {
    const { mockSnomedCervicalHistologySeverityMappingService } = await import('./mockSnomedCervicalHistologySeverityMappingService');
    const res = await mockSnomedCervicalHistologySeverityMappingService.update('does-not-exist', { severityRank: 5 });
    expect(res.ok).toBe(false);
  });

  it('a real removal correctly deletes an admin-added entry, leaving the seed data intact', async () => {
    const { mockSnomedCervicalHistologySeverityMappingService } = await import('./mockSnomedCervicalHistologySeverityMappingService');
    const before = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    const seedCount = before.ok ? before.data.length : 0;
    const added = await mockSnomedCervicalHistologySeverityMappingService.add({ snomedCode: 'TEST-INVASIVE-001', description: 'Invasive SCC (test)', severityRank: 5 });
    if (!added.ok) throw new Error('setup failed');
    await mockSnomedCervicalHistologySeverityMappingService.remove(added.data.id);
    const all = await mockSnomedCervicalHistologySeverityMappingService.getAll();
    if (all.ok) expect(all.data).toHaveLength(seedCount);
  });
});

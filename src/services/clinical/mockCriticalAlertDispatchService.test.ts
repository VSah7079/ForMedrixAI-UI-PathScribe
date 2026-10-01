// src/services/clinical/mockCriticalAlertDispatchService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCriticalAlertDispatchService } from './mockCriticalAlertDispatchService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const baseInput = {
  caseId: 'case-1',
  findingTerm: 'invasive carcinoma',
  findingSeverity: 'Critical' as const,
  physicianId: 'phys-1',
  physicianName: 'Dr. Chen',
  channels: [],
};

describe('mockCriticalAlertDispatchService — real, per PS-136', () => {
  it('record() generates its own id when none is supplied', async () => {
    const res = await mockCriticalAlertDispatchService.record(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBeTruthy();
  });

  it('record() uses a caller-supplied id when given — real, needed by dispatchCriticalAlerts.ts so a reference token can link back to the exact record before it exists in storage', async () => {
    const res = await mockCriticalAlertDispatchService.record({ ...baseInput, id: 'cad-fixed-1' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe('cad-fixed-1');
  });

  it('getAll() returns every record across every case, for the internal audit viewer', async () => {
    await mockCriticalAlertDispatchService.record({ ...baseInput, caseId: 'case-a' });
    await mockCriticalAlertDispatchService.record({ ...baseInput, caseId: 'case-b' });
    const res = await mockCriticalAlertDispatchService.getAll();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data.map(r => r.caseId).sort()).toEqual(['case-a', 'case-b']);
    }
  });

  it('getByCaseId() still scopes to only the given case, unaffected by getAll() existing', async () => {
    await mockCriticalAlertDispatchService.record({ ...baseInput, caseId: 'case-a' });
    await mockCriticalAlertDispatchService.record({ ...baseInput, caseId: 'case-b' });
    const res = await mockCriticalAlertDispatchService.getByCaseId('case-a');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.every(r => r.caseId === 'case-a')).toBe(true);
  });
});

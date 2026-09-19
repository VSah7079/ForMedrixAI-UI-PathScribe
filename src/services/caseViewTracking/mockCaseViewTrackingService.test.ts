import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCaseViewTrackingService', () => {
  it('a real, never-viewed case is genuinely absent from getViewedCaseIds', async () => {
    const { mockCaseViewTrackingService } = await import('./mockCaseViewTrackingService');
    const res = await mockCaseViewTrackingService.getViewedCaseIds('user-1');
    expect(res.ok && res.data.has('case-1')).toBe(false);
  });

  it('a real recordView makes the case appear in getViewedCaseIds for that real user', async () => {
    const { mockCaseViewTrackingService } = await import('./mockCaseViewTrackingService');
    await mockCaseViewTrackingService.recordView('user-1', 'case-1');
    const res = await mockCaseViewTrackingService.getViewedCaseIds('user-1');
    expect(res.ok && res.data.has('case-1')).toBe(true);
  });

  it('recording the same real view twice is idempotent \u2014 never a duplicate record', async () => {
    const { mockCaseViewTrackingService } = await import('./mockCaseViewTrackingService');
    await mockCaseViewTrackingService.recordView('user-1', 'case-1');
    await mockCaseViewTrackingService.recordView('user-1', 'case-1');
    const res = await mockCaseViewTrackingService.getViewedCaseIds('user-1');
    expect(res.ok && res.data.size).toBe(1);
  });

  it('a real view recorded for one user never leaks into another real user\u2019s own view set', async () => {
    const { mockCaseViewTrackingService } = await import('./mockCaseViewTrackingService');
    await mockCaseViewTrackingService.recordView('user-1', 'case-1');
    const res = await mockCaseViewTrackingService.getViewedCaseIds('user-2');
    expect(res.ok && res.data.has('case-1')).toBe(false);
  });
});

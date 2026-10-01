import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockPatientHistoryCacheService — real, per direct guidance\'s own fetch/cache/destroy lifecycle', () => {
  it('ensurePending creates a real, pending entry the first time, and is a real, honest no-op on a second call for the same case', async () => {
    const { mockPatientHistoryCacheService } = await import('./mockPatientHistoryCacheService');
    const first = await mockPatientHistoryCacheService.ensurePending('case-1', 'pat-1');
    expect(first.ok && first.data.status).toBe('pending');
    const second = await mockPatientHistoryCacheService.ensurePending('case-1', 'pat-1');
    expect(first.ok && second.ok && first.data.id === second.data.id).toBe(true);
  });

  it('markFetched records the real reports and clears any prior failure state', async () => {
    const { mockPatientHistoryCacheService } = await import('./mockPatientHistoryCacheService');
    await mockPatientHistoryCacheService.ensurePending('case-1', 'pat-1');
    await mockPatientHistoryCacheService.markFailed('case-1', 'LIS unreachable');
    const fetched = await mockPatientHistoryCacheService.markFetched('case-1', [
      { sourceAccessionNumber: 'LEGACY-1', reportDate: '2020-01-01', specimenDescription: 'A', diagnosisSummary: 'B', sourceSystemName: 'Legacy' },
    ]);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data.status).toBe('fetched');
      expect(fetched.data.reports).toHaveLength(1);
      expect(fetched.data.failedAttemptCount).toBe(0);
      expect(fetched.data.errorMessage).toBeUndefined();
    }
  });

  it('markFailed increments the real failed-attempt count each real time it happens', async () => {
    const { mockPatientHistoryCacheService } = await import('./mockPatientHistoryCacheService');
    await mockPatientHistoryCacheService.ensurePending('case-1', 'pat-1');
    await mockPatientHistoryCacheService.markFailed('case-1', 'LIS unreachable');
    const second = await mockPatientHistoryCacheService.markFailed('case-1', 'LIS unreachable');
    expect(second.ok && second.data.failedAttemptCount).toBe(2);
  });

  it('destroy genuinely removes the entry — per direct guidance\'s own real data-minimization requirement, never a soft-delete', async () => {
    const { mockPatientHistoryCacheService } = await import('./mockPatientHistoryCacheService');
    await mockPatientHistoryCacheService.ensurePending('case-1', 'pat-1');
    await mockPatientHistoryCacheService.destroy('case-1');
    const after = await mockPatientHistoryCacheService.getByCaseId('case-1');
    expect(after.ok && after.data).toBeNull();
  });

  it('marking a case with no real prior ensurePending call returns an honest error, never a fabricated entry', async () => {
    const { mockPatientHistoryCacheService } = await import('./mockPatientHistoryCacheService');
    const res = await mockPatientHistoryCacheService.markFetched('case-never-pending', []);
    expect(res.ok).toBe(false);
  });
});

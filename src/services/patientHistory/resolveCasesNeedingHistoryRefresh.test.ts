import { describe, it, expect } from 'vitest';
import { resolveCasesNeedingHistoryRefresh, MAX_HISTORY_FETCH_ATTEMPTS } from './resolveCasesNeedingHistoryRefresh';
import type { PatientHistoryCacheEntry } from '@/types/patientHistory/PatientHistoryCacheEntry';

const entry = (over: Partial<PatientHistoryCacheEntry>): PatientHistoryCacheEntry => ({
  id: 'e1', caseId: 'case-1', patientId: 'pat-1', status: 'pending', reports: [], failedAttemptCount: 0, ...over,
});

describe('resolveCasesNeedingHistoryRefresh', () => {
  it('a case with no cache entry at all needs a real, first fetch', () => {
    const result = resolveCasesNeedingHistoryRefresh([{ caseId: 'case-1', patientId: 'pat-1' }], []);
    expect(result).toEqual([{ caseId: 'case-1', patientId: 'pat-1' }]);
  });

  it('a case already fetched does not need another fetch', () => {
    const result = resolveCasesNeedingHistoryRefresh(
      [{ caseId: 'case-1', patientId: 'pat-1' }],
      [entry({ status: 'fetched' })],
    );
    expect(result).toEqual([]);
  });

  it('a case that failed fewer than the real max attempts is retried', () => {
    const result = resolveCasesNeedingHistoryRefresh(
      [{ caseId: 'case-1', patientId: 'pat-1' }],
      [entry({ status: 'failed', failedAttemptCount: MAX_HISTORY_FETCH_ATTEMPTS - 1 })],
    );
    expect(result).toEqual([{ caseId: 'case-1', patientId: 'pat-1' }]);
  });

  it('a case that has genuinely exhausted its real retry budget is never retried again', () => {
    const result = resolveCasesNeedingHistoryRefresh(
      [{ caseId: 'case-1', patientId: 'pat-1' }],
      [entry({ status: 'failed', failedAttemptCount: MAX_HISTORY_FETCH_ATTEMPTS })],
    );
    expect(result).toEqual([]);
  });

  it('only returns cases genuinely passed in as active — never invents one from a stale cache entry', () => {
    const result = resolveCasesNeedingHistoryRefresh(
      [],
      [entry({ caseId: 'case-signed-out', status: 'failed', failedAttemptCount: 0 })],
    );
    expect(result).toEqual([]);
  });
});

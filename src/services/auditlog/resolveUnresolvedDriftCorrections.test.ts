// src/services/auditlog/resolveUnresolvedDriftCorrections.test.ts
import { describe, it, expect } from 'vitest';
import { resolveUnresolvedDriftCorrections } from './resolveUnresolvedDriftCorrections';
import type { AuditLog } from './IAuditService';

let counter = 0;
function makeLog(over: Partial<AuditLog> = {}): AuditLog {
  counter += 1;
  return {
    id: `log-${counter}`,
    timestamp: '2026-01-01 00:00:00',
    type: 'system',
    event: 'Post-Finalization Drift Detected',
    detail: 'test',
    user: 'system',
    caseId: 'S26-0001',
    confidence: null,
    ...over,
  };
}

describe('resolveUnresolvedDriftCorrections', () => {
  it('a Deferred entry with no later Auto-Corrected entry for the same case is unresolved', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0001', timestamp: '2026-01-01 10:00:00' }),
    ];
    const result = resolveUnresolvedDriftCorrections(logs);
    expect(result).toHaveLength(1);
    expect(result[0].caseId).toBe('S26-0001');
  });

  it('a Failed entry with no later Auto-Corrected entry for the same case is unresolved', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Correction Failed', caseId: 'S26-0002', timestamp: '2026-01-01 10:00:00' }),
    ];
    expect(resolveUnresolvedDriftCorrections(logs)).toHaveLength(1);
  });

  it('a Deferred entry followed by a LATER Auto-Corrected entry for the SAME case is resolved (excluded)', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0003', timestamp: '2026-01-01 10:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Auto-Corrected', caseId: 'S26-0003', timestamp: '2026-01-01 11:00:00' }),
    ];
    expect(resolveUnresolvedDriftCorrections(logs)).toHaveLength(0);
  });

  it('an Auto-Corrected entry BEFORE the Deferred entry does NOT resolve it — the retry has to come after the failure it retries', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Auto-Corrected', caseId: 'S26-0004', timestamp: '2026-01-01 09:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0004', timestamp: '2026-01-01 10:00:00' }),
    ];
    const result = resolveUnresolvedDriftCorrections(logs);
    expect(result).toHaveLength(1);
    expect(result[0].caseId).toBe('S26-0004');
  });

  it('a later Auto-Corrected entry for a DIFFERENT case does not resolve this case’s Deferred entry', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0005', timestamp: '2026-01-01 10:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Auto-Corrected', caseId: 'S26-0006', timestamp: '2026-01-01 11:00:00' }),
    ];
    const result = resolveUnresolvedDriftCorrections(logs);
    expect(result).toHaveLength(1);
    expect(result[0].caseId).toBe('S26-0005');
  });

  it('a bare Detected event (no Deferred/Failed) never appears in the unresolved list on its own', () => {
    const logs = [makeLog({ event: 'Post-Finalization Drift Detected', caseId: 'S26-0007' })];
    expect(resolveUnresolvedDriftCorrections(logs)).toHaveLength(0);
  });

  it('an entry with no caseId is never surfaced, even if otherwise Deferred/Failed', () => {
    const logs = [makeLog({ event: 'Post-Finalization Drift Correction Failed', caseId: null })];
    expect(resolveUnresolvedDriftCorrections(logs)).toHaveLength(0);
  });

  it('results are sorted newest-first by timestamp', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0008', timestamp: '2026-01-01 08:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Correction Failed', caseId: 'S26-0009', timestamp: '2026-01-03 08:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0010', timestamp: '2026-01-02 08:00:00' }),
    ];
    const result = resolveUnresolvedDriftCorrections(logs);
    expect(result.map(l => l.caseId)).toEqual(['S26-0009', 'S26-0010', 'S26-0008']);
  });

  it('a case with multiple deferred/failed attempts and only ONE later correction: only the retries before that correction are resolved', () => {
    const logs = [
      makeLog({ event: 'Post-Finalization Drift Correction Deferred', caseId: 'S26-0011', timestamp: '2026-01-01 08:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Auto-Corrected', caseId: 'S26-0011', timestamp: '2026-01-01 09:00:00' }),
      makeLog({ event: 'Post-Finalization Drift Correction Failed', caseId: 'S26-0011', timestamp: '2026-01-02 08:00:00' }),
    ];
    // The second failure happens AFTER the only correction on record, so it is not itself
    // followed by a later correction — it stays unresolved even though an earlier
    // correction exists for the same case.
    const result = resolveUnresolvedDriftCorrections(logs);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('2026-01-02 08:00:00');
  });

  it('an empty log list resolves to an empty unresolved list', () => {
    expect(resolveUnresolvedDriftCorrections([])).toEqual([]);
  });
});

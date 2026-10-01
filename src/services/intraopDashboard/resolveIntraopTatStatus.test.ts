// src/services/intraopDashboard/resolveIntraopTatStatus.test.ts
import { describe, it, expect } from 'vitest';
import { resolveIntraopTatStatus } from './resolveIntraopTatStatus';

describe('resolveIntraopTatStatus — real, per the RFP\'s own "standard 20-minute turnaround" example', () => {
  const NOW = new Date('2026-09-09T12:00:00.000Z');

  it('real, well within the target is normal', () => {
    const result = resolveIntraopTatStatus('2026-09-09T11:55:00.000Z', 20, 5, NOW);
    expect(result.status).toBe('normal');
    expect(result.elapsedMinutes).toBe(5);
  });

  it('real, within the warning window but not yet overdue is warning', () => {
    const result = resolveIntraopTatStatus('2026-09-09T11:44:00.000Z', 20, 5, NOW);
    expect(result.status).toBe('warning');
    expect(result.elapsedMinutes).toBe(16);
  });

  it('real, exactly at target is overdue, not a boundary grace period', () => {
    const result = resolveIntraopTatStatus('2026-09-09T11:40:00.000Z', 20, 5, NOW);
    expect(result.status).toBe('overdue');
  });

  it('real, well past target is overdue with a real, negative remaining value', () => {
    const result = resolveIntraopTatStatus('2026-09-09T11:30:00.000Z', 20, 5, NOW);
    expect(result.status).toBe('overdue');
    expect(result.remainingMinutes).toBe(-10);
  });

  it('real, a custom, real target/warning pair is honored instead of the default', () => {
    const result = resolveIntraopTatStatus('2026-09-09T11:39:00.000Z', 30, 10, NOW);
    expect(result.elapsedMinutes).toBe(21);
    expect(result.remainingMinutes).toBe(9);
    expect(result.status).toBe('warning');
  });
});

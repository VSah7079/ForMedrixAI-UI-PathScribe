import { describe, it, expect } from 'vitest';
import { resolveDismissalTatMetrics } from './resolveDismissalTatMetrics';

describe('resolveDismissalTatMetrics', () => {
  it('computes real dwell time (sign-off → dismissal) and total turnaround (arrival → sign-off)', () => {
    const result = resolveDismissalTatMetrics(
      { arrivalTimestamp: '2026-01-01T00:00:00.000Z', frozenDiagnosisRenderedAt: '2026-01-01T00:18:00.000Z' },
      new Date('2026-01-01T00:20:30.000Z').getTime(),
    );
    expect(result.totalTurnaroundMinutes).toBe(18);
    expect(result.dwellTimeOnBoardSeconds).toBe(150); // 2m30s dwell since sign-off
  });

  it('both metrics are undefined when the case is dismissed with no sign-off ever recorded', () => {
    const result = resolveDismissalTatMetrics(
      { arrivalTimestamp: '2026-01-01T00:00:00.000Z', frozenDiagnosisRenderedAt: undefined },
      new Date('2026-01-01T00:20:00.000Z').getTime(),
    );
    expect(result.dwellTimeOnBoardSeconds).toBeUndefined();
    expect(result.totalTurnaroundMinutes).toBeUndefined();
  });

  it('dwell time never goes negative, even if dismissed at (or fractionally before) the sign-off instant', () => {
    const result = resolveDismissalTatMetrics(
      { arrivalTimestamp: '2026-01-01T00:00:00.000Z', frozenDiagnosisRenderedAt: '2026-01-01T00:18:00.000Z' },
      new Date('2026-01-01T00:17:59.900Z').getTime(),
    );
    expect(result.dwellTimeOnBoardSeconds).toBe(0);
  });

  it('defaults dismissedAtMs to the real current time when not passed', () => {
    const almostNow = Date.now() - 5000;
    const result = resolveDismissalTatMetrics({
      arrivalTimestamp: new Date(almostNow - 20 * 60000).toISOString(),
      frozenDiagnosisRenderedAt: new Date(almostNow).toISOString(),
    });
    expect(result.dwellTimeOnBoardSeconds).toBeGreaterThanOrEqual(4);
    expect(result.dwellTimeOnBoardSeconds).toBeLessThan(15);
    expect(result.totalTurnaroundMinutes).toBe(20);
  });

  it('dwell seconds and turnaround minutes each round to the nearest whole unit', () => {
    const result = resolveDismissalTatMetrics(
      { arrivalTimestamp: '2026-01-01T00:00:00.000Z', frozenDiagnosisRenderedAt: '2026-01-01T00:18:30.000Z' },
      new Date('2026-01-01T00:18:30.600Z').getTime(),
    );
    expect(result.dwellTimeOnBoardSeconds).toBe(1); // 0.6s rounds up to 1
    expect(result.totalTurnaroundMinutes).toBe(19); // 18.5 min rounds up to 19
  });
});

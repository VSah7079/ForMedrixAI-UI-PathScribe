import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeSlaCountdown, formatSlaDuration, SLA_WARNING_MINUTES_BEFORE_TARGET } from './computeSlaCountdown';

describe('computeSlaCountdown', () => {
  afterEach(() => vi.useRealTimers());

  it('returns normal well before target', () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-17T12:00:00.000Z');
    vi.setSystemTime(now);
    const startedAt = new Date(now.getTime() - 10 * 60000).toISOString(); // 10m elapsed
    const result = computeSlaCountdown(startedAt, 240); // 4h target
    expect(result.state).toBe('normal');
    expect(result.elapsedMinutes).toBe(10);
    expect(result.remainingMinutes).toBe(230);
  });

  it('returns warning within the warning window before target', () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-17T12:00:00.000Z');
    vi.setSystemTime(now);
    const startedAt = new Date(now.getTime() - 215 * 60000).toISOString(); // 215m elapsed, 240 target -> 25 remaining
    const result = computeSlaCountdown(startedAt, 240);
    expect(result.remainingMinutes).toBe(25);
    expect(result.remainingMinutes).toBeLessThanOrEqual(SLA_WARNING_MINUTES_BEFORE_TARGET);
    expect(result.state).toBe('warning');
  });

  it('returns overdue once remaining hits zero or below', () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-17T12:00:00.000Z');
    vi.setSystemTime(now);
    const startedAt = new Date(now.getTime() - 300 * 60000).toISOString(); // 300m elapsed, 240 target
    const result = computeSlaCountdown(startedAt, 240);
    expect(result.remainingMinutes).toBe(-60);
    expect(result.state).toBe('overdue');
  });

  it('respects a custom warning window', () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-17T12:00:00.000Z');
    vi.setSystemTime(now);
    const startedAt = new Date(now.getTime() - 100 * 60000).toISOString(); // 100m elapsed, 120 target -> 20 remaining
    const result = computeSlaCountdown(startedAt, 120, 15);
    expect(result.remainingMinutes).toBe(20);
    expect(result.state).toBe('normal'); // 20 > custom 15-minute window
  });

  it('never returns a negative elapsedMinutes for a future startedAt', () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-17T12:00:00.000Z');
    vi.setSystemTime(now);
    const startedAt = new Date(now.getTime() + 5 * 60000).toISOString(); // 5m in the future — clock skew, never crash
    const result = computeSlaCountdown(startedAt, 60);
    expect(result.elapsedMinutes).toBe(0);
  });
});

describe('formatSlaDuration', () => {
  it('formats minutes-only durations', () => {
    expect(formatSlaDuration(45)).toBe('45m');
  });

  it('formats hour-only durations', () => {
    expect(formatSlaDuration(120)).toBe('2h');
  });

  it('formats combined hour+minute durations', () => {
    expect(formatSlaDuration(125)).toBe('2h 5m');
  });

  it('formats negative (overdue) durations by absolute value', () => {
    expect(formatSlaDuration(-95)).toBe('1h 35m');
  });
});

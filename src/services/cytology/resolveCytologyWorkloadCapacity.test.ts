// src/services/cytology/resolveCytologyWorkloadCapacity.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyWorkloadCapacity } from './resolveCytologyWorkloadCapacity';

describe('resolveCytologyWorkloadCapacity — real, per direct guidance\'s own CLIA prorated-cap formula', () => {
  it('a real, full 8-hour day at the real, standard 100 cap allows exactly 100 SCU — landing exactly at the cap is not exceeded, though it is genuinely at 100% utilization', () => {
    const result = resolveCytologyWorkloadCapacity(100, 8, 100);
    expect(result.maxAllowedScu).toBe(100);
    expect(result.status).not.toBe('exceeded');
  });

  it('a real, half-day (4 hours) prorates the real cap to exactly half, with real headroom below the soft-brake threshold', () => {
    const result = resolveCytologyWorkloadCapacity(30, 4, 100);
    expect(result.maxAllowedScu).toBe(50);
    expect(result.status).toBe('ok');
  });

  it('a real, lower medical-director-assigned cap (80) prorates correctly too', () => {
    const result = resolveCytologyWorkloadCapacity(20, 4, 80);
    expect(result.maxAllowedScu).toBe(40);
    expect(result.status).toBe('ok');
  });

  it('landing EXACTLY on the real cap is never "exceeded" — a strict greater-than boundary, per direct guidance\'s own formula — though it is correctly flagged "approaching" at 100% utilization', () => {
    const result = resolveCytologyWorkloadCapacity(50, 4, 100);
    expect(result.status).toBe('approaching');
  });

  it('a real candidate total genuinely over the cap is exceeded', () => {
    const result = resolveCytologyWorkloadCapacity(50.5, 4, 100);
    expect(result.status).toBe('exceeded');
  });

  it('the real, 85% soft-brake threshold triggers "approaching" before genuinely exceeding', () => {
    const result = resolveCytologyWorkloadCapacity(43, 4, 100); // 43/50 = 86%
    expect(result.status).toBe('approaching');
  });

  it('below the real 85% threshold is genuinely ok', () => {
    const result = resolveCytologyWorkloadCapacity(40, 4, 100); // 40/50 = 80%
    expect(result.status).toBe('ok');
  });

  it('a real, first review of the day (zero prior completed SCU, but non-zero active time from the current session) still gets a real, non-zero allowance — never blocked before any work is even recorded', () => {
    const result = resolveCytologyWorkloadCapacity(1.0, 0.1, 100); // 6 real minutes into the very first slide
    expect(result.maxAllowedScu).toBeGreaterThan(0);
    expect(result.status).toBe('ok');
  });

  it('genuinely zero active time and zero candidate SCU is a real, safe "ok" — not a NaN or a false violation', () => {
    const result = resolveCytologyWorkloadCapacity(0, 0, 100);
    expect(result.status).toBe('ok');
    expect(Number.isNaN(result.utilizationPercent)).toBe(false);
  });
});

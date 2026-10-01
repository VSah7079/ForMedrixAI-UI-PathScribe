// src/services/cytology/resolveCytologyQcPoolMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyQcPoolMembership } from './resolveCytologyQcPoolMembership';

const FLAG_RANDOM = { reason: 'random_selection' as const, flaggedBy: 'PATH-001', flaggedByName: 'Pete Nimmo', flaggedAt: '2026-09-01T00:00:00.000Z' };
const FLAG_TARGETED = { reason: 'targeted_high_risk' as const, flaggedBy: 'PATH-001', flaggedByName: 'Pete Nimmo', flaggedAt: '2026-09-01T00:00:00.000Z' };

describe('resolveCytologyQcPoolMembership', () => {
  it('no real qcFlag at all is never a QC pool member', () => {
    expect(resolveCytologyQcPoolMembership(undefined, [])).toBe(false);
  });

  it('a real random-selection flag with no reviews yet stays a pool member', () => {
    expect(resolveCytologyQcPoolMembership(FLAG_RANDOM, [])).toBe(true);
  });

  it('a real random-selection flag is cleared by a matching qc_random_selection review', () => {
    expect(resolveCytologyQcPoolMembership(FLAG_RANDOM, [{ role: 'qc_random_selection' }])).toBe(false);
  });

  it('a real random-selection flag is NOT cleared by a targeted-high-risk review — genuinely different real obligations', () => {
    expect(resolveCytologyQcPoolMembership(FLAG_RANDOM, [{ role: 'qc_targeted_high_risk' }])).toBe(true);
  });

  it('a real targeted-high-risk flag is cleared by a matching qc_targeted_high_risk review', () => {
    expect(resolveCytologyQcPoolMembership(FLAG_TARGETED, [{ role: 'qc_targeted_high_risk' }])).toBe(false);
  });

  it('a real targeted-high-risk flag is NOT cleared by a random-selection review', () => {
    expect(resolveCytologyQcPoolMembership(FLAG_TARGETED, [{ role: 'qc_random_selection' }])).toBe(true);
  });

  it('a real primary_screen review alone never clears any QC flag', () => {
    expect(resolveCytologyQcPoolMembership(FLAG_RANDOM, [{ role: 'primary_screen' }])).toBe(true);
    expect(resolveCytologyQcPoolMembership(FLAG_TARGETED, [{ role: 'primary_screen' }])).toBe(true);
  });
});

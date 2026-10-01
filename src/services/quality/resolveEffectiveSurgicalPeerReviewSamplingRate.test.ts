import { describe, it, expect } from 'vitest';
import { resolveEffectiveSurgicalPeerReviewSamplingRate } from './resolveEffectiveSurgicalPeerReviewSamplingRate';
import type { QaSubspecialtyRiskWeight } from '@/types/quality/QaSubspecialtyRiskWeight';

const weights: QaSubspecialtyRiskWeight[] = [
  { id: 'w1', subspecialtyId: 'sub-gi', multiplier: 3, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'u1' },
  { id: 'w2', subspecialtyId: 'sub-derm', multiplier: 2, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'u1' },
];

describe('resolveEffectiveSurgicalPeerReviewSamplingRate', () => {
  it('never samples when the base rate is undefined, zero, or negative, regardless of weight', () => {
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(undefined, weights, 'sub-gi')).toBe(0);
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(0, weights, 'sub-gi')).toBe(0);
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(-5, weights, 'sub-gi')).toBe(0);
  });

  it('uses a 1x (unweighted) multiplier for a case with no known subspecialty', () => {
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(10, weights, undefined)).toBe(10);
  });

  it('uses a 1x (unweighted) multiplier for a subspecialty with no configured weight', () => {
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(10, weights, 'sub-unconfigured')).toBe(10);
  });

  it('applies the real, configured multiplier for a weighted subspecialty', () => {
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(10, weights, 'sub-gi')).toBe(30);
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(10, weights, 'sub-derm')).toBe(20);
  });

  it('clamps the effective rate to 100 rather than a nonsensical >100% probability', () => {
    expect(resolveEffectiveSurgicalPeerReviewSamplingRate(50, weights, 'sub-gi')).toBe(100);
  });
});

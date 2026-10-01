import { describe, it, expect } from 'vitest';
import { resolveSurgicalBiopsyToResectionCorrelationPoolMembership } from './resolveSurgicalBiopsyToResectionCorrelationPoolMembership';

describe('resolveSurgicalBiopsyToResectionCorrelationPoolMembership', () => {
  it('is false with no candidates at all', () => {
    expect(resolveSurgicalBiopsyToResectionCorrelationPoolMembership(undefined)).toBe(false);
    expect(resolveSurgicalBiopsyToResectionCorrelationPoolMembership([])).toBe(false);
  });

  it('is true when at least one candidate is neither recorded nor dismissed', () => {
    expect(resolveSurgicalBiopsyToResectionCorrelationPoolMembership([
      { candidateCaseId: 'c1', candidateSpecimenId: 's1', detectedAt: '2026-01-01T00:00:00.000Z', siteMatchStatus: 'matched' },
    ])).toBe(true);
  });

  it('is false once every candidate is either recorded or dismissed', () => {
    expect(resolveSurgicalBiopsyToResectionCorrelationPoolMembership([
      { candidateCaseId: 'c1', candidateSpecimenId: 's1', detectedAt: '2026-01-01T00:00:00.000Z', siteMatchStatus: 'matched', recordedActivityRecordId: 'qa-rec-1' },
      { candidateCaseId: 'c2', candidateSpecimenId: 's2', detectedAt: '2026-01-01T00:00:00.000Z', siteMatchStatus: 'unknown', dismissedAsNotRelevant: true },
    ])).toBe(false);
  });
});

// src/services/cytology/resolveCytologyHistologyCorrelationPoolMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHistologyCorrelationPoolMembership } from './resolveCytologyHistologyCorrelationPoolMembership';

describe('resolveCytologyHistologyCorrelationPoolMembership — real, per direct guidance (CYT-QA-04)', () => {
  it('a real specimen with no candidates at all is never a member', () => {
    expect(resolveCytologyHistologyCorrelationPoolMembership(undefined)).toBe(false);
    expect(resolveCytologyHistologyCorrelationPoolMembership([])).toBe(false);
  });

  it('a real, unrecorded candidate IS a member — still awaiting a real reviewer\'s correlation', () => {
    const candidates = [{ candidateCaseId: 'c2', detectedAt: '2026-01-01T00:00:00.000Z' }];
    expect(resolveCytologyHistologyCorrelationPoolMembership(candidates)).toBe(true);
  });

  it('a real specimen whose only candidate has already been recorded is correctly cleared', () => {
    const candidates = [{ candidateCaseId: 'c2', detectedAt: '2026-01-01T00:00:00.000Z', recordedActivityRecordId: 'qa-rec-1' }];
    expect(resolveCytologyHistologyCorrelationPoolMembership(candidates)).toBe(false);
  });

  it('a real specimen with multiple candidates remains a member as long as ANY one is still unrecorded', () => {
    const candidates = [
      { candidateCaseId: 'c2', detectedAt: '2026-01-01T00:00:00.000Z', recordedActivityRecordId: 'qa-rec-1' },
      { candidateCaseId: 'c3', detectedAt: '2026-02-01T00:00:00.000Z' },
    ];
    expect(resolveCytologyHistologyCorrelationPoolMembership(candidates)).toBe(true);
  });

  it('a real candidate dismissed as not relevant is correctly cleared — the same real resolution as an actually-recorded correlation', () => {
    const candidates = [{ candidateCaseId: 'c2', detectedAt: '2026-01-01T00:00:00.000Z', dismissedAsNotRelevant: true }];
    expect(resolveCytologyHistologyCorrelationPoolMembership(candidates)).toBe(false);
  });
});

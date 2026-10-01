import { describe, it, expect } from 'vitest';
import { resolveSurgicalBiopsyToResectionCorrelationCandidates, type SurgicalBiopsySpecimenInfo } from './resolveSurgicalBiopsyToResectionCorrelationCandidates';

function spec(overrides: Partial<SurgicalBiopsySpecimenInfo> & Pick<SurgicalBiopsySpecimenInfo, 'caseId' | 'specimenId' | 'receivedAt'>): SurgicalBiopsySpecimenInfo {
  return { ...overrides };
}

describe('resolveSurgicalBiopsyToResectionCorrelationCandidates - time window + patient scoping', () => {
  it('flags a same-patient pair within the window as a candidate', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const result = resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180);
    expect(result).toEqual([{ earlierCaseId: 'case-1', earlierSpecimenId: 'spec-1', laterCaseId: 'case-2', laterSpecimenId: 'spec-2', siteMatchStatus: 'unknown' }]);
  });

  it('never flags a pair outside the configured window', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-12-01T00:00:00.000Z' }),
    ];
    expect(resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180)).toEqual([]);
  });

  it('never flags two specimens belonging to the same case against each other', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z' }),
      spec({ caseId: 'case-1', specimenId: 'spec-2', receivedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    expect(resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180)).toEqual([]);
  });

  it('pairs every eligible combination when more than two specimens fall in the window', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-01-15T00:00:00.000Z' }),
      spec({ caseId: 'case-3', specimenId: 'spec-3', receivedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const result = resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180);
    expect(result).toHaveLength(3); // (1,2) (1,3) (2,3)
  });
});

describe('resolveSurgicalBiopsyToResectionCorrelationCandidates - anatomic site/laterality false-positive prevention', () => {
  it('excludes a pair with a real, recorded site mismatch — the real false-positive-prevention case this ticket exists for', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z', bodySite: 'Breast' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-02-01T00:00:00.000Z', bodySite: 'Colon' }),
    ];
    expect(resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180)).toEqual([]);
  });

  it('includes a pair with matching site, marked "matched"', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z', bodySite: 'Breast' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-02-01T00:00:00.000Z', bodySite: 'breast' }),
    ];
    const result = resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180);
    expect(result[0].siteMatchStatus).toBe('matched');
  });

  it('excludes a pair with matching site but a real laterality mismatch', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z', bodySite: 'Breast', laterality: 'Left' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-02-01T00:00:00.000Z', bodySite: 'Breast', laterality: 'Right' }),
    ];
    expect(resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180)).toEqual([]);
  });

  it('never excludes a pair just because one specimen has no site recorded — missing data is not evidence of a mismatch', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z', bodySite: 'Breast' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const result = resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180);
    expect(result).toHaveLength(1);
    expect(result[0].siteMatchStatus).toBe('unknown');
  });

  it('a matching site but only one specimen carrying laterality is still "matched", not penalized for the missing side', () => {
    const specimens = [
      spec({ caseId: 'case-1', specimenId: 'spec-1', receivedAt: '2026-01-01T00:00:00.000Z', bodySite: 'Breast', laterality: 'Left' }),
      spec({ caseId: 'case-2', specimenId: 'spec-2', receivedAt: '2026-02-01T00:00:00.000Z', bodySite: 'Breast' }),
    ];
    const result = resolveSurgicalBiopsyToResectionCorrelationCandidates(specimens, 180);
    expect(result[0].siteMatchStatus).toBe('matched');
  });
});

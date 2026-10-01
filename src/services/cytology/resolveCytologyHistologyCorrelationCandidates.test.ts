// src/services/cytology/resolveCytologyHistologyCorrelationCandidates.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHistologyCorrelationCandidates } from './resolveCytologyHistologyCorrelationCandidates';

const review = (id: string, caseId: string, specimenId: string, diagnosticRank: number | undefined, recordedAt: string) => ({
  id, caseId, specimenId, diagnosticRank, recordedAt,
});

const otherCase = (caseId: string, hasNonCytologySpecimen: boolean, earliestSpecimenReceivedAt: string | undefined) => ({
  caseId, hasNonCytologySpecimen, earliestSpecimenReceivedAt,
});

describe('resolveCytologyHistologyCorrelationCandidates — real, per direct guidance (CYT-QA-04)', () => {
  it('a real, genuinely negative cytology finding (rank 0) produces no candidates — CAP\'s own correlation requirement is for abnormal findings', () => {
    const reviews = [review('r1', 'c1', 'sp1', 0, '2026-01-01T00:00:00.000Z')];
    const others = [otherCase('c2', true, '2026-02-01T00:00:00.000Z')];
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others)).toHaveLength(0);
  });

  it('a real, genuinely unresolvable diagnostic rank produces no candidates', () => {
    const reviews = [review('r1', 'c1', 'sp1', undefined, '2026-01-01T00:00:00.000Z')];
    const others = [otherCase('c2', true, '2026-02-01T00:00:00.000Z')];
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others)).toHaveLength(0);
  });

  it('a real ASC-US (rank 1) finding correctly produces a candidate against a real, subsequent non-cytology case within the window', () => {
    const reviews = [review('r1', 'c1', 'sp1', 1, '2026-01-01T00:00:00.000Z')];
    const others = [otherCase('c2', true, '2026-02-01T00:00:00.000Z')];
    const result = resolveCytologyHistologyCorrelationCandidates(reviews, others);
    expect(result).toHaveLength(1);
    expect(result[0].candidateCaseId).toBe('c2');
  });

  it('a real, subsequent case with NO non-cytology specimen is correctly excluded — never a candidate against another cytology-only case', () => {
    const reviews = [review('r1', 'c1', 'sp1', 4, '2026-01-01T00:00:00.000Z')];
    const others = [otherCase('c2', false, '2026-02-01T00:00:00.000Z')];
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others)).toHaveLength(0);
  });

  it('a real, subsequent case OUTSIDE the real window (default 180 days) is correctly excluded', () => {
    const reviews = [review('r1', 'c1', 'sp1', 4, '2026-01-01T00:00:00.000Z')];
    const others = [otherCase('c2', true, '2026-08-01T00:00:00.000Z')]; // ~212 days later
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others)).toHaveLength(0);
  });

  it('a real, subsequent case BEFORE the cytology finding is correctly excluded — correlation only looks forward in time', () => {
    const reviews = [review('r1', 'c1', 'sp1', 4, '2026-03-01T00:00:00.000Z')];
    const others = [otherCase('c2', true, '2026-01-01T00:00:00.000Z')];
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others)).toHaveLength(0);
  });

  it('a real, custom window is honored when explicitly provided', () => {
    const reviews = [review('r1', 'c1', 'sp1', 4, '2026-01-01T00:00:00.000Z')];
    const others = [otherCase('c2', true, '2026-01-15T00:00:00.000Z')];
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others, 30)).toHaveLength(1);
    expect(resolveCytologyHistologyCorrelationCandidates(reviews, others, 7)).toHaveLength(0);
  });

  it('multiple real, distinct abnormal reviews each independently produce their own real candidates', () => {
    const reviews = [
      review('r1', 'c1', 'sp1', 1, '2026-01-01T00:00:00.000Z'),
      review('r2', 'c3', 'sp3', 4, '2026-01-05T00:00:00.000Z'),
    ];
    const others = [
      otherCase('c2', true, '2026-01-10T00:00:00.000Z'),
      otherCase('c4', true, '2026-01-20T00:00:00.000Z'),
    ];
    const result = resolveCytologyHistologyCorrelationCandidates(reviews, others);
    expect(result).toHaveLength(4); // both cytology findings each candidate-match both subsequent cases
  });
});

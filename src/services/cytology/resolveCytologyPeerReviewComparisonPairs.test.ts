// src/services/cytology/resolveCytologyPeerReviewComparisonPairs.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyPeerReviewComparisonPairs } from './resolveCytologyPeerReviewComparisonPairs';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const review = (id: string, specimenId: string, caseId: string, role: CytologyReviewRecord['role'], recordedAt: string): CytologyReviewRecord => ({
  id, specimenId, caseId, role, primaryInterpretationId: 'nilm', recordedAt,
  recordedBy: { userId: 'u1', userName: 'Test User' },
} as CytologyReviewRecord);

describe('resolveCytologyPeerReviewComparisonPairs — real, per direct follow-up ("continue to the comparison displays")', () => {
  it('a real pair forms between the specimen\'s own Final Diagnosis review (whatever role it happens to be) and its real peer review', () => {
    const reviews = [
      review('r1', 'sp1', 'c1', 'primary_screen', '2026-01-01T00:00:00.000Z'),
      review('r2', 'sp1', 'c1', 'post_signout_peer_review_random', '2026-02-01T00:00:00.000Z'),
    ];
    const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, [{ specimenId: 'sp1', caseId: 'c1', finalDiagnosisReviewRecordId: 'r1' }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].initial.id).toBe('r1');
    expect(pairs[0].followUp.id).toBe('r2');
  });

  it('the "initial" side is genuinely role-agnostic — a pathologist_review Final Diagnosis pairs correctly too, not just primary_screen', () => {
    const reviews = [
      review('r1', 'sp1', 'c1', 'pathologist_review', '2026-01-01T00:00:00.000Z'),
      review('r2', 'sp1', 'c1', 'post_signout_peer_review_targeted', '2026-02-01T00:00:00.000Z'),
    ];
    const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, [{ specimenId: 'sp1', caseId: 'c1', finalDiagnosisReviewRecordId: 'r1' }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].initial.role).toBe('pathologist_review');
  });

  it('a real specimen with no real peer review on file yet contributes no pair — never fabricated', () => {
    const reviews = [review('r1', 'sp1', 'c1', 'primary_screen', '2026-01-01T00:00:00.000Z')];
    const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, [{ specimenId: 'sp1', caseId: 'c1', finalDiagnosisReviewRecordId: 'r1' }]);
    expect(pairs).toHaveLength(0);
  });

  it('a real, dangling final-diagnosis reference (the referenced review no longer exists) is honestly skipped, never crashes', () => {
    const reviews = [review('r2', 'sp1', 'c1', 'post_signout_peer_review_random', '2026-02-01T00:00:00.000Z')];
    const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, [{ specimenId: 'sp1', caseId: 'c1', finalDiagnosisReviewRecordId: 'r-does-not-exist' }]);
    expect(pairs).toHaveLength(0);
  });

  it('when more than one real peer review exists for the same specimen, the most recently recorded one wins', () => {
    const reviews = [
      review('r1', 'sp1', 'c1', 'primary_screen', '2026-01-01T00:00:00.000Z'),
      review('r2', 'sp1', 'c1', 'post_signout_peer_review_random', '2026-02-01T00:00:00.000Z'),
      review('r3', 'sp1', 'c1', 'post_signout_peer_review_random', '2026-03-01T00:00:00.000Z'),
    ];
    const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, [{ specimenId: 'sp1', caseId: 'c1', finalDiagnosisReviewRecordId: 'r1' }]);
    expect(pairs[0].followUp.id).toBe('r3');
  });

  it('multiple real specimens each resolve their own independent real pair', () => {
    const reviews = [
      review('r1', 'sp1', 'c1', 'primary_screen', '2026-01-01T00:00:00.000Z'),
      review('r2', 'sp1', 'c1', 'post_signout_peer_review_random', '2026-02-01T00:00:00.000Z'),
      review('r3', 'sp2', 'c2', 'pathologist_review', '2026-01-01T00:00:00.000Z'),
      review('r4', 'sp2', 'c2', 'post_signout_peer_review_targeted', '2026-02-01T00:00:00.000Z'),
    ];
    const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, [
      { specimenId: 'sp1', caseId: 'c1', finalDiagnosisReviewRecordId: 'r1' },
      { specimenId: 'sp2', caseId: 'c2', finalDiagnosisReviewRecordId: 'r3' },
    ]);
    expect(pairs).toHaveLength(2);
  });
});

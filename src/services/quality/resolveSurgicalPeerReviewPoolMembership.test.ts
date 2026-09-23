import { describe, it, expect } from 'vitest';
import { resolveSurgicalPeerReviewPoolMembership } from './resolveSurgicalPeerReviewPoolMembership';

describe('resolveSurgicalPeerReviewPoolMembership', () => {
  it('is false when no flag was ever set', () => {
    expect(resolveSurgicalPeerReviewPoolMembership(undefined)).toBe(false);
    expect(resolveSurgicalPeerReviewPoolMembership({})).toBe(false);
  });

  it('is true when flagged and not yet recorded', () => {
    expect(resolveSurgicalPeerReviewPoolMembership({
      postSignOutPeerReviewFlag: { reason: 'random_selection', flaggedAt: '2026-01-01T00:00:00.000Z' },
    })).toBe(true);
  });

  it('is false once a real QaActivityRecord has been recorded against this flag', () => {
    expect(resolveSurgicalPeerReviewPoolMembership({
      postSignOutPeerReviewFlag: { reason: 'targeted_high_risk', flaggedAt: '2026-01-01T00:00:00.000Z' },
      peerReviewRecordedActivityRecordId: 'qa-rec-1',
    })).toBe(false);
  });
});

// src/services/cytology/resolveCytologyPostSignOutPeerReviewPoolMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyPostSignOutPeerReviewPoolMembership } from './resolveCytologyPostSignOutPeerReviewPoolMembership';

describe('resolveCytologyPostSignOutPeerReviewPoolMembership — real, mirroring the established pre-sign-out QC pool pattern exactly', () => {
  it('a real specimen with no flag at all is never a member', () => {
    expect(resolveCytologyPostSignOutPeerReviewPoolMembership(undefined, [])).toBe(false);
  });

  it('a real random-selection flag with no matching real review yet remains a member', () => {
    const flag = { reason: 'random_selection' as const, flaggedBy: 'system', flaggedByName: 'Automatic', flaggedAt: '2026-09-06T00:00:00.000Z' };
    expect(resolveCytologyPostSignOutPeerReviewPoolMembership(flag, [])).toBe(true);
  });

  it('a real random-selection flag IS cleared by a matching real post_signout_peer_review_random review', () => {
    const flag = { reason: 'random_selection' as const, flaggedBy: 'system', flaggedByName: 'Automatic', flaggedAt: '2026-09-06T00:00:00.000Z' };
    expect(resolveCytologyPostSignOutPeerReviewPoolMembership(flag, [{ role: 'post_signout_peer_review_random' }])).toBe(false);
  });

  it('a real random-selection flag is NOT cleared by a targeted review — the two real obligations are never cross-cleared', () => {
    const flag = { reason: 'random_selection' as const, flaggedBy: 'system', flaggedByName: 'Automatic', flaggedAt: '2026-09-06T00:00:00.000Z' };
    expect(resolveCytologyPostSignOutPeerReviewPoolMembership(flag, [{ role: 'post_signout_peer_review_targeted' }])).toBe(true);
  });

  it('a real targeted-high-risk flag IS cleared by a matching real post_signout_peer_review_targeted review', () => {
    const flag = { reason: 'targeted_high_risk' as const, flaggedBy: 'system', flaggedByName: 'Automatic', flaggedAt: '2026-09-06T00:00:00.000Z' };
    expect(resolveCytologyPostSignOutPeerReviewPoolMembership(flag, [{ role: 'post_signout_peer_review_targeted' }])).toBe(false);
  });

  it('a real targeted-high-risk flag is NOT cleared by a random-selection review', () => {
    const flag = { reason: 'targeted_high_risk' as const, flaggedBy: 'system', flaggedByName: 'Automatic', flaggedAt: '2026-09-06T00:00:00.000Z' };
    expect(resolveCytologyPostSignOutPeerReviewPoolMembership(flag, [{ role: 'post_signout_peer_review_random' }])).toBe(true);
  });
});

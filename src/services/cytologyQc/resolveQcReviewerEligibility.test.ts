import { describe, it, expect } from 'vitest';
import { resolveQcReviewerEligibility } from './resolveQcReviewerEligibility';

describe('resolveQcReviewerEligibility', () => {
  it('a real, different reviewer is genuinely eligible', () => {
    expect(resolveQcReviewerEligibility('prov-2', 'prov-1')).toBe(true);
  });

  it('the real primary sign-out provider is never eligible to review their own case, per spec\'s own hard Self-Review Prevention rule', () => {
    expect(resolveQcReviewerEligibility('prov-1', 'prov-1')).toBe(false);
  });
});

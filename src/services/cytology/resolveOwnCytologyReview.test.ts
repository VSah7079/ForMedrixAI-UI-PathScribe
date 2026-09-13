// src/services/cytology/resolveOwnCytologyReview.test.ts
import { describe, it, expect } from 'vitest';
import { resolveOwnCytologyReview } from './resolveOwnCytologyReview';

const rec = (userId: string, recordedAt: string) => ({ recordedBy: { userId, userName: 'X' }, recordedAt });

describe('resolveOwnCytologyReview — real, per direct correction', () => {
  it('no reviews at all: undefined', () => {
    expect(resolveOwnCytologyReview([], 'PATH-001')).toBeUndefined();
  });

  it('reviews exist but none by the current user: undefined — they genuinely have no own review here', () => {
    const reviews = [rec('PATH-002', '2026-09-01T00:00:00.000Z')];
    expect(resolveOwnCytologyReview(reviews, 'PATH-001')).toBeUndefined();
  });

  it('exactly one review by the current user: that one is returned', () => {
    const own = rec('PATH-001', '2026-09-01T00:00:00.000Z');
    const reviews = [rec('PATH-002', '2026-09-02T00:00:00.000Z'), own];
    expect(resolveOwnCytologyReview(reviews, 'PATH-001')).toBe(own);
  });

  it('multiple reviews by the current user: the real, MOST RECENT one wins, never the oldest', () => {
    const older = rec('PATH-001', '2026-09-01T00:00:00.000Z');
    const newer = rec('PATH-001', '2026-09-03T00:00:00.000Z');
    const reviews = [older, rec('PATH-002', '2026-09-02T00:00:00.000Z'), newer];
    expect(resolveOwnCytologyReview(reviews, 'PATH-001')).toBe(newer);
  });
});

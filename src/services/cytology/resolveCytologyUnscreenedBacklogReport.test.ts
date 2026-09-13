// src/services/cytology/resolveCytologyUnscreenedBacklogReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyUnscreenedBacklogReport } from './resolveCytologyUnscreenedBacklogReport';

const NOW = new Date('2026-09-06T12:00:00.000Z');

describe('resolveCytologyUnscreenedBacklogReport — real, per direct guidance\'s own US-QA-02 specification', () => {
  it('a real specimen with no review yet correctly resolves to unscreened', () => {
    const [row] = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-06T00:00:00.000Z', hasAnyReview: false }], NOW,
    );
    expect(row.currentStatus).toBe('unscreened');
  });

  it('a real specimen with at least one review already recorded correctly resolves to pending_path_review', () => {
    const [row] = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-06T00:00:00.000Z', hasAnyReview: true }], NOW,
    );
    expect(row.currentStatus).toBe('pending_path_review');
  });

  it('elapsed hours are correctly computed from the real received date to the given "now"', () => {
    const [row] = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-04T12:00:00.000Z', hasAnyReview: false }], NOW,
    );
    expect(row.elapsedHours).toBeCloseTo(48, 1);
  });

  it('a real specimen with no receivedAt at all gets an honest undefined elapsedHours, never a fabricated number', () => {
    const [row] = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', hasAnyReview: false }], NOW,
    );
    expect(row.elapsedHours).toBeUndefined();
    expect(row.tatExceeded).toBe(false);
  });

  it('the real, default 48-hour TAT threshold is correctly applied', () => {
    const overThreshold = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-04T00:00:00.000Z', hasAnyReview: false }], NOW,
    );
    expect(overThreshold[0].tatExceeded).toBe(true);

    const underThreshold = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-05T00:00:00.000Z', hasAnyReview: false }], NOW,
    );
    expect(underThreshold[0].tatExceeded).toBe(false);
  });

  it('a real, custom TAT threshold is honored when explicitly provided', () => {
    const [row] = resolveCytologyUnscreenedBacklogReport(
      [{ caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-06T00:00:00.000Z', hasAnyReview: false }], NOW, 6,
    );
    expect(row.tatExceeded).toBe(true); // 12 real hours elapsed, over a real 6-hour threshold
  });

  it('real, multiple specimens each resolve their own independent real row', () => {
    const rows = resolveCytologyUnscreenedBacklogReport(
      [
        { caseId: 'c1', specimenId: 'sp1', receivedAt: '2026-09-06T00:00:00.000Z', hasAnyReview: false },
        { caseId: 'c2', specimenId: 'sp2', receivedAt: '2026-09-01T00:00:00.000Z', hasAnyReview: true },
      ], NOW,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].tatExceeded).toBe(true);
  });
});

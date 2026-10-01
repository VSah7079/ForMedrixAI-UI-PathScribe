// src/services/cases/fppeEndCondition.test.ts
import { describe, it, expect } from 'vitest';
import { computeFppeProgress } from './fppeEndCondition';
import type { FppeAssignment } from '@/types/case/FppeAssignment';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function makeAssignment(over: Partial<FppeAssignment> = {}): FppeAssignment {
  return {
    id: 'fppe-1',
    provisionalUserId: 'user-1', provisionalUserName: 'Dr. New Hire',
    proctorUserId: 'user-2', proctorUserName: 'Dr. Proctor',
    facilityId: 'facility-1',
    startedAt: daysAgoIso(10),
    endCondition: { type: 'case_count', threshold: 20 },
    casesReviewedCount: 5,
    status: 'active',
    ...over,
  };
}

describe('computeFppeProgress', () => {
  it('case_count condition: fraction and met derive from casesReviewedCount / threshold', () => {
    const notMet = computeFppeProgress(makeAssignment({ endCondition: { type: 'case_count', threshold: 20 }, casesReviewedCount: 5 }));
    expect(notMet.byCasesFraction).toBeCloseTo(0.25);
    expect(notMet.byDurationFraction).toBeNull();
    expect(notMet.fraction).toBeCloseTo(0.25);
    expect(notMet.met).toBe(false);

    const met = computeFppeProgress(makeAssignment({ endCondition: { type: 'case_count', threshold: 20 }, casesReviewedCount: 20 }));
    expect(met.met).toBe(true);

    const overMet = computeFppeProgress(makeAssignment({ endCondition: { type: 'case_count', threshold: 20 }, casesReviewedCount: 25 }));
    expect(overMet.fraction).toBeCloseTo(1.25);
    expect(overMet.met).toBe(true);
  });

  it('duration_days condition: fraction and met derive from real elapsed days / threshold', () => {
    const notMet = computeFppeProgress(makeAssignment({ endCondition: { type: 'duration_days', threshold: 90 }, startedAt: daysAgoIso(30) }));
    expect(notMet.byCasesFraction).toBeNull();
    expect(notMet.byDurationFraction).toBeCloseTo(30 / 90, 2);
    expect(notMet.met).toBe(false);

    const met = computeFppeProgress(makeAssignment({ endCondition: { type: 'duration_days', threshold: 90 }, startedAt: daysAgoIso(91) }));
    expect(met.met).toBe(true);
  });

  it("either condition: fraction is the LARGER of the two — whichever threshold is closer to being hit first", () => {
    // Cases ahead of duration.
    const casesAhead = computeFppeProgress(makeAssignment({
      endCondition: { type: 'either', caseCountThreshold: 20, durationDaysThreshold: 90 },
      casesReviewedCount: 18, startedAt: daysAgoIso(10),
    }));
    expect(casesAhead.byCasesFraction).toBeCloseTo(0.9);
    expect(casesAhead.byDurationFraction).toBeCloseTo(10 / 90, 2);
    expect(casesAhead.fraction).toBeCloseTo(0.9);
    expect(casesAhead.met).toBe(false);

    // Duration ahead of cases.
    const durationAhead = computeFppeProgress(makeAssignment({
      endCondition: { type: 'either', caseCountThreshold: 20, durationDaysThreshold: 90 },
      casesReviewedCount: 2, startedAt: daysAgoIso(85),
    }));
    expect(durationAhead.fraction).toBeCloseTo(85 / 90, 2);

    // Either threshold crossed → met, even if the other lags behind.
    const metByCases = computeFppeProgress(makeAssignment({
      endCondition: { type: 'either', caseCountThreshold: 20, durationDaysThreshold: 90 },
      casesReviewedCount: 20, startedAt: daysAgoIso(5),
    }));
    expect(metByCases.met).toBe(true);

    const metByDuration = computeFppeProgress(makeAssignment({
      endCondition: { type: 'either', caseCountThreshold: 20, durationDaysThreshold: 90 },
      casesReviewedCount: 3, startedAt: daysAgoIso(90),
    }));
    expect(metByDuration.met).toBe(true);
  });

  it('daysSinceStart reflects real elapsed time regardless of end-condition type', () => {
    const p = computeFppeProgress(makeAssignment({ startedAt: daysAgoIso(7) }));
    expect(p.daysSinceStart).toBeGreaterThan(6.9);
    expect(p.daysSinceStart).toBeLessThan(7.1);
  });
});

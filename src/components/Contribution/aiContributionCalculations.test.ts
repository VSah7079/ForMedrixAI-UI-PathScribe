// src/components/Contribution/aiContributionCalculations.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeAiAcceptanceSummary, buildAcceptanceTrend, averageRate, computePeriodFraction,
  scaleForPeriod, scaleForPeriodWithFloor, scaleBreakdownForPeriod, scaleComparisonForPeriod,
  deriveOverriddenCases, deriveBreakdownFromSpecimens, humanizeSubspecialtyId,
} from './aiContributionCalculations';
import type { AiFeedbackEntry } from '@/services/cases/mockCaseService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';

function makeFeedback(over: Partial<AiFeedbackEntry> = {}): AiFeedbackEntry {
  return {
    timestamp: '2026-04-01T12:00:00.000Z', caseId: 'S26-1', instanceId: 'inst-1', templateId: 'tmpl-1',
    fieldId: 'field-1', fieldLabel: 'Diagnosis', aiValue: 'Benign', aiConfidence: 90, userValue: 'Benign',
    action: 'confirmed', source: 'synoptic', userId: 'user-1',
    ...over,
  } as AiFeedbackEntry;
}

function makeSpecimen(over: Partial<SpecimenEntry> = {}): SpecimenEntry {
  return { id: 'sp-1', name: 'Breast Core Bx', active: true, subspecialty: 'breast', ...over } as SpecimenEntry;
}

describe('computeAiAcceptanceSummary', () => {
  it('counts confirmed and overridden separately, summing to total', () => {
    const feedback = [
      makeFeedback({ action: 'confirmed' }),
      makeFeedback({ action: 'confirmed' }),
      makeFeedback({ action: 'overridden' }),
    ];
    const result = computeAiAcceptanceSummary(feedback);
    expect(result.confirmed).toBe(2);
    expect(result.overridden).toBe(1);
    expect(result.total).toBe(3);
  });

  it('"missed" entries are excluded from total — not an acceptance decision at all', () => {
    const feedback = [makeFeedback({ action: 'confirmed' }), makeFeedback({ action: 'missed' })];
    const result = computeAiAcceptanceSummary(feedback);
    expect(result.total).toBe(1);
  });

  it('avgConfidence averages confirmed+overridden entries only, excluding missed', () => {
    const feedback = [
      makeFeedback({ action: 'confirmed', aiConfidence: 80 }),
      makeFeedback({ action: 'overridden', aiConfidence: 90 }),
      makeFeedback({ action: 'missed', aiConfidence: 10 }),
    ];
    const result = computeAiAcceptanceSummary(feedback);
    expect(result.avgConfidence).toBe(85);
  });

  it('avgConfidence is null (never a fabricated 0) when there is no real feedback yet', () => {
    expect(computeAiAcceptanceSummary([]).avgConfidence).toBeNull();
  });
});

describe('buildAcceptanceTrend', () => {
  const now = new Date('2026-04-01T00:00:00.000Z').getTime();

  it('computes a real, per-bucket acceptance rate from real timestamps', () => {
    const feedback = [
      makeFeedback({ action: 'confirmed', timestamp: '2026-03-31T12:00:00.000Z' }),
      makeFeedback({ action: 'confirmed', timestamp: '2026-03-31T13:00:00.000Z' }),
      makeFeedback({ action: 'overridden', timestamp: '2026-03-31T14:00:00.000Z' }),
    ];
    const points = buildAcceptanceTrend(feedback, 1, 1, now);
    expect(points).toHaveLength(1);
    expect(points[0].rate).toBeCloseTo(66.7, 1); // 2 of 3 confirmed
  });

  it('a bucket with no real entries shows 0, never an interpolated guess', () => {
    const points = buildAcceptanceTrend([], 7, 7, now);
    expect(points.every(p => p.rate === 0)).toBe(true);
  });

  it('excludes "missed" entries from the per-bucket rate denominator', () => {
    const feedback = [
      makeFeedback({ action: 'confirmed', timestamp: '2026-03-31T12:00:00.000Z' }),
      makeFeedback({ action: 'missed', timestamp: '2026-03-31T13:00:00.000Z' }),
    ];
    const points = buildAcceptanceTrend(feedback, 1, 1, now);
    expect(points[0].rate).toBe(100); // the missed entry doesn't drag the rate down
  });

  it('an entry outside the requested period window falls into no bucket at all', () => {
    const feedback = [makeFeedback({ action: 'overridden', timestamp: '2026-01-01T00:00:00.000Z' })];
    const points = buildAcceptanceTrend(feedback, 7, 7, now);
    expect(points.every(p => p.rate === 0)).toBe(true);
  });

  it('produces exactly `buckets` points, oldest first', () => {
    const points = buildAcceptanceTrend([], 28, 4, now);
    expect(points).toHaveLength(4);
  });
});

describe('averageRate', () => {
  it('averages a set of trend points, rounded to one decimal', () => {
    expect(averageRate([{ month: 'a', rate: 80 }, { month: 'b', rate: 90 }, { month: 'c', rate: 100 }])).toBe(90);
  });

  it('rounds a non-terminating average to one decimal', () => {
    expect(averageRate([{ month: 'a', rate: 10 }, { month: 'b', rate: 20 }, { month: 'c', rate: 35 }])).toBeCloseTo(21.7, 1);
  });
});

describe('computePeriodFraction', () => {
  it('30d always scales against exactly 1 real elapsed month', () => {
    expect(computePeriodFraction('30d', 4)).toBe(0.25);
  });

  it('90d always scales against exactly 3 real elapsed months', () => {
    expect(computePeriodFraction('90d', 6)).toBe(0.5);
  });

  it('ytd is always the full, unscaled 1.0 regardless of months elapsed', () => {
    expect(computePeriodFraction('ytd', 4)).toBe(1);
  });
});

describe('scaleForPeriod / scaleForPeriodWithFloor', () => {
  it('scaleForPeriod returns the value unchanged for ytd', () => {
    expect(scaleForPeriod(100, 'ytd', 0.25)).toBe(100);
  });

  it('scaleForPeriod scales down proportionally for 30d/90d, with no floor', () => {
    expect(scaleForPeriod(100, '30d', 0.25)).toBe(25);
    expect(scaleForPeriod(1, '30d', 0.1)).toBe(0); // honest zero, not floored
  });

  it('scaleForPeriodWithFloor never scales a real, nonzero value down to 0', () => {
    expect(scaleForPeriodWithFloor(1, '30d', 0.1)).toBe(1);
  });

  it('scaleForPeriodWithFloor returns the value unchanged for ytd, even below what the floor would otherwise force', () => {
    expect(scaleForPeriodWithFloor(0, 'ytd', 0.1)).toBe(0);
  });
});

describe('scaleBreakdownForPeriod / scaleComparisonForPeriod', () => {
  it('scales each breakdown row’s cases with the floor rule, leaving rate/label untouched', () => {
    const result = scaleBreakdownForPeriod([{ label: 'Breast', rate: 91, cases: 40 }], '30d', 0.25);
    expect(result).toEqual([{ label: 'Breast', rate: 91, cases: 10 }]);
  });

  it('scales each comparison row’s aiAssisted/manual with the floor rule, leaving TAT figures untouched', () => {
    const result = scaleComparisonForPeriod([{ caseType: 'Breast', aiAssisted: 40, manual: 4, aiTat: 1.8, manualTat: 2.9 }], '30d', 0.25);
    expect(result).toEqual([{ caseType: 'Breast', aiAssisted: 10, manual: 1, aiTat: 1.8, manualTat: 2.9 }]);
  });
});

describe('deriveOverriddenCases', () => {
  const now = new Date('2026-04-01T00:00:00.000Z').getTime();

  it('only includes "overridden" entries, not confirmed or missed', () => {
    const feedback = [makeFeedback({ action: 'confirmed' }), makeFeedback({ action: 'overridden' }), makeFeedback({ action: 'missed' })];
    const result = deriveOverriddenCases(feedback, {}, now);
    expect(result).toHaveLength(1);
  });

  it('slices to the real most-recent 6, in the feedback log’s own order', () => {
    const feedback = Array.from({ length: 8 }, (_, i) => makeFeedback({ action: 'overridden', caseId: `S26-${i}` }));
    const result = deriveOverriddenCases(feedback, {}, now);
    expect(result).toHaveLength(6);
    expect(result.map(c => c.id)).toEqual(['S26-0', 'S26-1', 'S26-2', 'S26-3', 'S26-4', 'S26-5']);
  });

  it('resolves a real display label via caseTypeById when available, falling back to the raw caseId', () => {
    const feedback = [makeFeedback({ action: 'overridden', caseId: 'S26-1' })];
    const withLabel = deriveOverriddenCases(feedback, { 'S26-1': 'Breast Core Bx' }, now);
    expect(withLabel[0].caseType).toBe('Breast Core Bx');
    const withoutLabel = deriveOverriddenCases(feedback, {}, now);
    expect(withoutLabel[0].caseType).toBe('S26-1');
  });

  it('joins array-valued AI/user values with a comma, leaves string values as-is', () => {
    const feedback = [makeFeedback({ action: 'overridden', aiValue: ['A', 'B'], userValue: 'C' })];
    const result = deriveOverriddenCases(feedback, {}, now);
    expect(result[0].aiSuggestion).toBe('A, B');
    expect(result[0].finalDiagnosis).toBe('C');
  });

  it('computes real daysAgo from the real elapsed time since the feedback timestamp', () => {
    const feedback = [makeFeedback({ action: 'overridden', timestamp: '2026-03-25T00:00:00.000Z' })];
    const result = deriveOverriddenCases(feedback, {}, now);
    expect(result[0].daysAgo).toBe(7);
  });
});

describe('deriveBreakdownFromSpecimens', () => {
  it('groups active specimens by subspecialty, using the real label lookup', () => {
    const result = deriveBreakdownFromSpecimens([makeSpecimen({ subspecialty: 'breast' }), makeSpecimen({ subspecialty: 'breast' })]);
    expect(result).toEqual([{ label: 'Breast', rate: 91, cases: 24 }]); // 2 types * 12 cases-per-type multiplier
  });

  it('excludes inactive specimen entries entirely', () => {
    const result = deriveBreakdownFromSpecimens([makeSpecimen({ subspecialty: 'breast', active: false })]);
    expect(result).toHaveLength(0);
  });

  it('a specimen with no subspecialty at all groups under "Unassigned"', () => {
    const result = deriveBreakdownFromSpecimens([makeSpecimen({ subspecialty: undefined })]);
    expect(result[0].label).toBe('Unassigned');
  });

  it('an unrecognized subspecialty falls back to a humanized version of the raw id, and the generic 80% rate, rather than disappearing', () => {
    const result = deriveBreakdownFromSpecimens([makeSpecimen({ subspecialty: 'oral' })]);
    expect(result[0].label).toBe('Oral');
    expect(result[0].rate).toBe(80);
  });

  it('sorts by case volume descending', () => {
    const result = deriveBreakdownFromSpecimens([
      makeSpecimen({ id: 'a', subspecialty: 'derm' }),
      makeSpecimen({ id: 'b', subspecialty: 'breast' }),
      makeSpecimen({ id: 'c', subspecialty: 'breast' }),
    ]);
    expect(result.map(r => r.label)).toEqual(['Breast', 'Dermatopathology']);
  });
});

describe('humanizeSubspecialtyId', () => {
  it('capitalizes the first letter of an unrecognized id', () => {
    expect(humanizeSubspecialtyId('oral')).toBe('Oral');
  });

  it('returns "Unassigned" for an empty id', () => {
    expect(humanizeSubspecialtyId('')).toBe('Unassigned');
  });
});

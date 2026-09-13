import { describe, it, expect } from 'vitest';
import { resolveCytologyRoseEvaluationAdded } from './resolveCytologyRoseEvaluationAdded';

describe('resolveCytologyRoseEvaluationAdded', () => {
  it('a real, brand-new evaluation is appended with real, auto-numbered passes starting at 1', () => {
    const result = resolveCytologyRoseEvaluationAdded(undefined, {
      performedAt: '2026-01-01T10:00:00Z', performedBy: { userId: 'u1', userName: 'Dr. Smith' }, location: 'radiology',
      passes: [{ adequacyAssessment: 'adequate' }, { adequacyAssessment: 'adequate', preliminaryImpression: 'Benign' }],
    }, 'r-new');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r-new');
    expect(result[0].passes.map(p => p.passNumber)).toEqual([1, 2]);
  });

  it('a real, existing evaluation list keeps its own real entries when a new one is added', () => {
    const existing = [{ id: 'r1', performedAt: '2025-12-01T00:00:00Z', performedBy: { userId: 'u1', userName: 'Old' }, location: 'clinic' as const, passes: [] }];
    const result = resolveCytologyRoseEvaluationAdded(existing, { performedAt: '2026-01-01T00:00:00Z', performedBy: { userId: 'u2', userName: 'New' }, location: 'radiology', passes: [] }, 'r-new');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(existing[0]);
  });
});

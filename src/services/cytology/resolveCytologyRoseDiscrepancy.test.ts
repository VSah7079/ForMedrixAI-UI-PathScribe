import { describe, it, expect } from 'vitest';
import { resolveCytologyRoseDiscrepancy } from './resolveCytologyRoseDiscrepancy';

describe('resolveCytologyRoseDiscrepancy', () => {
  it('a real ROSE call of adequate that the final lab found unsatisfactory is a genuine discrepancy', () => {
    expect(resolveCytologyRoseDiscrepancy('adequate', true)).toBe(true);
  });

  it('a real ROSE call of adequate that the final lab confirmed satisfactory is fully concordant, never flagged', () => {
    expect(resolveCytologyRoseDiscrepancy('adequate', false)).toBe(false);
  });

  it('a real ROSE call of inadequate that the final lab actually found satisfactory is a genuine, real discrepancy too, not just the reverse direction', () => {
    expect(resolveCytologyRoseDiscrepancy('inadequate', false)).toBe(true);
  });

  it('a real ROSE call of inadequate that the final lab confirms unsatisfactory is fully concordant', () => {
    expect(resolveCytologyRoseDiscrepancy('inadequate', true)).toBe(false);
  });

  it('a real, indeterminate ROSE call is treated the same real way as inadequate for this comparison', () => {
    expect(resolveCytologyRoseDiscrepancy('indeterminate', false)).toBe(true);
    expect(resolveCytologyRoseDiscrepancy('indeterminate', true)).toBe(false);
  });
});

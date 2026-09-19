import { describe, it, expect } from 'vitest';
import { formatAutopsyTatSlaSummary } from './formatAutopsyTatSlaSummary';
import { resolveAutopsyTatSlaMatrix } from './resolveAutopsyTatSlaMatrix';

describe('formatAutopsyTatSlaSummary', () => {
  it('a real jurisdiction with a single, fixed PAD figure (US) formats without a dash range', () => {
    const summary = formatAutopsyTatSlaSummary(resolveAutopsyTatSlaMatrix('US'));
    expect(summary).toBe('TAT: PAD within 2 working days, FAD within 60 days (90 days if complex) \u2014 per CAP / CLIA');
  });

  it('a real jurisdiction with a genuine PAD range (GB_EW) formats as a real range, not collapsed to one figure', () => {
    const summary = formatAutopsyTatSlaSummary(resolveAutopsyTatSlaMatrix('GB_EW'));
    expect(summary).toContain('PAD within 24\u201348 hours');
    expect(summary).toContain('FAD within 14\u201321 working days');
    expect(summary).toContain('28\u201342 working days if complex');
    expect(summary).toContain('RCPath / HTA');
  });

  it('a real jurisdiction where complex FAD is also a fixed figure (GB_SCT) formats without a dash there either', () => {
    const summary = formatAutopsyTatSlaSummary(resolveAutopsyTatSlaMatrix('GB_SCT'));
    expect(summary).toContain('28 working days if complex');
  });
});

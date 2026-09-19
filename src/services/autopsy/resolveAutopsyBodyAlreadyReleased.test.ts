import { describe, it, expect } from 'vitest';
import { resolveAutopsyBodyAlreadyReleased } from './resolveAutopsyBodyAlreadyReleased';
import type { MaterialLocation } from '@/types/case/Material';

const loc = (overrides: Partial<MaterialLocation>): MaterialLocation => ({
  location: 'Mortuary Cooler 1', action: 'Received', at: '2026-01-01T00:00:00.000Z',
  source: 'PathScribe', ...overrides,
});

describe('resolveAutopsyBodyAlreadyReleased', () => {
  it('a real, genuinely empty locationHistory is not released', () => {
    expect(resolveAutopsyBodyAlreadyReleased([])).toBe(false);
  });

  it('a real, undefined locationHistory (a specimen with no history at all) is not released', () => {
    expect(resolveAutopsyBodyAlreadyReleased(undefined)).toBe(false);
  });

  it('a real, single "Received" entry is not released', () => {
    expect(resolveAutopsyBodyAlreadyReleased([loc({ action: 'Received' })])).toBe(false);
  });

  it('a real, single "Released" entry is genuinely released', () => {
    expect(resolveAutopsyBodyAlreadyReleased([loc({ action: 'Released' })])).toBe(true);
  });

  it('a real, multi-entry history is judged by the most recent entry\u2019s own action, regardless of array order', () => {
    const history = [
      loc({ action: 'Received', at: '2026-01-01T00:00:00.000Z' }),
      loc({ action: 'Released', at: '2026-01-05T00:00:00.000Z' }),
    ];
    expect(resolveAutopsyBodyAlreadyReleased(history)).toBe(true);
    expect(resolveAutopsyBodyAlreadyReleased([...history].reverse())).toBe(true);
  });

  it('a real body moved AFTER release (e.g. a real, later correction) is judged by that later, non-Released entry \u2014 not released', () => {
    const history = [
      loc({ action: 'Released', at: '2026-01-05T00:00:00.000Z' }),
      loc({ action: 'Received', at: '2026-01-06T00:00:00.000Z' }),
    ];
    expect(resolveAutopsyBodyAlreadyReleased(history)).toBe(false);
  });
});

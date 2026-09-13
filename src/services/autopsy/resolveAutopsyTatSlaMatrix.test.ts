import { describe, it, expect } from 'vitest';
import { resolveAutopsyTatSlaMatrix } from './resolveAutopsyTatSlaMatrix';

describe('resolveAutopsyTatSlaMatrix — real, per the spec\'s own exact §4 table', () => {
  it('US matches the spec\'s exact figures: PAD \u22642 working days, FAD \u226460 days, complex \u226490 days, CAP/CLIA', () => {
    const config = resolveAutopsyTatSlaMatrix('US');
    expect(config).toEqual({ padUnit: 'working_days', padMin: 2, padMax: 2, fadUnit: 'days', fadMin: 60, fadMax: 60, complexFadMin: 90, complexFadMax: 90, governingStandard: 'CAP / CLIA' });
  });

  it('England/Wales matches the spec\'s exact real range figures, never collapsed to one number', () => {
    const config = resolveAutopsyTatSlaMatrix('GB_EW');
    expect(config.padMin).toBe(24);
    expect(config.padMax).toBe(48);
    expect(config.fadMin).toBe(14);
    expect(config.fadMax).toBe(21);
    expect(config.governingStandard).toContain('RCPath');
  });

  it('Scotland is genuinely distinct from England/Wales \u2014 a single, exact figure per the spec, not a range, and a different governing standard', () => {
    const config = resolveAutopsyTatSlaMatrix('GB_SCT');
    expect(config.fadMin).toBe(14);
    expect(config.fadMax).toBe(14);
    expect(config.governingStandard).toBe('COPFS / RCPath');
  });

  it('South Korea matches the spec\'s own real figures', () => {
    const config = resolveAutopsyTatSlaMatrix('KR');
    expect(config.fadMin).toBe(14);
    expect(config.fadMax).toBe(30);
    expect(config.complexFadMin).toBe(45);
    expect(config.governingStandard).toContain('KCDC');
  });

  it('Ireland matches RCPath\'s own real figures directly (same as GB_EW/GB_NIR), per direct confirmation of professional-standard alignment', () => {
    const config = resolveAutopsyTatSlaMatrix('IE');
    expect(config.padMin).toBe(24);
    expect(config.padMax).toBe(48);
    expect(config.fadUnit).toBe('working_days');
    expect(config.fadMin).toBe(14);
    expect(config.fadMax).toBe(21);
    expect(config.complexFadMin).toBe(28);
    expect(config.complexFadMax).toBe(42);
    expect(config.governingStandard).toContain('RCPath');
  });

  it('every real jurisdiction the spec names resolves to a real, defined config \u2014 never falls through to undefined', () => {
    const jurisdictions: Array<Parameters<typeof resolveAutopsyTatSlaMatrix>[0]> = ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'DE', 'FR', 'BE', 'NL', 'AU', 'NZ', 'KR'];
    for (const j of jurisdictions) {
      expect(resolveAutopsyTatSlaMatrix(j)).toBeDefined();
    }
  });
});

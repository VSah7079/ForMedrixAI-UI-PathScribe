import { describe, it, expect } from 'vitest';
import { CONFIG_SEARCH_INDEX } from './configSearchIndex';

describe('CONFIG_SEARCH_INDEX \u2014 Autopsy-relevant entries, per direct follow-up ("it all needs to be wired")', () => {
  it('the real Specimens entry now includes "autopsy" among its own synonyms, so searching Config for "autopsy" finds it', () => {
    const entry = CONFIG_SEARCH_INDEX.find(e => e.id === 'sys-specimens');
    expect(entry).toBeDefined();
    expect(entry!.synonyms.some(s => s.toLowerCase().includes('autopsy'))).toBe(true);
  });

  it('a real Protocol Dictionary entry now exists, pointing at the real "protocols" SystemSection', () => {
    const entry = CONFIG_SEARCH_INDEX.find(e => e.id === 'sys-protocols');
    expect(entry).toBeDefined();
    expect(entry!.section).toBe('protocols');
    expect(entry!.synonyms.some(s => s.toLowerCase().includes('autopsy'))).toBe(true);
  });

  it('a real Asset Location Dictionary entry now exists, pointing at the real "asset_locations" SystemSection', () => {
    const entry = CONFIG_SEARCH_INDEX.find(e => e.id === 'sys-asset-locations');
    expect(entry).toBeDefined();
    expect(entry!.section).toBe('asset_locations');
    expect(entry!.synonyms.some(s => s.toLowerCase().includes('mortuary'))).toBe(true);
  });

  it('every real entry\u2019s own id is genuinely unique across the whole index \u2014 no accidental duplicate from this addition', () => {
    const ids = CONFIG_SEARCH_INDEX.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

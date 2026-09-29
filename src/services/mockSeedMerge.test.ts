// Batch 357: seed records added after a browser stored its demo data.
import { describe, expect, it } from 'vitest';
import { withMissingSeedRecords } from './mockSeedMerge';

const seed = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];

describe('withMissingSeedRecords', () => {
  it('nothing stored: the seed', () => {
    expect(withMissingSeedRecords(null, seed)).toEqual({ records: seed, added: 0 });
  });
  it('appends seed records that are missing, keeps stored edits and extra records', () => {
    const stored = [{ id: 'a', name: 'A (edited)' }, { id: 'z', name: 'Admin-added' }];
    expect(withMissingSeedRecords(stored, seed)).toEqual({
      records: [{ id: 'a', name: 'A (edited)' }, { id: 'z', name: 'Admin-added' }, { id: 'b', name: 'B' }], added: 1,
    });
  });
  it('nothing missing: unchanged', () => {
    expect(withMissingSeedRecords(seed, seed).added).toBe(0);
  });
});

import { withSeedFieldBackfill } from './mockSeedMerge';

describe('withSeedFieldBackfill (Batch 359)', () => {
  const seedWithLink = [{ id: 'a', name: 'A', link: 'eq-1' as string | undefined }, { id: 'b', name: 'B', link: undefined as string | undefined }];
  it('fills a missing field from the matching seed record, never replacing a stored value', () => {
    const stored = [{ id: 'a', name: 'A', link: undefined }, { id: 'b', name: 'B', link: undefined }, { id: 'z', name: 'Z', link: undefined }];
    const out = withSeedFieldBackfill(stored, seedWithLink, 'link');
    expect(out.filled).toBe(1);
    expect(out.records.map(r => r.link)).toEqual(['eq-1', undefined, undefined]);
    expect(withSeedFieldBackfill([{ id: 'a', name: 'A', link: 'eq-9' }], seedWithLink, 'link').records[0].link).toBe('eq-9');
  });
});

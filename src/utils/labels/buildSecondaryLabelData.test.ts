// src/utils/labels/buildSecondaryLabelData.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, dedicated unit test — none existed for this module before. Added
// while closing a real, confirmed gap: "no secondary-label printing for
// decants... if a decant container's barcode gets damaged, there's
// currently no recovery path the way there is for blocks."
// Focus is buildSecondaryLabelDataForDecant (the new function), with quick
// baseline coverage for the two existing, previously-untested builders too.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  buildSecondaryLabelDataForBlock,
  buildSecondaryLabelDataForMatrixBlock,
  buildSecondaryLabelDataForDecant,
} from './buildSecondaryLabelData';

const FIXED_NOW = () => '2026-08-19T00:00:00.000Z';

describe('buildSecondaryLabelDataForDecant', () => {
  it('builds real, correct label data when the decant genuinely has both foreign id fields', () => {
    const data = buildSecondaryLabelDataForDecant(
      'S26-0001', 'A',
      { label: 'D1', externalId: 'EXT-9001', externalIdSource: 'Outside Cytology Lab' },
      FIXED_NOW,
    );
    expect(data).not.toBeNull();
    expect(data!.displayId).toBe('S26-0001-AD1');
    expect(data!.recordLabel).toBe('AD1');
    expect(data!.foreignId).toBe('EXT-9001');
    expect(data!.foreignIdSource).toBe('Outside Cytology Lab');
    expect(data!.printedAt).toBe('2026-08-19T00:00:00.000Z');
  });

  it('returns null when the decant has no foreign id at all — same real guard as the block builder, this label only makes sense once a real foreign id explains why it exists', () => {
    const data = buildSecondaryLabelDataForDecant('S26-0001', 'A', { label: 'D1' }, FIXED_NOW);
    expect(data).toBeNull();
  });

  it('returns null when only one of the two required fields is present', () => {
    expect(buildSecondaryLabelDataForDecant('S26-0001', 'A', { label: 'D1', externalId: 'EXT-9001' }, FIXED_NOW)).toBeNull();
    expect(buildSecondaryLabelDataForDecant('S26-0001', 'A', { label: 'D1', externalIdSource: 'Outside Lab' }, FIXED_NOW)).toBeNull();
  });
});

describe('buildSecondaryLabelDataForBlock — baseline coverage, none existed before', () => {
  it('builds real, correct label data for an ordinary block with a real foreign id', () => {
    const data = buildSecondaryLabelDataForBlock(
      'S26-0001', 'A',
      { label: '1', externalId: 'EXT-1001', externalIdSource: 'Riverside Medical Center' },
      FIXED_NOW,
    );
    expect(data).toEqual({
      displayId: 'S26-0001-A1', recordLabel: 'A1',
      foreignId: 'EXT-1001', foreignIdSource: 'Riverside Medical Center',
      printedAt: '2026-08-19T00:00:00.000Z',
    });
  });

  it('returns null with no foreign id', () => {
    expect(buildSecondaryLabelDataForBlock('S26-0001', 'A', { label: '1' }, FIXED_NOW)).toBeNull();
  });
});

describe('buildSecondaryLabelDataForMatrixBlock — baseline coverage, none existed before', () => {
  it('builds real, correct label data for a matrix block with a real foreign id', () => {
    const data = buildSecondaryLabelDataForMatrixBlock(
      'S26-0001',
      { label: 'C1', externalId: 'EXT-2001', externalIdSource: 'Outside Lab' },
      FIXED_NOW,
    );
    expect(data).toEqual({
      displayId: 'S26-0001-C1', recordLabel: 'C1',
      foreignId: 'EXT-2001', foreignIdSource: 'Outside Lab',
      printedAt: '2026-08-19T00:00:00.000Z',
    });
  });

  it('returns null with no foreign id', () => {
    expect(buildSecondaryLabelDataForMatrixBlock('S26-0001', { label: 'C1' }, FIXED_NOW)).toBeNull();
  });
});

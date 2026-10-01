import { describe, it, expect } from 'vitest';
import { resolveBatchFacilityId } from './resolveBatchFacilityId';
import type { Batch, BatchItem } from '../batches/IBatchService';

function makeItem(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id: 'item-1',
    materialType: 'block',
    displayId: 'S26-0001-A1',
    caseAccession: 'MFT-2026-000001',
    addedAt: '2026-01-01T00:00:00.000Z',
    addedByUserId: 'u1',
    addedByUserName: 'Tech One',
    ...overrides,
  };
}

function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: 'batch-1',
    masterBarcode: 'CONT-STD-20260101-0001',
    processingNode: 'Staining',
    protocol: 'Standard H&E',
    priority: 'Routine',
    status: 'active',
    items: [],
    unexpectedScans: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    createdByUserId: 'u1',
    createdByUserName: 'Tech One',
    ...overrides,
  };
}

describe('resolveBatchFacilityId', () => {
  it('resolves via a batch item\'s caseAccession -> Case.originHospitalId join', () => {
    const batch = makeBatch({ items: [makeItem({ caseAccession: 'MFT-2026-000001' })] });
    const accessionMap = new Map([['MFT-2026-000001', 'c-fenwick-general']]);
    const stationMap = new Map<string, string>();
    expect(resolveBatchFacilityId(batch, accessionMap, stationMap)).toBe('c-fenwick-general');
  });

  it('falls back to Batch.stationId -> ScanStation.facilityId when no item resolves', () => {
    const batch = makeBatch({ items: [], stationId: 'station-1' });
    const accessionMap = new Map<string, string>();
    const stationMap = new Map([['station-1', 'c-westbrook-clinic']]);
    expect(resolveBatchFacilityId(batch, accessionMap, stationMap)).toBe('c-westbrook-clinic');
  });

  it('prefers the case-accession join over the station fallback when both are available', () => {
    const batch = makeBatch({ items: [makeItem({ caseAccession: 'MFT-2026-000001' })], stationId: 'station-1' });
    const accessionMap = new Map([['MFT-2026-000001', 'c-fenwick-general']]);
    const stationMap = new Map([['station-1', 'c-westbrook-clinic']]);
    expect(resolveBatchFacilityId(batch, accessionMap, stationMap)).toBe('c-fenwick-general');
  });

  it('checks every item, not just the first, when earlier items do not resolve', () => {
    const batch = makeBatch({
      items: [makeItem({ id: 'item-1', caseAccession: 'UNKNOWN-ACCESSION' }), makeItem({ id: 'item-2', caseAccession: 'MFT-2026-000001' })],
    });
    const accessionMap = new Map([['MFT-2026-000001', 'c-fenwick-general']]);
    const stationMap = new Map<string, string>();
    expect(resolveBatchFacilityId(batch, accessionMap, stationMap)).toBe('c-fenwick-general');
  });

  it('returns undefined, honestly, when neither signal resolves', () => {
    const batch = makeBatch({ items: [makeItem({ caseAccession: 'UNKNOWN' })] });
    const accessionMap = new Map<string, string>();
    const stationMap = new Map<string, string>();
    expect(resolveBatchFacilityId(batch, accessionMap, stationMap)).toBeUndefined();
  });

  it('returns undefined for an empty batch with no stationId', () => {
    const batch = makeBatch({ items: [] });
    expect(resolveBatchFacilityId(batch, new Map(), new Map())).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { resolveMortuaryStorageOccupancy } from './resolveMortuaryStorageOccupancy';
import type { AssetLocationEntry } from '@/types/assetLocation/AssetLocationEntry';
import type { MaterialLocation } from '@/types/case/Material';

const baseLocation = (overrides: Partial<AssetLocationEntry>): AssetLocationEntry => ({
  id: 'loc-1', name: 'Tray 1', locationType: 'storage_slot', normalizedLabel: 'tray 1',
  synonyms: [], status: 'Active', version: 1, updatedBy: 'system', updatedAt: '2026-01-01',
  ...overrides,
});

const materialLocation = (overrides: Partial<MaterialLocation>): MaterialLocation => ({
  location: 'Tray 1', at: '2026-09-01T02:00:00Z', source: 'MORTUARY_INTAKE',
  ...overrides,
});

describe('resolveMortuaryStorageOccupancy', () => {
  it('a real storage_slot with no real specimen currently there is reported as unoccupied', () => {
    const result = resolveMortuaryStorageOccupancy([baseLocation({ id: 'loc-1', name: 'Tray 1' })], []);
    expect(result).toEqual([{ location: baseLocation({ id: 'loc-1', name: 'Tray 1' }), occupied: false }]);
  });

  it('a real storage_slot matching a real specimen\u2019s own current (most recent) location is reported as occupied', () => {
    const result = resolveMortuaryStorageOccupancy(
      [baseLocation({ id: 'loc-1', name: 'Tray 1' })],
      [[materialLocation({ location: 'Tray 1', at: '2026-09-01T02:00:00Z' })]],
    );
    expect(result[0].occupied).toBe(true);
  });

  it('a real specimen that has since MOVED ON to a new real location automatically frees the old one \u2014 no explicit release event needed at all', () => {
    const result = resolveMortuaryStorageOccupancy(
      [baseLocation({ id: 'loc-1', name: 'Tray 1' }), baseLocation({ id: 'loc-2', name: 'Grossing Station 3', locationType: 'storage_slot' })],
      [[
        materialLocation({ location: 'Tray 1', at: '2026-09-01T02:00:00Z' }),
        materialLocation({ location: 'Grossing Station 3', at: '2026-09-02T09:00:00Z', action: 'Moved for Gross Examination' }),
      ]],
    );
    expect(result.find(r => r.location.id === 'loc-1')?.occupied).toBe(false);
    expect(result.find(r => r.location.id === 'loc-2')?.occupied).toBe(true);
  });

  it('matching is real, case-insensitive by name \u2014 the same real matching convention already used by findOrCreateByName', () => {
    const result = resolveMortuaryStorageOccupancy(
      [baseLocation({ id: 'loc-1', name: 'Tray 1' })],
      [[materialLocation({ location: 'tray 1', at: '2026-09-01T02:00:00Z' })]],
    );
    expect(result[0].occupied).toBe(true);
  });

  it('a real, non-storage_slot location (e.g. a whole storage_unit) is never included at all \u2014 a body doesn\u2019t directly occupy one', () => {
    const result = resolveMortuaryStorageOccupancy(
      [baseLocation({ id: 'unit-1', locationType: 'storage_unit', name: 'Cold Storage Unit 3' })],
      [],
    );
    expect(result).toEqual([]);
  });

  it('real occupancy is correctly reported across multiple real slots and multiple real specimens independently', () => {
    const result = resolveMortuaryStorageOccupancy(
      [baseLocation({ id: 'loc-1', name: 'Tray 1' }), baseLocation({ id: 'loc-2', name: 'Tray 2' })],
      [
        [materialLocation({ location: 'Tray 1', at: '2026-09-01T02:00:00Z' })],
        [], // a real specimen with no real location history logged yet
      ],
    );
    expect(result.find(r => r.location.id === 'loc-1')?.occupied).toBe(true);
    expect(result.find(r => r.location.id === 'loc-2')?.occupied).toBe(false);
  });
});

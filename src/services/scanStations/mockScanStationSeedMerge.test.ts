// @vitest-environment happy-dom
// Batch 357: a browser that stored scan stations before the molecular bay
// was seeded (Batch 356) gets it without a Demo Reset, and keeps its edits.
import { beforeEach, describe, expect, it } from 'vitest';
import { mockScanStationService } from './mockScanStationService';

describe('scan stations: seed stations added later', () => {
  beforeEach(() => localStorage.clear());

  it('adds the missing seed station and keeps a stored rename', async () => {
    localStorage.setItem('pathscribe_mock_scan_stations', JSON.stringify([
      { id: 'station-gross-1', name: 'Grossing Bench (renamed)', barcodeCode: 'GROSSING-01', facilityId: 'c-fenwick-general', status: 'Active', supportsEngraving: false, supportsPrinting: false },
    ]));
    const res = await mockScanStationService.getAll();
    const ids = res.ok ? res.data.map(s => s.id) : [];
    expect(ids[0]).toBe('station-gross-1');
    expect(ids).toContain('station-molecular-1');
    expect(res.ok && res.data[0].name).toBe('Grossing Bench (renamed)');
    // Written back, so it's there next time too.
    expect(JSON.parse(localStorage.getItem('pathscribe_mock_scan_stations')!).some((s: { id: string }) => s.id === 'station-molecular-1')).toBe(true);
  });
});

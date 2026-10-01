// @vitest-environment happy-dom
//
// src/hooks/__tests__/useDefaultActionOnScan.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDefaultActionOnScan } from '../useDefaultActionOnScan';

let mockPathname = '/worklist';
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useLocation: () => ({ pathname: mockPathname }) };
});

let mockEffectiveStationId: string | null = 'station-micro-1';
vi.mock('../useEffectiveScanStation', () => ({
  useEffectiveScanStation: () => ({ effectiveStationId: mockEffectiveStationId }),
}));

const mockGetStationById = vi.fn();
vi.mock('@/services/scanStations/mockScanStationService', () => ({
  mockScanStationService: { getById: (...args: any[]) => mockGetStationById(...args) },
}));

const mockGetGroupById = vi.fn();
vi.mock('@/services/workstationGroups/mockWorkstationGroupService', () => ({
  mockWorkstationGroupService: { getById: (...args: any[]) => mockGetGroupById(...args) },
}));

const mockGetActionById = vi.fn();
const mockExecuteAction = vi.fn();
vi.mock('@/services/actionRegistry/mockActionRegistryService', () => ({
  mockActionRegistryService: {
    getActionById: (...args: any[]) => mockGetActionById(...args),
    executeAction: (...args: any[]) => mockExecuteAction(...args),
  },
}));

const REAL_STATION = { id: 'station-micro-1', name: 'Microtomy — Bench 1', workstationGroupId: 'wg-microtomy-1', facilityId: 'c-fenwick-general' };
const REAL_GROUP = { id: 'wg-microtomy-1', name: 'Microtomy Group', defaultActionId: 'LOG_SLIDE_BLOCK' };
const REAL_ACTION = { id: 'LOG_SLIDE_BLOCK', label: 'Log Slide/Block', category: 'GROSSING', isActive: true };

function fireScan(raw: string) {
  window.dispatchEvent(new CustomEvent('PATHSCRIBE_SCAN', { detail: { raw, type: 'unknown' } }));
}

describe('useDefaultActionOnScan \u2014 real, per PS-289\u2019s own "fires on the next scan" piece', () => {
  beforeEach(() => {
    mockPathname = '/worklist';
    mockEffectiveStationId = 'station-micro-1';
    mockGetStationById.mockReset().mockResolvedValue({ ok: true, data: REAL_STATION });
    mockGetGroupById.mockReset().mockResolvedValue({ ok: true, data: REAL_GROUP });
    mockGetActionById.mockReset().mockReturnValue(REAL_ACTION);
    mockExecuteAction.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('a real scan at a station whose group has a real defaultActionId fires that action automatically', async () => {
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('CASSETTE-S26-5007-A-1'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).toHaveBeenCalledWith(REAL_ACTION, 'CASSETTE-S26-5007-A-1');
  });

  it('a real STATION: prefixed scan never fires a default action \u2014 left entirely to the station-switch listener', async () => {
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('STATION:MICROTOMY-01'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('the real Disposal Queue route is honestly excluded \u2014 its own scan meaning is never overridden', async () => {
    mockPathname = '/batch-management/disposal';
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('CASSETTE-S26-5007-A-1'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('with no real effective station set, this is a real, honest no-op', async () => {
    mockEffectiveStationId = null;
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('CASSETTE-S26-5007-A-1'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('a real station with no workstationGroupId assigned is a real, honest no-op, never a fabricated default', async () => {
    mockGetStationById.mockResolvedValue({ ok: true, data: { ...REAL_STATION, workstationGroupId: undefined } });
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('CASSETTE-S26-5007-A-1'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('a real group with no defaultActionId set is a real, honest no-op', async () => {
    mockGetGroupById.mockResolvedValue({ ok: true, data: { ...REAL_GROUP, defaultActionId: undefined } });
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('CASSETTE-S26-5007-A-1'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('a real, genuinely inactive default action never fires, even if configured', async () => {
    mockGetActionById.mockReturnValue({ ...REAL_ACTION, isActive: false });
    renderHook(() => useDefaultActionOnScan());
    await act(async () => { fireScan('CASSETTE-S26-5007-A-1'); await Promise.resolve(); await Promise.resolve(); });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });
});

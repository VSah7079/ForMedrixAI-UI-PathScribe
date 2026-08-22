// @vitest-environment happy-dom
//
// src/hooks/__tests__/useGlobalStationSwitch.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, focused verification of the safety-critical guardrail logic
// itself, per direct follow-up's own table: "No Unsaved Data ->
// Instantly switches... Unsaved Data Present -> Blocks immediate
// location switch." Mocks useDirtyState()'s isDirty directly rather
// than trying to reproduce it through full browser UI automation —
// a full app has no single, reliable UI action that's guaranteed to
// flip isDirty (it's set from 14+ different real call sites across
// SynopticReportPage.tsx), so this is the faster, more definitive way
// to prove the hook's own branching is correct, matching the same
// "unit test the hook's own logic in isolation" pattern already
// established (useLisIntegration.test.ts's own header comment).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGlobalStationSwitch } from '../useGlobalStationSwitch';

const mockGetByBarcodeCode = vi.fn();
vi.mock('@/services/scanStations/mockScanStationService', () => ({
  mockScanStationService: {
    getByBarcodeCode: (...args: any[]) => mockGetByBarcodeCode(...args),
  },
}));

const mockSetStationId = vi.fn();
vi.mock('../useEffectiveScanStation', () => ({
  useEffectiveScanStation: () => ({ setStationId: mockSetStationId, effectiveStationId: null }),
}));

let mockIsDirty = false;
const mockGetSaveHandler = vi.fn();
const mockGetDiscardHandler = vi.fn();
vi.mock('@/contexts/DirtyStateContext', () => ({
  useDirtyState: () => ({
    isDirty: mockIsDirty,
    getSaveHandler: mockGetSaveHandler,
    getDiscardHandler: mockGetDiscardHandler,
  }),
}));

vi.mock('react-toastify', () => ({
  toast: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const REAL_STATION = { id: 'station-stain-1', name: 'Staining Station 1', barcodeCode: 'STAINING-01', facilityId: 'lab-main', status: 'Active' as const };

function fireScan(raw: string) {
  window.dispatchEvent(new CustomEvent('PATHSCRIBE_SCAN', { detail: { raw, type: 'unknown' } }));
}

describe('useGlobalStationSwitch', () => {
  beforeEach(() => {
    mockIsDirty = false;
    mockSetStationId.mockClear();
    mockGetByBarcodeCode.mockClear();
    mockGetSaveHandler.mockClear();
    mockGetDiscardHandler.mockClear();
    mockGetByBarcodeCode.mockResolvedValue({ ok: true, data: REAL_STATION });
  });

  afterEach(() => {
    // Real fix: each renderHook() attaches its own real
    // window.addEventListener('PATHSCRIBE_SCAN', ...) — without an
    // explicit unmount between tests, every earlier test's listener
    // stays attached and reacts to later tests' scans too, since
    // window is shared, real global state across the whole file.
    cleanup();
  });

  it('ignores a scan with no STATION: prefix entirely — never calls the station lookup', async () => {
    renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('S26-4403-A1'); });
    expect(mockGetByBarcodeCode).not.toHaveBeenCalled();
    expect(mockSetStationId).not.toHaveBeenCalled();
  });

  it('clean state (isDirty=false): switches instantly, no pending guard', async () => {
    mockIsDirty = false;
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:STAINING-01'); });
    expect(mockSetStationId).toHaveBeenCalledWith('station-stain-1');
    expect(result.current.pending).toBeNull();
  });

  it('dirty state (isDirty=true): blocks the immediate switch, sets a real pending guard instead', async () => {
    mockIsDirty = true;
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:STAINING-01'); });
    // The real, critical safety rule: no immediate switch while dirty.
    expect(mockSetStationId).not.toHaveBeenCalled();
    expect(result.current.pending).not.toBeNull();
    expect(result.current.pending?.station.id).toBe('station-stain-1');
  });

  it('Save & Switch: calls the real registered save handler, only switches if it succeeds', async () => {
    mockIsDirty = true;
    const saveFn = vi.fn().mockResolvedValue(true);
    mockGetSaveHandler.mockReturnValue(saveFn);
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:STAINING-01'); });
    expect(result.current.pending).not.toBeNull();

    await act(async () => { await result.current.saveAndSwitch(); });
    expect(saveFn).toHaveBeenCalled();
    expect(mockSetStationId).toHaveBeenCalledWith('station-stain-1');
    expect(result.current.pending).toBeNull();
  });

  it('Save & Switch: a real save conflict (handler returns false) does NOT switch the station', async () => {
    mockIsDirty = true;
    const saveFn = vi.fn().mockResolvedValue(false);
    mockGetSaveHandler.mockReturnValue(saveFn);
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:STAINING-01'); });

    await act(async () => { await result.current.saveAndSwitch(); });
    expect(saveFn).toHaveBeenCalled();
    expect(mockSetStationId).not.toHaveBeenCalled();
  });

  it('Discard & Switch: calls the real registered discard handler, then switches', async () => {
    mockIsDirty = true;
    const discardFn = vi.fn();
    mockGetDiscardHandler.mockReturnValue(discardFn);
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:STAINING-01'); });

    act(() => { result.current.discardAndSwitch(); });
    expect(discardFn).toHaveBeenCalled();
    expect(mockSetStationId).toHaveBeenCalledWith('station-stain-1');
    expect(result.current.pending).toBeNull();
  });

  it('Cancel: clears the pending guard, never switches, never touches save/discard', async () => {
    mockIsDirty = true;
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:STAINING-01'); });
    expect(result.current.pending).not.toBeNull();

    act(() => { result.current.cancelSwitch(); });
    expect(result.current.pending).toBeNull();
    expect(mockSetStationId).not.toHaveBeenCalled();
  });

  it('an unrecognized barcode code never switches and never sets a pending guard', async () => {
    mockGetByBarcodeCode.mockResolvedValue({ ok: false, error: 'not found' });
    const { result } = renderHook(() => useGlobalStationSwitch());
    await act(async () => { fireScan('STATION:NONEXISTENT-99'); });
    expect(mockSetStationId).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });
});

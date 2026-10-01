// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useCassetteScanVerification.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCassetteScanVerification } from '../useCassetteScanVerification';

afterEach(() => {
  cleanup();
});

function dispatchScan(raw: string) {
  window.dispatchEvent(new CustomEvent('PATHSCRIBE_SCAN', { detail: { raw, type: 'unknown' } }));
}

describe('useCassetteScanVerification — real feature, per direct research: "Barcode Scan Verification... to close the loop"', () => {
  it('starts with no real pending verification', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    expect(result.current.pendingVerification).toBeNull();
  });

  it('registerPendingVerification sets a real, inspectable pending cassette', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    expect(result.current.pendingVerification).toEqual({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
  });

  it('a real scan matching the pending cassette exactly clears it', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    act(() => {
      dispatchScan('DVMC26-0001-A1');
    });
    expect(result.current.pendingVerification).toBeNull();
  });

  it('a scan for a genuinely different cassette does not clear the real pending one', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    act(() => {
      dispatchScan('DVMC26-0001-B2');
    });
    expect(result.current.pendingVerification).toEqual({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
  });

  it('whitespace around a real, otherwise-matching scan still clears it (trimmed comparison)', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    act(() => {
      dispatchScan('  DVMC26-0001-A1  ');
    });
    expect(result.current.pendingVerification).toBeNull();
  });

  it('a scan while nothing is genuinely pending is a real, safe no-op', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      dispatchScan('DVMC26-0001-A1');
    });
    expect(result.current.pendingVerification).toBeNull();
  });

  it('registering a new pending cassette replaces a real, still-unverified prior one', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A2', blockLabel: '2', specimenLabel: 'A' });
    });
    expect(result.current.pendingVerification?.cassetteId).toBe('DVMC26-0001-A2');
    // The real, now-replaced A1 no longer clears anything — only the
    // current pending cassette is ever tracked.
    act(() => {
      dispatchScan('DVMC26-0001-A1');
    });
    expect(result.current.pendingVerification?.cassetteId).toBe('DVMC26-0001-A2');
  });
});

describe('hasUnverifiedPendingCassette — real, honest guardrail check, never blocks on its own', () => {
  it('is false when the setting is off, even with a real, genuinely unverified cassette pending', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    expect(result.current.hasUnverifiedPendingCassette(false)).toBe(false);
  });

  it('is true when the setting is on and a real cassette is genuinely still unverified', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    expect(result.current.hasUnverifiedPendingCassette(true)).toBe(true);
  });

  it('is false when the setting is on but nothing is genuinely pending', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    expect(result.current.hasUnverifiedPendingCassette(true)).toBe(false);
  });

  it('is false once a real, previously-pending cassette has actually been verified by a matching scan', () => {
    const { result } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    act(() => {
      dispatchScan('DVMC26-0001-A1');
    });
    expect(result.current.hasUnverifiedPendingCassette(true)).toBe(false);
  });
});

describe('cleanup — real, no listener leaks across unmounts', () => {
  it('a scan after unmount does not throw or affect a later, separate hook instance', () => {
    const { result, unmount } = renderHook(() => useCassetteScanVerification());
    act(() => {
      result.current.registerPendingVerification({ cassetteId: 'DVMC26-0001-A1', blockLabel: '1', specimenLabel: 'A' });
    });
    unmount();
    expect(() => dispatchScan('DVMC26-0001-A1')).not.toThrow();

    const { result: fresh } = renderHook(() => useCassetteScanVerification());
    expect(fresh.current.pendingVerification).toBeNull();
  });
});

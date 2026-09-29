// @vitest-environment happy-dom
//
// src/components/Config/__tests__/configDirtyGuardContext.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, focused coverage for the new PS-128 dirty-guard bridge itself,
// independent of ConfigurationPage.tsx/MacroPanel.tsx (covered separately).
// Two real things this module promises and that ConfigurationPage.tsx's own
// guard logic depends on:
//   1. A consumer called OUTSIDE any provider gets a harmless no-op —
//      doesn't throw, doesn't require a provider to exist.
//   2. A consumer called INSIDE a provider reaches that provider's own
//      setDirty function, not a stray default.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ConfigDirtyGuardContext,
  useConfigDirtyGuard,
} from '../configDirtyGuardContext';

afterEach(cleanup);

const Consumer: React.FC = () => {
  const { setDirty } = useConfigDirtyGuard();
  return (
    <button onClick={() => setDirty(true)}>make dirty</button>
  );
};

describe('configDirtyGuardContext — PS-128', () => {
  it('a consumer rendered with no provider above it gets a real, harmless no-op setDirty', () => {
    // Real assertion: this must not throw just because no
    // ConfigDirtyGuardContext.Provider exists anywhere above it — see
    // MacroPanel.tsx's own comment on being reusable outside ConfigurationPage.
    expect(() => render(<Consumer />)).not.toThrow();
    fireEvent.click(screen.getByText('make dirty'));
    // No observable effect expected — the point is just that nothing throws.
  });

  it('a consumer rendered under a real provider reaches that provider\'s own setDirty', () => {
    const setDirty = vi.fn();
    render(
      <ConfigDirtyGuardContext.Provider value={{ setDirty }}>
        <Consumer />
      </ConfigDirtyGuardContext.Provider>
    );

    fireEvent.click(screen.getByText('make dirty'));
    expect(setDirty).toHaveBeenCalledWith(true);
  });
});

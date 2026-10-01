// src/utils/uiPreferences.test.ts — Batch 330.
import { describe, it, expect, beforeEach } from 'vitest';
import { getUiPreference, setUiPreference, clearUiPreference } from './uiPreferences';

let store: Record<string, string> = {};
let broken = false;
beforeEach(() => {
  store = {};
  broken = false;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => { if (broken) throw new Error('blocked'); return store[k] ?? null; },
    setItem: (k: string, v: string) => { if (broken) throw new Error('quota'); store[k] = v; },
    removeItem: (k: string) => { if (broken) throw new Error('blocked'); delete store[k]; },
  };
});

describe('uiPreferences', () => {
  it('stores, reads and clears a preference under its own prefix', () => {
    expect(getUiPreference('sidebarCollapsed', false)).toBe(false);
    setUiPreference('sidebarCollapsed', true);
    expect(store).toEqual({ ps_ui_sidebarCollapsed: 'true' });
    expect(getUiPreference('sidebarCollapsed', false)).toBe(true);
    clearUiPreference('sidebarCollapsed');
    expect(getUiPreference('sidebarCollapsed', false)).toBe(false);
  });

  it('falls back to the default when storage is blocked or holds bad data', () => {
    store.ps_ui_margins = '{not json';
    expect(getUiPreference('margins', 10)).toBe(10);
    broken = true;
    expect(getUiPreference('margins', 10)).toBe(10);
    expect(() => setUiPreference('margins', 12)).not.toThrow();
    expect(() => clearUiPreference('margins')).not.toThrow();
  });
});

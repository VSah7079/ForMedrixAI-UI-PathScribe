// src/services/terminologySearch/codeSearchService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { searchCodes } from './codeSearchService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('searchCodes("CPT", ...) — real fix: replaces the permanent, documented "not yet implemented" stub', () => {
  it('returns real, seeded codes from the active RVU code map version, not an empty array', async () => {
    const results = await searchCodes('CPT', '');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].system).toBe('CPT');
  });

  it('filters by a real query against code or description', async () => {
    const results = await searchCodes('CPT', '88305');
    expect(results.some(r => r.code === '88305')).toBe(true);
    expect(results.every(r => r.code === '88305')).toBe(true); // no unrelated codes leak in
  });

  it('filters by description text too, not just the code itself', async () => {
    // Real fix, found while unifying two previously-duplicate billing
    // dictionaries: this used to search for "immunohistochemistry" -
    // that stopped matching once CODE_MAP_TABLE's own descriptions
    // became synthetic ("Code 88342 — Stain Level") per direct
    // guidance on PS-92 (no real AMA CPT text in this table at all).
    // Real, honest trade-off of that change: searching by medical
    // terminology no longer works, only by code number or the
    // synthetic level phrase itself - this test now verifies the
    // latter, which is what the description field actually contains.
    const results = await searchCodes('CPT', 'stain level');
    expect(results.some(r => r.code === '88342')).toBe(true);
  });

  it('returns no results for a genuinely unmatched query, not a fabricated fallback', async () => {
    const results = await searchCodes('CPT', 'not-a-real-code-xyz');
    expect(results).toHaveLength(0);
  });
});

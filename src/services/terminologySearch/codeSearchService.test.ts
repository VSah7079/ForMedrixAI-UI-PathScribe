// src/services/terminologySearch/codeSearchService.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchCodes, verifyCodeExists, filterToVerifiedCodes, clearVerifiedCodeCache } from './codeSearchService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  // Real, per direct guidance's own caching optimization: module-level
  // cache state would otherwise leak between test cases, since several
  // tests in this file reuse the same real code values.
  clearVerifiedCodeCache();
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

describe('verifyCodeExists / filterToVerifiedCodes — real, per direct guidance: "before any suggestion is [shown], verify that code actually exists"', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('CPT is always trusted here — it already has its own, separate, existing re-verification in AddCodeModal.tsx, never checked twice', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
    const result = await verifyCodeExists('88305', 'CPT', 'anything');
    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a real, live search result with an exact matching code verifies as true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { results: [{ ui: '254837009', name: 'Malignant tumor of breast', rootSource: 'SNOMEDCT_US' }] } }),
    }) as any;
    const result = await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor of breast');
    expect(result).toBe(true);
  });

  it('a code that never appears among the real, live search results verifies as false — the exact real-world hallucination case this whole feature exists to catch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { results: [{ ui: '254837009', name: 'Malignant tumor of breast', rootSource: 'SNOMEDCT_US' }] } }),
    }) as any;
    const result = await verifyCodeExists('999999999', 'SNOMED', 'Malignant tumor of breast');
    expect(result).toBe(false);
  });

  it('fails closed, not open, on a real network/endpoint error — an unverifiable code is never assumed real', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;
    const result = await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor of breast');
    expect(result).toBe(false);
  });

  it('filterToVerifiedCodes drops only the unverified suggestions, keeping every genuinely real one', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      // Real, distinct results per real query, mirroring how the real
      // UTS endpoint would actually behave for two different searches.
      if (String(url).includes('Real')) {
        return { ok: true, json: async () => ({ result: { results: [{ ui: 'REAL-CODE-1', name: 'Real Concept', rootSource: 'SNOMEDCT_US' }] } }) };
      }
      return { ok: true, json: async () => ({ result: { results: [] } }) };
    }) as any;

    const suggestions = [
      { code: 'REAL-CODE-1', system: 'SNOMED', display: 'Real Concept' },
      { code: 'FAKE-CODE-1', system: 'SNOMED', display: 'Hallucinated Concept' },
    ];
    const verified = await filterToVerifiedCodes(suggestions);
    expect(verified).toHaveLength(1);
    expect(verified[0].code).toBe('REAL-CODE-1');
  });
});

describe('verifyCodeExists — real, per direct guidance: "optimize our code and approach" — caching eliminates real, redundant round trips', () => {
  it('a second, identical verification never makes a second network call — reuses the real, cached positive result', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { results: [{ ui: '254837009', name: 'Malignant tumor', rootSource: 'SNOMEDCT_US' }] } }),
    });
    globalThis.fetch = fetchSpy as any;

    await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor');
    await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('a real, positive result is reused across a genuinely DIFFERENT search phrase for the same code — existence doesn\'t depend on how it was found', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { results: [{ ui: '254837009', name: 'Malignant tumor', rootSource: 'SNOMEDCT_US' }] } }),
    });
    globalThis.fetch = fetchSpy as any;

    await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor of breast');
    const second = await verifyCodeExists('254837009', 'SNOMED', 'a completely different search phrase');
    expect(second).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('a negative result for the exact same query is cached too — avoids re-attempting an identical, already-failed search', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { results: [] } }) });
    globalThis.fetch = fetchSpy as any;

    await verifyCodeExists('999999999', 'SNOMED', 'some phrase');
    await verifyCodeExists('999999999', 'SNOMED', 'some phrase');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('real safety property: a negative result never blocks a genuinely different search phrase from trying again for the same code — never risks hiding a real code behind one bad query', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { results: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { results: [{ ui: '254837009', name: 'Malignant tumor', rootSource: 'SNOMEDCT_US' }] } }) });
    globalThis.fetch = fetchSpy as any;

    const first = await verifyCodeExists('254837009', 'SNOMED', 'a poor search phrase');
    const second = await verifyCodeExists('254837009', 'SNOMED', 'a better search phrase');
    expect(first).toBe(false);
    expect(second).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('real safety property: a network/timeout failure is never cached — a transient outage never permanently hides a real code', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    globalThis.fetch = fetchSpy as any;

    await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor');
    await verifyCodeExists('254837009', 'SNOMED', 'Malignant tumor');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('codeSearchService — real, per direct guidance: "everything needs to be fast as possible" — a real, explicit 5s search timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('a real fetch() that never resolves is genuinely aborted after 5 real seconds, not left hanging indefinitely', async () => {
    // Real, per direct guidance: simulates the real, actual
    // AbortController/fetch() interaction, same established pattern
    // as dispatchInterfaceMessage.test.ts's own real timeout test —
    // a real fetch() respects the passed `signal` and rejects with a
    // real AbortError once it fires, rather than just asserting the
    // timer fired in isolation.
    vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit)?.signal;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const resultPromise = searchCodes('SNOMED', 'carcinoma');
    // Real, per direct guidance: attaches the rejection expectation
    // BEFORE advancing timers, not after — a genuinely rejecting
    // promise (searchSnomed re-throws on failure, unlike
    // dispatchInterfaceMessage's own "resolve with an error object"
    // contract) needs its handler attached before the rejection
    // actually fires, or Node's own unhandled-rejection tracking
    // notices the gap even though the test itself still passes.
    const assertion = expect(resultPromise).rejects.toThrow('SNOMED search is currently unavailable');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('a real response arriving just before the 5s timeout is NOT treated as a timeout', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve({ ok: true, json: async () => ({ result: { results: [] } }) } as any), 4000);
      });
    });

    const resultPromise = searchCodes('SNOMED', 'carcinoma');
    await vi.advanceTimersByTimeAsync(4000);
    const results = await resultPromise;
    expect(results).toEqual([]);
  });
});

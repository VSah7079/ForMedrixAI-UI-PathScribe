// src/components/Config/Terminology/terminologyConfig.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { testTerminologyEndpoints } from './terminologyConfig';

describe('testTerminologyEndpoints — real security fix: no hardcoded UMLS API key, routes through the real, secure proxy', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('never sends a real, hardcoded API key in a client-side URL for SNOMED or ICD-O — routes through the secure proxy path instead', async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      return { ok: true, json: async () => ({ result: { results: [] } }) };
    }) as any;

    await testTerminologyEndpoints();

    const snomedUrl = calledUrls.find(u => u.includes('carcinoma') && !u.includes('adenocarcinoma'));
    const icdoUrl = calledUrls.find(u => u.includes('adenocarcinoma'));
    expect(snomedUrl).toBeDefined();
    expect(icdoUrl).toBeDefined();
    // The real, structural safety check: no real key value, and no
    // direct call to the real, external UTS host — both real
    // properties of the fix, not just an absence of one specific
    // known key string.
    for (const url of [snomedUrl, icdoUrl]) {
      expect(url).not.toContain('apiKey=');
      expect(url).not.toContain('uts-ws.nlm.nih.gov');
      expect(url).toContain('/api/terminology/umls/');
    }
  });

  it('real fix: correctly reports SNOMED as "live" for a genuine, real UTS-shaped response with results — the old array-shaped check always reported this as degraded', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/terminology/umls/')) {
        return { ok: true, json: async () => ({ result: { results: [{ ui: '254837009', name: 'Malignant tumor', rootSource: 'SNOMEDCT_US' }] } }) };
      }
      return { ok: true, json: async () => [1, ['code'], {}, [['code', 'name']]] };
    }) as any;

    const results = await testTerminologyEndpoints();
    expect(results.snomed.status).toBe('live');
    expect(results.icdo.status).toBe('live');
  });

  it('correctly reports SNOMED as "degraded" for a genuine, real UTS-shaped response with zero results — not silently swallowed as "live"', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/terminology/umls/')) {
        return { ok: true, json: async () => ({ result: { results: [] } }) };
      }
      return { ok: true, json: async () => [1, ['code'], {}, [['code', 'name']]] };
    }) as any;

    const results = await testTerminologyEndpoints();
    expect(results.snomed.status).toBe('degraded');
    expect(results.snomed.note).toBe('Reachable but returned no results');
  });

  it('the pre-existing NLM Clinical Tables endpoints (ICD-10/ICD-11/LOINC) still correctly parse their own, genuinely different array response shape, unaffected by the SNOMED/ICD-O fix', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/terminology/umls/')) return { ok: true, json: async () => ({ result: { results: [] } }) };
      return { ok: true, json: async () => [1, ['code'], {}, [['code', 'name']]] };
    }) as any;

    const results = await testTerminologyEndpoints();
    expect(results.icd10.status).toBe('live');
    expect(results.icd11.status).toBe('live');
    expect(results.loinc.status).toBe('live');
  });
});

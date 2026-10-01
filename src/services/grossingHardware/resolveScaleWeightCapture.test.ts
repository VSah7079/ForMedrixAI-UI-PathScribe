// src/services/grossingHardware/resolveScaleWeightCapture.test.ts
import { describe, it, expect } from 'vitest';
import { resolveScaleWeightCapture } from './resolveScaleWeightCapture';
import type { GrossingHardwareProfile } from './IGrossingHardwareProfileService';

const agentProfile: GrossingHardwareProfile = {
  id: 'p1', kind: 'scale', label: 'Test Scale', bridgeType: 'pathscribe_agent',
  agentBaseUrl: 'https://127.0.0.1:9100', isActive: true, createdAt: '', updatedAt: '',
};

const manualProfile: GrossingHardwareProfile = {
  id: 'p2', kind: 'scale', label: 'Manual', bridgeType: 'manual_entry_only', isActive: true, createdAt: '', updatedAt: '',
};

const mockFetch = (impl: (url: string) => Promise<Response>) => impl as unknown as typeof fetch;

describe('resolveScaleWeightCapture — real, per the RFP-APLIS-2026-GLOBAL Grossing Station Hardware Integration gap', () => {
  it('real, a manual_entry_only profile honestly reports not_configured, never attempts a fetch at all', async () => {
    let fetchCalled = false;
    const fetchImpl = mockFetch(async () => { fetchCalled = true; return new Response('{}'); });
    const result = await resolveScaleWeightCapture(manualProfile, fetchImpl);
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(fetchCalled).toBe(false);
  });

  it('real, no profile at all honestly reports not_configured', async () => {
    const result = await resolveScaleWeightCapture(null);
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('refuses a plain-HTTP agent address without fetching (Batch 327)', async () => {
    let fetchCalled = false;
    const fetchImpl = mockFetch(async () => { fetchCalled = true; return new Response('{}'); });
    const result = await resolveScaleWeightCapture({ ...agentProfile, agentBaseUrl: 'http://localhost:9191' }, fetchImpl);
    expect(result).toEqual({ ok: false, reason: 'not_https' });
    expect(fetchCalled).toBe(false);
  });

  it('reads the weight from the https address', async () => {
    const urls: string[] = [];
    const fetchImpl = mockFetch(async url => { urls.push(url); return new Response(JSON.stringify({ grams: 12, stable: true }), { status: 200 }); });
    await resolveScaleWeightCapture(agentProfile, fetchImpl);
    expect(urls).toEqual(['https://127.0.0.1:9100/scale/weight']);
  });

  it('real, a genuinely stable reading is accepted', async () => {
    const fetchImpl = mockFetch(async () => new Response(JSON.stringify({ grams: 45.2, stable: true }), { status: 200 }));
    const result = await resolveScaleWeightCapture(agentProfile, fetchImpl);
    expect(result).toEqual({ ok: true, grams: 45.2 });
  });

  it('real, a genuinely unstable (still-settling) reading is honestly rejected, never accepted as real', async () => {
    const fetchImpl = mockFetch(async () => new Response(JSON.stringify({ grams: 45.2, stable: false }), { status: 200 }));
    const result = await resolveScaleWeightCapture(agentProfile, fetchImpl);
    expect(result).toEqual({ ok: false, reason: 'unstable_reading' });
  });

  it('real, an unreachable agent (network failure) is honestly reported, never silently defaulted to a fake weight', async () => {
    const fetchImpl = mockFetch(async () => { throw new Error('network error'); });
    const result = await resolveScaleWeightCapture(agentProfile, fetchImpl);
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('real, a malformed response body is honestly rejected, never coerced into a number', async () => {
    const fetchImpl = mockFetch(async () => new Response(JSON.stringify({ unexpected: 'shape' }), { status: 200 }));
    const result = await resolveScaleWeightCapture(agentProfile, fetchImpl);
    expect(result).toEqual({ ok: false, reason: 'malformed_response' });
  });
});

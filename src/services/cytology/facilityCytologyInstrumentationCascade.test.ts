// src/services/cytology/facilityCytologyInstrumentationCascade.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("each performing facility could identify
// their own mode... is it possible that an individual system could
// have both types?", high priority given multi-facility support).
// mockCytologyInstrumentationService.test.ts already covers Tier 1
// (the Enterprise default) — not re-tested here.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { mockFacilityCytologyInstrumentationOverrideService } from './mockFacilityCytologyInstrumentationOverrideService';
import { resolveEffectiveCytologyInstrumentationModality } from './resolveEffectiveCytologyInstrumentationModality';
import { DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG } from './ICytologyInstrumentationService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockFacilityCytologyInstrumentationOverrideService — Tier 2', () => {
  it('a facility with no override returns null, not a fabricated default record', async () => {
    const res = await mockFacilityCytologyInstrumentationOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override', async () => {
    await mockFacilityCytologyInstrumentationOverrideService.create('fac-1', { modality: 'traditional_guided' });
    const res = await mockFacilityCytologyInstrumentationOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.modality).toBe('traditional_guided');
  });

  it('a second create() for the same facility is a real, honest error, never a silent second record', async () => {
    await mockFacilityCytologyInstrumentationOverrideService.create('fac-1', { modality: 'traditional_guided' });
    const second = await mockFacilityCytologyInstrumentationOverrideService.create('fac-1', { modality: 'wsi' });
    expect(second.ok).toBe(false);
  });

  it('update() changes an existing override without needing a fresh create()', async () => {
    await mockFacilityCytologyInstrumentationOverrideService.create('fac-1', { modality: 'traditional_guided' });
    await mockFacilityCytologyInstrumentationOverrideService.update('fac-1', { modality: 'wsi' });
    const res = await mockFacilityCytologyInstrumentationOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.modality).toBe('wsi');
  });

  it('update() with no existing override is a real, honest error, never a silent create', async () => {
    const res = await mockFacilityCytologyInstrumentationOverrideService.update('fac-1', { modality: 'wsi' });
    expect(res.ok).toBe(false);
  });

  it('remove() genuinely reverts to null — no override, not a soft-disabled one', async () => {
    await mockFacilityCytologyInstrumentationOverrideService.create('fac-1', { modality: 'traditional_guided' });
    await mockFacilityCytologyInstrumentationOverrideService.remove('fac-1');
    const res = await mockFacilityCytologyInstrumentationOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('two different facilities hold two real, independent overrides at once', async () => {
    await mockFacilityCytologyInstrumentationOverrideService.create('fac-wsi-upgrade', { modality: 'wsi' });
    await mockFacilityCytologyInstrumentationOverrideService.create('fac-legacy-scope', { modality: 'traditional_guided' });
    const [a, b] = await Promise.all([
      mockFacilityCytologyInstrumentationOverrideService.getForFacility('fac-wsi-upgrade'),
      mockFacilityCytologyInstrumentationOverrideService.getForFacility('fac-legacy-scope'),
    ]);
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect(a.data?.overrides.modality).toBe('wsi');
    expect(b.data?.overrides.modality).toBe('traditional_guided');
  });
});

describe('resolveEffectiveCytologyInstrumentationModality — real, 2-tier cascade merge', () => {
  it('with no facility override, the Enterprise default (wsi) applies', () => {
    const result = resolveEffectiveCytologyInstrumentationModality(DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG, null);
    expect(result.modality).toBe('wsi');
  });

  it('a facility override wins over the Enterprise default', () => {
    const facilityOverride = { id: 'f1', facilityId: 'fac-1', overrides: { modality: 'traditional_guided' as const }, createdAt: '', updatedAt: '' };
    const result = resolveEffectiveCytologyInstrumentationModality(DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG, facilityOverride);
    expect(result.modality).toBe('traditional_guided');
  });

  it('a real, practical scenario: one system genuinely runs both modalities at once, resolved independently per facility', () => {
    const enterpriseDefault = DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG; // wsi
    const legacyFacilityOverride = { id: 'f1', facilityId: 'fac-legacy-scope', overrides: { modality: 'traditional_guided' as const }, createdAt: '', updatedAt: '' };
    // The legacy-scope facility genuinely resolves to traditional_guided...
    expect(resolveEffectiveCytologyInstrumentationModality(enterpriseDefault, legacyFacilityOverride).modality).toBe('traditional_guided');
    // ...while a different, non-overridden facility in the SAME real system still correctly resolves to the Enterprise wsi default, at the same time.
    expect(resolveEffectiveCytologyInstrumentationModality(enterpriseDefault, null).modality).toBe('wsi');
  });
});

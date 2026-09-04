// src/services/cytology/cytologyRegistrySettingsCascade.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyRegistrySettingsService } from './mockCytologyRegistrySettingsService';
import { mockFacilityCytologyRegistryOverrideService } from './mockFacilityCytologyRegistryOverrideService';
import { resolveEffectiveCytologyRegistrySettings } from './resolveEffectiveCytologyRegistrySettings';
import { DEFAULT_CYTOLOGY_REGISTRY_SETTINGS } from './ICytologyRegistrySettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyRegistrySettingsService — Tier 1, Enterprise default', () => {
  it('defaults to no real registry obligation, matching the real, decentralized US/CA norm', async () => {
    const res = await mockCytologyRegistrySettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.registryId).toBe('none');
  });

  it('a real update genuinely persists', async () => {
    await mockCytologyRegistrySettingsService.update({ registryId: 'kncsp_kccr_korea' });
    const res = await mockCytologyRegistrySettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.registryId).toBe('kncsp_kccr_korea');
  });
});

describe('mockFacilityCytologyRegistryOverrideService — Tier 2', () => {
  it('a facility with no override returns null', async () => {
    const res = await mockFacilityCytologyRegistryOverrideService.getForFacility('fac-kr-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override, isolated from other facilities', async () => {
    await mockFacilityCytologyRegistryOverrideService.create('fac-kr-1', { registryId: 'kncsp_kccr_korea' });
    const res = await mockFacilityCytologyRegistryOverrideService.getForFacility('fac-kr-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.registryId).toBe('kncsp_kccr_korea');
    const other = await mockFacilityCytologyRegistryOverrideService.getForFacility('fac-us-1');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });
});

describe('resolveEffectiveCytologyRegistrySettings — real, two-tier cascade', () => {
  it('with no facility override, the Enterprise default (none) wins', () => {
    const effective = resolveEffectiveCytologyRegistrySettings(DEFAULT_CYTOLOGY_REGISTRY_SETTINGS, null);
    expect(effective.registryId).toBe('none');
  });

  it('a real, end-to-end scenario: Enterprise says none, a Korean facility overrides to kncsp_kccr_korea, a US facility still gets none', async () => {
    await mockCytologyRegistrySettingsService.reset();
    await mockFacilityCytologyRegistryOverrideService.create('fac-kr-1', { registryId: 'kncsp_kccr_korea' });

    const enterprise = await mockCytologyRegistrySettingsService.get();
    const krFacility = await mockFacilityCytologyRegistryOverrideService.getForFacility('fac-kr-1');
    const usFacility = await mockFacilityCytologyRegistryOverrideService.getForFacility('fac-us-1');
    if (!enterprise.ok || !krFacility.ok || !usFacility.ok) throw new Error('setup failed');

    expect(resolveEffectiveCytologyRegistrySettings(enterprise.data, krFacility.data).registryId).toBe('kncsp_kccr_korea');
    expect(resolveEffectiveCytologyRegistrySettings(enterprise.data, usFacility.data).registryId).toBe('none');
  });
});

// src/services/facilities/registrySettingsCascade.test.ts
// Real, migrated from services/cytology/cytologyRegistrySettingsCascade.test.ts —
// see IRegistrySettingsService.ts's own header for why this moved.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockRegistrySettingsService } from './mockRegistrySettingsService';
import { mockFacilityRegistryOverrideService } from './mockFacilityRegistryOverrideService';
import { resolveEffectiveRegistrySettings } from './resolveEffectiveRegistrySettings';
import { DEFAULT_REGISTRY_SETTINGS } from './IRegistrySettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockRegistrySettingsService — Tier 1, Enterprise default', () => {
  it('defaults to no real registry obligation, matching the real, decentralized US/CA norm', async () => {
    const res = await mockRegistrySettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.registryId).toBe('none');
  });

  it('a real update genuinely persists', async () => {
    await mockRegistrySettingsService.update({ registryId: 'kncsp_kccr_korea' });
    const res = await mockRegistrySettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.registryId).toBe('kncsp_kccr_korea');
  });
});

describe('mockFacilityRegistryOverrideService — Tier 2', () => {
  it('a facility with no override returns null', async () => {
    const res = await mockFacilityRegistryOverrideService.getForFacility('fac-kr-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override, isolated from other facilities', async () => {
    await mockFacilityRegistryOverrideService.create('fac-kr-1', { registryId: 'kncsp_kccr_korea' });
    const res = await mockFacilityRegistryOverrideService.getForFacility('fac-kr-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.registryId).toBe('kncsp_kccr_korea');
    const other = await mockFacilityRegistryOverrideService.getForFacility('fac-us-1');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });

  it('a real, genuinely specimen-type-agnostic scenario: a single facility-level override (e.g. a Dutch lab reporting to PALGA) is one real record, not one per module', async () => {
    await mockFacilityRegistryOverrideService.create('fac-nl-1', { registryId: 'palga_netherlands' });
    const res = await mockFacilityRegistryOverrideService.getForFacility('fac-nl-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.registryId).toBe('palga_netherlands');
  });
});

describe('resolveEffectiveRegistrySettings — real, two-tier cascade', () => {
  it('with no facility override, the Enterprise default (none) wins', () => {
    const effective = resolveEffectiveRegistrySettings(DEFAULT_REGISTRY_SETTINGS, null);
    expect(effective.registryId).toBe('none');
  });

  it('a real, end-to-end scenario: Enterprise says none, a Korean facility overrides to kncsp_kccr_korea, a US facility still gets none', async () => {
    await mockRegistrySettingsService.reset();
    await mockFacilityRegistryOverrideService.create('fac-kr-1', { registryId: 'kncsp_kccr_korea' });

    const enterprise = await mockRegistrySettingsService.get();
    const krFacility = await mockFacilityRegistryOverrideService.getForFacility('fac-kr-1');
    const usFacility = await mockFacilityRegistryOverrideService.getForFacility('fac-us-1');
    if (!enterprise.ok || !krFacility.ok || !usFacility.ok) throw new Error('setup failed');

    expect(resolveEffectiveRegistrySettings(enterprise.data, krFacility.data).registryId).toBe('kncsp_kccr_korea');
    expect(resolveEffectiveRegistrySettings(enterprise.data, usFacility.data).registryId).toBe('none');
  });
});

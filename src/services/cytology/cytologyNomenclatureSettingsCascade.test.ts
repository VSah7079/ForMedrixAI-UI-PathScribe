// src/services/cytology/cytologyNomenclatureSettingsCascade.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyNomenclatureSettingsService } from './mockCytologyNomenclatureSettingsService';
import { mockFacilityCytologyNomenclatureOverrideService } from './mockFacilityCytologyNomenclatureOverrideService';
import { resolveEffectiveCytologyNomenclatureSettings } from './resolveEffectiveCytologyNomenclatureSettings';
import { DEFAULT_CYTOLOGY_NOMENCLATURE_SETTINGS } from './ICytologyNomenclatureSettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyNomenclatureSettingsService — Tier 1, Enterprise default', () => {
  it('defaults to the real, standard Bethesda system', async () => {
    const res = await mockCytologyNomenclatureSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.nomenclatureSystem).toBe('bethesda');
  });

  it('a real update genuinely persists', async () => {
    await mockCytologyNomenclatureSettingsService.update({ nomenclatureSystem: 'bscc_rcpath' });
    const res = await mockCytologyNomenclatureSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.nomenclatureSystem).toBe('bscc_rcpath');
  });
});

describe('mockFacilityCytologyNomenclatureOverrideService — Tier 2', () => {
  it('a facility with no override returns null', async () => {
    const res = await mockFacilityCytologyNomenclatureOverrideService.getForFacility('fac-uk-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override', async () => {
    await mockFacilityCytologyNomenclatureOverrideService.create('fac-uk-1', { nomenclatureSystem: 'bscc_rcpath' });
    const res = await mockFacilityCytologyNomenclatureOverrideService.getForFacility('fac-uk-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.nomenclatureSystem).toBe('bscc_rcpath');
  });

  it('a real override for one facility never leaks into another facility\'s own lookup', async () => {
    await mockFacilityCytologyNomenclatureOverrideService.create('fac-uk-1', { nomenclatureSystem: 'bscc_rcpath' });
    const other = await mockFacilityCytologyNomenclatureOverrideService.getForFacility('fac-us-1');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });
});

describe('resolveEffectiveCytologyNomenclatureSettings — real, two-tier cascade', () => {
  it('with no facility override, the Enterprise default (Bethesda) wins', () => {
    const effective = resolveEffectiveCytologyNomenclatureSettings(DEFAULT_CYTOLOGY_NOMENCLATURE_SETTINGS, null);
    expect(effective.nomenclatureSystem).toBe('bethesda');
  });

  it('a real UK facility override wins over the Enterprise default', () => {
    const facilityOverride = {
      id: 'fac-nomenclature-1', facilityId: 'fac-uk-1',
      overrides: { nomenclatureSystem: 'bscc_rcpath' as const },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const effective = resolveEffectiveCytologyNomenclatureSettings(DEFAULT_CYTOLOGY_NOMENCLATURE_SETTINGS, facilityOverride);
    expect(effective.nomenclatureSystem).toBe('bscc_rcpath');
  });

  it('a real, end-to-end scenario: Enterprise says Bethesda, a UK facility overrides to BSCC/RCPath, a US facility still gets the Enterprise default', async () => {
    // Real, explicit baseline first — this mock service's own
    // module-level state can carry a prior test's mutation forward.
    await mockCytologyNomenclatureSettingsService.reset();
    await mockFacilityCytologyNomenclatureOverrideService.create('fac-uk-1', { nomenclatureSystem: 'bscc_rcpath' });

    const enterprise = await mockCytologyNomenclatureSettingsService.get();
    const ukFacility = await mockFacilityCytologyNomenclatureOverrideService.getForFacility('fac-uk-1');
    const usFacility = await mockFacilityCytologyNomenclatureOverrideService.getForFacility('fac-us-1');
    if (!enterprise.ok || !ukFacility.ok || !usFacility.ok) throw new Error('setup failed');

    expect(resolveEffectiveCytologyNomenclatureSettings(enterprise.data, ukFacility.data).nomenclatureSystem).toBe('bscc_rcpath');
    expect(resolveEffectiveCytologyNomenclatureSettings(enterprise.data, usFacility.data).nomenclatureSystem).toBe('bethesda');
  });
});

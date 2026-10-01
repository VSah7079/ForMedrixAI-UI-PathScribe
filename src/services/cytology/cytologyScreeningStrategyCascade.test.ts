// src/services/cytology/cytologyScreeningStrategyCascade.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyScreeningStrategyService } from './mockCytologyScreeningStrategyService';
import { mockFacilityCytologyScreeningStrategyOverrideService } from './mockFacilityCytologyScreeningStrategyOverrideService';
import { resolveEffectiveCytologyScreeningStrategy } from './resolveEffectiveCytologyScreeningStrategy';
import { DEFAULT_CYTOLOGY_SCREENING_STRATEGY } from './ICytologyScreeningStrategyService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyScreeningStrategyService — Tier 1, Enterprise default', () => {
  it('defaults to the real, standard co-testing strategy', async () => {
    const res = await mockCytologyScreeningStrategyService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.screeningStrategy).toBe('co_testing');
  });

  it('a real update genuinely persists', async () => {
    await mockCytologyScreeningStrategyService.update({ screeningStrategy: 'primary_hpv_reflex' });
    const res = await mockCytologyScreeningStrategyService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.screeningStrategy).toBe('primary_hpv_reflex');
  });
});

describe('mockFacilityCytologyScreeningStrategyOverrideService — Tier 2', () => {
  it('a facility with no override returns null', async () => {
    const res = await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility('fac-uk-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override, isolated from other facilities', async () => {
    await mockFacilityCytologyScreeningStrategyOverrideService.create('fac-uk-1', { screeningStrategy: 'primary_hpv_reflex' });
    const res = await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility('fac-uk-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.screeningStrategy).toBe('primary_hpv_reflex');
    const other = await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility('fac-us-1');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });
});

describe('resolveEffectiveCytologyScreeningStrategy — real, two-tier cascade', () => {
  it('with no facility override, the Enterprise default (co-testing) wins', () => {
    const effective = resolveEffectiveCytologyScreeningStrategy(DEFAULT_CYTOLOGY_SCREENING_STRATEGY, null);
    expect(effective.screeningStrategy).toBe('co_testing');
  });

  it('a real end-to-end scenario: Enterprise says co-testing, a UK facility overrides to primary HPV reflex, a US facility still gets co-testing', async () => {
    await mockCytologyScreeningStrategyService.reset();
    await mockFacilityCytologyScreeningStrategyOverrideService.create('fac-uk-1', { screeningStrategy: 'primary_hpv_reflex' });

    const enterprise = await mockCytologyScreeningStrategyService.get();
    const ukFacility = await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility('fac-uk-1');
    const usFacility = await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility('fac-us-1');
    if (!enterprise.ok || !ukFacility.ok || !usFacility.ok) throw new Error('setup failed');

    expect(resolveEffectiveCytologyScreeningStrategy(enterprise.data, ukFacility.data).screeningStrategy).toBe('primary_hpv_reflex');
    expect(resolveEffectiveCytologyScreeningStrategy(enterprise.data, usFacility.data).screeningStrategy).toBe('co_testing');
  });
});

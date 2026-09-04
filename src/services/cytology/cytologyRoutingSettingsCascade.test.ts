// src/services/cytology/cytologyRoutingSettingsCascade.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyRoutingSettingsService } from './mockCytologyRoutingSettingsService';
import { mockFacilityCytologyRoutingOverrideService } from './mockFacilityCytologyRoutingOverrideService';
import { resolveEffectiveCytologyRoutingSettings } from './resolveEffectiveCytologyRoutingSettings';
import { resolveCytologyWorklistRouting } from './resolveCytologyWorklistRouting';
import { DEFAULT_CYTOLOGY_ROUTING_SETTINGS } from './ICytologyRoutingSettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyRoutingSettingsService — Tier 1, Enterprise default', () => {
  it('defaults to the real, standard "route non-GYN like Surgical Pathology" baseline', async () => {
    const res = await mockCytologyRoutingSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.nonGynCytologyRouting).toBe('surgical_pathology_worklist');
  });

  it('a real update genuinely persists', async () => {
    await mockCytologyRoutingSettingsService.update({ nonGynCytologyRouting: 'cytology_worklist' });
    const res = await mockCytologyRoutingSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.nonGynCytologyRouting).toBe('cytology_worklist');
  });

  it('reset genuinely reverts to the real default', async () => {
    await mockCytologyRoutingSettingsService.update({ nonGynCytologyRouting: 'cytology_worklist' });
    await mockCytologyRoutingSettingsService.reset();
    const res = await mockCytologyRoutingSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.nonGynCytologyRouting).toBe('surgical_pathology_worklist');
  });
});

describe('mockFacilityCytologyRoutingOverrideService — Tier 2', () => {
  it('a facility with no override returns null, not a fabricated default record', async () => {
    const res = await mockFacilityCytologyRoutingOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override', async () => {
    await mockFacilityCytologyRoutingOverrideService.create('fac-1', { nonGynCytologyRouting: 'cytology_worklist' });
    const res = await mockFacilityCytologyRoutingOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.nonGynCytologyRouting).toBe('cytology_worklist');
  });

  it('a second create() for the same facility is a real error, not a silent second record', async () => {
    await mockFacilityCytologyRoutingOverrideService.create('fac-1', { nonGynCytologyRouting: 'cytology_worklist' });
    const second = await mockFacilityCytologyRoutingOverrideService.create('fac-1', { nonGynCytologyRouting: 'surgical_pathology_worklist' });
    expect(second.ok).toBe(false);
  });

  it('update requires an existing override — never silently creates one', async () => {
    const res = await mockFacilityCytologyRoutingOverrideService.update('fac-no-override', { nonGynCytologyRouting: 'cytology_worklist' });
    expect(res.ok).toBe(false);
  });

  it('remove genuinely reverts getForFacility to null', async () => {
    await mockFacilityCytologyRoutingOverrideService.create('fac-1', { nonGynCytologyRouting: 'cytology_worklist' });
    await mockFacilityCytologyRoutingOverrideService.remove('fac-1');
    const res = await mockFacilityCytologyRoutingOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('a real override for one facility never leaks into another facility\'s own lookup', async () => {
    await mockFacilityCytologyRoutingOverrideService.create('fac-1', { nonGynCytologyRouting: 'cytology_worklist' });
    const other = await mockFacilityCytologyRoutingOverrideService.getForFacility('fac-2');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });
});

describe('resolveEffectiveCytologyRoutingSettings — real, two-tier cascade', () => {
  it('with no facility override, the Enterprise default wins', () => {
    const effective = resolveEffectiveCytologyRoutingSettings(DEFAULT_CYTOLOGY_ROUTING_SETTINGS, null);
    expect(effective.nonGynCytologyRouting).toBe('surgical_pathology_worklist');
  });

  it('a real facility override wins over the Enterprise default', () => {
    const facilityOverride = {
      id: 'fac-routing-1', facilityId: 'fac-1',
      overrides: { nonGynCytologyRouting: 'cytology_worklist' as const },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const effective = resolveEffectiveCytologyRoutingSettings(DEFAULT_CYTOLOGY_ROUTING_SETTINGS, facilityOverride);
    expect(effective.nonGynCytologyRouting).toBe('cytology_worklist');
  });

  it('a real, end-to-end scenario: Enterprise says Surgical, one facility overrides to Cytology, another facility still gets the Enterprise default', async () => {
    await mockFacilityCytologyRoutingOverrideService.create('fac-override', { nonGynCytologyRouting: 'cytology_worklist' });

    const enterprise = await mockCytologyRoutingSettingsService.get();
    const overriddenFacility = await mockFacilityCytologyRoutingOverrideService.getForFacility('fac-override');
    const plainFacility = await mockFacilityCytologyRoutingOverrideService.getForFacility('fac-plain');
    if (!enterprise.ok || !overriddenFacility.ok || !plainFacility.ok) throw new Error('setup failed');

    const effectiveOverridden = resolveEffectiveCytologyRoutingSettings(enterprise.data, overriddenFacility.data);
    const effectivePlain = resolveEffectiveCytologyRoutingSettings(enterprise.data, plainFacility.data);

    expect(effectiveOverridden.nonGynCytologyRouting).toBe('cytology_worklist');
    expect(effectivePlain.nonGynCytologyRouting).toBe('surgical_pathology_worklist');

    // And the real, downstream worklist-routing decision follows correctly for a non-GYN specimen at each facility:
    expect(resolveCytologyWorklistRouting(false, effectiveOverridden.nonGynCytologyRouting)).toBe('cytology_worklist');
    expect(resolveCytologyWorklistRouting(false, effectivePlain.nonGynCytologyRouting)).toBe('surgical_pathology_worklist');
    // GYN cytology at either facility is unaffected either way — never configurable.
    expect(resolveCytologyWorklistRouting(true, effectiveOverridden.nonGynCytologyRouting)).toBe('cytology_worklist');
    expect(resolveCytologyWorklistRouting(true, effectivePlain.nonGynCytologyRouting)).toBe('cytology_worklist');
  });
});

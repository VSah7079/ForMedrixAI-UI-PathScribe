// src/services/cytology/cytologyWorkloadCapSettingsCascade.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyWorkloadCapSettingsService } from './mockCytologyWorkloadCapSettingsService';
import { mockFacilityCytologyWorkloadCapOverrideService } from './mockFacilityCytologyWorkloadCapOverrideService';
import { mockStaffCytologyWorkloadCapOverrideService } from './mockStaffCytologyWorkloadCapOverrideService';
import { resolveEffectiveCytologyWorkloadCap } from './resolveEffectiveCytologyWorkloadCap';
import { DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS } from './ICytologyWorkloadCapSettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyWorkloadCapSettingsService — Tier 1, Enterprise default', () => {
  it('defaults to the real, standard 100-slide CLIA cap', async () => {
    const res = await mockCytologyWorkloadCapSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.dailySlideCap).toBe(100);
  });
});

describe('mockFacilityCytologyWorkloadCapOverrideService — Tier 2', () => {
  it('a facility with no override returns null', async () => {
    const res = await mockFacilityCytologyWorkloadCapOverrideService.getForFacility('fac-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('a real, facility-wide cap persists and is isolated to that one facility', async () => {
    await mockFacilityCytologyWorkloadCapOverrideService.create('fac-001', { dailySlideCap: 120 });
    const res = await mockFacilityCytologyWorkloadCapOverrideService.getForFacility('fac-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.dailySlideCap).toBe(120);
    const other = await mockFacilityCytologyWorkloadCapOverrideService.getForFacility('fac-002');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });
});

describe('mockStaffCytologyWorkloadCapOverrideService — Tier 3', () => {
  it('a staff member with no override returns null', async () => {
    const res = await mockStaffCytologyWorkloadCapOverrideService.getForStaff('CT-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('a real, medical-director-assigned lower cap (80) persists and is isolated to that one staff member', async () => {
    await mockStaffCytologyWorkloadCapOverrideService.create('CT-001', { dailySlideCap: 80 });
    const res = await mockStaffCytologyWorkloadCapOverrideService.getForStaff('CT-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.dailySlideCap).toBe(80);
    const other = await mockStaffCytologyWorkloadCapOverrideService.getForStaff('CT-002');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toBeNull();
  });
});

describe('resolveEffectiveCytologyWorkloadCap — real, three-tier cascade, per direct guidance ("universal but configurable at the enterprise, facility and staff level")', () => {
  it('with no facility or staff override, the Enterprise default (100) wins', () => {
    const effective = resolveEffectiveCytologyWorkloadCap(DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS, null, null);
    expect(effective.dailySlideCap).toBe(100);
  });

  it('a real facility override wins over the Enterprise default when no staff override exists', () => {
    const facilityOverride = { id: 'x', facilityId: 'fac-001', overrides: { dailySlideCap: 120 }, createdAt: '', updatedAt: '' };
    const effective = resolveEffectiveCytologyWorkloadCap(DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS, facilityOverride, null);
    expect(effective.dailySlideCap).toBe(120);
  });

  it('a real staff override wins over both the facility override and the Enterprise default — the most specific setting always wins', () => {
    const facilityOverride = { id: 'x', facilityId: 'fac-001', overrides: { dailySlideCap: 120 }, createdAt: '', updatedAt: '' };
    const staffOverride = { id: 'y', staffUserId: 'CT-001', overrides: { dailySlideCap: 80 }, createdAt: '', updatedAt: '' };
    const effective = resolveEffectiveCytologyWorkloadCap(DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS, facilityOverride, staffOverride);
    expect(effective.dailySlideCap).toBe(80);
  });

  it('a real, end-to-end scenario: Enterprise says 100, a high-throughput facility overrides to 120, one staff member at that facility is individually capped lower at 80, another staff member at the same facility still gets the facility\'s own 120', async () => {
    await mockFacilityCytologyWorkloadCapOverrideService.create('fac-001', { dailySlideCap: 120 });
    await mockStaffCytologyWorkloadCapOverrideService.create('CT-001', { dailySlideCap: 80 });

    const enterprise = await mockCytologyWorkloadCapSettingsService.get();
    const facility = await mockFacilityCytologyWorkloadCapOverrideService.getForFacility('fac-001');
    const staffCapped = await mockStaffCytologyWorkloadCapOverrideService.getForStaff('CT-001');
    const staffUncapped = await mockStaffCytologyWorkloadCapOverrideService.getForStaff('CT-002');
    if (!enterprise.ok || !facility.ok || !staffCapped.ok || !staffUncapped.ok) throw new Error('setup failed');

    expect(resolveEffectiveCytologyWorkloadCap(enterprise.data, facility.data, staffCapped.data).dailySlideCap).toBe(80);
    expect(resolveEffectiveCytologyWorkloadCap(enterprise.data, facility.data, staffUncapped.data).dailySlideCap).toBe(120);
  });
});

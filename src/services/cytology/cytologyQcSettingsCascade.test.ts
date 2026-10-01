// src/services/cytology/cytologyQcSettingsCascade.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyQcSettingsService } from './mockCytologyQcSettingsService';
import { mockFacilityCytologyQcOverrideService } from './mockFacilityCytologyQcOverrideService';
import { mockStaffCytologyQcOverrideService } from './mockStaffCytologyQcOverrideService';
import { resolveEffectiveCytologyQcSettings } from './resolveEffectiveCytologyQcSettings';
import { DEFAULT_CYTOLOGY_QC_SETTINGS } from './ICytologyQcSettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyQcSettingsService — Tier 1, Enterprise default', () => {
  it('defaults to the real, standard 10% baseline for both real, independent rates', async () => {
    const res = await mockCytologyQcSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.negativeRandomSelectionRatePercent).toBe(10);
    expect(res.data.nonNegativeRandomSelectionRatePercent).toBe(10);
  });

  it('the two real rates update independently — changing one never touches the other', async () => {
    // Real, explicit baseline first — this mock service's own
    // module-level state can carry a prior test's mutation forward,
    // so don't assume a fresh 10/10 default here.
    await mockCytologyQcSettingsService.update({ negativeRandomSelectionRatePercent: 10, nonNegativeRandomSelectionRatePercent: 10 });
    await mockCytologyQcSettingsService.update({ negativeRandomSelectionRatePercent: 15 });
    const res = await mockCytologyQcSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.negativeRandomSelectionRatePercent).toBe(15);
    expect(res.data.nonNegativeRandomSelectionRatePercent).toBe(10);
  });

  it('a real update genuinely persists', async () => {
    await mockCytologyQcSettingsService.update({ negativeRandomSelectionRatePercent: 15, nonNegativeRandomSelectionRatePercent: 15 });
    const res = await mockCytologyQcSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.negativeRandomSelectionRatePercent).toBe(15);
  });

  it('reset genuinely reverts to the real default', async () => {
    await mockCytologyQcSettingsService.update({ negativeRandomSelectionRatePercent: 25, nonNegativeRandomSelectionRatePercent: 25 });
    await mockCytologyQcSettingsService.reset();
    const res = await mockCytologyQcSettingsService.get();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.negativeRandomSelectionRatePercent).toBe(10);
  });
});

describe('mockFacilityCytologyQcOverrideService — Tier 2', () => {
  it('a facility with no override returns null, not a fabricated default record', async () => {
    const res = await mockFacilityCytologyQcOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates and persists a real facility override', async () => {
    await mockFacilityCytologyQcOverrideService.create('fac-1', { negativeRandomSelectionRatePercent: 20, nonNegativeRandomSelectionRatePercent: 20 });
    const res = await mockFacilityCytologyQcOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.negativeRandomSelectionRatePercent).toBe(20);
  });

  it('a second create() for the same facility is a real, honest error, never a silent second record', async () => {
    await mockFacilityCytologyQcOverrideService.create('fac-1', { negativeRandomSelectionRatePercent: 20, nonNegativeRandomSelectionRatePercent: 20 });
    const second = await mockFacilityCytologyQcOverrideService.create('fac-1', { negativeRandomSelectionRatePercent: 30, nonNegativeRandomSelectionRatePercent: 30 });
    expect(second.ok).toBe(false);
  });

  it('remove() genuinely reverts to null — no override, not a soft-disabled one', async () => {
    await mockFacilityCytologyQcOverrideService.create('fac-1', { negativeRandomSelectionRatePercent: 20, nonNegativeRandomSelectionRatePercent: 20 });
    await mockFacilityCytologyQcOverrideService.remove('fac-1');
    const res = await mockFacilityCytologyQcOverrideService.getForFacility('fac-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });
});

describe('mockStaffCytologyQcOverrideService — Tier 3, the genuinely new tier', () => {
  it('a staff member with no override returns null', async () => {
    const res = await mockStaffCytologyQcOverrideService.getForStaff('CT-NEW-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toBeNull();
  });

  it('creates a real, higher rate for a new employee/student, per direct guidance\'s own use case', async () => {
    await mockStaffCytologyQcOverrideService.create('CT-NEW-001', { negativeRandomSelectionRatePercent: 50, nonNegativeRandomSelectionRatePercent: 50 });
    const res = await mockStaffCytologyQcOverrideService.getForStaff('CT-NEW-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data?.overrides.negativeRandomSelectionRatePercent).toBe(50);
  });

  it('a second create() for the same staff member is refused', async () => {
    await mockStaffCytologyQcOverrideService.create('CT-NEW-001', { negativeRandomSelectionRatePercent: 50, nonNegativeRandomSelectionRatePercent: 50 });
    const second = await mockStaffCytologyQcOverrideService.create('CT-NEW-001', { negativeRandomSelectionRatePercent: 40, nonNegativeRandomSelectionRatePercent: 40 });
    expect(second.ok).toBe(false);
  });
});

describe('resolveEffectiveCytologyQcSettings — real, 3-tier cascade merge', () => {
  it('with no facility or staff override, the Enterprise default applies', () => {
    const result = resolveEffectiveCytologyQcSettings(DEFAULT_CYTOLOGY_QC_SETTINGS, null, null);
    expect(result.negativeRandomSelectionRatePercent).toBe(10);
  });

  it('a facility override applies over the Enterprise default when no staff override exists', () => {
    const facilityOverride = { id: 'f1', facilityId: 'fac-1', overrides: { negativeRandomSelectionRatePercent: 20, nonNegativeRandomSelectionRatePercent: 20 }, createdAt: '', updatedAt: '' };
    const result = resolveEffectiveCytologyQcSettings(DEFAULT_CYTOLOGY_QC_SETTINGS, facilityOverride, null);
    expect(result.negativeRandomSelectionRatePercent).toBe(20);
  });

  it('a staff override wins over BOTH the facility override and the Enterprise default — the real, most-specific-wins requirement', () => {
    const facilityOverride = { id: 'f1', facilityId: 'fac-1', overrides: { negativeRandomSelectionRatePercent: 20, nonNegativeRandomSelectionRatePercent: 20 }, createdAt: '', updatedAt: '' };
    const staffOverride = { id: 's1', staffUserId: 'CT-NEW-001', overrides: { negativeRandomSelectionRatePercent: 50, nonNegativeRandomSelectionRatePercent: 50 }, createdAt: '', updatedAt: '' };
    const result = resolveEffectiveCytologyQcSettings(DEFAULT_CYTOLOGY_QC_SETTINGS, facilityOverride, staffOverride);
    expect(result.negativeRandomSelectionRatePercent).toBe(50);
  });

  it('a staff override alone (no facility override) still correctly wins over the Enterprise default', () => {
    const staffOverride = { id: 's1', staffUserId: 'CT-NEW-001', overrides: { negativeRandomSelectionRatePercent: 50, nonNegativeRandomSelectionRatePercent: 50 }, createdAt: '', updatedAt: '' };
    const result = resolveEffectiveCytologyQcSettings(DEFAULT_CYTOLOGY_QC_SETTINGS, null, staffOverride);
    expect(result.negativeRandomSelectionRatePercent).toBe(50);
  });

  it('a real, practical scenario: enterprise 10%, facility raised to 15% department-wide, one new-hire raised further to 40% — the new hire genuinely gets 40%, not the facility\'s own 15%', () => {
    const enterprise = { negativeRandomSelectionRatePercent: 10, nonNegativeRandomSelectionRatePercent: 10 };
    const facilityOverride = { id: 'f1', facilityId: 'fac-1', overrides: { negativeRandomSelectionRatePercent: 15, nonNegativeRandomSelectionRatePercent: 15 }, createdAt: '', updatedAt: '' };
    const staffOverride = { id: 's1', staffUserId: 'CT-STUDENT-1', overrides: { negativeRandomSelectionRatePercent: 40, nonNegativeRandomSelectionRatePercent: 40 }, createdAt: '', updatedAt: '' };
    expect(resolveEffectiveCytologyQcSettings(enterprise, facilityOverride, staffOverride).negativeRandomSelectionRatePercent).toBe(40);
    // A DIFFERENT, non-overridden staff member at the same facility still correctly gets the facility's own 15%.
    expect(resolveEffectiveCytologyQcSettings(enterprise, facilityOverride, null).negativeRandomSelectionRatePercent).toBe(15);
  });
});

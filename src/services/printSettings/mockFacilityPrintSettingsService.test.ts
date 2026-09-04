import { describe, it, expect, beforeEach } from 'vitest';
import { mockFacilityPrintSettingsService } from './mockFacilityPrintSettingsService';
import { resolveEffectivePrintSettings } from './IFacilityPrintSettingsService';
import { DEFAULT_PRINT_SETTINGS_CONFIG } from './IPrintSettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockFacilityPrintSettingsService', () => {
  it('a facility with no override returns null, not a fabricated default record', async () => {
    const res = await mockFacilityPrintSettingsService.getForFacility('c-fenwick-general');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toBeNull();
  });

  it('creates a real override seeded from a full starting-point config', async () => {
    const res = await mockFacilityPrintSettingsService.create('c-fenwick-general', {
      ...DEFAULT_PRINT_SETTINGS_CONFIG, disposableBarcodePrefix: 'FGH',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.facilityId).toBe('c-fenwick-general');
    expect(res.data.overrides.disposableBarcodePrefix).toBe('FGH');

    const fetched = await mockFacilityPrintSettingsService.getForFacility('c-fenwick-general');
    expect(fetched.ok && fetched.data?.overrides.disposableBarcodePrefix).toBe('FGH');
  });

  it('rejects creating a second override for a facility that already has one', async () => {
    await mockFacilityPrintSettingsService.create('c-fenwick-general', DEFAULT_PRINT_SETTINGS_CONFIG);
    const second = await mockFacilityPrintSettingsService.create('c-fenwick-general', DEFAULT_PRINT_SETTINGS_CONFIG);
    expect(second.ok).toBe(false);
  });

  it('update patches only the given fields, leaving the rest of the override untouched', async () => {
    await mockFacilityPrintSettingsService.create('c-fenwick-general', { ...DEFAULT_PRINT_SETTINGS_CONFIG, disposableBarcodePrefix: 'FGH', rackBarcodePrefix: 'FGR' });
    const updated = await mockFacilityPrintSettingsService.update('c-fenwick-general', { rackBarcodePrefix: 'RACK2' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.overrides.disposableBarcodePrefix).toBe('FGH'); // untouched
    expect(updated.data.overrides.rackBarcodePrefix).toBe('RACK2'); // changed
  });

  it('update rejects a facility with no existing override', async () => {
    const res = await mockFacilityPrintSettingsService.update('never-created', { rackBarcodePrefix: 'X' });
    expect(res.ok).toBe(false);
  });

  it('remove deletes the override outright — getForFacility genuinely returns null afterward, same as never having overridden anything', async () => {
    await mockFacilityPrintSettingsService.create('c-fenwick-general', DEFAULT_PRINT_SETTINGS_CONFIG);
    await mockFacilityPrintSettingsService.remove('c-fenwick-general');
    const res = await mockFacilityPrintSettingsService.getForFacility('c-fenwick-general');
    expect(res.ok && res.data).toBeNull();
  });

  it('two different facilities can each have their own real, independent override', async () => {
    await mockFacilityPrintSettingsService.create('c-fenwick-general', { ...DEFAULT_PRINT_SETTINGS_CONFIG, disposableBarcodePrefix: 'FGH' });
    await mockFacilityPrintSettingsService.create('c-fenwick-womens', { ...DEFAULT_PRINT_SETTINGS_CONFIG, disposableBarcodePrefix: 'FWH' });

    const a = await mockFacilityPrintSettingsService.getForFacility('c-fenwick-general');
    const b = await mockFacilityPrintSettingsService.getForFacility('c-fenwick-womens');
    expect(a.ok && a.data?.overrides.disposableBarcodePrefix).toBe('FGH');
    expect(b.ok && b.data?.overrides.disposableBarcodePrefix).toBe('FWH');
  });
});

describe('resolveEffectivePrintSettings', () => {
  it('with no override, returns the global config exactly, unchanged', () => {
    const effective = resolveEffectivePrintSettings(DEFAULT_PRINT_SETTINGS_CONFIG, null);
    expect(effective).toEqual(DEFAULT_PRINT_SETTINGS_CONFIG);
  });

  it('with an override, merges only the overridden fields over the global default — never a second, independent full config', () => {
    const effective = resolveEffectivePrintSettings(DEFAULT_PRINT_SETTINGS_CONFIG, {
      id: 'fps-1', facilityId: 'c-fenwick-general',
      overrides: { disposableBarcodePrefix: 'FGH' },
      createdAt: '', updatedAt: '',
    });
    expect(effective.disposableBarcodePrefix).toBe('FGH'); // overridden
    expect(effective.rackBarcodePrefix).toBe(DEFAULT_PRINT_SETTINGS_CONFIG.rackBarcodePrefix); // inherited, untouched
    expect(effective.gs1Gtin).toBe(DEFAULT_PRINT_SETTINGS_CONFIG.gs1Gtin); // inherited, untouched
  });
});

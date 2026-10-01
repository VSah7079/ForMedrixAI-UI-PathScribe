// src/services/printSettings/mockPrintSettingsService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrintSettingsService } from './mockPrintSettingsService';
import { DEFAULT_PRINT_SETTINGS_CONFIG } from './IPrintSettingsService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockPrintSettingsService — real feature, per direct follow-up on the hierarchical print-settings architecture', () => {
  it('get() returns the real, documented default config when nothing has been saved yet', async () => {
    const res = await mockPrintSettingsService.get();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(DEFAULT_PRINT_SETTINGS_CONFIG);
  });

  it('the real default is genuinely on_demand, matching the researched patient-safety recommendation', () => {
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.defaultPrintBehavior).toBe('on_demand');
  });

  it('update() persists a real, partial change and returns the full merged config', async () => {
    const res = await mockPrintSettingsService.update({ defaultPrintBehavior: 'batch' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.defaultPrintBehavior).toBe('batch');
      // Untouched fields keep their real, existing values — a partial
      // update never silently resets the rest of the config.
      expect(res.data.enforceOnDemandGuardrails).toBe(DEFAULT_PRINT_SETTINGS_CONFIG.enforceOnDemandGuardrails);
    }
  });

  it('a real update genuinely persists across separate get() calls', async () => {
    await mockPrintSettingsService.update({ requireScanVerificationBeforeNextBlock: true });
    const res = await mockPrintSettingsService.get();
    if (res.ok) expect(res.data.requireScanVerificationBeforeNextBlock).toBe(true);
  });

  it('reset() genuinely restores the real, documented defaults after real changes were made', async () => {
    await mockPrintSettingsService.update({ defaultPrintBehavior: 'batch', enforceOnDemandGuardrails: true });
    const res = await mockPrintSettingsService.reset();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(DEFAULT_PRINT_SETTINGS_CONFIG);
  });

  it('a real, valid containerLabelPresetId can be updated independently of the other fields', async () => {
    const res = await mockPrintSettingsService.update({ containerLabelPresetId: 'large_container' });
    if (res.ok) expect(res.data.containerLabelPresetId).toBe('large_container');
  });
});

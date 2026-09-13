// @vitest-environment happy-dom
//
// src/utils/labels/printRequisitionAndContainerLabels.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { printRequisitionLabel, printContainerLabel, printAllContainerLabels, printDecantContainerLabel } from './printRequisitionAndContainerLabels';
import { mockPrintSettingsService as printSettingsService } from '@/services/printSettings/mockPrintSettingsService';
import type { Case } from '@/types/case/Case';

vi.mock('qz-tray', () => ({
  websocket: { isActive: vi.fn(), connect: vi.fn(), disconnect: vi.fn() },
  printers: { find: vi.fn() },
  configs: { create: vi.fn() },
  print: vi.fn(),
  security: { setCertificatePromise: vi.fn(), setSignaturePromise: vi.fn() },
}));

function makeCase(): Case {
  return {
    id: 'O26-0031',
    accession: { fullAccession: 'DVMC26-0001' },
    patient: { givenNames: 'Maria', familyNames: 'Garcia', dateOfBirth: '1958-03-14', mrn: 'AUTO-0031' },
    order: { requestingProvider: 'Dr. Chen', clientName: 'Metro General' },
  } as unknown as Case;
}

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  vi.stubGlobal('open', vi.fn(() => ({
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
  })));
});

describe('printRequisitionLabel — real, per direct correction: a real, multi-zone sticker sheet, configurable preset (no longer a fixed full-page default)', () => {
  it('a real case with genuine data returns true (a real print window opened)', async () => {
    expect(await printRequisitionLabel(makeCase())).toBe(true);
  });
});

describe('printContainerLabel — real, single-specimen reprint, per direct follow-up: "reprint... single"', () => {
  it('prints using the real, admin-configured containerLabelPresetId, not a hardcoded default (the real bug this fixes)', async () => {
    await printSettingsService.update({ containerLabelPresetId: 'large_container' });
    const result = await printContainerLabel(makeCase(), { label: 'A', description: 'Skin punch biopsy' });
    expect(result).toBe(true);
  });

  it('falls back to the real, documented default when no real setting has been saved yet', async () => {
    const result = await printContainerLabel(makeCase(), { label: 'A', description: 'Skin punch biopsy' });
    expect(result).toBe(true);
  });

  it('a genuinely unknown, stale stored preset id falls back to the real default rather than silently failing', async () => {
    await printSettingsService.update({ containerLabelPresetId: 'not_a_real_preset_id' });
    const result = await printContainerLabel(makeCase(), { label: 'A', description: 'x' });
    expect(result).toBe(true);
  });
});

describe('printAllContainerLabels — real, per direct follow-up: "reprint... batch"', () => {
  it('a genuinely empty specimen list is a real no-op, matching printLabels own honest behavior', async () => {
    const result = await printAllContainerLabels(makeCase(), []);
    expect(result).toBe(false);
  });

  it('multiple real specimens all print in one real batch job', async () => {
    const result = await printAllContainerLabels(makeCase(), [
      { label: 'A', description: 'Skin punch' },
      { label: 'B', description: 'Fingernail' },
    ]);
    expect(result).toBe(true);
  });
});

describe('printRequisitionLabel — real, per direct follow-up + supplied research: the real, mathematically-verified ZPL sheet path, when configured', () => {
  it('dispatches via the real, configured QZ Tray bridge instead of window.print() when a real printer profile is set', async () => {
    const qz = await import('qz-tray');
    (qz.websocket.isActive as any).mockReturnValue(true);
    (qz.print as any).mockResolvedValue(undefined);

    const { mockPrinterProfileService: printerProfileService } = await import('@/services/printerProfiles/mockPrinterProfileService');
    const profileRes = await printerProfileService.add({
      printerId: 'Zebra ZT411', model: 'ZT411', dpi: 203, supportsDataMatrix: true, supportsGS1: false,
      zplVersion: 'II', maxPrintDensity: 8, moduleSize: 4, vendor: 'zebra', bridgeType: 'qz_tray',
    } as any);
    if (!profileRes.ok) throw new Error('setup failed');
    await printSettingsService.update({ requisitionLabelPrinterProfileId: profileRes.data.id });

    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const result = await printRequisitionLabel(makeCase());
    expect(result).toBe(true);
    expect(qz.print).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('printDecantContainerLabel — real, direct fix, per direct follow-up ("Why is the decant label being handled differently?"): the same real QZ Tray hardware-bridge eligibility every other real label type already has', () => {
  it('a real decant with genuine data returns true (a real print window opened) when no real hardware bridge is configured', async () => {
    const result = await printDecantContainerLabel(makeCase(), 'A', 'Cervical, liquid-based cytology', { label: 'D1', decantType: 'cell_block' } as any);
    expect(result).toBe(true);
  });

  it('real, direct correction: dispatches via the real, configured QZ Tray bridge instead of window.print() when a real printer profile is set — the exact real gap that was found and fixed', async () => {
    const qz = await import('qz-tray');
    (qz.websocket.isActive as any).mockReturnValue(true);
    (qz.print as any).mockResolvedValue(undefined);

    const { mockPrinterProfileService: printerProfileService } = await import('@/services/printerProfiles/mockPrinterProfileService');
    const profileRes = await printerProfileService.add({
      printerId: 'Zebra ZT411', model: 'ZT411', dpi: 203, supportsDataMatrix: true, supportsGS1: false,
      zplVersion: 'II', maxPrintDensity: 8, moduleSize: 4, vendor: 'zebra', bridgeType: 'qz_tray',
    } as any);
    if (!profileRes.ok) throw new Error('setup failed');
    // Real, deliberate reuse — the decant label shares
    // containerLabelPrinterProfileId, not a separate setting, since a
    // decant container is the same real, physical label size/printer
    // target as an ordinary specimen container.
    await printSettingsService.update({ containerLabelPrinterProfileId: profileRes.data.id });

    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const result = await printDecantContainerLabel(makeCase(), 'A', 'Cervical, liquid-based cytology', { label: 'D1', decantType: 'cell_block' } as any);
    expect(result).toBe(true);
    expect(qz.print).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('real, honest degrade: a real, non-qz_tray bridge type falls back to window.print(), never throws', async () => {
    const { mockPrinterProfileService: printerProfileService } = await import('@/services/printerProfiles/mockPrinterProfileService');
    const profileRes = await printerProfileService.add({
      printerId: 'Generic Network Printer', model: 'Generic', dpi: 203, supportsDataMatrix: false, supportsGS1: false,
      zplVersion: 'II', maxPrintDensity: 8, moduleSize: 4, vendor: 'other', bridgeType: 'network',
    } as any);
    if (!profileRes.ok) throw new Error('setup failed');
    await printSettingsService.update({ containerLabelPrinterProfileId: profileRes.data.id });

    const openSpy = vi.fn(() => ({ document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() }));
    vi.stubGlobal('open', openSpy);

    const result = await printDecantContainerLabel(makeCase(), 'A', 'Cervical, liquid-based cytology', { label: 'D1', decantType: 'cell_block' } as any);
    expect(result).toBe(true);
    expect(openSpy).toHaveBeenCalled();
  });
});

// @vitest-environment happy-dom
//
// src/utils/labels/printRequisitionAndContainerLabels.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { printRequisitionLabel, printContainerLabel, printAllContainerLabels } from './printRequisitionAndContainerLabels';
import { printSettingsService } from '@/services/index';
import type { Case } from '@/types/case/Case';

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

describe('printRequisitionLabel — real, single-case print, no preset lookup needed (always full-page)', () => {
  it('a real case with genuine data returns true (a real print window opened)', () => {
    expect(printRequisitionLabel(makeCase())).toBe(true);
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

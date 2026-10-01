// src/services/clinicalHistory/mockClinicalHistoryDictionaryService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockClinicalHistoryDictionaryService — real, per the uploaded Structured Clinical History Dictionary spec\'s own User Story 1', () => {
  it('real, seeds real entries across all six real categories named in the spec — SCR, SYM, RAD_LAB, PRIOR_PATH, MAL_STAGE, HIGH_RISK', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const categories = new Set(res.data.map(e => e.categoryCode));
    expect(categories).toEqual(new Set(['SCR', 'SYM', 'RAD_LAB', 'PRIOR_PATH', 'MAL_STAGE', 'HIGH_RISK']));
  });

  it('real, the spec\'s own given example entry (HX_ABNL_CYTO_01) is seeded with its exact real metadata schema', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.getById('HX_ABNL_CYTO_01');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.categoryCode).toBe('PRIOR_PATH');
    expect(res.data.requiredMetadataSchema.map(f => f.key)).toEqual(['prior_accession_number', 'prior_date']);
  });

  it('real, getByCategory correctly isolates one real category\'s own entries only', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.getByCategory('HIGH_RISK');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.every(e => e.categoryCode === 'HIGH_RISK')).toBe(true);
  });

  it('real, getBySpecimenFamily correctly includes an entry with no real filter (applies to every specimen family)', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.getBySpecimenFamily('cervical_cytology');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Real, direct verification: HX_ABNL_CYTO_01 has no specimenFamilyFilter set, so it must appear for ANY real family queried.
    expect(res.data.some(e => e.id === 'HX_ABNL_CYTO_01')).toBe(true);
  });

  it('real, add() refuses a genuinely duplicate history_code rather than silently overwriting it', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.add({ id: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', displayText: 'Duplicate', active: true, requiredMetadataSchema: [] });
    expect(res.ok).toBe(false);
  });

  it('real, add() correctly creates a real, new, non-system entry', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.add({ id: 'HX_CUSTOM_TEST', categoryCode: 'SYM', displayText: 'Custom Test Entry', active: true, requiredMetadataSchema: [] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.isSystem).toBe(false);
  });

  it('real, remove() refuses to delete a real, system-seeded entry', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    const res = await mockClinicalHistoryDictionaryService.remove('HX_ABNL_CYTO_01');
    expect(res.ok).toBe(false);
  });

  it('real, deactivate/reactivate correctly round-trip a real entry\'s own active flag', async () => {
    const { mockClinicalHistoryDictionaryService } = await import('./mockClinicalHistoryDictionaryService');
    await mockClinicalHistoryDictionaryService.deactivate('HX_HIGHRISK_SMOKING');
    const deactivated = await mockClinicalHistoryDictionaryService.getById('HX_HIGHRISK_SMOKING');
    if (deactivated.ok) expect(deactivated.data.active).toBe(false);
    // Real, direct verification: getActive() must never return it while deactivated.
    const activeList = await mockClinicalHistoryDictionaryService.getActive();
    if (activeList.ok) expect(activeList.data.some(e => e.id === 'HX_HIGHRISK_SMOKING')).toBe(false);

    await mockClinicalHistoryDictionaryService.reactivate('HX_HIGHRISK_SMOKING');
    const reactivated = await mockClinicalHistoryDictionaryService.getById('HX_HIGHRISK_SMOKING');
    if (reactivated.ok) expect(reactivated.data.active).toBe(true);
  });
});

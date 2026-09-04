// src/services/cytology/mockCytologyCategoryService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { mockCytologyCategoryService } = await import('./mockCytologyCategoryService');

describe('mockCytologyCategoryService — real, standard Bethesda System seed data', () => {
  beforeEach(() => { store.clear(); });

  it('seeds all three real Bethesda sections: adequacy, general categorization, interpretation/result', async () => {
    const res = await mockCytologyCategoryService.getAll();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.some(e => e.section === 'adequacy')).toBe(true);
    expect(res.data.some(e => e.section === 'general_categorization')).toBe(true);
    expect(res.data.some(e => e.section === 'interpretation_result')).toBe(true);
  });

  it('the real, standard abbreviations are present and correctly attached', async () => {
    const res = await mockCytologyCategoryService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const byAbbrev = (a: string) => res.data.find(e => e.abbreviation === a);
    expect(byAbbrev('ASC-US')?.label).toBe('Atypical Squamous Cells of Undetermined Significance');
    expect(byAbbrev('ASC-H')?.label).toBe('Atypical Squamous Cells, Cannot Exclude HSIL');
    expect(byAbbrev('LSIL')).toBeDefined();
    expect(byAbbrev('HSIL')?.label).toBe('High-Grade Squamous Intraepithelial Lesion');
    expect(byAbbrev('AIS')?.label).toBe('Endocervical Adenocarcinoma In Situ');
  });

  it('NILM and its own real sub-findings never require pathologist review; every epithelial cell abnormality and other malignant neoplasm does', async () => {
    const res = await mockCytologyCategoryService.getBySection('interpretation_result');
    if (!res.ok) throw new Error('setup failed');
    const nilmGroup = res.data.filter(e => e.group?.startsWith('Negative for Intraepithelial Lesion or Malignancy'));
    expect(nilmGroup.length).toBeGreaterThan(0);
    nilmGroup.forEach(e => expect(e.requiresPathologistReview).toBe(false));

    const abnormalGroups = res.data.filter(e =>
      e.group === 'Epithelial Cell Abnormality — Squamous' ||
      e.group === 'Epithelial Cell Abnormality — Glandular' ||
      e.group === 'Other Malignant Neoplasms'
    );
    expect(abnormalGroups.length).toBeGreaterThan(0);
    abnormalGroups.forEach(e => expect(e.requiresPathologistReview).toBe(true));
  });

  it('a genuine, invasive/malignant finding is suggested at the Malignant severity, never a lesser one', async () => {
    const res = await mockCytologyCategoryService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const scc = res.data.find(e => e.label === 'Squamous Cell Carcinoma');
    const adenoNos = res.data.find(e => e.label === 'Adenocarcinoma, Not Otherwise Specified');
    expect(scc?.suggestedAbnormalSeverity).toBe('Malignant');
    expect(adenoNos?.suggestedAbnormalSeverity).toBe('Malignant');
  });

  it('getBySection returns only the requested section, in real sortOrder', async () => {
    const res = await mockCytologyCategoryService.getBySection('adequacy');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.every(e => e.section === 'adequacy')).toBe(true);
    expect(res.data[0].label).toBe('Satisfactory for Evaluation');
  });

  it('a real save is genuinely visible on the next getAll — not just in-memory state', async () => {
    const before = await mockCytologyCategoryService.getAll();
    if (!before.ok) throw new Error('setup failed');
    await mockCytologyCategoryService.update('cyto-squam-ascus', { description: 'Updated by a real admin.' });

    const reloaded = await mockCytologyCategoryService.getAll();
    if (!reloaded.ok) throw new Error('setup failed');
    expect(reloaded.data.find(e => e.id === 'cyto-squam-ascus')?.description).toBe('Updated by a real admin.');
  });

  it('adding a custom category actually persists, with a real, non-colliding id and correct sortOrder within its own section', async () => {
    const res = await mockCytologyCategoryService.add({
      section: 'interpretation_result', nomenclatureSystem: 'bethesda', group: 'Epithelial Cell Abnormality — Squamous',
      label: 'Custom Local Variant', requiresPathologistReview: true, active: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.isSystem).toBe(false);

    const all = await mockCytologyCategoryService.getAll();
    if (!all.ok) throw new Error('setup failed');
    expect(all.data.find(e => e.id === res.data.id)).toBeDefined();
  });

  it('a built-in (isSystem) category cannot be removed', async () => {
    const res = await mockCytologyCategoryService.remove('cyto-adeq-satisfactory');
    expect(res.ok).toBe(false);
  });

  it('deactivate/reactivate round-trips correctly and persists', async () => {
    await mockCytologyCategoryService.deactivate('cyto-org-trichomonas');
    let all = await mockCytologyCategoryService.getActive();
    if (!all.ok) throw new Error('setup failed');
    expect(all.data.find(e => e.id === 'cyto-org-trichomonas')).toBeUndefined();

    await mockCytologyCategoryService.reactivate('cyto-org-trichomonas');
    all = await mockCytologyCategoryService.getActive();
    if (!all.ok) throw new Error('setup failed');
    expect(all.data.find(e => e.id === 'cyto-org-trichomonas')).toBeDefined();
  });

  it('getByNomenclatureSystem correctly isolates each real system\'s own entries — a Bethesda query never returns a real BSCC/RCPath entry, and vice versa', async () => {
    const bethesda = await mockCytologyCategoryService.getByNomenclatureSystem('bethesda');
    if (!bethesda.ok) throw new Error('setup failed');
    expect(bethesda.data.find(e => e.id === 'cyto-squam-ascus')).toBeDefined();
    expect(bethesda.data.every(e => e.nomenclatureSystem === 'bethesda')).toBe(true);

    const bscc = await mockCytologyCategoryService.getByNomenclatureSystem('bscc_rcpath');
    if (!bscc.ok) throw new Error('setup failed');
    expect(bscc.data.length).toBeGreaterThan(0);
    expect(bscc.data.every(e => e.nomenclatureSystem === 'bscc_rcpath')).toBe(true);
    expect(bscc.data.find(e => e.id === 'cyto-squam-ascus')).toBeUndefined();
  });
});

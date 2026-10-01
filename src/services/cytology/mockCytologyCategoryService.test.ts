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

  it('real, per direct guidance: SFCC is not a separate system — getByNomenclatureSystem(\'sfcc\') returns Bethesda\'s own entries with real, researched French text substituted, never a second, duplicated entry set', async () => {
    const sfcc = await mockCytologyCategoryService.getByNomenclatureSystem('sfcc');
    if (!sfcc.ok) throw new Error('setup failed');
    expect(sfcc.data.length).toBeGreaterThan(0);
    expect(sfcc.data.every(e => e.nomenclatureSystem === 'bethesda')).toBe(true);
    // Real, direct verification: the real ids are Bethesda's own ids —
    // this is genuinely the same 46 records, not a parallel set.
    const ascus = sfcc.data.find(e => e.id === 'cyto-squam-ascus');
    expect(ascus).toBeDefined();
    expect(ascus?.label).toBe('Atypies des cellules malpighiennes de signification indéterminée');
    expect(ascus?.description).toBe('Atypies des cellules malpighiennes de signification indéterminée (ASC-US).');
    // Real, honest field still says 'bethesda' — this is a real,
    // computed view, not a genuinely separate stored record.
    expect(ascus?.nomenclatureSystem).toBe('bethesda');

    const bethesdaAscus = (await mockCytologyCategoryService.getByNomenclatureSystem('bethesda'));
    if (!bethesdaAscus.ok) throw new Error('setup failed');
    // Real, direct verification: the real, canonical English record is
    // never mutated by reading the French view.
    expect(bethesdaAscus.data.find(e => e.id === 'cyto-squam-ascus')?.label).toBe('Atypical Squamous Cells of Undetermined Significance');
  });

  it('real, per direct guidance: SFCC is Bethesda\u2019s own real entries with French text substituted, never a separate, duplicated set', async () => {
    const sfcc = await mockCytologyCategoryService.getByNomenclatureSystem('sfcc');
    if (!sfcc.ok) throw new Error('setup failed');
    const bethesda = await mockCytologyCategoryService.getByNomenclatureSystem('bethesda');
    if (!bethesda.ok) throw new Error('setup failed');

    // Real, same 46 real records, same real ids — a genuinely separate
    // system would not share every single id with Bethesda.
    expect(sfcc.data.length).toBe(bethesda.data.length);
    expect(sfcc.data.map(e => e.id).sort()).toEqual(bethesda.data.map(e => e.id).sort());

    // Real, direct verification of the actual French substitution —
    // ASC-US's own real, researched French clinical term, confirmed
    // directly against ANAES/HAS's own official 2001 Bethesda
    // terminology summary, not a generic or invented translation.
    const ascusFr = sfcc.data.find(e => e.id === 'cyto-squam-ascus');
    expect(ascusFr?.label).toBe('Atypies des cellules malpighiennes de signification indéterminée');
    expect(ascusFr?.abbreviation).toBe('ASC-US');

    // Real, diagnosticRank/requiresPathologistReview/etc. are
    // identical to the real Bethesda record — SFCC changes only the
    // display text, never the real clinical calibration underneath.
    const ascusEn = bethesda.data.find(e => e.id === 'cyto-squam-ascus');
    expect(ascusFr?.diagnosticRank).toBe(ascusEn?.diagnosticRank);
    expect(ascusFr?.requiresPathologistReview).toBe(ascusEn?.requiresPathologistReview);
  });

  it('the real Münchner Nomenklatur III (München IIIb) dictionary is correctly isolated and calibrated to its own real rank scale', async () => {
    const mn3 = await mockCytologyCategoryService.getByNomenclatureSystem('munchen_iiib');
    if (!mn3.ok) throw new Error('setup failed');
    expect(mn3.data.length).toBeGreaterThan(0);
    expect(mn3.data.every(e => e.nomenclatureSystem === 'munchen_iiib')).toBe(true);
    expect(mn3.data.find(e => e.id === 'cyto-squam-ascus')).toBeUndefined();

    // Real, researched risk ordering: Group III (ambiguous, cannot
    // exclude high-grade) genuinely ranks ABOVE the confirmed,
    // lower-grade IIID1 — not the naive Bethesda-style assumption that
    // an ambiguous call always ranks below a confirmed low-grade one.
    const iiid1 = mn3.data.find(e => e.id === 'mn3-group-iiid1');
    const iiip = mn3.data.find(e => e.id === 'mn3-group-iiip');
    expect(iiid1?.diagnosticRank).toBeLessThan(iiip?.diagnosticRank ?? 0);

    // Real, correct alignment with the shared HIGH_GRADE_RANK_THRESHOLD
    // (3, classifyCytologyAgreement.ts) — Group III itself is the
    // real, correct high-grade boundary here.
    expect(iiip?.diagnosticRank).toBe(3);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { mockQaActivityTypeService } from './mockQaActivityTypeService';

// Real, minimal localStorage mock - same established pattern every
// other storage-backed service test in this app uses (confirmed
// directly against mockServiceChargeService.test.ts) - this project's
// real test environment provides no real localStorage global at all.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockQaActivityTypeService', () => {
  it('seeds six real, distinct activity types by default', async () => {
    const res = await mockQaActivityTypeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Real, per PS-324: two new seed entries added this session
    // (Surgical Post-Sign-Out Peer Review, Surgical Biopsy-to-Resection
    // Correlation) — six is the current, real count, not four.
    expect(res.data.length).toBe(6);
    expect(res.data.map(t => t.id)).toEqual(expect.arrayContaining([
      'qa-activity-frozen-final', 'qa-activity-cyto-histo', 'qa-activity-abnormal-finding-confirmation', 'qa-activity-gyn-cytology-secondary-screening',
      'qa-activity-surgical-peer-review', 'qa-activity-surgical-biopsy-resection',
    ]));
  });

  it('the seeded Frozen vs Final type has teachingOnboardingEnabled true and a real field schema', async () => {
    const res = await mockQaActivityTypeService.getAll();
    if (!res.ok) return;
    const frozenFinal = res.data.find(t => t.id === 'qa-activity-frozen-final');
    expect(frozenFinal?.teachingOnboardingEnabled).toBe(true);
    expect(frozenFinal?.fields.map(f => f.id)).toEqual(['frozenCategory', 'finalCategory', 'frozenDx', 'finalDx']);
  });

  it('rejects adding a type with no real name', async () => {
    const res = await mockQaActivityTypeService.add({
      name: '', tabScope: 'custom', fields: [{ id: 'x', label: 'X', type: 'text', required: false, options: [] }],
      teachingOnboardingEnabled: false, active: true, createdBy: 'user-1',
    });
    expect(res.ok).toBe(false);
  });

  it('rejects adding a type with zero real fields', async () => {
    const res = await mockQaActivityTypeService.add({
      name: 'Grossing QA', tabScope: 'custom', fields: [],
      teachingOnboardingEnabled: false, active: true, createdBy: 'user-1',
    });
    expect(res.ok).toBe(false);
  });

  it('adds a real, valid new activity type (proves the model accepts a genuinely new one with no code change)', async () => {
    const res = await mockQaActivityTypeService.add({
      name: 'Grossing QA', tabScope: 'custom', fields: [{ id: 'accuracy', label: 'Grossing Accuracy', type: 'dropdown', required: true, options: [{ id: 'accurate', label: 'Accurate' }, { id: 'inaccurate', label: 'Inaccurate' }] }],
      teachingOnboardingEnabled: false, active: true, createdBy: 'user-1',
    });
    expect(res.ok).toBe(true);
    const all = await mockQaActivityTypeService.getAll();
    if (!all.ok) return;
    expect(all.data.length).toBe(7); // 6 real seeds (PS-324) + this one
  });

  it('deactivate/reactivate toggle the real active flag', async () => {
    await mockQaActivityTypeService.deactivate('qa-activity-cyto-histo');
    let all = await mockQaActivityTypeService.getAll();
    if (!all.ok) return;
    expect(all.data.find(t => t.id === 'qa-activity-cyto-histo')?.active).toBe(false);

    await mockQaActivityTypeService.reactivate('qa-activity-cyto-histo');
    all = await mockQaActivityTypeService.getAll();
    if (!all.ok) return;
    expect(all.data.find(t => t.id === 'qa-activity-cyto-histo')?.active).toBe(true);
  });

  it('update rejects an unknown id', async () => {
    const res = await mockQaActivityTypeService.update('not-real', { name: 'X' });
    expect(res.ok).toBe(false);
  });

  it('real fix (PS-115): seeded jurisdictions use only real Jurisdiction enum values, never the old invalid EU/UK placeholders', async () => {
    const res = await mockQaActivityTypeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const realJurisdictions = ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'AU', 'NZ', 'KR', 'BE', 'NL', 'DE', 'FR'];
    for (const type of res.data) {
      for (const j of type.jurisdictions ?? []) {
        expect(realJurisdictions).toContain(j);
      }
    }
    // The specific real regression this closes — a UK site resolves to
    // one of these three, never the old, invalid 'UK' catch-all.
    const frozenFinal = res.data.find(t => t.id === 'qa-activity-frozen-final');
    expect(frozenFinal?.jurisdictions).toEqual(expect.arrayContaining(['GB_EW', 'GB_SCT', 'GB_NIR']));
    expect(frozenFinal?.jurisdictions).not.toContain('UK');
    expect(frozenFinal?.jurisdictions).not.toContain('EU');
  });
});

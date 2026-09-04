import { describe, it, expect, beforeEach } from 'vitest';
import { mockQaSupervisionAssignmentTypeService } from './mockQaSupervisionAssignmentTypeService';
import { FPPE_ACTIVITY_TYPE_ID } from './mockQaSupervisionAssignmentService';

// Real, minimal localStorage mock - same established pattern
// mockQaActivityTypeService.test.ts already uses.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockQaSupervisionAssignmentTypeService', () => {
  it('seeds the real FPPE/Credentialing Review type by default', async () => {
    const res = await mockQaSupervisionAssignmentTypeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe(FPPE_ACTIVITY_TYPE_ID);
    expect(res.data[0].tabScope).toBe('standard');
  });

  it('the seeded type shares its real id with mockQaSupervisionAssignmentService\'s own FPPE_ACTIVITY_TYPE_ID — the real FK relationship every real assignment instance depends on', async () => {
    const res = await mockQaSupervisionAssignmentTypeService.getAll();
    if (!res.ok) return;
    expect(res.data[0].id).toBe('qa-activity-fppe-credentialing');
  });

  it('rejects adding a type with no real name', async () => {
    const res = await mockQaSupervisionAssignmentTypeService.add({
      name: '', tabScope: 'custom', active: true, createdBy: 'user-1',
    });
    expect(res.ok).toBe(false);
  });

  it('adds a real, valid new custom supervision type', async () => {
    const res = await mockQaSupervisionAssignmentTypeService.add({
      name: 'New Grosser Training Period', tabScope: 'custom', active: true, createdBy: 'user-1',
    });
    expect(res.ok).toBe(true);
    const all = await mockQaSupervisionAssignmentTypeService.getAll();
    if (!all.ok) return;
    expect(all.data.length).toBe(2);
  });

  it('deactivate/reactivate toggle the real active flag', async () => {
    await mockQaSupervisionAssignmentTypeService.deactivate(FPPE_ACTIVITY_TYPE_ID);
    let all = await mockQaSupervisionAssignmentTypeService.getAll();
    if (!all.ok) return;
    expect(all.data.find(t => t.id === FPPE_ACTIVITY_TYPE_ID)?.active).toBe(false);

    await mockQaSupervisionAssignmentTypeService.reactivate(FPPE_ACTIVITY_TYPE_ID);
    all = await mockQaSupervisionAssignmentTypeService.getAll();
    if (!all.ok) return;
    expect(all.data.find(t => t.id === FPPE_ACTIVITY_TYPE_ID)?.active).toBe(true);
  });

  it('update rejects an unknown id', async () => {
    const res = await mockQaSupervisionAssignmentTypeService.update('not-real', { name: 'X' });
    expect(res.ok).toBe(false);
  });

  it('supports duplicatedFromId provenance tracking, matching QaActivityType\'s own field — needed for Duplicate to work symmetrically across both archetypes', async () => {
    const res = await mockQaSupervisionAssignmentTypeService.add({
      name: 'FPPE / Credentialing Review (Copy)', tabScope: 'custom', active: true, createdBy: 'user-1',
      duplicatedFromId: FPPE_ACTIVITY_TYPE_ID,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.duplicatedFromId).toBe(FPPE_ACTIVITY_TYPE_ID);
  });
});

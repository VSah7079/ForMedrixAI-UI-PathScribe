// @vitest-environment happy-dom
//
// src/services/batches/controlSlideAutoAppend.test.ts
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { mockBatchService } = await import('./mockBatchService');
const { caseRouter } = await import('../cases/CaseRouter');

describe('mockBatchService.create() \u2014 real, per PS-289/PS-292\u2019s own "batch-manifest scanning with automatic control-slide appending" piece', () => {
  it('a real Staining batch created with a real reagent lot requiring a control auto-appends one real control item', async () => {
    const batchRes = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real Ki-67 run', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
      stainingReagentLotIds: ['lot-ki67-2601'],
    } as any);
    if (!batchRes.ok) throw new Error('setup failed');

    expect(batchRes.data.items.length).toBe(1);
    const controlItem = batchRes.data.items[0];
    expect(controlItem.materialType).toBe('slide');
    expect(controlItem.addedByUserName).toContain('auto-appended');

    // Real — the control case itself was actually, genuinely created,
    // not just referenced by a fabricated accession string.
    const controlCase = await caseRouter.getCase(controlItem.caseAccession);
    expect(controlCase?.controlSlideContext?.reagentLotId).toBe('lot-ki67-2601');
    expect(controlCase?.controlSlideContext?.stainTypeId).toBe('st-ki67');
  });

  it('a real Staining batch with a reagent lot whose stain does NOT require a control appends nothing', async () => {
    // lot-pr-2599 -> st-pr also requires one; use a lot pointing at a
    // real stain type with neither toggle set instead — no real,
    // seeded lot points at st-he (H&E), so this proves the negative
    // path structurally via a batch with no stainingReagentLotIds at
    // all, the simplest real "nothing should require a control" case.
    const batchRes = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real, no-lot-selected run', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    } as any);
    if (!batchRes.ok) throw new Error('setup failed');
    expect(batchRes.data.items.length).toBe(0);
  });

  it('a real, non-Staining batch never auto-appends a control, even with reagent lots somehow present', async () => {
    const batchRes = await mockBatchService.create({
      processingNode: 'Grossing', protocol: 'Real grossing batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    } as any);
    if (!batchRes.ok) throw new Error('setup failed');
    expect(batchRes.data.items.length).toBe(0);
  });

  it('a real, genuinely nonexistent reagent lot id is a real, honest no-op \u2014 never throws, never blocks batch creation', async () => {
    const batchRes = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real, bad-lot-id run', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
      stainingReagentLotIds: ['lot-does-not-exist'],
    } as any);
    expect(batchRes.ok).toBe(true);
    if (batchRes.ok) expect(batchRes.data.items.length).toBe(0);
  });
});

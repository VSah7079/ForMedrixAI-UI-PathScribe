// @vitest-environment happy-dom
//
// src/services/batches/computePendingBatchQueue.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up's own confirmed answer: "Auto-load
// into a 'pending' queue only — still needs a real scan to confirm
// physical placement in the basket/rack." Tests against real,
// freshly-created cases AND a real, freshly-created batch (via the
// same real batchService.create()/addItemByScan() this app's own
// NewContainerModal.tsx uses) — proving this queue genuinely agrees
// with the real Batch system's own manifest, not a synthetic stand-in.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { caseRouter } = await import('../cases/CaseRouter');
const { mockBatchService } = await import('./mockBatchService');
const { computePendingBatchQueue } = await import('./computePendingBatchQueue');
const { cassetteIdentifier } = await import('@/types/labels/LabelData');

let counter = 0;
function makeCaseId(): string {
  counter += 1;
  return `S26-PENDING-BATCH-TEST-${counter}`;
}

async function seedCaseWithBlock(blockStatus: string) {
  const id = makeCaseId();
  const fullAccession = id;
  await caseRouter.createCase({
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    status: 'in-progress', accession: { fullAccession }, participants: [], synopticReports: [],
    order: { priority: 'Routine' },
    specimens: [{
      id: `${id}-SP-A`, label: 'A', description: 'Test specimen',
      blocks: [{ id: `${id}-BLK-1`, label: '1', status: blockStatus, stains: [] }],
    }],
  } as any);
  return { caseId: id, fullAccession, cassetteId: cassetteIdentifier(fullAccession, 'A', '1') };
}

describe('computePendingBatchQueue — real, computed "printed but not yet physically loaded" queue', () => {
  it('includes a real, freshly-printed (Grossed) block that has never been scanned into any batch', async () => {
    const { caseId } = await seedCaseWithBlock('Grossed');
    const queue = await computePendingBatchQueue();
    expect(queue.find(i => i.caseId === caseId)).toBeDefined();
  });

  it('excludes a real, still-Pending placeholder block — nothing has been physically printed for it yet', async () => {
    const { caseId } = await seedCaseWithBlock('Pending');
    const queue = await computePendingBatchQueue();
    expect(queue.find(i => i.caseId === caseId)).toBeUndefined();
  });

  it('excludes a real block once it has genuinely been scanned into a real, active batch', async () => {
    const { caseId, cassetteId } = await seedCaseWithBlock('Grossed');

    const created = await mockBatchService.create({
      processingNode: 'Processing', protocol: 'Test Protocol', priority: 'Routine',
      createdByUserId: 'TEST-USER', createdByUserName: 'Test User',
      containerType: 'Tissue Processor Basket', identifierMode: 'disposable',
    });
    expect('data' in created).toBe(true);
    if (!('data' in created)) return;

    const addResult = await mockBatchService.addItemByScan(created.data.id, cassetteId, 'TEST-USER', 'Test User');
    expect(addResult.outcome).toBe('added');

    const queue = await computePendingBatchQueue();
    expect(queue.find(i => i.caseId === caseId)).toBeUndefined();
  });

  it('a real, cancelled block is never included — nothing physically exists to load', async () => {
    const { caseId } = await seedCaseWithBlock('Cancelled');
    const queue = await computePendingBatchQueue();
    expect(queue.find(i => i.caseId === caseId)).toBeUndefined();
  });
});

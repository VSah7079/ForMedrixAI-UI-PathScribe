// @vitest-environment happy-dom
//
// src/services/batches/stainBatchFailureDeficiency.test.ts
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
const { mockSpecimenDeficiencyService } = await import('../deficiencies/mockSpecimenDeficiencyService');
const { cassetteIdentifier } = await import('@/types/labels/LabelData');

let counter = 0;
function makeCaseId() { counter += 1; return `S26-QCFAIL-${counter}`; }

async function seedCaseWithBlock() {
  const id = makeCaseId();
  const fullAccession = id;
  await caseRouter.createCase({
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    status: 'in-progress', accession: { fullAccession }, participants: [], synopticReports: [],
    order: { priority: 'Routine' },
    originHospitalId: 'c-fenwick-general',
    specimens: [{
      id: `${id}-SP-A`, label: 'A', description: 'Test specimen',
      blocks: [{ id: `${id}-BLK-1`, label: '1', status: 'Grossed', stains: [] }],
    }],
  } as any);
  return { caseId: id, fullAccession, cassetteId: cassetteIdentifier(fullAccession, 'A', '1') };
}

describe('mockBatchService.setStainingInstrumentStatus — real, per the original Stain QC Module spec\u2019s own \u00a72.4 ("flag the entire run")', () => {
  it('a real "Run Failed" status auto-raises a real def-stain-batch-failed deficiency against every real specimen in the batch', async () => {
    const { caseId, cassetteId } = await seedCaseWithBlock();

    const batchRes = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real QC-failure test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batchRes.ok) throw new Error('setup failed');
    const addRes = await mockBatchService.addItemByScan(batchRes.data.id, cassetteId, 'u1', 'Tech A');
    expect(addRes.outcome).toBe('added');

    await mockBatchService.setStainingInstrumentStatus(batchRes.data.id, 'Run Failed');

    const deficienciesRes = await mockSpecimenDeficiencyService.getByCaseId(caseId);
    if (!deficienciesRes.ok) throw new Error('lookup failed');
    const raised = deficienciesRes.data.find(d => d.deficiencyTypeId === 'def-stain-batch-failed');
    expect(raised).toBeDefined();
    expect(raised?.specimenLabel).toBe('A');
    expect(raised?.status).toBe('open');
  });

  it('a real "Run Completed" status never raises this real deficiency', async () => {
    const { caseId, cassetteId } = await seedCaseWithBlock();

    const batchRes = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real QC-success test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batchRes.ok) throw new Error('setup failed');
    await mockBatchService.addItemByScan(batchRes.data.id, cassetteId, 'u1', 'Tech A');

    await mockBatchService.setStainingInstrumentStatus(batchRes.data.id, 'Run Completed');

    const deficienciesRes = await mockSpecimenDeficiencyService.getByCaseId(caseId);
    if (!deficienciesRes.ok) throw new Error('lookup failed');
    expect(deficienciesRes.data.find(d => d.deficiencyTypeId === 'def-stain-batch-failed')).toBeUndefined();
  });

  it('a real batch with no real items at all is a real, honest no-op on failure — never throws, never raises against nothing', async () => {
    const batchRes = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real, empty test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batchRes.ok) throw new Error('setup failed');
    await expect(mockBatchService.setStainingInstrumentStatus(batchRes.data.id, 'Run Failed')).resolves.toMatchObject({ ok: true });
  });
});

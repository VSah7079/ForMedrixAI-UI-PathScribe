// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/checkStainQcGate.test.ts
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { mockBatchService } = await import('@/services/batches/mockBatchService');
const { mockScanStationService } = await import('@/services/scanStations/mockScanStationService');
const { mockWorkstationGroupService } = await import('@/services/workstationGroups/mockWorkstationGroupService');
const { caseRouter } = await import('@/services/cases/CaseRouter');
const { checkStainQcGate } = await import('./checkStainQcGate');
const { slideIdentifier } = await import('@/types/labels/LabelData');

let counter = 0;
function makeCaseId() { counter += 1; return `S26-GATE-${counter}`; }

async function makeCaseData(id: string, numStains: number) {
  const caseData = {
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    status: 'in-progress', accession: { accessionNumber: id, fullAccession: id }, participants: [], synopticReports: [],
    order: { priority: 'Routine' }, originHospitalId: 'c-fenwick-general',
    specimens: [{
      id: `${id}-SP-A`, label: 'A', description: 'Test specimen',
      blocks: [{
        id: `${id}-BLK-1`, label: '1', status: 'Grossed',
        stains: Array.from({ length: numStains }, (_, i) => ({ id: `${id}-ST-${i}`, stainName: 'H&E', status: 'Cut & Placed' as const })),
      }],
    }],
  } as any;
  await caseRouter.createCase(caseData);
  return caseData;
}

async function setUpStainingBatchAtStation(qcEnforcementMode: 'Enforced' | 'Auto-Resolve' | 'Hybrid' | undefined, slideId: string) {
  const group = await mockWorkstationGroupService.create({
    name: `Group ${Math.random()}`, discipline: 'HISTOLOGY', functionalArea: 'Staining',
    performingLabFacilityId: 'c-fenwick-general', createdBy: 'u1', qcEnforcementMode,
  });
  if (!group.ok) throw new Error('group setup failed');

  const station = await mockScanStationService.create({
    name: `Station ${Math.random()}`, barcodeCode: `BC-${Math.random()}`, facilityId: 'c-fenwick-general',
  } as any);
  if (!station.ok) throw new Error('station setup failed');
  await mockScanStationService.update(station.data.id, { workstationGroupId: group.data.id });

  const batch = await mockBatchService.create({
    processingNode: 'Staining', protocol: 'Real gate test batch', priority: 'Routine',
    createdByUserId: 'u1', createdByUserName: 'Tech A', stationId: station.data.id,
  } as any);
  if (!batch.ok) throw new Error('batch setup failed');
  await mockBatchService.addItemByScan(batch.data.id, slideId, 'u1', 'Tech A');
  return batch.data.id;
}

describe('checkStainQcGate \u2014 real, per PS-289/PS-292\u2019s own Gating Strategy, the "gather" half', () => {
  it('a real stain in an Enforced-mode batch with no confirmation yet is a real, blocking item', async () => {
    const id = makeCaseId();
    const caseData = await makeCaseData(id, 1);
    const slideId = slideIdentifier(id, 'A', '1', 'L1');
    await setUpStainingBatchAtStation('Enforced', slideId);

    const blocking = await checkStainQcGate(caseData);
    expect(blocking.length).toBe(1);
    expect(blocking[0].status).toBe('blocked-enforced');
    expect(blocking[0].specimenLabel).toBe('A');
  });

  it('a real stain in an Auto-Resolve batch with no instrument status yet is honestly NOT blocking \u2014 clears without blocking the user', async () => {
    const id = makeCaseId();
    const caseData = await makeCaseData(id, 1);
    const slideId = slideIdentifier(id, 'A', '1', 'L1');
    await setUpStainingBatchAtStation('Auto-Resolve', slideId);

    const blocking = await checkStainQcGate(caseData);
    expect(blocking.length).toBe(0);
  });

  it('a real stain in a batch with no real WorkstationGroup at all is honestly not-applicable, never a fabricated block', async () => {
    const id = makeCaseId();
    const caseData = await makeCaseData(id, 1);
    const slideId = slideIdentifier(id, 'A', '1', 'L1');

    const batch = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real, unscoped test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('batch setup failed');
    await mockBatchService.addItemByScan(batch.data.id, slideId, 'u1', 'Tech A');

    const blocking = await checkStainQcGate(caseData);
    expect(blocking.length).toBe(0);
  });

  it('a real stain never scanned into any real batch at all is honestly excluded, not a false block', async () => {
    const id = makeCaseId();
    const caseData = await makeCaseData(id, 1);
    const blocking = await checkStainQcGate(caseData);
    expect(blocking.length).toBe(0);
  });
});

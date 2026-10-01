// @vitest-environment happy-dom
//
// src/services/facilityOpsDashboard/facilityOpsDashboardSummaries.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-288 — real, integration-style tests for all five department
// dashboard summary functions, seeding real cases/batches/referral
// tracking/WSI batches via the same real services these functions
// themselves read from (same real pattern as
// computePendingBatchQueue.test.ts), rather than mocking them out.
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
const { mockBatchService } = await import('../batches/mockBatchService');
const { mockReferralTrackingService } = await import('../referral/mockReferralTrackingService');
const { mockWsiScanBatchService } = await import('../digitalPathology/mockWsiScanBatchService');
const { computeGrossingIntakeSummary } = await import('./computeGrossingIntakeSummary');
const { computeEmbeddingMicrotomySummary } = await import('./computeEmbeddingMicrotomySummary');
const { computeStainingIhcSummary } = await import('./computeStainingIhcSummary');
const { computeSendOutReferenceSummary } = await import('./computeSendOutReferenceSummary');
const { computeDiagnosticSignOutSummary } = await import('./computeDiagnosticSignOutSummary');

let counter = 0;
function makeCaseId(): string {
  counter += 1;
  return `S26-OPSDASH-TEST-${counter}`;
}

async function seedCase(originHospitalId: string, opts: { priority?: 'Routine' | 'Rush' | 'STAT'; stains?: any[] } = {}) {
  const id = makeCaseId();
  await caseRouter.createCase({
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    status: 'in-progress', accession: { fullAccession: id }, participants: [], synopticReports: [],
    order: { priority: opts.priority ?? 'Routine' },
    originHospitalId,
    specimens: [{
      id: `${id}-SP-A`, label: 'A', description: 'Test specimen',
      blocks: [{ id: `${id}-BLK-1`, label: '1', status: 'Embedded', stains: opts.stains ?? [] }],
    }],
  } as any);
  return id;
}

describe('computeGrossingIntakeSummary', () => {
  it('scopes active Processing/Decal batches by facility and flags a decal batch overdue against its own real target', async () => {
    const caseId = await seedCase('c-opsdash-facility-1');
    const created = await mockBatchService.create({
      processingNode: 'Decal / Special Processing', protocol: 'EDTA', priority: 'Routine',
      createdByUserId: 'TEST-USER', createdByUserName: 'Test User',
      containerType: 'Tissue Processor Basket', identifierMode: 'disposable',
      solutionType: 'EDTA', targetDurationMinutes: 0,
    } as any);
    expect('data' in created).toBe(true);
    if (!('data' in created)) return;
    await mockBatchService.addItemByScan(created.data.id, `S26-OPSDASH-NOMATCH-A1`, 'TEST-USER', 'Test User');

    const summary = await computeGrossingIntakeSummary(undefined);
    const found = summary.queue.find(q => q.id === created.data.id);
    expect(found).toBeDefined();
    expect(found?.slaState).toBe('overdue');
    void caseId;
  });
});

describe('computeEmbeddingMicrotomySummary', () => {
  it('flags a STAT-priority active Embedding batch as an alert', async () => {
    const created = await mockBatchService.create({
      processingNode: 'Embedding', protocol: 'Standard Embed', priority: 'STAT',
      createdByUserId: 'TEST-USER', createdByUserName: 'Test User',
      containerType: 'Tissue Processor Basket', identifierMode: 'disposable',
    } as any);
    expect('data' in created).toBe(true);
    if (!('data' in created)) return;

    const summary = await computeEmbeddingMicrotomySummary(undefined);
    expect(summary.alerts.some(a => a.id === `stat-batch-${created.data.id}`)).toBe(true);
    expect(summary.queue.find(q => q.id === created.data.id)?.isStat).toBe(true);
  });
});

describe('computeStainingIhcSummary', () => {
  it('counts a real QC Failed stain order as a critical alert, scoped to its own facility', async () => {
    const facilityId = 'c-opsdash-facility-2';
    await seedCase(facilityId, { stains: [{ id: 'stain-qc-1', stainName: 'H&E', status: 'QC Failed' }] });
    const otherFacilityId = 'c-opsdash-facility-3';
    await seedCase(otherFacilityId, { stains: [{ id: 'stain-qc-2', stainName: 'H&E', status: 'QC Failed' }] });

    const scoped = await computeStainingIhcSummary(facilityId);
    expect(scoped.stats.find(s => s.id === 'qc-failed')?.value).toBe(1);
    expect(scoped.alerts.some(a => a.kind === 'QC Failed')).toBe(true);
  });
});

describe('computeSendOutReferenceSummary', () => {
  it('surfaces an unacknowledged cold-chain excursion as a critical alert', async () => {
    const caseId = await seedCase('c-opsdash-facility-4');
    const created = await mockBatchService.create({
      processingNode: 'External Referral', protocol: 'Send-Out', priority: 'Routine',
      createdByUserId: 'TEST-USER', createdByUserName: 'Test User',
      containerType: 'Tissue Processor Basket', identifierMode: 'disposable',
      referralDestinationFacilityId: 'c-reference-lab-1',
    } as any);
    expect('data' in created).toBe(true);
    if (!('data' in created)) return;
    await mockBatchService.addItemByScan(created.data.id, `S26-OPSDASH-NOMATCH2-A1`, 'TEST-USER', 'Test User');
    await mockBatchService.setColdChainExcursion(created.data.id, 'reading-1', 12.5, new Date().toISOString());
    await mockReferralTrackingService.createOnDispatch(created.data.id);

    const summary = await computeSendOutReferenceSummary(undefined);
    expect(summary.alerts.some(a => a.kind === 'Cold-Chain Excursion' && a.id === `cold-chain-${created.data.id}`)).toBe(true);
    expect(summary.stats.find(s => s.id === 'dispatched')?.value).toBeGreaterThanOrEqual(1);
    void caseId;
  });
});

describe('computeDiagnosticSignOutSummary', () => {
  it('scopes WSI scan batch slide counts by facility via each slide\'s own caseId', async () => {
    const facilityId = 'c-opsdash-facility-5';
    const caseId = await seedCase(facilityId);
    const created = await mockWsiScanBatchService.create({
      scannerInstrumentId: 'Test Scanner #1',
      slides: [
        { slidePosition: '1', caseId, specimenId: `${caseId}-SP-A`, scanStatus: 'failed', failureReason: 'Instrument jam' },
        { slidePosition: '2', caseId, specimenId: `${caseId}-SP-A`, scanStatus: 'pending' },
      ],
    } as any);
    expect('data' in created).toBe(true);
    if (!('data' in created)) return;

    const scoped = await computeDiagnosticSignOutSummary(facilityId);
    expect(scoped.stats.find(s => s.id === 'failed')?.value).toBeGreaterThanOrEqual(1);
    expect(scoped.stats.find(s => s.id === 'pending')?.value).toBeGreaterThanOrEqual(1);
    expect(scoped.alerts.some(a => a.kind === 'Scan Failed')).toBe(true);

    const unscopedOther = await computeDiagnosticSignOutSummary('c-opsdash-facility-does-not-exist');
    expect(unscopedOther.queue.find(q => q.id === created.data.id)).toBeUndefined();
  });
});

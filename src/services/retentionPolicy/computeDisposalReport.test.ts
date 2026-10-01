// src/services/retentionPolicy/computeDisposalReport.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, Stain QC Module §2.5 (waste tracking/reporting) — see
// computeDisposalReport.ts's own header for the full account of what was
// already built (computeDisposalQueue.ts/disposeItemByScan.ts/RetentionPolicy.ts)
// vs. what this file's function actually closes: aggregating already-disposed
// items into a filterable, exportable report.
//
// Same real, minimal-setup convention as specimenDisposal.test.ts (real
// caseRouter.createCase, not a synthetic fixture) — items here are seeded
// already-disposed (disposedAt/disposedBy set directly) rather than routed
// through disposeItemByScan, since this file's own function only cares about
// the resulting state, not how an item got there.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { caseRouter } = await import('../cases/CaseRouter');
const { computeDisposalReport } = await import('./computeDisposalReport');
const { specimenIdentifier, cassetteIdentifier } = await import('@/types/labels/LabelData');

let counter = 0;
function makeCaseId(): string {
  counter += 1;
  return `S26-WASTE-REPORT-TEST-${counter}`;
}

const SIX_MONTHS_AGO_ISO = new Date(Date.now() - 1000 * 60 * 60 * 24 * 182).toISOString();

describe('computeDisposalReport — Stain QC Module §2.5 waste tracking/reporting', () => {
  beforeEach(() => { counter += 1000; });

  it('includes a genuinely disposed specimen, resolving disposedByUserId to a real display name', async () => {
    const id = makeCaseId();
    const fullAccession = id;
    const disposedAtIso = new Date().toISOString();
    await caseRouter.createCase({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'signed-out',
      finalizedAt: SIX_MONTHS_AGO_ISO,
      accession: { fullAccession },
      participants: [],
      synopticReports: [],
      order: { priority: 'Routine' },
      specimens: [
        {
          id: `${id}-SP-A`, label: 'A', description: 'Test specimen', blocks: [],
          disposedAt: disposedAtIso, disposedBy: '1', // seeded user id '1' = Sarah Chen
        },
      ],
    } as any);

    const rows = await computeDisposalReport({});
    const row = rows.find(r => r.caseId === id);
    expect(row).toBeTruthy();
    expect(row!.materialType).toBe('wet_tissue');
    expect(row!.displayId).toBe(specimenIdentifier(fullAccession, 'A'));
    expect(row!.disposedByUserId).toBe('1');
    expect(row!.disposedByName).toBe('Sarah Chen');
  });

  it('excludes an item that has not been disposed', async () => {
    const id = makeCaseId();
    const fullAccession = id;
    await caseRouter.createCase({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'signed-out',
      finalizedAt: SIX_MONTHS_AGO_ISO,
      accession: { fullAccession },
      participants: [],
      synopticReports: [],
      order: { priority: 'Routine' },
      specimens: [
        { id: `${id}-SP-A`, label: 'A', description: 'Not disposed', blocks: [] },
      ],
    } as any);

    const rows = await computeDisposalReport({});
    expect(rows.find(r => r.caseId === id)).toBeUndefined();
  });

  it('filters by materialType — a disposed block is excluded when the report is scoped to slide', async () => {
    const id = makeCaseId();
    const fullAccession = id;
    const disposedAtIso = new Date().toISOString();
    await caseRouter.createCase({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'signed-out',
      finalizedAt: SIX_MONTHS_AGO_ISO,
      accession: { fullAccession },
      participants: [],
      synopticReports: [],
      order: { priority: 'Routine' },
      specimens: [
        {
          id: `${id}-SP-A`, label: 'A', description: 'Test specimen',
          blocks: [
            { id: `${id}-BLK-A1`, label: '1', stains: [], disposedAt: disposedAtIso, disposedBy: '2' },
          ],
        },
      ],
    } as any);

    const blockRows = await computeDisposalReport({ materialType: 'block' });
    expect(blockRows.find(r => r.caseId === id)).toBeTruthy();

    const slideRows = await computeDisposalReport({ materialType: 'slide' });
    expect(slideRows.find(r => r.caseId === id)).toBeUndefined();
  });

  it('filters by disposal date range — an item disposed outside the window is excluded', async () => {
    const id = makeCaseId();
    const fullAccession = id;
    const longAgoDisposedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400).toISOString();
    await caseRouter.createCase({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'signed-out',
      finalizedAt: SIX_MONTHS_AGO_ISO,
      accession: { fullAccession },
      participants: [],
      synopticReports: [],
      order: { priority: 'Routine' },
      specimens: [
        {
          id: `${id}-SP-A`, label: 'A', description: 'Test specimen', blocks: [],
          disposedAt: longAgoDisposedAt, disposedBy: '1',
        },
      ],
    } as any);

    const today = new Date().toISOString().slice(0, 10);
    const rowsInRange = await computeDisposalReport({ dateFrom: today, dateTo: today });
    expect(rowsInRange.find(r => r.caseId === id)).toBeUndefined();

    const rowsAllTime = await computeDisposalReport({});
    expect(rowsAllTime.find(r => r.caseId === id)).toBeTruthy();
  });

  it('falls back to the raw user id when disposedByUserId cannot be resolved to a known user', async () => {
    const id = makeCaseId();
    const fullAccession = id;
    const disposedAtIso = new Date().toISOString();
    await caseRouter.createCase({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'signed-out',
      finalizedAt: SIX_MONTHS_AGO_ISO,
      accession: { fullAccession },
      participants: [],
      synopticReports: [],
      order: { priority: 'Routine' },
      specimens: [
        {
          id: `${id}-SP-A`, label: 'A', description: 'Test specimen', blocks: [],
          disposedAt: disposedAtIso, disposedBy: 'NONEXISTENT-USER-ID',
        },
      ],
    } as any);

    const rows = await computeDisposalReport({});
    const row = rows.find(r => r.caseId === id);
    expect(row!.disposedByName).toBe('NONEXISTENT-USER-ID');
  });

  it('sorts most-recently-disposed first', async () => {
    const idOlder = makeCaseId();
    const idNewer = makeCaseId();
    const olderIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
    const newerIso = new Date().toISOString();
    for (const [id, disposedAtIso] of [[idOlder, olderIso], [idNewer, newerIso]] as const) {
      await caseRouter.createCase({
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'signed-out',
        finalizedAt: SIX_MONTHS_AGO_ISO,
        accession: { fullAccession: id },
        participants: [],
        synopticReports: [],
        order: { priority: 'Routine' },
        specimens: [
          { id: `${id}-SP-A`, label: 'A', description: 'Test specimen', blocks: [], disposedAt: disposedAtIso, disposedBy: '1' },
        ],
      } as any);
    }

    const rows = await computeDisposalReport({});
    const newerIndex = rows.findIndex(r => r.caseId === idNewer);
    const olderIndex = rows.findIndex(r => r.caseId === idOlder);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it('includes a disposed block\'s displayId built the same way disposeItemByScan/computeDisposalQueue build it', async () => {
    const id = makeCaseId();
    const fullAccession = id;
    const disposedAtIso = new Date().toISOString();
    await caseRouter.createCase({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'signed-out',
      finalizedAt: SIX_MONTHS_AGO_ISO,
      accession: { fullAccession },
      participants: [],
      synopticReports: [],
      order: { priority: 'Routine' },
      specimens: [
        {
          id: `${id}-SP-A`, label: 'A', description: 'Test specimen',
          blocks: [{ id: `${id}-BLK-A1`, label: '1', stains: [], disposedAt: disposedAtIso, disposedBy: '3' }],
        },
      ],
    } as any);

    const rows = await computeDisposalReport({});
    const row = rows.find(r => r.caseId === id);
    expect(row!.displayId).toBe(cassetteIdentifier(fullAccession, 'A', '1'));
    expect(row!.disposedByName).toBe('Pete Nimmo');
  });
});

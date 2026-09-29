import { describe, it, expect, vi } from 'vitest';
import type { Case } from '@/types/case/Case';
import { createCaseSearchService, type CaseSearchDependencies } from './createCaseSearchService';

const mk = (i: number, over: Record<string, unknown> = {}): Case => ({
  id: `C-${String(i).padStart(3, '0')}`, status: i % 2 ? 'finalized' : 'draft',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  accession: { fullAccession: `S26-${1000 + i}` },
  patient: { mrn: String(100000 + i), firstName: 'Pat', lastName: `Case${i}`, sex: 'F' },
  order: { priority: 'Routine', receivedDate: `2026-09-${String((i % 27) + 1).padStart(2, '0')}T12:00:00Z` },
  caseFlags: [{ flagDefinitionId: 'f1', deletedAt: null }],
  ...over,
} as unknown as Case);

function deps(cases: Case[], over: Partial<CaseSearchDependencies> = {}): CaseSearchDependencies {
  return {
    loadAccessibleCases: async () => ({ ok: true, data: cases }),
    loadReferenceData: async () => ({ physicianNamesById: new Map(), flagsById: new Map([['f1', { name: 'Malignant', lisCode: 'MAL' }]]) }),
    auditExport: vi.fn(),
    now: () => new Date('2026-09-27T12:00:00Z'),
    ...over,
  };
}

describe('case search service (Batch 350)', () => {
  const cases = Array.from({ length: 60 }, (_, i) => mk(i + 1));

  it('returns one page, the total across all pages, and the page count', async () => {
    const svc = createCaseSearchService(deps(cases));
    const res = await svc.search({ criteria: { statuses: ['finalized'] }, page: 2, pageSize: 25 });
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.data.total).toBe(30);
      expect(res.data.pageCount).toBe(2);
      expect(res.data.page).toBe(2);
      expect(res.data.items).toHaveLength(5);
      expect(res.data.items.every(c => c.status === 'finalized')).toBe(true);
    }
  });

  it('pages never overlap and together cover every match, in the requested order', async () => {
    const svc = createCaseSearchService(deps(cases));
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await svc.search({ criteria: {}, sort: { key: 'accessionNumber', direction: 'asc' }, page, pageSize: 25 });
      if (res.ok === true) seen.push(...res.data.items.map(c => c.accession!.fullAccession!));
    }
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
    expect(seen).toEqual([...seen].sort());
  });

  it('counts only cases the user may see: access rules apply before the page is cut', async () => {
    // The dependency returns the accessible cases; nothing the search does can add others.
    const svc = createCaseSearchService(deps(cases.slice(0, 7)));
    const res = await svc.search({ criteria: {}, page: 1, pageSize: 5 });
    if (res.ok === true) { expect(res.data.total).toBe(7); expect(res.data.items).toHaveLength(5); }
  });

  it('caps the page size at 100 and returns the last page for a page past the end', async () => {
    const many = Array.from({ length: 250 }, (_, i) => mk(i + 1));
    const svc = createCaseSearchService(deps(many));
    const res = await svc.search({ criteria: {}, page: 99, pageSize: 1000 });
    if (res.ok === true) { expect(res.data.pageSize).toBe(100); expect(res.data.page).toBe(3); expect(res.data.items).toHaveLength(50); }
  });

  it('passes a failure to load cases through', async () => {
    const svc = createCaseSearchService(deps([], { loadAccessibleCases: async () => ({ ok: false, error: 'offline' }) }));
    expect(await svc.search({ criteria: {} })).toEqual({ ok: false, error: 'offline' });
  });

  it('export returns every match as rows with flag names, and audits it', async () => {
    const d = deps(cases);
    const svc = createCaseSearchService(d);
    const res = await svc.exportRows({ criteria: { statuses: ['draft'] } });
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.data.rows).toHaveLength(30);
      expect(res.data.truncated).toBe(false);
      expect(res.data.rows[0].flags).toEqual(['Malignant']);
    }
    expect(d.auditExport).toHaveBeenCalledWith({ rowCount: 30, total: 30 });
  });

  it('export stops at the export limit and says so', async () => {
    const many = Array.from({ length: 5003 }, (_, i) => mk(i + 1));
    const svc = createCaseSearchService(deps(many));
    const res = await svc.exportRows({ criteria: {} });
    if (res.ok === true) { expect(res.data.rows).toHaveLength(5000); expect(res.data.total).toBe(5003); expect(res.data.truncated).toBe(true); }
  });
});

describe('case search service: a Trust includes its sites (Batch 354)', () => {
  const cases = [
    mk(1, { order: { priority: 'Routine', facilityId: 'client-mri' } }),
    mk(2, { order: { priority: 'Routine', facilityId: 'client-wyth' } }),
    mk(3, { order: { priority: 'Routine', facilityId: 'elsewhere' } }),
  ];
  const reference = async () => ({
    physicianNamesById: new Map(),
    performingLabByFacilityId: new Map([['client-mri', 'site-mri'], ['client-wyth', 'site-wyth'], ['elsewhere', 'lab-x']]),
    parentFacilityIdById: new Map([['site-mri', 'trust'], ['site-wyth', 'trust'], ['client-mri', 'site-mri'], ['client-wyth', 'site-wyth']]),
  });
  const ids = (res: Awaited<ReturnType<ReturnType<typeof createCaseSearchService>['search']>>) =>
    res.ok === true ? res.data.items.map(c => c.id).sort() : [];

  it('performing lab: the Trust finds both sites\' cases; a site finds its own', async () => {
    const svc = createCaseSearchService(deps(cases, { loadReferenceData: reference }));
    expect(ids(await svc.search({ criteria: { performingLabIds: ['trust'] } }))).toEqual(['C-001', 'C-002']);
    expect(ids(await svc.search({ criteria: { performingLabIds: ['site-wyth'] } }))).toEqual(['C-002']);
  });

  it('submitting facility: the Trust finds cases sent from facilities under it', async () => {
    const svc = createCaseSearchService(deps(cases, { loadReferenceData: reference }));
    expect(ids(await svc.search({ criteria: { submittingFacilityIds: ['trust'] } }))).toEqual(['C-001', 'C-002']);
  });
});

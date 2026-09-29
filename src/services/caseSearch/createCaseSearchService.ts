// src/services/caseSearch/createCaseSearchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 350: the case search service, built from its dependencies so it can
// be tested without module mocks. This is the server's side of search:
//
//   1. load the cases this user may see (access rules applied first, so
//      page sizes and totals are right: before, the access check ran on
//      each page after it was cut, so pages could come back short);
//   2. keep those matching the criteria (caseSearchMatching.ts);
//   3. sort, with a stable tiebreak;
//   4. count, and return one page.
//
// In this build, step 1 loads every accessible case into memory (the mock
// data). The API server does steps 1–4 in one SQL query
// (docs/architecture/CASE_SEARCH_API.md).
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { ServiceResult } from '../types';
import type { ICaseSearchService } from './ICaseSearchService';
import {
  CASE_SEARCH_EXPORT_LIMIT, DEFAULT_CASE_SEARCH_PAGE_SIZE, DEFAULT_CASE_SEARCH_SORT, MAX_CASE_SEARCH_PAGE_SIZE,
  type CaseSearchExportRow, type CaseSearchRequest,
} from './caseSearchTypes';
import {
  caseAccessionInstant, caseSignedOutInstant, compareCases, expandOrganisationCriteria, matchesCaseSearch, pageBounds, patientSortName,
  type CaseSearchFlagInfo, type CaseSearchMatchContext, type CaseSearchReferenceData,
} from './caseSearchMatching';

export interface CaseSearchDependencies {
  /** Every case the signed-in user may see, with access rules already applied. */
  loadAccessibleCases(): Promise<ServiceResult<Case[]>>;
  /**
   * The data matching joins (Batch 351): physician names, flag definitions,
   * the specimen and stain dictionaries, performing labs, released
   * amendments, countersigns, delegations, subspecialty and TAT resolvers.
   * The API server joins the same tables in SQL.
   */
  loadReferenceData(): Promise<CaseSearchReferenceData>;
  /** Records an export in the audit trail (fire and forget). */
  auditExport(entry: { rowCount: number; total: number }): void;
  /** Batch 372: told which criteria a search used (names only, never values). */
  auditSearch?(entry: { fieldsUsed: string[]; total: number }): void;
  now?: () => Date;
}

export function toCaseSearchExportRow(c: Case, flags: ReadonlyMap<string, CaseSearchFlagInfo> | undefined): CaseSearchExportRow {
  return {
    accession: c.accession?.fullAccession ?? c.id,
    patientName: patientSortName(c),
    mrn: c.patient?.mrn ?? '',
    sex: c.patient?.sex ?? '',
    dateOfBirth: c.patient?.dateOfBirth ?? '',
    specimens: (c.specimens ?? []).map(s => s.description ?? s.label ?? '').filter(Boolean),
    accessionDate: caseAccessionInstant(c) ?? '',
    signedOutDate: caseSignedOutInstant(c) ?? '',
    orderingPhysician: c.order?.requestingProvider ?? '',
    priority: c.order?.priority ?? 'Routine',
    status: c.status ?? '',
    // Current records name their definition; older ones carry the name themselves.
    flags: (c.caseFlags ?? []).filter(f => !f.deletedAt)
      .map(f => flags?.get(f.flagDefinitionId)?.name ?? (f as { name?: string }).name ?? '').filter(Boolean),
  };
}

/** The criteria a search actually used: names only, never the values (which can be patient names). */
export function usedCriteria(criteria: object): string[] {
  return Object.entries(criteria)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0))
    .map(([k]) => k)
    .sort();
}

export function createCaseSearchService(deps: CaseSearchDependencies): ICaseSearchService {
  const now = deps.now ?? (() => new Date());

  const run = async (request: Omit<CaseSearchRequest, 'page' | 'pageSize'>): Promise<ServiceResult<{ cases: Case[]; reference: CaseSearchReferenceData }>> => {
    const [casesRes, reference] = await Promise.all([deps.loadAccessibleCases(), deps.loadReferenceData()]);
    if (casesRes.ok === false) return casesRes;
    const ctx: CaseSearchMatchContext = { ...reference, timeZone: request.timeZone || 'UTC', now: now() };
    // Batch 354: a chosen Trust includes its sites.
    const criteria = expandOrganisationCriteria(request.criteria ?? {}, reference.parentFacilityIdById);
    const matched = casesRes.data.filter(c => matchesCaseSearch(c, criteria, ctx));
    matched.sort(compareCases(request.sort ?? DEFAULT_CASE_SEARCH_SORT));
    deps.auditSearch?.({ fieldsUsed: usedCriteria(request.criteria ?? {}), total: matched.length });
    return { ok: true, data: { cases: matched, reference } };
  };

  return {
    async search(request) {
      const res = await run(request);
      if (res.ok === false) return res;
      const pageSize = Math.min(MAX_CASE_SEARCH_PAGE_SIZE, Math.max(1, Math.floor(request.pageSize ?? DEFAULT_CASE_SEARCH_PAGE_SIZE)));
      const total = res.data.cases.length;
      const { page, pageCount, start, end } = pageBounds(total, request.page ?? 1, pageSize);
      return { ok: true, data: { items: res.data.cases.slice(start, end), total, page, pageSize, pageCount } };
    },

    async exportRows(request) {
      const res = await run(request);
      if (res.ok === false) return res;
      const { cases, reference } = res.data;
      const rows = cases.slice(0, CASE_SEARCH_EXPORT_LIMIT).map(c => toCaseSearchExportRow(c, reference.flagsById));
      deps.auditExport({ rowCount: rows.length, total: cases.length });
      return { ok: true, data: { rows, total: cases.length, truncated: cases.length > rows.length } };
    },
  };
}

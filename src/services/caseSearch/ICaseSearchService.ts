// src/services/caseSearch/ICaseSearchService.ts
// Batch 350: case search, done by the server. The caller sends criteria,
// a sort and a page number; the server applies the user's access rules,
// matches, sorts, counts and returns that one page. Exports run the same
// search and return up to CASE_SEARCH_EXPORT_LIMIT rows.
// Contract for the .NET API server: docs/architecture/CASE_SEARCH_API.md.
import type { ServiceResult } from '../types';
import type { CaseSearchExport, CaseSearchPage, CaseSearchRequest } from './caseSearchTypes';

export interface ICaseSearchService {
  /** One page of matching cases, with the total. The user comes from the session, never the request. */
  search(request: CaseSearchRequest): Promise<ServiceResult<CaseSearchPage>>;
  /** Every matching case (up to the export limit) as export rows. Audited. */
  exportRows(request: Omit<CaseSearchRequest, 'page' | 'pageSize'>): Promise<ServiceResult<CaseSearchExport>>;
}

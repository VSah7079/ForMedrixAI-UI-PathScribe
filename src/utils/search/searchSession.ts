// src/utils/search/searchSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 350: the Search page's per-tab navigation state, so a user who opens
// a case from the results and comes back sees the same search again.
//
//   saveLastCaseSearch / loadLastCaseSearch / clearLastCaseSearch
//       the draft, page, page size and sort of the last search. Results are
//       NOT kept: they are fetched again for that page on return, so the tab
//       never stores patient data (it used to keep the whole result list).
//   markReturnToSearch / consumeReturnToSearch
//       set by whatever navigates back to /search (the breadcrumb, the
//       report page's Back), read once by the Search page.
//   setCaseOpenedFrom / getCaseOpenedFrom
//       whether the case being viewed was opened from Search or the
//       Worklist, for the report page's Back button.
//
// This tab only (sessionStorage), wrapped like utils/uiPreferences.ts: when
// storage is unavailable the state just isn't remembered. UI code uses these
// functions instead of touching browser storage (the deployment-readiness
// rule).
// ─────────────────────────────────────────────────────────────────────────────

import type { CaseSearchDraft, CaseSearchSort } from '@/services/caseSearch/caseSearchTypes';

const LAST_SEARCH_KEY = 'pathscribe:lastSearch';
const RETURN_KEY = 'pathscribe:searchReturn';
const OPENED_FROM_KEY = 'pathscribe:navFrom';

export interface LastCaseSearch {
  draft: CaseSearchDraft;
  page: number;
  pageSize: number;
  sort: CaseSearchSort;
}

function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* not remembered */ }
}
function remove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* nothing to remove */ }
}

export function saveLastCaseSearch(search: LastCaseSearch): void {
  write(LAST_SEARCH_KEY, JSON.stringify(search));
}

/** The last search, or null. The draft is returned as stored: normalise it (normalizeCaseSearchDraft) before use. */
export function loadLastCaseSearch(): (Omit<LastCaseSearch, 'draft'> & { draft: unknown }) | null {
  const raw = read(LAST_SEARCH_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastCaseSearch> & { filters?: unknown };
    // Before Batch 350 this key held { filters, results, hasSearched }: the page and sort start over.
    const draft = v.draft ?? v.filters;
    if (!draft) return null;
    return {
      draft,
      page: typeof v.page === 'number' ? v.page : 1,
      pageSize: typeof v.pageSize === 'number' ? v.pageSize : 0,
      sort: v.sort as CaseSearchSort,
    };
  } catch {
    return null;
  }
}

export function clearLastCaseSearch(): void {
  remove(LAST_SEARCH_KEY);
}

export function markReturnToSearch(): void {
  write(RETURN_KEY, '1');
}

/** True once after markReturnToSearch(); clears the mark. */
export function consumeReturnToSearch(): boolean {
  const returning = read(RETURN_KEY) === '1';
  remove(RETURN_KEY);
  return returning;
}

export type CaseOpenedFrom = 'search' | 'worklist';

export function setCaseOpenedFrom(source: CaseOpenedFrom): void {
  write(OPENED_FROM_KEY, source);
}

export function getCaseOpenedFrom(): CaseOpenedFrom {
  return read(OPENED_FROM_KEY) === 'search' ? 'search' : 'worklist';
}

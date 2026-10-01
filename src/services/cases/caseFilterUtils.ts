// src/services/cases/caseFilterUtils.ts
// ─────────────────────────────────────────────────────────────
// Shared case-filtering pipeline.
//
// Extracted verbatim from mockCaseService.ts's getAll() so that
// mockOrchestratorCaseService.ts's getAll() can apply the exact same
// filters instead of a thinner, separately-maintained copy. Both
// mockCaseService.getAll() and mockOrchestratorCaseService.getAll() now
// call applyCaseFilters() — one filter pipeline, not two that will
// inevitably drift (the same class of bug this codebase has hit
// repeatedly: IAIProvider/aiProviderService, protocolRegistry/
// protocolShared, the reportingMode type mismatch, etc.).
//
// Deliberately pure: takes a Case[] and params, returns a filtered
// Case[]. No side effects, no delay(), no CASES-reseed logic — those
// stay local to each service's own getAll(), since they're specific to
// how each service manages its own store.
//
// Batch 350: the Search page's filters moved to the case search service
// (services/caseSearch/caseSearchMatching.ts), which the server runs with
// paging. What is left here serves the simple internal callers.
// ─────────────────────────────────────────────────────────────

import type { Case } from '../../types/case/Case';
import type { CaseFilterParams } from './ICaseService';

export function applyCaseFilters(cases: Case[], params?: CaseFilterParams): Case[] {
  let results = [...cases];

  // ── Worklist-style filters ─────────────────────────────────────────────
  if ((params as any)?.status) {
    const statuses = Array.isArray((params as any).status) ? (params as any).status : [(params as any).status];
    results = results.filter(c => statuses.includes((c as any).status));
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    results = results.filter(c =>
      c.accession?.fullAccession?.toLowerCase().includes(q) ||
      `${c.patient?.firstName} ${c.patient?.lastName}`.toLowerCase().includes(q) ||
      (c.patient?.mrn ?? '').toLowerCase().includes(q)
    );
  }

  if ((params as any)?.patientName) {
    const q = ((params as any).patientName as string).toLowerCase();
    results = results.filter(c =>
      `${c.patient?.firstName} ${c.patient?.lastName}`.toLowerCase().includes(q)
    );
  }
  // Real fix: hospitalId (MRN) and patientId (MPI) were both declared in
  // CaseFilterParams and sent by SearchPage.tsx, but neither was ever
  // actually checked anywhere in this pipeline - a real, live gap
  // (confirmed directly), not a stylistic omission. patient.id already
  // holds the real, deduplicated MPI identity (AccessionPage.tsx's real
  // MPI resolution, not a case-derived id), so it's matched exactly
  // rather than by substring, unlike MRN which stays substring-matched
  // for consistency with every other identifier field here.
  if ((params as any)?.hospitalId) {
    const q = ((params as any).hospitalId as string).toLowerCase();
    results = results.filter(c => (c.patient?.mrn ?? '').toLowerCase().includes(q));
  }
  if ((params as any)?.patientId) {
    const q = (params as any).patientId as string;
    results = results.filter(c => c.patient?.id === q);
  }
  if ((params as any)?.accessionNo) {
    const q = ((params as any).accessionNo as string).toLowerCase();
    results = results.filter(c =>
      c.accession?.fullAccession?.toLowerCase().includes(q)
    );
  }

  return results;
}

// ── Pagination ─────────────────────────────────────────────────────────────
// Real, shared pagination for the two mock services (mockCaseService.ts,
// mockOrchestratorCaseService.ts) - kept separate from applyCaseFilters
// above to preserve that function's own stated "deliberately pure, just
// filtering" contract. Same "one shared implementation, not two that
// drift" reasoning this file's own header already states for filtering.
//
// Sorts by updatedAt desc before paginating - matches
// FirestoreCaseService.ts's own orderBy('updatedAt', 'desc') exactly, so
// a caller (SearchPage.tsx) sees cases in the same order and the
// pagination cursor means the same thing regardless of which backend is
// actually active. Without this, the two backends would paginate through
// genuinely different orderings of the same filtered set.
//
// Honest, known limitation, deliberately consistent with the Firestore
// implementation rather than "fixed" only here: cursor is a single field
// (updatedAt), not a compound cursor with a tiebreaker. Two cases sharing
// the exact same updatedAt timestamp could theoretically resolve
// ambiguously - the same limitation the real Firestore query has with a
// single-field orderBy/startAfter, not a mock-only gap.
export interface CasePaginationResult {
  data: Case[];
  meta?: { hasMore: boolean; nextCursor?: string };
}

export function applyCasePagination(results: Case[], params?: CaseFilterParams): CasePaginationResult {
  const sorted = [...results].sort((a, b) => {
    const at = new Date((a as any).updatedAt ?? 0).getTime();
    const bt = new Date((b as any).updatedAt ?? 0).getTime();
    return bt - at;
  });

  if (!params?.pageSize) {
    return { data: sorted };
  }

  let startIdx = 0;
  if (params.cursor) {
    // Resume immediately after the item the previous page actually ended
    // on. If that item is no longer in the current filtered/sorted set
    // (e.g. it changed status between requests and no longer matches),
    // fall back to the start rather than erroring - a graceful, honest
    // degradation, not a crash.
    const idx = sorted.findIndex(c => (c as any).updatedAt === params.cursor);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }

  const page = sorted.slice(startIdx, startIdx + params.pageSize + 1);
  const hasMore = page.length > params.pageSize;
  const data = page.slice(0, params.pageSize);
  const nextCursor = hasMore ? (data[data.length - 1] as any)?.updatedAt : undefined;

  return { data, meta: { hasMore, nextCursor } };
}

// Real, pure merge-pagination for CaseRouter.getAll()'s dual-source case
// (LIS + Orchestration combined). Extracted specifically so this genuinely
// tricky algorithm (composite cursor: each source needs its own resume
// point, since a cursor value from one source's own updatedAt ordering
// may not exist at all in the other's dataset) can be tested directly,
// without needing to mock CaseRouter's real session/subspecialty/audit
// dependencies just to verify the merge itself is correct.
export interface DualSourceCursor { lis?: string; orch?: string }
export interface DualSourcePage<T> {
  data: T[];
  meta: { hasMore: boolean; nextCursor?: string };
}

export function mergeDualSourcePages<T extends { updatedAt?: string }>(
  lisItems: T[],
  orchItems: T[],
  pageSize: number,
  priorCursor: DualSourceCursor,
  // Each source's own hasMore, from its own prior applyCasePagination call.
  // Real, necessary input, not optional bookkeeping: without this, a
  // source whose entire fetched batch gets consumed by this page would
  // look like "no more data" even when that source genuinely has more
  // beyond what was fetched — a real, confirmed gap caught directly by
  // testing (mergeDualSourcePages(lisFetched.data, [], 2, {}) with a
  // 3-item lis source and pageSize 2 returned hasMore: false when it
  // should have been true).
  sourceHasMore: { lis?: boolean; orch?: boolean } = {},
): DualSourcePage<T> {
  const tagged = [
    ...lisItems.map(c => ({ c, source: 'lis' as const })),
    ...orchItems.map(c => ({ c, source: 'orch' as const })),
  ].sort((a, b) => {
    const at = new Date(a.c.updatedAt ?? 0).getTime();
    const bt = new Date(b.c.updatedAt ?? 0).getTime();
    return bt - at;
  });

  const page = tagged.slice(0, pageSize);
  const hasMore = tagged.length > pageSize || !!sourceHasMore.lis || !!sourceHasMore.orch;

  // Next cursor per source: the updatedAt of the last item FROM THAT
  // SOURCE that actually made it into this page. If none of a source's
  // fetched items made the cut, that source's cursor stays exactly where
  // it was — nothing from it was consumed yet, so the next request should
  // resume from the same spot rather than skipping ahead incorrectly.
  const lastLisInPage = [...page].reverse().find(x => x.source === 'lis');
  const lastOrchInPage = [...page].reverse().find(x => x.source === 'orch');
  const nextCursor: DualSourceCursor = {
    lis: lastLisInPage ? lastLisInPage.c.updatedAt : priorCursor.lis,
    orch: lastOrchInPage ? lastOrchInPage.c.updatedAt : priorCursor.orch,
  };

  return {
    data: page.map(x => x.c),
    meta: { hasMore, nextCursor: hasMore ? JSON.stringify(nextCursor) : undefined },
  };
}


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
// ─────────────────────────────────────────────────────────────

import type { Case } from '../../types/case/Case';
import { getFlagsSync } from '../flags/mockFlagService';
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
  if ((params as any)?.specialty) {
    results = results.filter(c => (c as any).specialty === (params as any).specialty);
  }

  // ── SearchPage CaseFilterParams ────────────────────────────────────────
  if (params?.statusList?.length) {
    const sl = (params.statusList as string[]).map((s: string) => s.toLowerCase());
    results = results.filter(c => sl.includes(((c as any).status ?? '').toLowerCase()));
  }
  if ((params as any)?.priorityList?.length) {
    const pl = ((params as any).priorityList as string[]).map((s: string) => s.toLowerCase());
    results = results.filter(c => {
      const priority = ((c as any).order?.priority ?? 'routine').toLowerCase();
      return pl.some((p: string) => priority.includes(p.toLowerCase()));
    });
  }
  if (params?.dateFrom || params?.dateTo) {
    const from = params?.dateFrom ? new Date(params.dateFrom as string).getTime() : 0;
    const to   = params?.dateTo   ? new Date(params.dateTo as string).getTime() + 86400000 : Infinity;
    results = results.filter(c => {
      // Use first specimen receivedAt as the case accession date
      const specimens = (c as any).specimens ?? [];
      const raw = specimens[0]?.receivedAt ?? specimens[0]?.collectedAt ?? (c as any).createdAt ?? '';
      const d = raw ? new Date(raw).getTime() : NaN;
      if (isNaN(d)) return true; // don't exclude cases with no date
      return d >= from && d <= to;
    });
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
  if ((params as any)?.genderList?.length) {
    // Normalise both sides so 'M'|'male'|'Male' all resolve to 'male', etc.
    // Case data stores single-letter codes ('M','F'); SearchPage sends full words ('Male','Female').
    const toFull = (s: string): string => {
      const l = s.toLowerCase();
      if (l === 'm' || l === 'male')       return 'male';
      if (l === 'f' || l === 'female')     return 'female';
      if (l === 'x' || l === 'non-binary') return 'non-binary';
      if (l === 'u' || l === 'unknown')    return 'unknown';
      if (l === 'o' || l === 'other')      return 'other';
      return l;
    };
    const gl = ((params as any).genderList as string[]).map(toFull);
    // Use c.patient.sex (the actual field) — NOT c.patient.gender (does not exist)
    results = results.filter(c => gl.includes(toFull(c.patient?.sex ?? '')));
  }

  // Age range — no stored 'age' field; compute from patient.dateOfBirth at query time
  if ((params as any)?.ageMin !== undefined || (params as any)?.ageMax !== undefined) {
    const minAge = (params as any).ageMin ?? 0;
    const maxAge = (params as any).ageMax ?? 150;
    const now = new Date();
    results = results.filter(c => {
      const dob = c.patient?.dateOfBirth;
      if (!dob) return true; // don't exclude cases with no DOB on record
      const birth = new Date(dob);
      // Real, honest justification for both lines below: age-from-DOB
      // compares two dates (now, birth) in the same, consistent local
      // time - inherently viewer-relative, not a real, stored-event
      // facility-timezone concern.
      const age =
        // eslint-disable-next-line no-restricted-properties -- see real, honest justification above
        now.getFullYear() - birth.getFullYear() -
        // eslint-disable-next-line no-restricted-properties -- see real, honest justification above
        (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
      return age >= minAge && age <= maxAge;
    });
  }

  // DOB date range (separate from accession dateFrom/dateTo)
  if ((params as any)?.dobFrom || (params as any)?.dobTo) {
    const from = (params as any).dobFrom ? new Date((params as any).dobFrom as string).getTime() : 0;
    const to   = (params as any).dobTo   ? new Date((params as any).dobTo   as string).getTime() + 86_400_000 : Infinity;
    results = results.filter(c => {
      const dob = c.patient?.dateOfBirth;
      if (!dob) return true;
      const d = new Date(dob).getTime();
      return !isNaN(d) && d >= from && d <= to;
    });
  }
  if (params?.specimenList?.length) {
    const sl = params.specimenList as string[];
    results = results.filter(c =>
      (c.specimens ?? []).some((sp: any) =>
        sl.some((s: string) => (sp.description ?? sp.label ?? '').toLowerCase().includes(s.toLowerCase()))
      )
    );
  }
  if (params?.diagnosisList?.length) {
    const dl = params.diagnosisList as string[];
    results = results.filter(c =>
      dl.some((d: string) =>
        ((c as any).diagnosis ?? '').toLowerCase().includes(d.toLowerCase()) ||
        ((c as any).microscopicDescription ?? '').toLowerCase().includes(d.toLowerCase())
      )
    );
  }
  if (params?.pathologistIds?.length) {
    const ids = params.pathologistIds as string[];
    results = results.filter(c => ids.includes(c.order?.assignedTo ?? ''));
  }
  if (params?.synopticProtocolIds?.length) {
    // SearchPage passes resolved templateIds (e.g. 'breast_invasive'), not the UI p01 keys.
    // Match against synopticReports[].templateId — specimens never had a synopticTemplateId field.
    const ids = (params.synopticProtocolIds as string[]).map((s: string) => s.toLowerCase());
    results = results.filter(c =>
      ((c as any).synopticReports ?? []).some((sr: any) => {
        const t = (sr.templateId ?? '').toLowerCase();
        // Exact match OR common-prefix match (lung_adeno ↔ lung_resection, melanoma_resection ↔ skin_melanoma_bx)
        return ids.some((id: string) => t === id || t.startsWith(id.replace(/_[^_]+$/, '_')));
      })
    );
  }
  if (params?.flagIds?.length || params?.compFlagCodes?.length) {
    // Real, confirmed fix (Jira PS-57 + its follow-up "should be able
    // to assign Flags at either a Case or Specimen level"): both
    // filters below used to read display fields (.name/.label/
    // .lisCode) directly off a case's own flag entries — those
    // entries are real FlagInstance records now (id/flagDefinitionId/
    // appliedAt/source/deletedAt), with no display fields of their
    // own. Resolved against the real flag catalog instead, the same
    // one FlagManagerModal.tsx itself uses — getFlagsSync() specifically
    // because this whole function is genuinely synchronous, no caller
    // currently awaits it.
    const flagDefById = new Map(getFlagsSync().map(f => [f.id, f]));

    if (params?.flagIds?.length) {
      // SearchPage sends flag display names (e.g. 'STAT — Rush Processing'), not ID keys.
      const search = (params.flagIds as string[]).map((s: string) => s.toLowerCase());
      results = results.filter(c =>
        ((c as any).caseFlags ?? []).some((f: any) => {
          if (f.deletedAt) return false;
          const name = (flagDefById.get(f.flagDefinitionId)?.name ?? '').toLowerCase();
          return search.some((s: string) => name.includes(s) || s.includes(name));
        })
      );
    }

    if (params?.compFlagCodes?.length) {
      // Real, per direct guidance's own follow-up: moved verbatim from
      // SearchPage.tsx's own runSearch, where this exact check
      // ran client-side, after the real page had already been fetched -
      // now applied here, before pagination, same real pipeline
      // position as every other filter in this function. Aggregated
      // across every specimen on the case — there's deliberately no
      // case-level specimenFlags field; each specimen's own
      // specimenFlags is the only real place a flag applied to a
      // specific specimen can live, since FlagInstance itself carries
      // no specimenId.
      const codes = params.compFlagCodes as string[];
      results = results.filter(c =>
        codes.some(code =>
          (c.specimens ?? []).flatMap((sp: any) => sp.specimenFlags ?? []).some((sf: any) => {
            if (sf.deletedAt) return false;
            const def = flagDefById.get(sf.flagDefinitionId);
            return !!def && (def.lisCode === code || def.id === code || def.name === code);
          })
        )
      );
    }
  }

  if (params?.facilityIds?.length) {
    const ids = params.facilityIds as string[];
    results = results.filter(c => ids.includes((c as any).order?.facilityId ?? ''));
  }

  // SNOMED CT — SearchPage passes s.code (e.g. '413448000'); match c.coding.snomed[]
  if ((params as any)?.snomedCodes?.length) {
    const codes: string[] = (params as any).snomedCodes;
    results = results.filter(c => {
      const caseCodes: string[] = (c as any).coding?.snomed ?? [];
      return codes.some((code: string) => caseCodes.includes(code));
    });
  }

  // ICD-10/11 — SearchPage passes s.code (e.g. 'C50.412'); match c.coding.icd10[]
  if ((params as any)?.icdCodes?.length) {
    const codes: string[] = (params as any).icdCodes;
    results = results.filter(c => {
      const caseCodes: string[] = (c as any).coding?.icd10 ?? [];
      // Trim trailing sub-category so 'C50' matches 'C50.412'
      return codes.some((code: string) =>
        caseCodes.some((cc: string) => cc.startsWith(code) || code.startsWith(cc))
      );
    });
  }

  // Attending / Requesting Provider — SearchPage maps attendingId → full name before passing
  if ((params as any)?.attendingNames?.length) {
    const strip = (s: string) => s.toLowerCase().replace(/^(dr\.|mr\.|ms\.|mrs\.)\s*/i, '').trim();
    const names: string[] = ((params as any).attendingNames as string[]).map(strip);
    results = results.filter(c => {
      const prov = strip(c.order?.requestingProvider ?? '');
      return names.some((n: string) => prov.includes(n) || n.includes(prov));
    });
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


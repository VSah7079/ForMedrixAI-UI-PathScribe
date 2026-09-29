// src/utils/search/buildCaseSearchRequest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 350: turns what the user filled in on the Search page (a
// CaseSearchDraft, also what a saved search stores) into the request the
// case search service runs on the server. Moved out of SearchPage.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CASE_SEARCH_DATE_BASES, CASE_SEARCH_PATHOLOGIST_ROLES,
  DEFAULT_CASE_SEARCH_PAGE_SIZE, DEFAULT_CASE_SEARCH_SORT, emptyCaseSearchDraft,
  type CaseSearchCriteria, type CaseSearchDraft, type CaseSearchRequest, type CaseSearchSort,
} from '@/services/caseSearch/caseSearchTypes';
import type { IdentifierApplicationResult } from '@/utils/detectIdentifierType';
import { resolveSearchDateRange } from './resolveSearchDateRange';

const trimmed = (s: string | undefined) => (s ?? '').trim() || undefined;
const list = <T>(xs: readonly T[] | undefined): T[] | undefined => (xs && xs.length ? [...xs] : undefined);
const wholeNumber = (s: string): number | undefined => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function draftHasIdentifier(d: CaseSearchDraft): boolean {
  return !!(d.patientName || d.mrn || d.mpiId || d.accessionNo || d.orderNo || d.anyIdentifier);
}

export function draftToCriteria(d: CaseSearchDraft): CaseSearchCriteria {
  const range = resolveSearchDateRange({
    dateFrom: d.dateFrom, dateTo: d.dateTo, datesChosen: d.datesChosen, hasIdentifier: draftHasIdentifier(d),
  });
  const criteria: CaseSearchCriteria = {
    anyIdentifier: trimmed(d.anyIdentifier),
    patientName: trimmed(d.patientName),
    mrn: trimmed(d.mrn),
    mpiId: trimmed(d.mpiId),
    accessionNo: trimmed(d.accessionNo),
    orderNo: trimmed(d.orderNo),
    dateBasis: (range.dateFrom || range.dateTo) && d.dateBasis !== 'accessioned' ? d.dateBasis : undefined,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    sexes: list(d.sexes),
    dobFrom: trimmed(d.dobFrom),
    dobTo: trimmed(d.dobTo),
    ageMin: wholeNumber(d.ageMin),
    ageMax: wholeNumber(d.ageMax),
    statuses: list(d.statuses),
    priorities: list(d.priorities),
    caseFlagIds: list(d.caseFlagIds),
    specimenFlagIds: list(d.specimenFlagIds),
    synopticTemplateIds: list(d.synopticTemplateIds),
    pathologistIds: list(d.pathologistIds),
    pathologistRole: d.pathologistIds.length && d.pathologistRole !== 'any' ? d.pathologistRole : undefined,
    orderingPhysicianIds: list(d.orderingPhysicianIds),
    submittingFacilityIds: list(d.submittingFacilityIds),
    specimenTerms: list(d.specimenTerms),
    diagnosisTerms: list(d.diagnosisTerms),
    snomedCodes: list(d.snomedCodes.map(c => c.code)),
    icdCodes: list(d.icdCodes.map(c => c.code)),
    // Batch 351
    caseTypes: list(d.caseTypes),
    revisionTypes: list(d.revisionTypes),
    holdTypes: list(d.holdTypes),
    resultFlags: list(d.resultFlags),
    pendingWork: list(d.pendingWork),
    pastTatTarget: d.pastTatTarget ? true : undefined,
    subspecialtyIds: list(d.subspecialtyIds),
    performingLabIds: list(d.performingLabIds),
    locationIds: list(d.locationIds),
    intakes: list(d.intakes),
    payer: trimmed(d.payer),
    cptCodes: list(d.cptCodes),
    autopsyJurisdictions: list(d.autopsyJurisdictions),
    autopsyAuthorities: list(d.autopsyAuthorities),
    autopsyReports: list(d.autopsyReports),
  };
  // Leave out what isn't set, so the request carries only real filters.
  return Object.fromEntries(Object.entries(criteria).filter(([, v]) => v !== undefined)) as CaseSearchCriteria;
}

export function buildCaseSearchRequest(
  draft: CaseSearchDraft,
  opts: { page?: number; pageSize?: number; sort?: CaseSearchSort; timeZone?: string } = {},
): CaseSearchRequest {
  return {
    criteria: draftToCriteria(draft),
    sort: opts.sort ?? DEFAULT_CASE_SEARCH_SORT,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? DEFAULT_CASE_SEARCH_PAGE_SIZE,
    timeZone: opts.timeZone,
  };
}

/** A stored draft (a saved search, the last search) with every field present, whatever version saved it. */
export function normalizeCaseSearchDraft(value: unknown, dateFrom: string, dateTo: string): CaseSearchDraft {
  const base = emptyCaseSearchDraft(dateFrom, dateTo);
  if (!value || typeof value !== 'object') return base;
  const v = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [key, def] of Object.entries(base)) {
    const got = v[key];
    if (Array.isArray(def)) out[key] = Array.isArray(got) ? got : def;
    else if (typeof def === 'boolean') out[key] = typeof got === 'boolean' ? got : def;
    else out[key] = typeof got === 'string' ? got : def;
  }
  // A draft saved without datesChosen had its dates chosen by the user.
  if (typeof v.datesChosen !== 'boolean') out.datesChosen = true;
  // Choices must be ones the page offers (Batch 351).
  if (!(CASE_SEARCH_DATE_BASES as readonly string[]).includes(out.dateBasis as string)) out.dateBasis = base.dateBasis;
  if (!(CASE_SEARCH_PATHOLOGIST_ROLES as readonly string[]).includes(out.pathologistRole as string)) out.pathologistRole = base.pathologistRole;
  return out as unknown as CaseSearchDraft;
}

/** Puts what the identifier box resolved to into the draft. */
export function applyIdentifierToDraft(
  d: CaseSearchDraft, text: string, result: Extract<IdentifierApplicationResult, { action: 'setFilters' }>,
): CaseSearchDraft {
  return {
    ...d,
    identifierText: text,
    patientName: result.patientName,
    mrn: result.hospitalId,
    mpiId: result.patientId,
    accessionNo: result.accessionNo,
    orderNo: result.orderNo,
    anyIdentifier: result.anyIdentifier,
  };
}

/**
 * How many filters are set (the badge next to the saved searches). The date
 * range counts once, and only when it applies (an identifier search with
 * untouched dates covers every date).
 */
export function countDraftFilters(d: CaseSearchDraft): number {
  const lists = [
    d.sexes, d.statuses, d.priorities, d.caseFlagIds, d.specimenFlagIds, d.synopticTemplateIds,
    d.pathologistIds, d.orderingPhysicianIds, d.submittingFacilityIds, d.specimenTerms, d.diagnosisTerms,
    d.snomedCodes, d.icdCodes, d.caseTypes,
  ].reduce((n, xs) => n + xs.length, 0) + countMoreFilters(d);
  const range = resolveSearchDateRange({ dateFrom: d.dateFrom, dateTo: d.dateTo, datesChosen: d.datesChosen, hasIdentifier: draftHasIdentifier(d) });
  const singles = [d.identifierText.trim(), d.dobFrom || d.dobTo, d.ageMin || d.ageMax, !range.allDates && (d.dateFrom || d.dateTo)].filter(Boolean).length;
  return lists + singles;
}

/** How many of the "More filters" are set (Batch 351): shown on the section's toggle. */
export function countMoreFilters(d: CaseSearchDraft): number {
  return [
    d.revisionTypes, d.holdTypes, d.resultFlags, d.pendingWork, d.subspecialtyIds, d.performingLabIds,
    d.locationIds, d.intakes, d.cptCodes, d.autopsyJurisdictions, d.autopsyAuthorities, d.autopsyReports,
  ].reduce((n, xs) => n + xs.length, 0) + (d.pastTatTarget ? 1 : 0) + (d.payer.trim() ? 1 : 0);
}

/** Adds a value to a list, or removes it if it's there. */
export function toggleInList<T>(xs: readonly T[], value: T): T[] {
  return xs.includes(value) ? xs.filter(x => x !== value) : [...xs, value];
}

/** Adds a typed term (trimmed, no duplicates). */
export function addTerm(xs: readonly string[], value: string): string[] {
  const v = value.trim();
  return !v || xs.includes(v) ? [...xs] : [...xs, v];
}

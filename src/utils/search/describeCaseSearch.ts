// src/utils/search/describeCaseSearch.ts
// Batch 350: the plain-language summary of a search ("Showing cases with
// all accession dates · MRN "100001" · status: Draft") and the "26–50 of
// 312" range, moved out of SearchPage.tsx. Names are looked up so the
// summary shows people, facilities, flags and protocols, not ids; statuses,
// priorities and sexes are translated.
import type { CaseSearchDraft } from '@/services/caseSearch/caseSearchTypes';
import { resolveSearchDateRange } from './resolveSearchDateRange';
import { draftHasIdentifier } from './buildCaseSearchRequest';
import {
  AUTOPSY_AUTHORITY_LABEL_KEY, AUTOPSY_REPORT_LABEL_KEY, CASE_PRIORITY_LABEL_KEY, CASE_SEX_LABEL_KEY, CASE_STATUS_LABEL_KEY,
  CASE_TYPE_LABEL_KEY, DATE_RANGE_SUMMARY_KEY, HOLD_TYPE_LABEL_KEY, INTAKE_LABEL_KEY, PATHOLOGIST_ROLE_LABEL_KEY,
  PENDING_WORK_LABEL_KEY, RESULT_FLAG_LABEL_KEY, REVISION_TYPE_LABEL_KEY,
} from './caseSearchLabels';

type T = (key: string, opts?: Record<string, unknown>) => string;

export interface CaseSearchNameLookups {
  pathologist(id: string): string | undefined;
  physician(id: string): string | undefined;
  facility(id: string): string | undefined;
  flag(id: string): string | undefined;
  template(id: string): string | undefined;
  // Batch 351
  subspecialty(id: string): string | undefined;
  performingLab(id: string): string | undefined;
  location(id: string): string | undefined;
}

/** Each part of the summary, in order. Empty when no filter is set. */
export function describeCaseSearch(
  d: CaseSearchDraft, names: CaseSearchNameLookups, t: T, formatDay: (isoDate: string) => string,
): string[] {
  const parts: string[] = [];
  const join = (xs: readonly string[]) => xs.join(', ');
  const named = (ids: readonly string[], lookup: (id: string) => string | undefined) => join(ids.map(id => lookup(id) ?? id));

  const range = resolveSearchDateRange({ dateFrom: d.dateFrom, dateTo: d.dateTo, datesChosen: d.datesChosen, hasIdentifier: draftHasIdentifier(d) });
  if (range.allDates) parts.push(t('searchPage.summaryParts.allDates'));
  else if (d.dateFrom || d.dateTo) {
    parts.push(t(DATE_RANGE_SUMMARY_KEY[d.dateBasis] ?? DATE_RANGE_SUMMARY_KEY.accessioned, {
      from: d.dateFrom ? formatDay(d.dateFrom) : '…',
      to: d.dateTo ? formatDay(d.dateTo) : t('searchPage.summaryParts.todayFallback'),
    }));
  }
  if (d.anyIdentifier) parts.push(t('searchPage.summaryParts.anyIdentifier', { value: d.anyIdentifier }));
  if (d.patientName)   parts.push(t('searchPage.summaryParts.patientName', { name: d.patientName }));
  if (d.accessionNo)   parts.push(t('searchPage.summaryParts.accessionNo', { no: d.accessionNo }));
  if (d.orderNo)       parts.push(t('searchPage.summaryParts.orderNo', { no: d.orderNo }));
  if (d.mrn)           parts.push(t('searchPage.summaryParts.mrn', { id: d.mrn }));
  if (d.mpiId)         parts.push(t('searchPage.summaryParts.mpi', { id: d.mpiId }));
  if (d.specimenTerms.length)  parts.push(t('searchPage.summaryParts.specimen', { list: join(d.specimenTerms) }));
  if (d.diagnosisTerms.length) parts.push(t('searchPage.summaryParts.diagnosis', { list: join(d.diagnosisTerms) }));
  if (d.snomedCodes.length)    parts.push(t('searchPage.summaryParts.snomed', { list: join(d.snomedCodes.map(c => c.code)) }));
  if (d.icdCodes.length)       parts.push(t('searchPage.summaryParts.icd', { list: join(d.icdCodes.map(c => `${c.system} ${c.code}`)) }));
  if (d.statuses.length)       parts.push(t('searchPage.summaryParts.status', { list: join(d.statuses.map(s => t(CASE_STATUS_LABEL_KEY[s]))) }));
  if (d.sexes.length)          parts.push(t('searchPage.summaryParts.gender', { list: join(d.sexes.map(s => t(CASE_SEX_LABEL_KEY[s]))) }));
  if (d.dobFrom || d.dobTo)    parts.push(t('searchPage.summaryParts.dob', { from: d.dobFrom ? formatDay(d.dobFrom) : '…', to: d.dobTo ? formatDay(d.dobTo) : '…' }));
  if (d.ageMin || d.ageMax)    parts.push(t('searchPage.summaryParts.age', { min: d.ageMin || '0', max: d.ageMax || '∞' }));
  if (d.priorities.length)     parts.push(t('searchPage.summaryParts.priority', { list: join(d.priorities.map(p => t(CASE_PRIORITY_LABEL_KEY[p]))) }));
  if (d.caseFlagIds.length)    parts.push(t('searchPage.summaryParts.flags', { list: named(d.caseFlagIds, names.flag) }));
  if (d.specimenFlagIds.length) parts.push(t('searchPage.summaryParts.specimenFlags', { list: named(d.specimenFlagIds, names.flag) }));
  if (d.synopticTemplateIds.length) parts.push(t('searchPage.summaryParts.synoptic', { list: named(d.synopticTemplateIds, names.template) }));
  if (d.pathologistIds.length) {
    parts.push(d.pathologistRole === 'any'
      ? t('searchPage.summaryParts.pathologist', { list: named(d.pathologistIds, names.pathologist) })
      : t('searchPage.summaryParts.pathologistInRole', { role: t(PATHOLOGIST_ROLE_LABEL_KEY[d.pathologistRole]), list: named(d.pathologistIds, names.pathologist) }));
  }
  if (d.orderingPhysicianIds.length) parts.push(t('searchPage.summaryParts.attending', { list: named(d.orderingPhysicianIds, names.physician) }));
  if (d.submittingFacilityIds.length) parts.push(t('searchPage.summaryParts.facility', { list: named(d.submittingFacilityIds, names.facility) }));
  // Batch 351
  const labels = <K extends string>(xs: readonly K[], keys: Record<K, string>) => join(xs.map(x => t(keys[x])));
  if (d.caseTypes.length)       parts.push(t('searchPage.summaryParts.caseType', { list: labels(d.caseTypes, CASE_TYPE_LABEL_KEY) }));
  if (d.revisionTypes.length)   parts.push(t('searchPage.summaryParts.revisions', { list: labels(d.revisionTypes, REVISION_TYPE_LABEL_KEY) }));
  if (d.holdTypes.length)       parts.push(t('searchPage.summaryParts.holds', { list: labels(d.holdTypes, HOLD_TYPE_LABEL_KEY) }));
  if (d.resultFlags.length)     parts.push(t('searchPage.summaryParts.resultFlags', { list: labels(d.resultFlags, RESULT_FLAG_LABEL_KEY) }));
  if (d.pendingWork.length)     parts.push(t('searchPage.summaryParts.pendingWork', { list: labels(d.pendingWork, PENDING_WORK_LABEL_KEY) }));
  if (d.pastTatTarget)          parts.push(t('searchPage.summaryParts.pastTat'));
  if (d.subspecialtyIds.length) parts.push(t('searchPage.summaryParts.subspecialty', { list: named(d.subspecialtyIds, names.subspecialty) }));
  if (d.performingLabIds.length) parts.push(t('searchPage.summaryParts.performingLab', { list: named(d.performingLabIds, names.performingLab) }));
  if (d.locationIds.length)     parts.push(t('searchPage.summaryParts.location', { list: named(d.locationIds, names.location) }));
  if (d.intakes.length)         parts.push(t('searchPage.summaryParts.intake', { list: labels(d.intakes, INTAKE_LABEL_KEY) }));
  if (d.payer.trim())           parts.push(t('searchPage.summaryParts.payer', { value: d.payer.trim() }));
  if (d.cptCodes.length)        parts.push(t('searchPage.summaryParts.cpt', { list: join(d.cptCodes) }));
  if (d.autopsyJurisdictions.length) parts.push(t('searchPage.summaryParts.autopsyJurisdiction', { list: join(d.autopsyJurisdictions.map(j => t(`jurisdictionNames.${j}`))) }));
  if (d.autopsyAuthorities.length)   parts.push(t('searchPage.summaryParts.autopsyAuthority', { list: labels(d.autopsyAuthorities, AUTOPSY_AUTHORITY_LABEL_KEY) }));
  if (d.autopsyReports.length)       parts.push(t('searchPage.summaryParts.autopsyReport', { list: labels(d.autopsyReports, AUTOPSY_REPORT_LABEL_KEY) }));
  return parts;
}

/** The 1-based positions shown on this page: 26–50. Zero results give 0–0. */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, page * pageSize) };
}

// src/utils/search/caseSearchCsv.ts
// Batch 350: the Search page's CSV export, moved out of SearchPage.tsx.
// The rows come from the case search service (every matching case, up to
// its export limit, not just the page on screen). Column headings, statuses
// and priorities are translated; dates use the user's locale (they were
// English column names and US dates before).
import type { CaseSearchExportRow } from '@/services/caseSearch/caseSearchTypes';
import type { CaseStatus } from '@/types/case/CaseStatus';
import type { CasePriority } from '@/services/cases/ICaseService';
import { CASE_PRIORITY_LABEL_KEY, CASE_SEX_LABEL_KEY, CASE_STATUS_LABEL_KEY } from './caseSearchLabels';

type T = (key: string, opts?: Record<string, unknown>) => string;

const COLUMNS: ReadonlyArray<[keyof CaseSearchExportRow, string]> = [
  ['accession', 'searchPage.csv.accession'],
  ['patientName', 'searchPage.csv.patientName'],
  ['mrn', 'searchPage.csv.mrn'],
  ['sex', 'searchPage.csv.sex'],
  ['dateOfBirth', 'searchPage.csv.dateOfBirth'],
  ['specimens', 'searchPage.csv.specimens'],
  ['accessionDate', 'searchPage.csv.accessionDate'],
  ['signedOutDate', 'searchPage.csv.signedOutDate'],
  ['orderingPhysician', 'searchPage.csv.orderingPhysician'],
  ['priority', 'searchPage.csv.priority'],
  ['status', 'searchPage.csv.status'],
  ['flags', 'searchPage.csv.flags'],
];

const csvField = (v: string) => `"${v.replace(/"/g, '""')}"`;

/**
 * A calendar date in the user's locale. A date-only value (a date of birth)
 * is shown as that date wherever the user is; a timestamp is shown as the
 * date it falls on in the facility's time zone.
 */
export function formatCalendarDate(value: string, locale: string, timeZone: string): string {
  if (!value) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: dateOnly ? 'UTC' : timeZone,
  }).format(d);
}

export function buildCaseSearchCsv(
  rows: readonly CaseSearchExportRow[], opts: { t: T; locale: string; timeZone: string },
): string {
  const { t, locale, timeZone } = opts;
  const cell = (row: CaseSearchExportRow, key: keyof CaseSearchExportRow): string => {
    const v = row[key];
    switch (key) {
      case 'dateOfBirth':
      case 'signedOutDate':
      case 'accessionDate': return formatCalendarDate(v as string, locale, timeZone);
      case 'specimens':
      case 'flags':         return (v as string[]).join('; ');
      case 'status':        { const k = CASE_STATUS_LABEL_KEY[v as CaseStatus]; return k ? t(k) : (v as string); }
      case 'priority':      { const k = CASE_PRIORITY_LABEL_KEY[v as CasePriority]; return k ? t(k) : (v as string); }
      case 'sex':           { const k = CASE_SEX_LABEL_KEY[v as 'M' | 'F' | 'U']; return k ? t(k) : (v as string); }
      default:              return String(v ?? '');
    }
  };
  const header = COLUMNS.map(([, key]) => csvField(t(key))).join(',');
  const lines = rows.map(row => COLUMNS.map(([key]) => csvField(cell(row, key))).join(','));
  return [header, ...lines].join('\r\n');
}

/** pathscribe-cases-2026-09-27.csv (the date is the facility's). */
export function caseSearchCsvFilename(facilityDate: string): string {
  return `pathscribe-cases-${facilityDate}.csv`;
}

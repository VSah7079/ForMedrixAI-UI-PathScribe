// src/utils/search/searchDateShortcuts.ts
// Batch 350: the Search page's accession-date shortcuts (7 days … 1 year,
// All), moved out of SearchPage.tsx. Dates are facility-local calendar
// dates (YYYY-MM-DD), the form the case search criteria take.
import { getFacilityDateParts } from '@/utils/facilityTime';

export type SearchDateShortcut = '7d' | '30d' | '90d' | '1yr' | 'all';
export const SEARCH_DATE_SHORTCUT_DAYS: ReadonlyArray<[Exclude<SearchDateShortcut, 'all'>, number]> = [
  ['7d', 7], ['30d', 30], ['90d', 90], ['1yr', 365],
];
export const DEFAULT_SEARCH_DATE_SHORTCUT: SearchDateShortcut = '30d';

export function facilityDateString(d: Date, timeZone: string): string {
  const { year, month, day } = getFacilityDateParts(d, timeZone);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The date range a shortcut stands for, ending today in the facility's time zone. */
export function shortcutDateRange(shortcut: SearchDateShortcut, timeZone: string, now: Date = new Date()): { dateFrom: string; dateTo: string } {
  if (shortcut === 'all') return { dateFrom: '', dateTo: '' };
  const days = SEARCH_DATE_SHORTCUT_DAYS.find(([s]) => s === shortcut)?.[1] ?? 30;
  // Calendar arithmetic on the facility's date, so a daylight-saving change can't shift it.
  const today = getFacilityDateParts(now, timeZone);
  const from = new Date(Date.UTC(today.year, today.month, today.day - days));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(new Date(Date.UTC(today.year, today.month, today.day))) };
}

/** Which shortcut a range matches, if any (so a restored search highlights the right button). */
export function matchDateShortcut(dateFrom: string, dateTo: string, timeZone: string, now: Date = new Date()): SearchDateShortcut | null {
  if (!dateFrom && !dateTo) return 'all';
  const hit = SEARCH_DATE_SHORTCUT_DAYS.find(([s]) => {
    const r = shortcutDateRange(s, timeZone, now);
    return r.dateFrom === dateFrom && r.dateTo === dateTo;
  });
  return hit ? hit[0] : null;
}

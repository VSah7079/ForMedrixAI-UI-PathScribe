// src/utils/search/resolveSearchDateRange.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 349 (PS-101, "Search does not appear to be working"): Case Search
// opens with the accession date range set to the last 30 days. Searching for
// a patient, MRN or accession number then silently missed every case
// accessioned earlier. Now, when the user searches by an identifier and has
// not chosen a date range themselves, the search covers all dates. A range
// the user picks (a shortcut, "All", or typed dates) is always respected, and
// searches without an identifier keep the 30-day default.
// Pure; SearchPage.tsx calls it for the search and for the summary line.
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchDateRangeInput {
  dateFrom: string;
  dateTo: string;
  /** The user picked the range themselves (shortcut, "All", typed dates, or a saved search). */
  datesChosen: boolean;
  /** An accession number, patient name, MRN or MPI is being searched for. */
  hasIdentifier: boolean;
}

export interface SearchDateRange {
  dateFrom?: string;
  dateTo?: string;
  /** The default range was dropped because an identifier is being searched for. */
  allDates: boolean;
}

export function resolveSearchDateRange(input: SearchDateRangeInput): SearchDateRange {
  if (input.hasIdentifier && !input.datesChosen) return { allDates: true };
  return {
    ...(input.dateFrom ? { dateFrom: input.dateFrom } : {}),
    ...(input.dateTo ? { dateTo: input.dateTo } : {}),
    allDates: false,
  };
}

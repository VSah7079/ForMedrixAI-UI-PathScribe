// src/utils/isoDateForSearch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: the Accession page's omnibox search
// originally hardcoded US-style mm/dd/yyyy formatting for DOB matching and
// display (this file's earlier version, isoDateToMDY.ts, whose own header
// comment wrongly claimed "no locale awareness needed" — confirmed wrong).
// PathScribe explicitly serves UK/IE/CA/AU/NZ jurisdictions too — all of
// which use DD/MM/YYYY, not MM/DD/YYYY (see JURISDICTION_LOCALE in
// types/systemConfig.ts; only 'US' uses month-first). Hardcoding month-first
// meant a UK user typing a date the way they naturally would (dd/mm/yyyy)
// could silently fail to match, or worse, could match the WRONG patient if
// both interpretations happened to be valid dates (e.g. '03/04/1990' reads
// as two different real dates depending on which field comes first) — a
// genuine patient-identification risk in a feature explicitly named "Order
// Lookup & Patient Verification."
//
// Deliberately does NOT call toLocaleDateString(locale, ...) directly the
// way formatDate.ts (this app's own display-formatting utility) does —
// confirmed live that real ICU locale data disagrees with this app's own
// JURISDICTION_LOCALE table for at least one supported jurisdiction:
// 'en-CA' actually formats as yyyy-mm-dd (ISO) via toLocaleDateString, not
// the dd/mm/yyyy JURISDICTION_LOCALE.CA declares. Search-matching needs a
// format that's guaranteed to match what the placeholder text promises and
// what JURISDICTION_LOCALE's own dateFormat says, not whatever a given
// browser/Node's bundled CLDR data happens to produce for that locale
// string. Built directly from the explicit format hint instead
// (dateFormatHint() in formatDate.ts, for the two day/month permutations)
// — this app's own, authoritative, already-declared source of truth for
// which field comes first, not re-derived from a second, less predictable
// mechanism.
//
// Real, later extension, per direct follow-up: "would we do the same
// approach [for] N. Ireland, EU, Republic of Ireland, Canada, Australia,
// New Zealand, S. Korea?" — N. Ireland/IE/CA/AU/NZ were already fully
// covered: all five are real, existing entries in Jurisdiction, all five
// use DD/MM/YYYY with slashes, and this fix already checks both
// permutations universally, regardless of which specific jurisdiction is
// selected. 'EU' isn't a real jurisdiction in this app at all, and
// confirmed empirically it isn't really one thing either — Germany and
// France are both day-first, but Germany uses dots (23.07.1990) and
// France uses slashes (23/07/1990). South Korea is genuinely different
// and genuinely uncovered: also absent from Jurisdiction, and its real
// convention is YEAR-FIRST, dot-separated (confirmed empirically via
// toLocaleDateString('ko-KR', ...): "1990. 07. 23."), not a day/month
// permutation at all — neither MM/DD/YYYY nor DD/MM/YYYY would ever match
// it. 'YYYY-MM-DD' and 'YYYY.MM.DD' added to catch a year-first query,
// dash or dot separated. This fixes SEARCH MATCHING only — full South
// Korea support (a real 'KR' Jurisdiction entry, patient ID scheme,
// SNOMED/ICD terminology variant) is real, separate, larger scope not
// addressed here.
// ─────────────────────────────────────────────────────────────────────────────

export type DateSearchFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'YYYY.MM.DD';

/** Converts an ISO date (yyyy-mm-dd, optionally with a time component) to
 *  the given format (see dateFormatHint() in formatDate.ts for deriving
 *  MM/DD/YYYY or DD/MM/YYYY from a real Jurisdiction; YYYY-MM-DD and
 *  YYYY.MM.DD are for year-first search-matching — see this file's own
 *  header comment). Returns '' for anything that isn't a genuine
 *  yyyy-mm-dd string, so a malformed/missing DOB never accidentally
 *  matches an unrelated search query via a garbled partial string.
 *  `format` defaults to 'MM/DD/YYYY' only as a last-resort fallback for a
 *  caller that genuinely has no resolved jurisdiction yet — real callers
 *  should always pass the actual, resolved format hint. */
export function isoDateForSearch(
  iso: string | undefined | null,
  format: DateSearchFormat = 'MM/DD/YYYY',
): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const [, yyyy, mm, dd] = m;
  switch (format) {
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'YYYY.MM.DD': return `${yyyy}.${mm}.${dd}`;
    default:           return `${mm}/${dd}/${yyyy}`;
  }
}

// Every format this app's search-matching currently tries, regardless of
// which specific jurisdiction is selected — see this file's own header
// comment for why matching doesn't guess a single "correct" one.
const ALL_SEARCH_FORMATS: DateSearchFormat[] = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'YYYY.MM.DD'];

/** True if `query` is a substring of the ISO date rendered in ANY
 *  supported format. Centralizes the "try every format" list so call
 *  sites (AccessionPage.tsx, OrderLookupModal.tsx) don't each maintain
 *  their own copy of it — adding a new format here automatically reaches
 *  every caller. */
export function dobIncludesQuery(iso: string | undefined | null, query: string): boolean {
  if (!iso) return false;
  return ALL_SEARCH_FORMATS.some(f => isoDateForSearch(iso, f).includes(query));
}

/** True if `needle` exactly equals the ISO date rendered in ANY
 *  supported format — see dobIncludesQuery's own comment for why this
 *  list lives in one place. */
export function dobExactlyMatches(iso: string | undefined | null, needle: string): boolean {
  if (!iso) return false;
  return ALL_SEARCH_FORMATS.some(f => isoDateForSearch(iso, f) === needle);
}

// src/utils/isoDateToMDY.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: the Accession page's omnibox
// search now advertises "DOB (mm/dd/yyyy)" as a real, matchable field, in
// both the inline search and the new "Order Lookup & Patient Verification"
// modal (AccessionPage.tsx and OrderLookupModal.tsx respectively — a
// shared, standalone file rather than defined in either, avoiding a
// circular import between the page and the modal it renders). Patient DOBs
// are stored as ISO dates (yyyy-mm-dd) everywhere in this app's own data
// model — this is a narrow, dedicated string transform for search-matching
// and grid-display purposes only, not a general display-formatting
// concern (no locale awareness needed; the placeholder text itself already
// commits to one specific, fixed format).
// ─────────────────────────────────────────────────────────────────────────────

/** Converts an ISO date (yyyy-mm-dd, optionally with a time component) to
 *  mm/dd/yyyy. Returns '' for anything that isn't a genuine yyyy-mm-dd
 *  string, so a malformed/missing DOB never accidentally matches an
 *  unrelated search query via a garbled partial string. */
export function isoDateToMDY(iso: string | undefined | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const [, yyyy, mm, dd] = m;
  return `${mm}/${dd}/${yyyy}`;
}

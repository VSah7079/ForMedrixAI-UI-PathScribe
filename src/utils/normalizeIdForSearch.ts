// src/utils/normalizeIdForSearch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "Scotland and Ireland have different
// formats for their NHS number, would we do the same approach there?"
//
// No — deliberately not the same mechanism as isoDateForSearch.ts. That fix
// addressed genuine AMBIGUITY: the same digits, two valid ways to read them,
// with no way to know which is correct without more context. A patient ID
// scheme isn't ambiguous the same way — NHS Number (England & Wales), CHI
// Number (Scotland), H&C Number (Northern Ireland), and PPS Number
// (Ireland) are structurally DIFFERENT schemes (see PATIENT_ID_BY_JURISDICTION
// in types/systemConfig.ts: NHS is 10 plain digits, CHI is 10 digits with an
// embedded birthdate, H&C is letters-then-digits, PPS is digits-then-letters).
// A given patient has exactly one real ID, under exactly one real scheme —
// there is nothing to "try both interpretations" of.
//
// What IS a real, comparable problem: formatting, not interpretation. NHS
// Number's own standard display convention groups digits with spaces
// ("999 999 9999") — and PATIENT_ID_BY_JURISDICTION's own validation
// pattern for it (`^\d{3}[\s-]?\d{3}[\s-]?\d{4}$`) already anticipates
// spaces OR dashes as valid separators. If a patient's real number is
// stored without spaces but an accessioner types it the way it's
// conventionally printed (or vice versa), a plain substring search misses
// a genuine match — not because of ambiguity, but because of superficial
// formatting noise on either side of the comparison.
//
// This is a safe normalization, unlike date reinterpretation: stripping
// spaces/dashes from an ID string can only ever remove false negatives
// (a real match that formatting hid), never introduce a false positive
// (it doesn't create new, coincidental matches with a different, unrelated
// real ID the way trying multiple date interpretations could).
// ─────────────────────────────────────────────────────────────────────────────

/** Strips whitespace and dashes for ID/MRN search comparison — not for
 *  display. Applies to whichever jurisdiction's ID scheme is actually in
 *  play without needing to know which one it is: every scheme this app
 *  currently models (NHS Number, CHI Number, H&C Number, PPS Number, US
 *  MRN, and the rest of PATIENT_ID_BY_JURISDICTION) is either unaffected
 *  by stripping spaces/dashes (schemes with no natural separator) or
 *  specifically uses them as an optional, cosmetic separator (NHS Number's
 *  own validation pattern treats \s and - as interchangeable, optional
 *  characters). */
export function normalizeIdForSearch(value: string | undefined | null): string {
  if (!value) return '';
  return value.replace(/[\s-]/g, '').toLowerCase();
}

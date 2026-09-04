// src/types/billing/PlaceOfServiceCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: run through the same validation/versioning
// process as this app's other real CMS-derived types. Mirrors
// BillingRuleVersion.ts's own real, established append-only pattern -
// "never edit history, only add a new record" - but deliberately NOT
// its site-scoping. Confirmed directly before designing this: Place
// of Service is a real, universal federal codeset (HIPAA-mandated,
// CMS-maintained) - "Office" means the same thing at every real
// PathScribe site. There is no real "site override" concept for POS
// the way there genuinely is for a negotiated billing rule/fee
// schedule, so (code, version) is the real unique key here, not
// (code, siteId, version).
//
// Real, deliberate status simplification vs. BillingRuleStatus's own
// five real states (DRAFT/PENDING_APPROVAL/ACTIVE/REJECTED/RETIRED):
// those exist because a billing rule is something THIS app's own
// admins author and must clear through real Four-Eyes approval before
// it governs a real charge. A POS code isn't authored by anyone here
// - CMS either currently recognizes it or it's been retired/is
// unassigned. Two real states, not five.
//
// Real, deliberate omission: no facility/non-facility rate-type field.
// Confirmed directly for exactly two codes during research (11=non-
// facility, 22=facility), not for the complete real set - fabricating
// that classification for the other 50 real codes would be exactly
// the kind of guessed regulatory data this app has deliberately
// avoided all session (see the CPT/AMA licensing posture,
// Config/System/ModifierDictionarySection.tsx). A real, separate,
// fully-verified pass, not built here.
//
// Real, complete source: https://www.cms.gov/medicare/coding-billing/
// place-of-service-codes/code-sets - fetched directly, not
// reconstructed from memory. Page confirmed "Database (updated May 2,
// 2024)," page itself last modified 02/17/2026 - see
// sourceLastVerified below for exactly when this seed was captured
// against that real source.
// ─────────────────────────────────────────────────────────────────────────────

export type PlaceOfServiceCodeStatus = 'ACTIVE' | 'RETIRED';

export interface PlaceOfServiceCode {
  /** The real, two-digit CMS code (e.g. "11"). Logical identifier -
   *  multiple real rows can share this value, one per real version,
   *  matching BillingRuleVersion's own (billingCode, version)
   *  convention. */
  code: string;
  /** 1-indexed, per code - NOT a global/table-wide counter. (code,
   *  version) together are the real unique key. */
  version: number;
  /** ISO date - when this specific version's name/description started
   *  applying. Real, per-code effective dates where CMS states one
   *  directly (e.g. "(Effective October 1, 2003)"); the real page's
   *  own May 2, 2024 database date where no code-specific date was
   *  given. */
  effectiveFrom: string;
  /** ISO date, or null while still the current/open-ended version. */
  effectiveTo: string | null;
  /** ACTIVE = a real, currently CMS-recognized code. RETIRED = kept
   *  for real audit/historical resolution, never offered as a live
   *  choice in the Facility editor. */
  status: PlaceOfServiceCodeStatus;
  /** Real, official CMS name (e.g. "Office"). */
  name: string;
  /** Real, official CMS description text, paraphrased only where the
   *  source itself is long - never fabricated. */
  description: string;
  /** Real, direct citation - required for every entry, not just
   *  table-level. Regulatory/compliance-relevant data should always
   *  be traceable to exactly where it came from. */
  sourceUrl: string;
  /** ISO date - when this specific entry was last checked directly
   *  against sourceUrl, not just when the seed happened to be
   *  written. */
  sourceLastVerified: string;
}

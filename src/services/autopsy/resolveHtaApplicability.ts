// src/services/autopsy/resolveHtaApplicability.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own §5 (referenced directly in
// types/autopsy/AutopsyCaseDetails.ts's own OrganRetentionTier doc
// comment) — Phase 2 of the 8-phase Autopsy Pathology Module build
// (PS-261, RFP-APLIS-2026-GLOBAL §3.1.C).
//
// Real, named acts only — never a guessed or inferred jurisdiction:
// - Human Tissue Act 2004 — England & Wales, and Northern Ireland
//   (a single UK-wide act covering both; Scotland has its own,
//   separate act below, never conflated with this one).
// - Human Tissue (Scotland) Act 2006 — Scotland only.
// - Coroners Act 2006 — New Zealand.
// No other real jurisdiction in this app's own Jurisdiction union
// (US, CA, IE, AU, KR, BE, NL, DE, FR) is named as HTA-governed by
// the uploaded spec — organ-retention tracking simply doesn't apply
// there under this module, not a gap to fill in later without a real,
// separately-confirmed legal basis for doing so.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

const HTA_GOVERNED_JURISDICTIONS = new Set<Jurisdiction>(['GB_EW', 'GB_NIR', 'GB_SCT', 'NZ']);

/** Real, per direct guidance's own confirmed scope. Returns whether
 *  organ-retention tier tracking (AutopsyCaseDetails.organRetentionTier)
 *  means anything at all for a real case in this jurisdiction — never
 *  a default of `false` standing in for "not sure," and never
 *  extended to a real jurisdiction the uploaded spec didn't actually
 *  name. */
export function resolveHtaApplicability(jurisdiction: Jurisdiction): boolean {
  return HTA_GOVERNED_JURISDICTIONS.has(jurisdiction);
}

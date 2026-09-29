// src/types/config/FacilityBranding.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-277 §1.2.2 (Master Template Engine — conditional
// branding & header overrides), and per direct architecture guidance:
// "Conditional branding will reuse the existing Facility/Department/
// Enterprise hierarchy from Case Mask Scoping. Branding properties
// (logos, CLIA numbers, Director details) will be inherited from the
// primary Facility context with fallback to Department and Enterprise
// defaults."
//
// Deliberately NOT a new, separate override-record type (unlike
// CaseMask.ts, which needed one because neither Department nor
// Facility had any native mask fields to read). Facility already
// carries cliaOrIsoNumber/directorName/headerLogoUrl as real, plain
// fields (this batch adds the latter two), and Department now carries
// the same three as a real fallback tier — so resolution here reads
// directly off those existing entities, same as
// resolveInterfaceEngineConnectionForFacility/resolveLisRoutingForFacility
// already do for their own fields, rather than introducing a second,
// parallel storage layer for the same three values.
//
// Real, deliberate resolution-order difference from
// resolveCaseMaskScopeCandidates.ts (department → facility →
// enterprise): per direct guidance above, branding is Facility-first —
// "inherited from the primary Facility context, with fallback to
// Department and Enterprise." A case-numbering prefix is naturally
// department-scoped (accessioning categories); a report's own letterhead
// is naturally tied to the physical performing facility first. Same
// real three scope points, same real single-hop Enterprise walk,
// different real ordering for a different real reason — see
// resolveFacilityPrintBranding.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type BrandingScopeType = 'facility' | 'department' | 'enterprise';

export interface BrandingScopeCandidate {
  scopeType: BrandingScopeType;
  scopeId: string;
}

/** The real, effective branding for one generated report. facilityName/
 *  address/city/state/zip always come directly from the resolved
 *  performing Facility itself (never inherited — showing a parent
 *  Enterprise's own name/address on an affiliate's report would be
 *  actively wrong, not a fallback). headerLogoUrl/directorName/
 *  cliaOrIsoNumber are each independently resolved — see
 *  resolveFacilityPrintBranding.ts's own header comment for why
 *  per-field (not whole-record) fallback is the real, deliberate
 *  choice here. */
export interface ResolvedPrintBranding {
  facilityName: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  cliaOrIsoNumber?: string;
  directorName?: string;
  headerLogoUrl?: string;
}

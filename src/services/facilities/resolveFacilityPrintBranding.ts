// src/services/facilities/resolveFacilityPrintBranding.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-277 §1.2.2 and per direct architecture guidance — see
// types/config/FacilityBranding.ts's own header comment for the full
// real reasoning (reuses Case Mask Scoping's own real
// Facility/Department/Enterprise hierarchy, Facility-first ordering,
// reads existing entity fields directly rather than a new override
// table).
//
// Two real, separate steps, same real split PS-277's own requirement
// text draws ("based on ordering facility, performing location"):
//   1. resolvePerformingLabFacilityId() (IFacilityService.ts, already
//      real/existing) — an ORDERING facility's own branding is never
//      shown; the entity that actually performed the diagnostic work
//      is who a CLIA number/Director attribution legally belongs to.
//   2. resolveFacilityPrintBranding() below — given that real
//      performing Facility, walks facility → department → enterprise
//      (resolveBrandingScopeCandidates) independently PER FIELD for
//      headerLogoUrl/directorName/cliaOrIsoNumber.
//
// Real, deliberate per-field (not whole-record) fallback: unlike
// CaseMask (where prefix/pattern/sequenceDigits must all come from one
// coherent record — mixing a department's prefix with a facility's own
// sequence counter would be incoherent), a facility's own real CLIA
// number and its parent Trust's own real shared logo are genuinely
// independent facts. A real, common case this per-field model exists
// for: an NHS Trust affiliate sets its own CLIA/ISO accreditation
// number (its own real certification) while still showing the Trust's
// own shared letterhead logo — neither value should force the other to
// also be locally overridden.
// ─────────────────────────────────────────────────────────────────────────────

import type { Facility } from './IFacilityService';
import { resolvePerformingLabFacilityId } from './IFacilityService';
import type { Department } from '../departments/IDepartmentService';
import type { BrandingScopeCandidate, ResolvedPrintBranding } from '@/types/config/FacilityBranding';

/**
 * Real, per direct architecture guidance's own explicit order:
 * "inherited from the primary Facility context, with fallback to
 * Department and Enterprise defaults." Facility → Department →
 * Enterprise — deliberately NOT resolveCaseMaskScopeCandidates.ts's own
 * department-first order (see FacilityBranding.ts's header comment for
 * why the two real orderings genuinely differ). Same real, single,
 * direct hop to the Enterprise ancestor as every other resolveX
 * function in this app (resolveInterfaceEngineConnectionForFacility,
 * resolveLisRoutingForFacility, resolveCaseMaskScopeCandidates) —
 * parentId can only ever point to an isEnterprise facility, so there's
 * never a deeper real chain to climb.
 */
export function resolveBrandingScopeCandidates(
  performingLabFacility: Facility,
  department: Department | undefined,
  allFacilities: Facility[],
): BrandingScopeCandidate[] {
  const candidates: BrandingScopeCandidate[] = [
    { scopeType: 'facility', scopeId: performingLabFacility.id },
  ];

  if (department) {
    candidates.push({ scopeType: 'department', scopeId: department.id });
  }

  const enterprise = performingLabFacility.isEnterprise
    ? performingLabFacility
    : performingLabFacility.parentId
      ? allFacilities.find(f => f.id === performingLabFacility.parentId)
      : undefined;

  // Same real, deliberate de-dup as resolveCaseMaskScopeCandidates.ts —
  // a performing lab that is itself the Enterprise shouldn't appear as
  // two, misleadingly-distinct candidates for the same real scopeId.
  if (enterprise && enterprise.id !== performingLabFacility.id) {
    candidates.push({ scopeType: 'enterprise', scopeId: enterprise.id });
  }

  return candidates;
}

function firstDefined<K extends 'headerLogoUrl' | 'directorName' | 'cliaOrIsoNumber'>(
  field: K,
  candidates: BrandingScopeCandidate[],
  performingLabFacility: Facility,
  department: Department | undefined,
  allFacilities: Facility[],
): string | undefined {
  for (const candidate of candidates) {
    if (candidate.scopeType === 'facility' && candidate.scopeId === performingLabFacility.id) {
      if (performingLabFacility[field]) return performingLabFacility[field];
    } else if (candidate.scopeType === 'department' && department && candidate.scopeId === department.id) {
      if (department[field]) return department[field];
    } else if (candidate.scopeType === 'enterprise') {
      const enterprise = allFacilities.find(f => f.id === candidate.scopeId);
      if (enterprise?.[field]) return enterprise[field];
    }
  }
  return undefined;
}

/**
 * Real, per PS-277 §1.2.2 — the full, real resolution: ordering-or-
 * performing facility in, real effective branding out (or undefined —
 * a real, honest "no performing lab resolvable" state, never a guess).
 *
 * componentSplitBillingType, per direct architecture guidance #2: "PS-
 * 277 will consume the existing component-split status flag from the
 * case context solely to toggle header/branding layout elements (e.g.
 * rendering TC facility header vs. PC lab header)." Real, existing flag
 * — ServiceChargeRecord.billingType ('TC' | '26' | 'Global'),
 * types/billing/ServiceChargeRecord.ts. Real, deliberate, minimal
 * interpretation, documented here rather than assumed silently: a pure
 * 'TC' report is attesting to the TECHNICAL component only — no
 * pathologist has signed a diagnostic interpretation under this
 * facility's own CLIA/Director attribution for this specific billing
 * record — so directorName/cliaOrIsoNumber are deliberately withheld
 * for 'TC' (facilityName/address still show, since the specimen was
 * genuinely processed there). '26' (professional-only) and 'Global'
 * both show the full, real interpretive branding block — the real,
 * disclosed simplification is that this does not yet resolve a
 * SECOND, separate "which facility did the technical work" branding
 * block for a genuinely split '26' case (that would need a distinct
 * technical-component facility reference this app's real case data
 * doesn't carry yet) — see services/documentRendering/README.md.
 */
export function resolveFacilityPrintBranding(
  orderingOrPerformingFacility: Facility,
  allFacilities: Facility[],
  department?: Department,
  componentSplitBillingType?: 'TC' | '26' | 'Global',
): ResolvedPrintBranding | undefined {
  const performingLabId = resolvePerformingLabFacilityId(orderingOrPerformingFacility);
  if (!performingLabId) return undefined;

  const performingLabFacility = allFacilities.find(f => f.id === performingLabId);
  if (!performingLabFacility) return undefined;

  const candidates = resolveBrandingScopeCandidates(performingLabFacility, department, allFacilities);
  const isTechnicalComponentOnly = componentSplitBillingType === 'TC';

  return {
    facilityName: performingLabFacility.name,
    address: performingLabFacility.address,
    city: performingLabFacility.city,
    state: performingLabFacility.state,
    zip: performingLabFacility.zip,
    headerLogoUrl: firstDefined('headerLogoUrl', candidates, performingLabFacility, department, allFacilities),
    directorName: isTechnicalComponentOnly
      ? undefined
      : firstDefined('directorName', candidates, performingLabFacility, department, allFacilities),
    cliaOrIsoNumber: isTechnicalComponentOnly
      ? undefined
      : firstDefined('cliaOrIsoNumber', candidates, performingLabFacility, department, allFacilities),
  };
}

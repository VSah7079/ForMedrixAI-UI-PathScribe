// src/services/auth/resolveTenantFacility.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 of the Organisation/Site -> Facility migration, per direct
// guidance's own phasing ("fix auth/tenant-isolation first... then
// the Case.originHospitalId/originSiteId migration last").
//
// Case.originHospitalId (e.g. 'HOSP-MFT') and StaffUser.organisationId
// (e.g. 'ORG-MFT') are two different legacy string values for the same
// real tenant, and both are deliberately left untouched until Phase 3.
// This resolves either one to the real, admin-editable Facility
// (isEnterprise: true) that's now authoritative, via
// Facility.legacyTenantIds — replacing organisationService.ts's own
// hardcoded, incomplete 4-entry legacyMap (confirmed directly: real,
// live seeded cases with originHospitalId 'HOSP-002'/'HOSP-003' were
// NOT in that map at all, making them invisible to any non-superadmin
// session — this resolver has no such gap, since legacyTenantIds is
// real, admin-settable seed data covering every real value in use, not
// a fixed, hand-maintained switch).
//
// Pure, data-only — takes the already-fetched Enterprise facility list
// rather than fetching internally, same reasoning as every other
// resolveX function in this app (resolveInterfaceEngineConnectionForFacility,
// resolveCaseMaskScopeCandidates, etc.). The caller (CaseRouter.ts) is
// responsible for fetching/caching that list once, same pattern this
// file already uses for getSubspecialtyLookup().
// ─────────────────────────────────────────────────────────────────────────────

import type { Facility } from '../facilities/IFacilityService';

export function resolveTenantFacility(
  legacyId: string | null | undefined,
  enterpriseFacilities: Facility[],
): Facility | undefined {
  if (!legacyId) return undefined;
  return enterpriseFacilities.find(f => f.isEnterprise && f.legacyTenantIds?.includes(legacyId));
}

/**
 * The reverse direction, for institutionService.ts's own real,
 * Firestore-backed getInstitutionId() (firestoreBiometricService.ts's
 * biometric security policy path — a real, non-mock consumer, not
 * just demo data). Given a resolved Enterprise Facility, returns its
 * legacy 'HOSP-*'-style id — the same real, existing document-path
 * shape that consumer still expects until Phase 3 replaces it with a
 * real Facility.id path directly. Simple prefix match rather than a
 * dedicated field, deliberately: legacyTenantIds itself is already a
 * temporary Phase 1 bridge (see its own doc comment on Facility) —
 * not worth a second, more structured field for something scheduled
 * to be deleted once Phase 3 lands.
 */
export function getLegacyHospitalIdForTenant(facility: Facility | undefined): string | undefined {
  return facility?.legacyTenantIds?.find(id => id.startsWith('HOSP-'));
}

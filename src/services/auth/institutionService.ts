// src/services/auth/institutionService.ts
// Returns the institution (Organisation) ID for the current session.
//
// Fixed June 2026 — this previously read a separate localStorage key,
// 'ps_institution_id', that was NEVER SET anywhere in the entire
// codebase (only ever read, here), always silently falling back to the
// hardcoded 'HOSP-001' default. Since this function backs a real
// (non-mock) Firestore path — firestoreBiometricService.ts's biometric
// security policy — every institution's policy was reading/writing the
// same 'HOSP-001' Firestore document regardless of which institution the
// logged-in user actually belonged to. Found while building
// caseAccessControl.ts in this same folder, which had independently
// built its own separate session-resolution logic without knowing this
// file (and its TODO — "derive from authenticated user's JWT claims when
// multi-tenancy is live") already existed. Now delegates to the same
// session resolution caseAccessControl.ts uses, so there's one source of
// truth for "what tenant is this session in," not two.
//
// Updated again — Phase 1 of the Organisation/Site -> Facility
// migration (see caseAccessControl.ts's own updated header): shares
// this file's original bug class, now fixed the same way —
// organisationService.ts's own getHospitalIdForOrganisation() used the
// same hardcoded, incomplete 4-entry legacyMap
// getOrganisationByHospitalId() did (confirmed directly: real, live
// seeded cases with originHospitalId 'HOSP-002'/'HOSP-003' were never
// in it), silently defaulting an unmapped organisation's biometric
// policy document to 'HOSP-001' — a real, different institution's
// document, not this session's own. Resolves through the same real,
// admin-editable Facility.legacyTenantIds bridge caseAccessControl.ts
// now uses instead.
//
// TODO (unchanged): once real auth exists, resolve this from the
// authenticated JWT's claims server-side, not from a client-readable
// localStorage session object — same production caveat documented in
// caseAccessControl.ts.

import { getSessionUser } from './caseAccessControl';
import { resolveTenantFacility, getLegacyHospitalIdForTenant } from './resolveTenantFacility';
import { mockFacilityService } from '../facilities/mockFacilityService';

export async function getInstitutionId(): Promise<string> {
  const session = getSessionUser();
  if (!session?.organisationId) return 'HOSP-001';

  const facilitiesRes = await mockFacilityService.getAll();
  const enterpriseFacilities = facilitiesRes.ok ? facilitiesRes.data.filter(f => f.isEnterprise) : [];
  const tenant = resolveTenantFacility(session.organisationId, enterpriseFacilities);
  return getLegacyHospitalIdForTenant(tenant) ?? 'HOSP-001';
}
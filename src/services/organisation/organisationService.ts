// src/services/organisation/organisationService.ts
// ─────────────────────────────────────────────────────────────
// Organisation, Site, and Lab service.
//
// MOCK PHASE (current):
//   Returns realistic mock data. Components wire against these
//   interfaces — no changes needed when backend is ready.
//
// REAL PHASE (when backend is ready):
//   Replace each function body with the corresponding fetch() call.
//   See API_CONTRACT.md Section 10 for full endpoint documentation.
//
// Real, per direct guidance: Site is now genuinely read-only end to
// end - no write path exists anywhere in this file. Used to carry a
// real, persisted overlay (Facility Setup's own LIS connection/CLIA
// fields), which created a real, disclosed sync-vs-async data
// consistency gap between the four async functions below (which
// merged that overlay in) and the several synchronous helpers
// further down (which didn't). Both the LIS connection fields and
// CLIA were migrated off Site entirely this session - CLIA to
// Facility.cliaOrIsoNumber (services/facilities/), and the LIS
// connection consolidated into Facility.interfaceEngineConnection/
// lisRouting per a real architectural correction: PathScribe
// maintains one physical connection to the Interface Engine per real
// Enterprise, never a direct per-Site connection to an individual
// LIS. With no write path left, the sync/async split below is purely
// about matching a future real backend's likely API shape, not a
// data-consistency concern.
// ─────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────

export type OrganisationType =
  | 'nhs_trust'
  | 'nhs_foundation_trust'
  | 'nhs_integrated_care_board'
  | 'private_hospital'
  | 'health_system'
  | 'independent_lab';

export type LisType =
  | 'WinPath' | 'Telepath' | 'Epic' | 'CoPath' | 'Beaker' | 'Other';

export type WorkflowMode = 'assist' | 'orchestration';

export type TemplateStandard = 'CAP' | 'RCPath';
export type CodingSystem = 'SNOMED' | 'ICD10' | 'ICD11' | 'LOINC' | 'ICDO' | 'CPT' | 'OPCS4';

export interface Organisation {
  id:            string;
  name:          string;
  shortName:     string;
  type:          OrganisationType;
  /** Real link to the enterprise this organisation belongs to — matches
   *  EnterpriseConfig.id (contexts/SystemConfigContext.tsx). Added to
   *  close a real gap: Case.originEnterpriseId was previously hardcoded
   *  to a literal string at accession time ('ENT-ACME') rather than
   *  resolved from anything, and that literal didn't even match
   *  EnterpriseConfig's own default id ('ENT-DEFAULT') — two separate,
   *  disagreeing hardcoded values for what was supposed to be the same
   *  single demo enterprise. This field is the real, resolvable source
   *  AccessionPage.tsx now reads from instead of hardcoding either one.
   */
  enterpriseId:  string;
  /** Real, per direct guidance's own cross-jurisdiction pre-analytic
   *  compliance research (resolvePreAnalyticDateGateConfig.ts) - widened
   *  from the original 'UK' | 'US' | 'AU' | 'CA' to cover every real
   *  market PathScribe targets. 'EU' is a deliberate, single generic
   *  bucket per direct guidance's own table (one combined "European
   *  Union" row spanning COFRAC/DAkkS/ENAC, not per-member-state) -
   *  narrower to a specific EU country only if a real, later need for
   *  that granularity is confirmed. */
  country:       'UK' | 'US' | 'AU' | 'CA' | 'EU' | 'NZ' | 'KR';
  locale:        string;
  timezone:      string;
  contractStart: string;
  contractTier:  'starter' | 'professional' | 'enterprise';
  active:        boolean;
  sites?:        Site[];
  labs?:         Lab[];
}

export interface Site {
  id:                      string;
  organisationId:          string;
  name:                    string;
  shortName:               string;
  siteCode:                string;   // accession prefix from LIS
  address:                 string;
  active:                  boolean;
  defaultTemplateStandard: TemplateStandard;
  defaultLocale:           string;
  defaultWorkflowMode:     WorkflowMode;
  codingSystems:           CodingSystem[];   // ordered list — first is default tab
  secureEmailGateway?:     'Paubox' | 'Virtru' | 'Zix';
  /** Real, per direct guidance's own detailed jurisdictional research
   *  (resolveBillingDateOfService.ts) - a real, explicit override for
   *  which real date this site's own charges use as billing date of
   *  service. Undefined means the real country-based default applies
   *  (see that file's own defaultRuleForCountry) - only set here when
   *  a site's own real billing arrangement genuinely differs from its
   *  country's typical default (e.g. a UK site serving meaningful
   *  private-insurance volume, which should override away from the
   *  NHS-costing SIGNOUT_DATE default to COLLECTION_DATE). */
  billingDosRule?: 'COLLECTION_DATE' | 'SIGNOUT_DATE' | 'ACCESSION_DATE';
}

export interface Lab {
  id:             string;
  siteId:         string;
  organisationId: string;
  name:           string;
  subspecialties: string[];
  pathologistIds: string[];
  poolIds:        string[];
}

// ─── Mock Data ────────────────────────────────────────────────

const MOCK_ORGANISATIONS: Organisation[] = [
  {
    id: 'ORG-DVMC',
    name: 'Desert Valley Medical Center',
    shortName: 'DVMC',
    type: 'health_system',
    enterpriseId: 'ENT-DEFAULT',
    country: 'US',
    locale: 'en-US',
    timezone: 'America/Phoenix',
    contractStart: '2025-01-01',
    contractTier: 'professional',
    active: true,
    sites: [
      {
        id: 'SITE-DVMC-MAIN',
        organisationId: 'ORG-DVMC',
        name: 'Desert Valley Medical Center — Main Campus',
        shortName: 'DVMC',
        siteCode: 'S',
        address: '1234 Desert Blvd, Phoenix, AZ 85001',
        active: true,
        defaultTemplateStandard: 'CAP',
        defaultLocale: 'en-US',
        defaultWorkflowMode: 'assist',
        codingSystems: ['SNOMED', 'ICD10', 'ICDO', 'LOINC', 'CPT'],
        secureEmailGateway: 'Paubox',
      },
    ],
    labs: [
      {
        id: 'LAB-DVMC-PATH',
        siteId: 'SITE-DVMC-MAIN',
        organisationId: 'ORG-DVMC',
        name: 'Anatomic Pathology',
        subspecialties: ['Breast', 'GI', 'GU', 'Lung', 'Derm', 'Neuro'],
        pathologistIds: ['PATH-001', 'PATH-002', 'PATH-003', 'PATH-004', 'PATH-005'],
        poolIds: ['POOL-GI', 'POOL-DERM'],
      },
    ],
  },
  {
    id: 'ORG-MFT',
    name: 'Manchester University NHS Foundation Trust',
    shortName: 'MFT',
    type: 'nhs_foundation_trust',
    enterpriseId: 'ENT-DEFAULT',
    country: 'UK',
    locale: 'en-GB',
    timezone: 'Europe/London',
    contractStart: '2026-01-01',
    contractTier: 'enterprise',
    active: true,
    sites: [
      {
        id: 'SITE-MRI',
        organisationId: 'ORG-MFT',
        name: 'Manchester Royal Infirmary',
        shortName: 'MRI',
        siteCode: 'MFT',
        address: 'Oxford Road, Manchester, M13 9WL',
        active: true,
        defaultTemplateStandard: 'RCPath',
        defaultLocale: 'en-GB',
        defaultWorkflowMode: 'assist',
        codingSystems: ['SNOMED', 'ICD10', 'ICDO', 'OPCS4', 'LOINC'],
      },
      {
        id: 'SITE-WYTH',
        organisationId: 'ORG-MFT',
        name: 'Wythenshawe Hospital',
        shortName: 'WYT',
        siteCode: 'MFT',
        address: 'Southmoor Road, Manchester, M23 9LT',
        active: true,
        defaultTemplateStandard: 'RCPath',
        defaultLocale: 'en-GB',
        defaultWorkflowMode: 'assist',
        codingSystems: ['SNOMED', 'ICD10', 'ICDO', 'OPCS4', 'LOINC'],
      },
      {
        id: 'SITE-NMGH',
        organisationId: 'ORG-MFT',
        name: 'North Manchester General Hospital',
        shortName: 'NMGH',
        siteCode: 'MFT',
        address: 'Delaunays Road, Manchester, M8 5RB',
        active: true,
        defaultTemplateStandard: 'RCPath',
        defaultLocale: 'en-GB',
        defaultWorkflowMode: 'assist',
        codingSystems: ['SNOMED', 'ICD10', 'ICDO', 'OPCS4', 'LOINC'],
      },
    ],
    labs: [
      {
        id: 'LAB-MFT-CELL',
        siteId: 'SITE-MRI',
        organisationId: 'ORG-MFT',
        name: 'Cellular Pathology',
        subspecialties: ['GI', 'Breast', 'GU', 'Uropathology', 'Gynaecology', 'Skin', 'Head & Neck'],
        pathologistIds: ['PATH-UK-001', 'PATH-UK-002'],
        poolIds: ['POOL-GI-UK', 'POOL-URO-UK'],
      },
    ],
  },
  {
    id: 'ORG-MPA',
    name: 'Midwest Pathology Associates',
    shortName: 'MPA',
    type: 'independent_lab',
    enterpriseId: 'ENT-DEFAULT',
    country: 'US',
    locale: 'en-US',
    timezone: 'America/Chicago',
    contractStart: '2026-04-01',
    contractTier: 'professional',
    active: true,
    sites: [
      {
        id: 'SITE-MPA-MAIN',
        organisationId: 'ORG-MPA',
        name: 'Midwest Pathology Associates — Chicago',
        shortName: 'MPA',
        siteCode: 'MPA',
        address: '200 E Illinois St, Chicago, IL 60611',
        active: true,
        defaultTemplateStandard: 'CAP',
        defaultLocale: 'en-US',
        defaultWorkflowMode: 'assist',
        codingSystems: ['SNOMED', 'ICD10', 'ICDO', 'LOINC', 'CPT'],
        secureEmailGateway: 'Paubox',
      },
    ],
    labs: [
      {
        id: 'LAB-MPA-PATH',
        siteId: 'SITE-MPA-MAIN',
        organisationId: 'ORG-MPA',
        name: 'Surgical Pathology',
        subspecialties: ['Breast', 'GI', 'GU', 'Gynecologic', 'Lung'],
        pathologistIds: ['PATH-US-001'],
        poolIds: ['POOL-GYN-MPA'],
      },
    ],
  },
  {
    id: 'ORG-HFHS',
    name: 'Henry Ford Health System',
    shortName: 'HFHS',
    type: 'health_system',
    enterpriseId: 'ENT-DEFAULT',
    country: 'US',
    locale: 'en-US',
    timezone: 'America/Detroit',
    contractStart: '2026-04-01',
    contractTier: 'enterprise',
    active: true,
    sites: [
      {
        id: 'SITE-HFHS-MAIN',
        organisationId: 'ORG-HFHS',
        name: 'Henry Ford Hospital — Main Campus',
        shortName: 'HFH',
        siteCode: 'HFHS',
        address: '2799 W Grand Blvd, Detroit, MI 48202',
        active: true,
        defaultTemplateStandard: 'CAP',
        defaultLocale: 'en-US',
        defaultWorkflowMode: 'assist',
        codingSystems: ['SNOMED', 'ICD10', 'ICDO', 'LOINC', 'CPT'],
        secureEmailGateway: 'Paubox',
      },
    ],
    labs: [
      {
        id: 'LAB-HFHS-PATH',
        siteId: 'SITE-HFHS-MAIN',
        organisationId: 'ORG-HFHS',
        name: 'Department of Pathology',
        subspecialties: ['Breast', 'GI', 'GU', 'Lung', 'Gynecologic', 'Neuropathology', 'Hematopathology'],
        pathologistIds: ['PATH-US-001', 'PATH-US-002'],
        poolIds: ['POOL-GYN-US'],
      },
    ],
  },
];

// ─── In-memory lookup ─────────────────────────────────────────

const ORG_BY_ID   = new Map(MOCK_ORGANISATIONS.map(o => [o.id, o]));
const SITE_BY_CODE = new Map(
  MOCK_ORGANISATIONS.flatMap(o => o.sites ?? []).map(s => [s.siteCode, s])
);

// ─── Service functions ────────────────────────────────────────

const delay = (ms = 200) => new Promise(res => setTimeout(res, ms));

/** GET /organisations */
export async function listOrganisations(): Promise<Organisation[]> {
  await delay();
  return MOCK_ORGANISATIONS;
  // REAL: const res = await fetch('/api/organisations'); return res.json();
}

/** GET /sites — real, new: flattens every real Site across every real
 *  Organisation. Added for Charge Capture's own real site-scoping
 *  picker (components/Config/System/BillingDictionarySection.tsx) -
 *  no flat, cross-organisation site listing existed before this;
 *  getSiteConfig only fetches one known site by id. Real, defensive
 *  fix: org.sites is optional, ?? [] rather than assuming every real
 *  organisation always has one. */
export async function listAllSites(): Promise<Site[]> {
  await delay();
  return MOCK_ORGANISATIONS.flatMap(org => org.sites ?? []);
  // REAL: const res = await fetch('/api/sites'); return res.json();
}

/** GET /organisations/:id */
export async function getOrganisation(id: string): Promise<Organisation | null> {
  await delay();
  return ORG_BY_ID.get(id) ?? null;
  // REAL: const res = await fetch(`/api/organisations/${id}`); return res.json();
}

/** GET /organisations/current — resolves from auth token */
export async function getCurrentOrganisation(organisationId: string): Promise<Organisation | null> {
  await delay();
  return ORG_BY_ID.get(organisationId) ?? null;
  // REAL: const res = await fetch('/api/organisations/current'); return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the sync-vs-async data-consistency gap
// this block used to document (PS-79) no longer exists. It was
// specific to Facility Setup's own real, persisted overlay — the 6
// synchronous functions below never merged it in, while the 4 async
// functions above did. That overlay (and the LIS/CLIA fields it
// covered) is retired entirely this session — Site has no write path
// left at all, so every function in this file, sync or async, now
// reads the identical static seed data. The sync/async split remains
// purely to match a likely future real backend's API shape.
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve site from accession prefix (siteCode) */
export function getSiteBySiteCode(siteCode: string): Site | null {
  return SITE_BY_CODE.get(siteCode) ?? null;
}

/** Resolve organisation from originHospitalId on a Case */
export function getOrganisationByHospitalId(hospitalId: string): Organisation | null {
  // Legacy field mapping — hospitalId maps to organisationId in new model
  const legacyMap: Record<string, string> = {
    'HOSP-001':  'ORG-DVMC',
    'HOSP-MFT':  'ORG-MFT',
    'HOSP-MPA':  'ORG-MPA',
    'HOSP-HFHS': 'ORG-HFHS',
  };
  const orgId = legacyMap[hospitalId];
  return orgId ? (ORG_BY_ID.get(orgId) ?? null) : null;
}

/**
 * Reverse of getOrganisationByHospitalId — given a session's
 * organisationId, returns the legacy hospital ID a new Case should carry
 * as originHospitalId. Added June 2026 for the Accession page: Origin
 * Hospital should be derived from the accessioning user's own
 * organisation, not a free-pick dropdown across every organisation in the
 * system — a mis-click there would put a case under the wrong tenant
 * entirely, which is exactly the boundary caseAccessControl.ts exists to
 * protect. Single-sourced here rather than duplicating the legacy map in
 * AccessionPage.tsx.
 */
export function getHospitalIdForOrganisation(organisationId: string): string | null {
  const legacyReverseMap: Record<string, string> = {
    'ORG-DVMC': 'HOSP-001',
    'ORG-MFT':  'HOSP-MFT',
    'ORG-MPA':  'HOSP-MPA',
    'ORG-HFHS': 'HOSP-HFHS',
  };
  return legacyReverseMap[organisationId] ?? null;
}

/** Fallback site for an organisation when no explicit originSiteId was
 *  captured at accessioning — used by ModeAInterfaceService's context
 *  resolution. Deliberately just the first entry in the organisation's
 *  real sites[] array, not a dedicated "primary site" field — no such
 *  field exists on Organisation today, and this codebase already has one
 *  documented lesson (Site.siteCode being shared across MFT's three
 *  sites) about not inventing a designation that isn't actually modeled.
 *  If a genuine "which site is primary" concept is needed later, it
 *  should be a real field with an admin UI to set it, not inferred from
 *  array order. */
export function getDefaultSiteId(organisationId: string): string | null {
  const org = MOCK_ORGANISATIONS.find(o => o.id === organisationId);
  return org?.sites?.[0]?.id ?? null;
}

/** Get display name for a hospital ID (used in UI until full migration) */
export function getOrganisationDisplayName(hospitalId?: string | null): string | null {
  if (!hospitalId) return null;
  const org = getOrganisationByHospitalId(hospitalId);
  return org?.name ?? null;
}

/** Get short name for a hospital ID */
export function getOrganisationShortName(hospitalId?: string | null): string | null {
  if (!hospitalId) return null;
  const org = getOrganisationByHospitalId(hospitalId);
  return org?.shortName ?? null;
}

/** Real, critical fix, extracted for testability: the real, stable
 *  scope for MPI (patient-matching) purposes is this LAB's own
 *  enterprise, not whichever hospital/clinic happens to have referred
 *  a given case. A real bug had this scoped to the referring
 *  organisation's own id instead — the same real patient referred by
 *  two different hospitals to the same lab would incorrectly get two
 *  separate MPI identities, directly undermining the reason
 *  IPatientIndexService.ts exists (reliably surfacing a patient's full
 *  case history). Falls back to the same 'ENT-DEFAULT' literal
 *  EnterpriseConfig itself uses when nothing resolves, matching
 *  Case.originEnterpriseId's own established fallback rather than a
 *  second, different one. */
export function resolveMpiScopeEnterpriseId(originOrganisation: { enterpriseId: string } | null | undefined): string {
  return originOrganisation?.enterpriseId ?? 'ENT-DEFAULT';
}

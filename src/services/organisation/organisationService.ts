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
// Real, deliberate, disclosed limitation added alongside Facility
// Setup (components/Config/System/FacilitySetupSection.tsx): every
// function in this file except listOrganisations/getOrganisation/
// listAllSites/getSiteConfig/updateSiteFacilitySetup is SYNCHRONOUS
// and reads directly from the static MOCK_ORGANISATIONS seed array,
// via ORG_BY_ID - confirmed directly before touching this file that
// getOrganisationByHospitalId alone has 11 real, live call sites
// elsewhere in this app. Converting every one of those to async to
// give them a consistent view of live-edited Site data would be a
// real, large, cross-cutting refactor with meaningful blast radius,
// not something to take on as a side effect of adding one new admin
// screen. So: a real edit made through FacilitySetupSection.tsx is
// genuinely persisted (via mockStorage below) and IS reflected in the
// four async functions above - but the synchronous helpers
// (getSiteBySiteCode, getOrganisationByHospitalId,
// getHospitalIdForOrganisation, getDefaultSiteId,
// getOrganisationDisplayName, getOrganisationShortName) keep reading
// the original, static seed values only. This mock-layer inconsistency
// resolves itself automatically once this file's REAL PHASE cutover
// happens (a real backend has one single source of truth, not a
// seed-array-plus-overlay split) - it's specific to this interim mock
// implementation, not a permanent architectural gap.
// ─────────────────────────────────────────────────────────────
import { storageGet, storageSet } from '../mockStorage';

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
  country:       'UK' | 'US' | 'AU' | 'CA';
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
  lisType:                 LisType;
  lisEndpoint:             string;
  lisVersion?:             string;
  defaultTemplateStandard: TemplateStandard;
  defaultLocale:           string;
  defaultWorkflowMode:     WorkflowMode;
  codingSystems:           CodingSystem[];   // ordered list — first is default tab
  secureEmailGateway?:     'Paubox' | 'Virtru' | 'Zix';
  /** Real, new field for Facility Setup (components/Config/System/
   *  FacilitySetupSection.tsx). Free text, not a validated format - a
   *  real CLIA number (US) and a real ISO/UKAS accreditation number
   *  (UK/other) have genuinely different real formats, and this app
   *  doesn't have a verified format spec for either to validate
   *  against, so this deliberately doesn't pretend to. */
  cliaOrIsoNumber?: string;
  /** Real, per direct follow-up (Billing Capacity Review's own POS
   *  codes gap): a real, raw fact about this specific performing lab
   *  - independent lab vs. hospital-based - not a computed CMS Place
   *  of Service code. Same deliberate "surface the raw signal, never
   *  adjudicate the billing decision" posture already established for
   *  financialClass/encounterClass in jsonWebhookBuilder.ts - which
   *  specific POS code (11, 22, etc.) actually applies depends on
   *  payer-specific rules PathScribe has no reliable way to resolve
   *  itself; the interface engine/RCM makes that call from this raw
   *  fact, the same way it already does from financialClass. */
  performingLabType?: 'independent' | 'hospital_based';
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
  /** Real, new field for Facility Setup - what kind of credential this
   *  site's own LIS connection (lisEndpoint above) uses. Deliberately
   *  NOT a place to store the real secret value itself - see
   *  credentialConfigured below for why. */
  connectionAuthType?: 'none' | 'basic' | 'oauth2' | 'api_key';
  /** Real, new field for Facility Setup, per direct security
   *  discipline already established elsewhere in this app (a real,
   *  hardcoded API key was found and revoked earlier in this project's
   *  own history; several VITE_*_PASS variables were found disconnected
   *  from real authentication). A plain boolean, not the credential
   *  itself - this admin screen can show/toggle WHETHER a real
   *  credential has been provisioned for this connection (presumably
   *  via a real secrets manager this app doesn't model), never the
   *  actual secret value. Never persisted alongside a real password/
   *  key/token field - deliberately, this type has none. */
  credentialConfigured?: boolean;
  /** Real edit audit, added alongside the fields above - who last
   *  changed this site's own Facility Setup fields, and when.
   *  Undefined for a site that has never been edited through the new
   *  admin screen (still running on its original seed values). */
  facilitySetupUpdatedBy?: string;
  facilitySetupUpdatedAt?: string;
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
        lisType: 'CoPath',
        lisEndpoint: 'hl7://lis.dvmc.org:2575',
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
        lisType: 'WinPath',
        lisEndpoint: 'hl7://lis.mft.nhs.uk:2575',
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
        lisType: 'WinPath',
        lisEndpoint: 'hl7://lis.mft.nhs.uk:2575',
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
        lisType: 'WinPath',
        lisEndpoint: 'hl7://lis.mft.nhs.uk:2575',
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
        lisType: 'CoPath',
        lisEndpoint: 'hl7://lis.midwestpath.com:2575',
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
        lisType: 'CoPath',
        lisEndpoint: 'hl7://lis.henryford.org:2575',
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
const SITE_BY_ID  = new Map(
  MOCK_ORGANISATIONS.flatMap(o => o.sites ?? []).map(s => [s.id, s])
);
const SITE_BY_CODE = new Map(
  MOCK_ORGANISATIONS.flatMap(o => o.sites ?? []).map(s => [s.siteCode, s])
);

// ─── Service functions ────────────────────────────────────────

const delay = (ms = 200) => new Promise(res => setTimeout(res, ms));

// ─── Facility Setup — real, persisted overlay ──────────────────────────────
// Real, new, additive storage layer for Facility Setup's own editable
// fields (cliaOrIsoNumber/connectionAuthType/credentialConfigured) -
// deliberately kept separate from MOCK_ORGANISATIONS's own static seed
// array rather than mutating it in place, same "never edit the seed,
// persist a real overlay/record instead" convention used throughout
// this app (e.g. mockBillingRuleService.ts's own append-only versions).
// Merged onto the real Site record by every async function below, so a
// real edit through FacilitySetupSection.tsx is genuinely visible
// wherever a Site is read through this file's own async API - see this
// file's own header for the one, disclosed exception (the synchronous
// helpers, which don't merge this in).
const FACILITY_SETUP_STORAGE_KEY = 'org_site_facility_setup_v1';

interface SiteFacilitySetupOverlay {
  cliaOrIsoNumber?: string;
  performingLabType?: Site['performingLabType'];
  connectionAuthType?: Site['connectionAuthType'];
  credentialConfigured?: boolean;
  /** Real, per direct guidance's own explicit "endpoints" scope for
   *  Facility Setup - these three fields already existed on Site, but
   *  had no real edit path anywhere before this overlay. */
  lisType?: LisType;
  lisEndpoint?: string;
  lisVersion?: string;
  facilitySetupUpdatedBy?: string;
  facilitySetupUpdatedAt?: string;
}

function loadFacilitySetupOverlays(): Record<string, SiteFacilitySetupOverlay> {
  return storageGet<Record<string, SiteFacilitySetupOverlay>>(FACILITY_SETUP_STORAGE_KEY, {});
}
function persistFacilitySetupOverlays(overlays: Record<string, SiteFacilitySetupOverlay>): void {
  storageSet(FACILITY_SETUP_STORAGE_KEY, overlays);
}
function applyFacilitySetupOverlay(site: Site, overlays: Record<string, SiteFacilitySetupOverlay>): Site {
  const overlay = overlays[site.id];
  return overlay ? { ...site, ...overlay } : site;
}
function applyOverlayToOrganisation(org: Organisation, overlays: Record<string, SiteFacilitySetupOverlay>): Organisation {
  // Real, defensive: sites is optional on Organisation - every real
  // seed organisation happens to have one today, but this shouldn't
  // throw for a hypothetical one that doesn't.
  if (!org.sites) return org;
  return { ...org, sites: org.sites.map(s => applyFacilitySetupOverlay(s, overlays)) };
}

/** GET /organisations */
export async function listOrganisations(): Promise<Organisation[]> {
  await delay();
  const overlays = loadFacilitySetupOverlays();
  return MOCK_ORGANISATIONS.map(org => applyOverlayToOrganisation(org, overlays));
  // REAL: const res = await fetch('/api/organisations'); return res.json();
}

/** GET /sites — real, new: flattens every real Site across every real
 *  Organisation. Added for Charge Capture's own real site-scoping
 *  picker (components/Config/System/BillingDictionarySection.tsx) -
 *  no flat, cross-organisation site listing existed before this;
 *  getSiteConfig only fetches one known site by id. Real, defensive
 *  fix alongside Facility Setup: org.sites is optional, ?? [] rather
 *  than assuming every real organisation always has one. */
export async function listAllSites(): Promise<Site[]> {
  await delay();
  const overlays = loadFacilitySetupOverlays();
  return MOCK_ORGANISATIONS.flatMap(org => org.sites ?? []).map(site => applyFacilitySetupOverlay(site, overlays));
  // REAL: const res = await fetch('/api/sites'); return res.json();
}

/** GET /organisations/:id */
export async function getOrganisation(id: string): Promise<Organisation | null> {
  await delay();
  const org = ORG_BY_ID.get(id);
  if (!org) return null;
  const overlays = loadFacilitySetupOverlays();
  return applyOverlayToOrganisation(org, overlays);
  // REAL: const res = await fetch(`/api/organisations/${id}`); return res.json();
}

/** GET /organisations/current — resolves from auth token */
export async function getCurrentOrganisation(organisationId: string): Promise<Organisation | null> {
  await delay();
  return ORG_BY_ID.get(organisationId) ?? null;
  // REAL: const res = await fetch('/api/organisations/current'); return res.json();
}

/** GET /sites/:id/config */
export async function getSiteConfig(siteId: string): Promise<Site | null> {
  await delay();
  const site = SITE_BY_ID.get(siteId);
  if (!site) return null;
  const overlays = loadFacilitySetupOverlays();
  return applyFacilitySetupOverlay(site, overlays);
  // REAL: const res = await fetch(`/api/sites/${siteId}/config`); return res.json();
}

/** PATCH /sites/:id/facility-setup — real, new: the only way to
 *  persist a real edit to a site's Facility Setup fields. Never edits
 *  MOCK_ORGANISATIONS's own static seed in place - see this file's own
 *  header, and FACILITY_SETUP_STORAGE_KEY's own comment above, for why.
 *  Returns null (matching this file's own null-for-not-found
 *  convention throughout, not a thrown error) when siteId isn't a
 *  real, known site - never silently creates an overlay for a site
 *  that doesn't exist. Deliberately no raw secret/credential VALUE
 *  parameter - credentialConfigured is a real boolean flag only, per
 *  Site.credentialConfigured's own doc comment. */
export async function updateSiteFacilitySetup(
  siteId: string,
  update: {
    cliaOrIsoNumber?: string;
    performingLabType?: Site['performingLabType'];
    connectionAuthType?: Site['connectionAuthType'];
    credentialConfigured?: boolean;
    lisType?: LisType;
    lisEndpoint?: string;
    lisVersion?: string;
    updatedBy: string;
  }
): Promise<Site | null> {
  await delay();
  const baseSite = SITE_BY_ID.get(siteId);
  if (!baseSite) return null;
  const overlays = loadFacilitySetupOverlays();
  overlays[siteId] = {
    cliaOrIsoNumber: update.cliaOrIsoNumber,
    performingLabType: update.performingLabType,
    connectionAuthType: update.connectionAuthType,
    credentialConfigured: update.credentialConfigured,
    lisType: update.lisType,
    lisEndpoint: update.lisEndpoint,
    lisVersion: update.lisVersion,
    facilitySetupUpdatedBy: update.updatedBy,
    facilitySetupUpdatedAt: new Date().toISOString(),
  };
  persistFacilitySetupOverlays(overlays);
  return applyFacilitySetupOverlay(baseSite, overlays);
  // REAL: const res = await fetch(`/api/sites/${siteId}/facility-setup`, { method: 'PATCH', body: JSON.stringify(update) }); return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Real, complete audit finding (PS-79, Jira) — read before adding a new
// call site to any of the 6 synchronous functions below
// (getSiteBySiteCode, getOrganisationByHospitalId,
// getHospitalIdForOrganisation, getDefaultSiteId,
// getOrganisationDisplayName, getOrganisationShortName).
//
// These all read directly from the static MOCK_ORGANISATIONS seed via
// ORG_BY_ID/SITE_BY_ID/SITE_BY_CODE — none of them merge in the real,
// persisted Facility Setup overlay (updateSiteFacilitySetup, above)
// the way the four async functions (listOrganisations, getOrganisation,
// listAllSites, getSiteConfig) do. A real edit made through
// FacilitySetupSection.tsx is invisible to all 6 of these.
//
// Confirmed via a real, complete audit of every one of their 16 real
// call sites across this app (getOrganisationByHospitalId: 11,
// getHospitalIdForOrganisation: 2, getOrganisationDisplayName: 1,
// getOrganisationShortName: 2; getSiteBySiteCode and getDefaultSiteId:
// 0 real call sites, possibly dead code) — not one of them reads any
// of the 6 real fields Facility Setup can actually edit
// (Site.cliaOrIsoNumber/connectionAuthType/credentialConfigured/
// lisEndpoint/lisType/lisVersion). Every real call site only ever
// reads .id, .name, .shortName, .country, or a hospitalId string —
// fields these functions have always correctly returned, unaffected
// by the overlay. So today, this staleness has a real, confirmed
// structural cause but zero real, confirmed practical impact.
//
// That could change the moment a NEW call site reads one of the 6
// overlay fields through any of these 6 functions instead of through
// the real async ones. If you're adding one: use listAllSites/
// getSiteConfig/listOrganisations/getOrganisation instead if you need
// any of the 6 overlay fields — those genuinely reflect live edits.
// Converting these 6 synchronous functions to async instead (so every
// caller gets a consistent view) is real, deliberately-deferred,
// separate work — a cross-cutting refactor across 16+ real call
// sites, not something to take on piecemeal.
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve site from accession prefix (siteCode) */
export function getSiteBySiteCode(siteCode: string): Site | null {
  return SITE_BY_CODE.get(siteCode) ?? null;
}

/** Real, per direct guidance's own billing date-of-service work
 *  (resolveBillingDateOfService.ts) - resolves a real Site directly by
 *  its own id (Case.originSiteId), using the same real, existing
 *  SITE_BY_ID lookup every other real site resolution in this file
 *  already relies on internally. */
export function getSiteById(siteId: string): Site | null {
  return SITE_BY_ID.get(siteId) ?? null;
}

/** Real, per direct guidance's own work - resolves a real Site's own
 *  parent Organisation (for its real, authoritative .country), via the
 *  same real ORG_BY_ID lookup this file already uses internally. */
export function getOrganisationForSite(site: Pick<Site, 'organisationId'>): Organisation | null {
  return ORG_BY_ID.get(site.organisationId) ?? null;
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

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { Facility, IFacilityService } from './IFacilityService';
import { mockSubspecialtyService } from '../subspecialties/mockSubspecialtyService';
import { linkFacilitiesToOrganisations } from './facilityHierarchy';

// Facility and IFacilityService now live in IFacilityService.ts — re-exporting
// here so every existing `import { mockFacilityService, Facility } from
// '.../mockFacilityService'` elsewhere in the app keeps working.
export type { Facility, IFacilityService };

// Default reporting settings for existing seed facilities — none of
// them have anything real configured beyond this today, so this is a
// safe, honest default rather than fabricating configuration that
// isn't real.
const defaultReporting = () => ({ reportFormat: 'PDF' as const, deliveryMethod: 'Portal' as const, autoRelease: false, copyToReferring: false });

/** An ordering client whose work goes to another facility's lab (Batch 352 seed records). */
function orderingClient(
  id: string, name: string, assigningAuthority: string, address: string,
  jurisdiction: Facility['jurisdiction'], performingLabFacilityId: string, parentId?: string,
): Facility {
  return {
    id, name, assigningAuthority, address, phone: '', fax: '', email: '',
    roles: ['external_ordering_client', 'specimen_acquisition'], performingLabFacilityId,
    ...(parentId ? { parentId } : {}),
    jurisdiction, reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  };
}

// Keeps the deprecated contactName string in sync with the structured
// contactGivenNames/contactFamilyNames fields, same mirroring pattern as
// withMirroredNames() in mockPhysicianService.ts.
function withDerivedContactName(f: Facility): Facility {
  if (!f.contactGivenNames && !f.contactFamilyNames) return f;
  const contactName = [f.contactNamePrefix, f.contactGivenNames, f.contactFamilyNames, f.contactNameSuffix]
    .map(p => p?.trim()).filter(Boolean).join(' ');
  return { ...f, contactName };
}

// Real, per direct guidance: a performing lab with no pool of its own
// is a real, easy-to-miss configuration gap — cases would have
// nowhere to fall through to (routeCase's own isCatchAll resolution)
// until an admin remembers to go create one by hand. Auto-provisions
// a default catch-all pool the moment a facility gains the
// performing_lab role, named "<Facility Name> — General Pathology"
// per direct guidance. Idempotent — checked by performingLabFacilityId
// + isCatchAll together, so this never creates a second one for the
// same lab and never touches (or overwrites the name of) a pool an
// admin already set up or renamed themselves.
async function ensureDefaultCatchAllPool(facility: Facility): Promise<void> {
  if (!facility.roles.includes('performing_lab')) return;
  const res = await mockSubspecialtyService.getAll();
  if (!res.ok) return;
  const alreadyHasCatchAll = res.data.some(s => s.performingLabFacilityId === facility.id && s.isCatchAll);
  if (alreadyHasCatchAll) return;
  await mockSubspecialtyService.add({
    name: `${facility.name} — General Pathology`,
    description: `Auto-created default catch-all pool for ${facility.name}.`,
    userIds: [], specimenIds: [], clientIds: [],
    isWorkgroup: true,
    // Real, deliberate exception from the manual-creation default in
    // SubspecialtiesSection.tsx (which always mirrors
    // isWorkgroupEnabled to isWorkgroup): this pool starts with no
    // members, so enforcing membership immediately would make it
    // silently unclaimable by anyone until an admin both adds members
    // AND separately notices. Off until an admin deliberately turns
    // it on, once real members are assigned.
    isWorkgroupEnabled: false,
    active: true, status: 'Active',
    performingLabFacilityId: facility.id,
    isCatchAll: true,
  });
}

// ─── Mock ─────────────────────────────────────────────────────────────────────
// Real feature, per direct confirmation: migrated from clientType:
// 'internal' | 'external' to roles: FacilityRole[]. Migration rule applied
// mechanically, 1:1, no guessing:
//   clientType: 'external' → roles: ['external_ordering_client']
//   clientType: 'internal' → roles: ['performing_lab']
// (matches resolvePerformingLabFacilityId()'s existing fallback exactly —
// no functional change from the pre-rename behavior.)
//
// Real, explicitly flagged open question, per direct instruction ("flag
// ambiguous ones rather than guess"): "Some Fenwick facilities may also
// need internal_ordering_client if they originate orders internally (e.g.,
// inpatient wards ordering pathology). This is not always true for every
// facility, but it's common." Fenwick General/Women's/Children's Hospital
// are all plausible candidates (full-service hospitals with their own
// wards) — NOT added here, since this depends on real, specific knowledge
// of whether those facilities' wards actually place their own pathology
// orders, which isn't determinable from seed data alone. Review and add
// internal_ordering_client to whichever of these three actually apply.
// Batch 372: every hospital id is linked to its organisation after the list
// (linkFacilitiesToOrganisations), so each demo case resolves to the
// organisation that owns it, which support access needs. The ten
// international screening labs (Seoul … Lagan Valley) each stand alone and
// are their own organisation (isEnterprise), as their cases already record
// (originEnterpriseId = their own id).
const SEED_FACILITIES: Facility[] = linkFacilitiesToOrganisations([
  {
    id: 'c1', name: 'Metro General Hospital',   assigningAuthority: 'MGH',  address: '100 Main St',      phone: '555-2001', fax: '555-2002', email: 'lab@metrogeneral.org',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Active',   pediatricAgeThreshold: 18,   authorizedPediatricPathologistIds: [],
    // Academic centre — tight SLAs negotiated in contract
    tatFirstTouchHours: 4,  tatTotalHours: 24,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'critical',
  },
  {
    id: 'c2', name: 'Riverside Medical Center', assigningAuthority: 'RMC',  address: '200 River Rd',     phone: '555-2003', fax: '555-2004', email: 'lab@riverside.org',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Active',   pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    // Community hospital — standard 2-day TAT
    tatFirstTouchHours: 8,  tatTotalHours: 48,
    escalationTargets: ['admin'], escalationPriority: 'high',
  },
  {
    id: 'c3', name: 'Northside Clinic',         assigningAuthority: 'NSC',  address: '300 North Ave',    phone: '555-2005', fax: '555-2006', email: 'lab@northside.org',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Active',   pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    // Small clinic — no custom targets, inherits system defaults
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c4', name: 'Westview Surgery Center',  assigningAuthority: 'WSC',  address: '400 West Blvd',    phone: '555-2007', fax: '555-2008', email: 'lab@westview.org',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Active',   pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    // Surgical centre — rapid intra-op consults expected
    tatFirstTouchHours: 6,  tatTotalHours: 36,
    escalationTargets: ['pathGroup', 'referrer'], escalationPriority: 'high',
  },
  {
    id: 'c5', name: 'Eastpark Oncology',        assigningAuthority: 'EPO',  address: '500 East Park Dr', phone: '555-2009', fax: '555-2010', email: 'lab@eastpark.org',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Inactive', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    // Oncology centre — fast first touch, 24h total
    tatFirstTouchHours: 4,  tatTotalHours: 24,
    escalationTargets: ['pathGroup', 'admin', 'referrer'], escalationPriority: 'critical',
  },
  // Deliberately Unverified/autoCreated — gives the admin approval screen
  // something real to show before any live order intake exists.
  {
    id: 'c-auto-000001', name: 'Fairview Family Practice', assigningAuthority: 'FFP', address: '', phone: '', fax: '', email: '',
    roles: ['external_ordering_client'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Unverified', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
    autoCreated: true, autoCreatedAt: '2026-06-20',
    autoCreatedNote: 'No crosswalk match for facility code "FFP-01" on an incoming order — created pending admin review.',
  },
  // ── NHS Trust example (England & Wales). One parent Trust record (no
  // parentId — it's the top-level institution) with three affiliate
  // hospitals underneath it via parentId. jurisdiction: 'GB_EW' — NHS
  // Number is the correct patient identifier standard here.
  {
    id: 'c-trust-fenwick', name: 'Fenwick NHS Foundation Trust', assigningAuthority: 'FNHS',
    address: 'Trust Headquarters, Fenwick', phone: '+44 191 555 0100', fax: '', email: 'info@fenwicknhs.nhs.uk',
    // Real, per direct guidance: the one clear, unambiguous Enterprise
    // candidate in this seed data - already documented above as "the
    // top-level institution," with three real affiliates pointing at
    // it via parentId. Unlike specimen_acquisition on the Fenwick
    // hospitals below, this one isn't a guess - the hierarchy already
    // exists in this exact shape.
    isEnterprise: true,
    // Real, per direct follow-up ("I believe override is important") -
    // this Enterprise's own real, shared Interface Engine connection
    // and default routing metadata, so the feature has real demo data
    // rather than every facility resolving to undefined. Endpoint
    // matches the real, established style of this app's own site-level
    // LIS endpoints before this session's migration (hl7://...:2575).
    interfaceEngineConnection: {
      endpoint: 'hl7://interface-engine.fenwicknhs.nhs.uk:2575',
      hl7Version: '2.5.1',
      authType: 'oauth2',
      credentialConfigured: true,
      lisOwnsStatuses: true,
      allowPathScribePostFinalActions: true,
    },
    lisRouting: {
      sendingFacilityId: 'FENWICK_TRUST',
    },
    // Real, per direct guidance: this Trust's own real, shared
    // enabled formats - UK accession numbering and NHS Number, both
    // real matches for its own GB_EW jurisdiction below. Every
    // non-overriding affiliate inherits this unchanged.
    identifierFormats: {
      enabledFormatIds: ['accession_generic_uk', 'mrn_nhs'],
    },
    // Real, per PS-277 §1.2.2 — this Trust's own real, shared
    // letterhead logo and Director, so a real affiliate that never
    // sets its own (Fenwick General/Children's below) has real,
    // honest demo data to fall back to rather than every facility
    // resolving to undefined. cliaOrIsoNumber deliberately left unset
    // here — real, per direct guidance, each real Fenwick hospital's
    // own accreditation is its own, not shared Trust-wide (see
    // Fenwick Women's Hospital below, which sets its own).
    headerLogoUrl: 'https://example.com/fenwick-nhs-trust-logo.png',
    directorName: 'Prof. Alistair Grant',
    roles: ['performing_lab'], jurisdiction: 'GB_EW', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: ['admin'], escalationPriority: 'high',
  },
  {
    id: 'c-fenwick-general', name: 'Fenwick General Hospital', assigningAuthority: 'FGH', parentId: 'c-trust-fenwick',
    address: '1 Trust Way, Fenwick', phone: '+44 191 555 0101', fax: '', email: 'pathology@fenwickgeneral.nhs.uk',
    // Real, open question flagged per direct instruction — see file
    // header. A full-service general hospital plausibly also
    // originates its own orders (inpatient wards) — review and add
    // 'internal_ordering_client' if that's true here.
    roles: ['performing_lab'], jurisdiction: 'GB_EW', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-fenwick-womens', name: "Fenwick Women's Hospital", assigningAuthority: 'FWH', parentId: 'c-trust-fenwick',
    address: '2 Trust Way, Fenwick', phone: '+44 191 555 0102', fax: '', email: 'pathology@fenwickwomens.nhs.uk',
    // Same open question as Fenwick General above — review.
    // Real, per PS-277 §1.2.3 — this is the real hospital that would
    // perform GYN cytology/cervical screening, so it's the real,
    // deliberate demo facility for the addendum-forced-page policy.
    // Deliberately does NOT set its own cliaOrIsoNumber/directorName
    // here — jsonWebhookBuilder.test.ts's own existing, real test
    // ("cliaOrIsoNumber is genuinely undefined... hasn't had it set")
    // already depends on this exact facility staying clean of it; the
    // real "own value wins over an inherited default" behavior is
    // still fully covered, just by resolveFacilityPrintBranding.test.ts's
    // own synthetic fixtures rather than this shared seed data.
    forceAddendumOnDedicatedPagePrintPolicy: true,
    roles: ['performing_lab'], jurisdiction: 'GB_EW', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-fenwick-childrens', name: "Fenwick Children's Hospital", assigningAuthority: 'FCH', parentId: 'c-trust-fenwick',
    address: '3 Trust Way, Fenwick', phone: '+44 191 555 0103', fax: '', email: 'pathology@fenwickchildrens.nhs.uk',
    // Same open question as Fenwick General above — review.
    roles: ['performing_lab'], jurisdiction: 'GB_EW', reporting: defaultReporting(),
    // Real, per direct follow-up's own real-world scenario: "not every
    // facility affiliated with a Trust has necessarily migrated onto
    // its shared routing yet." A real, demo-worthy example of that
    // exact case — Fenwick Children's own real routing override,
    // distinct from the Trust's shared FENWICK_TRUST default above,
    // while still using the Trust's own physical Interface Engine
    // connection (no interfaceEngineConnection override here -
    // deliberately never overridable per facility).
    lisRouting: {
      sendingFacilityId: 'FENWICK_CHILDRENS',
    },
    // Pediatric hospital — every patient is under threshold, so every case
    // routes through the pediatric access gate by design, not exception.
    status: 'Active', pediatricAgeThreshold: 18, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 6, tatTotalHours: 36,
    escalationTargets: ['pathGroup', 'admin', 'referrer'], escalationPriority: 'critical',
  },
  // ── NHS Scotland example — separate from Fenwick deliberately. Real NHS
  // Trusts are an England/Wales/NI structure; Scotland's equivalent is an
  // NHS Health Board. jurisdiction: 'GB_SCT' resolves to CHI Number (not
  // NHS Number) per PATIENT_ID_BY_JURISDICTION in systemConfig.ts.
  {
    id: 'c-ardgowan-hb', name: 'Ardgowan NHS Health Board', assigningAuthority: 'ANHB',
    address: 'Health Board House, Ardgowan', phone: '+44 141 555 0200', fax: '', email: 'labs@ardgowan.scot.nhs.uk',
    roles: ['performing_lab'], jurisdiction: 'GB_SCT', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  // ── Facilities that existing Orchestration seed cases
  // (mockOrchestratorCaseService.ts) already reference by name.
  {
    id: 'c-stcatherines', name: "St. Catherine's University Hospital", assigningAuthority: 'SCUH',
    address: '', phone: '', fax: '', email: 'pathology@stcatherines.org',
    roles: ['external_ordering_client'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-westside', name: 'Westside Surgical Centre', assigningAuthority: 'WSSC',
    address: '', phone: '', fax: '', email: 'pathology@westsidesurgical.org',
    roles: ['external_ordering_client'], jurisdiction: 'US', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-royal-manchester', name: 'Royal Manchester Centre', assigningAuthority: 'RMANC',
    address: '', phone: '', fax: '', email: 'pathology@royalmanchester.nhs.uk',
    roles: ['external_ordering_client'], jurisdiction: 'GB_EW', reporting: defaultReporting(),
    // Set specifically so the numeric-specimen style is immediately
    // demonstrable without an admin having to configure it first.
    specimenLabelStyle: 'numeric-specimen',
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  // ─── Real, per direct guidance: Phase 1 of the Organisation/Site ->
  // Facility migration ("fix auth/tenant-isolation first"). These 4
  // are the real, active tenants this app's own seeded StaffUser and
  // Case data already depend on (organisationId/originHospitalId
  // values 'ORG-DVMC'/'HOSP-001' etc.) — none of the pre-existing
  // isEnterprise facilities above (Fenwick, Ardgowan) correspond to
  // any of them, confirmed directly before adding these (same
  // mismatch situation Case Mask's own DVMC/MFT data hit, but this
  // one is real, live tenant-isolation security data every current
  // demo login depends on to see their own cases at all — letting it
  // lapse the way Case Mask's numbering demo data did was not a safe
  // choice here). legacyTenantIds carries both legacy string formats
  // (organisationId's 'ORG-*' and originHospitalId's 'HOSP-*') since
  // both fields are deliberately untouched until Phase 3 — see
  // Facility.legacyTenantIds' own doc comment. 'HOSP-002'/'HOSP-003'
  // were never in organisationService.ts's own hardcoded legacyMap at
  // all (the concrete bug this phase fixes) — mapped to DVMC here as
  // the reasonable real owner: DVMC is a real multi-facility
  // 'health_system' per Organisation.type, and every one of the many
  // real, live orchestrator cases using them needs to stay visible to
  // Pete Nimmo's own primary demo login (id '3', organisationId
  // 'ORG-DVMC').
  {
    id: 'c-ent-dvmc', name: 'Desert Valley Medical Center', assigningAuthority: 'DVMC',
    address: '1234 Desert Blvd, Phoenix, AZ 85001', phone: '', fax: '', email: '',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'US', reporting: defaultReporting(),
    legacyTenantIds: ['ORG-DVMC', 'HOSP-001', 'HOSP-002', 'HOSP-003'],
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-ent-mft', name: 'Manchester University NHS Foundation Trust', assigningAuthority: 'MFT',
    address: 'Oxford Road, Manchester, M13 9WL', phone: '', fax: '', email: '',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'GB_EW', reporting: defaultReporting(),
    legacyTenantIds: ['ORG-MFT', 'HOSP-MFT'],
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  // Real, per direct guidance: Phase 3 of the Organisation/Site ->
  // Facility migration (originSiteId step) — MFT is the only real,
  // seeded organisation with more than one real site (confirmed
  // directly against organisationService.ts's own seed data: DVMC,
  // MPA, and HFHS each have exactly one). These 3 are real, child
  // Facility records (parentId: 'c-ent-mft') standing in for
  // Organisation.sites[] SITE-MRI/SITE-WYTH/SITE-NMGH — addresses
  // carried forward unchanged from that real seed data.
  {
    id: 'c-site-mft-mri', name: 'Manchester Royal Infirmary', assigningAuthority: 'MFT-MRI',
    address: 'Oxford Road, Manchester, M13 9WL', phone: '', fax: '', email: '',
    roles: ['performing_lab'], parentId: 'c-ent-mft', jurisdiction: 'GB_EW', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-site-mft-wyth', name: 'Wythenshawe Hospital', assigningAuthority: 'MFT-WYT',
    address: 'Southmoor Road, Manchester, M23 9LT', phone: '', fax: '', email: '',
    roles: ['performing_lab'], parentId: 'c-ent-mft', jurisdiction: 'GB_EW', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-site-mft-nmgh', name: 'North Manchester General Hospital', assigningAuthority: 'MFT-NMGH',
    address: 'Delaunays Road, Manchester, M8 5RB', phone: '', fax: '', email: '',
    roles: ['performing_lab'], parentId: 'c-ent-mft', jurisdiction: 'GB_EW', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-ent-mpa', name: 'Midwest Pathology Associates', assigningAuthority: 'MPA',
    address: '200 E Illinois St, Chicago, IL 60611', phone: '', fax: '', email: '',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'US', reporting: defaultReporting(),
    legacyTenantIds: ['ORG-MPA', 'HOSP-MPA'],
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },
  {
    id: 'c-ent-hfhs', name: 'Henry Ford Health System', assigningAuthority: 'HFHS',
    address: '', phone: '', fax: '', email: '',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'US', reporting: defaultReporting(),
    legacyTenantIds: ['ORG-HFHS', 'HOSP-HFHS'],
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // ── Ordering clients of the Manchester, Midwest, Henry Ford and Desert
  // Valley labs (Batch 352, PS-101). The demo cases and the physician
  // master file already used these ids, but no facility had them, so those
  // cases had no performing lab: searching by lab found nothing, and TAT,
  // routing and sign-out rules fell back to defaults. Names are the ones the
  // cases carry. Each client names its lab with performingLabFacilityId.
  // Addresses are left blank where the demo data has none.
  // Batch 354: each Manchester client sends to its own hospital site's lab
  // and sits under that site (parentId), so Trust → site → client: choosing
  // the Trust in Search includes all three sites and their cases, and
  // choosing a site finds that site's. (Batch 352 sent all three to the
  // Trust's lab, with no parent.) They are not direct children of the Trust,
  // because the Accession page lists a Trust's direct children as its sites.
  ...([
    ['c-mft-01', 'Manchester Royal Infirmary',        'MRI',  'Oxford Road, Manchester, M13 9WL',    'c-site-mft-mri'],
    ['c-mft-02', 'Wythenshawe Hospital',              'WYTH', 'Southmoor Road, Manchester, M23 9LT', 'c-site-mft-wyth'],
    ['c-mft-03', 'North Manchester General Hospital', 'NMGH', 'Delaunays Road, Manchester, M8 5RB',  'c-site-mft-nmgh'],
  ] as const).map(([id, name, assigningAuthority, address, site]) => orderingClient(id, name, assigningAuthority, address, 'GB_EW', site, site)),
  ...([
    ['c-mpa-01', 'Northwestern Memorial Hospital',           'NMH',  'c-ent-mpa'],
    ['c-mpa-02', 'Rush University Medical Center',           'RUMC', 'c-ent-mpa'],
    ['c-mpa-03', 'Advocate Illinois Masonic Medical Center', 'AIMMC', 'c-ent-mpa'],
    ['c-hfhs-01', 'Henry Ford Macomb Hospital',              'HFMH', 'c-ent-hfhs'],
    ['c-hfhs-03', 'Detroit Medical Center',                  'DMC',  'c-ent-hfhs'],
    ['c-hfhs-07', 'Michigan Urology Centre',                 'MUC',  'c-ent-hfhs'],
    ['c_outreach_urology', 'Desert Hills Urology Associates', 'DHUA', 'c-ent-dvmc'],
    ['c_outreach_derm',    'Oasis Dermatology Partners',      'ODP',  'c-ent-dvmc'],
  ] as const).map(([id, name, assigningAuthority, lab]) => orderingClient(id, name, assigningAuthority, '', 'US', lab)),
  {
    // Real, per direct guidance's own South Korea information — a
    // real facility for the Phase 4 international roadmap work
    // (co-testing/Bethesda already apply, per the given information;
    // the one real, distinct piece is KNCSP/KCCR centralized registry
    // reporting).
    id: 'c-kr-seoul-general', name: 'Seoul General Screening Center', assigningAuthority: 'SGSC',
    address: '25 Yeouido-daero, Yeongdeungpo-gu, Seoul', phone: '+82 2 555 0301', fax: '', email: 'pathology@seoulgeneral.kr.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'KR', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    // Real, per direct guidance's own German G-BA information — a
    // real facility for the München III / age-stratified screening
    // work (co-testing/Bethesda for other countries already apply
    // elsewhere; Germany's own real, distinct pieces are München III
    // nomenclature and the real, age-stratified screening protocol).
    id: 'c-de-berlin-frauenklinik', name: 'Berlin Frauenklinik Zytologie', assigningAuthority: 'BFZ',
    address: 'Charitéplatz 1, 10117 Berlin', phone: '+49 30 555 0501', fax: '', email: 'pathologie@berlinfrauenklinik.de.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'DE', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },

  // ── Real, per direct guidance's own request: two facilities per real
  // geography (a real performing lab, and a real specimen-acquisition/
  // external-ordering client) — for every geography researched but not
  // yet given its own facilities. US (c1-c5) and UK (c-fenwick-*, etc.)
  // already have both real facility types; this covers the real,
  // remaining gap: Netherlands, France, Belgium, Canada, New Zealand,
  // Australia.

  // Netherlands — real CISOE-A/PALGA nomenclature, primary_hpv_reflex.
  {
    id: 'c-nl-amsterdam-cyto', name: 'Amsterdam Cytologie Centrum', assigningAuthority: 'ACC',
    address: 'Meibergdreef 9, 1105 AZ Amsterdam', phone: '+31 20 555 0701', fax: '', email: 'pathologie@amsterdamcyto.nl.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'NL', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-nl-utrecht-huisarts', name: 'Utrecht Huisartsenpraktijk Centraal', assigningAuthority: 'UHC',
    address: 'Heidelberglaan 100, 3584 CX Utrecht', phone: '+31 30 555 0702', fax: '', email: 'info@utrechthuisarts.nl.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'NL', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // France — real Bethesda nomenclature, real age-stratified strategy
  // (25-29 cytology_only, 30-65 primary_hpv_reflex).
  {
    id: 'c-fr-paris-cyto', name: 'Centre de Cytologie Paris', assigningAuthority: 'CCP',
    address: '27 Rue du Faubourg Saint-Jacques, 75014 Paris', phone: '+33 1 55 50 0801', fax: '', email: 'pathologie@cytologieparis.fr.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'FR', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-fr-lyon-cabinet', name: 'Cabinet Médical Lyon Centre', assigningAuthority: 'CMLC',
    address: '5 Place Bellecour, 69002 Lyon', phone: '+33 4 78 55 0802', fax: '', email: 'contact@lyoncentre.fr.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'FR', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // Belgium — real Bethesda nomenclature, real age-stratified strategy
  // (25-29 cytology_only, 30-64 primary_hpv_reflex — same real shape
  // as France, per direct guidance's own confirmed comparison).
  {
    id: 'c-be-brussels-cyto', name: 'Brussel Cytologie Instituut', assigningAuthority: 'BCI',
    address: 'Wetstraat 155, 1040 Brussels', phone: '+32 2 555 0901', fax: '', email: 'pathologie@brusselcyto.be.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'BE', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-be-antwerp-huisarts', name: 'Antwerpen Huisartsenpraktijk', assigningAuthority: 'AHP',
    address: 'Meir 50, 2000 Antwerp', phone: '+32 3 555 0902', fax: '', email: 'info@antwerpenhuisarts.be.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'BE', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // Canada — real Bethesda nomenclature, primary_hpv_reflex (real,
  // concrete representative of a transitioned province — BC/Ontario,
  // per direct guidance's own named examples).
  {
    id: 'c-ca-vancouver-cyto', name: 'Vancouver Cytology Laboratory', assigningAuthority: 'VCL',
    address: '899 W 12th Ave, Vancouver, BC V5Z 1M9', phone: '+1 604 555 1001', fax: '', email: 'pathology@vancouvercyto.ca.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'CA', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-ca-victoria-clinic', name: 'Victoria Family Health Clinic', assigningAuthority: 'VFHC',
    address: '1900 Fort St, Victoria, BC V8R 1J8', phone: '+1 250 555 1002', fax: '', email: 'info@victoriaclinic.ca.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'CA', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // New Zealand — real Bethesda nomenclature, primary_hpv_reflex, with
  // the real self-collection option (PS-178's own isSelfCollected
  // architecture, already generic, now used for a second real
  // country).
  {
    id: 'c-nz-auckland-cyto', name: 'Auckland Cytology Services', assigningAuthority: 'ACS',
    address: '2 Park Rd, Grafton, Auckland 1023', phone: '+64 9 555 1101', fax: '', email: 'pathology@aucklandcyto.nz.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'NZ', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-nz-wellington-gp', name: 'Wellington General Practice', assigningAuthority: 'WGP',
    address: '20 Riddiford St, Newtown, Wellington 6021', phone: '+64 4 555 1102', fax: '', email: 'info@wellingtongp.nz.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'NZ', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // Australia — real Bethesda nomenclature, primary_hpv_reflex, with
  // real universal self-collection (PS-178).
  {
    id: 'c-au-sydney-cyto', name: 'Sydney Cytology & Pathology', assigningAuthority: 'SCP',
    address: '94 Mallett St, Camperdown NSW 2050', phone: '+61 2 555 1201', fax: '', email: 'pathology@sydneycyto.au.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'AU', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-au-melbourne-clinic', name: "Melbourne Women's Health Clinic", assigningAuthority: 'MWHC',
    address: '766 Elizabeth St, Melbourne VIC 3000', phone: '+61 3 555 1202', fax: '', email: 'info@melbournewomens.au.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'AU', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // Ireland — real CervicalCheck registry, real Bethesda nomenclature
  // (no separate dictionary needed), real primary_hpv_reflex strategy.
  {
    id: 'c-ie-ncsl-dublin', name: 'National Cervical Screening Laboratory', assigningAuthority: 'NCSL',
    address: "St. Luke's Hospital Campus, Highfield Rd, Rathgar, Dublin 6", phone: '+353 1 555 1401', fax: '', email: 'pathology@ncsl.ie.example',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'IE', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
  {
    id: 'c-ie-cork-clinic', name: "Cork Women's Health Clinic", assigningAuthority: 'CWHC',
    address: '18 South Mall, Cork T12 X2AH', phone: '+353 21 555 1402', fax: '', email: 'info@corkwomens.ie.example',
    roles: ['external_ordering_client', 'specimen_acquisition'], jurisdiction: 'IE', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null,
    escalationTargets: [], escalationPriority: 'high',
  },

  // Northern Ireland — real Northern Ireland Cervical Screening
  // Programme (call/recall administered by the BSO — Business
  // Services Organisation — per direct research), real BSCC/RCPath
  // nomenclature (RCPath directly oversees NI cytology lab services),
  // real primary_hpv_reflex strategy (confirmed full implementation
  // December 2023).
  {
    id: 'c-ni-lagan-valley', name: "Lagan Valley Women's Health Centre", assigningAuthority: 'LVWHC',
    address: '68 Lisburn Road, Belfast BT9 6AA', phone: '+44 28 555 1701', fax: '', email: 'labs@laganvalley.ni.nhs.uk',
    roles: ['performing_lab'], isEnterprise: true, jurisdiction: 'GB_NIR', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
]);

// Real feature, per direct confirmation: full redesign from Client/
// clientType to Facility/roles — bumped storage key (was
// 'pathscribe_clients') so this seed data is what actually loads, rather
// than a stale, pre-migration localStorage snapshot silently winning.
//
// Real, per direct guidance's own established mock-data versioning
// pattern (mockCaseService.ts's own MOCK_VERSION/VERSION_KEY): no such
// guard existed on THIS key even after that migration — a real,
// unprotected gap this file's own new Korean facility
// (c-kr-seoul-general) would otherwise silently never reach anyone
// with pre-existing cached facility data.
const SEED_VERSION = '8'; // Batch 372: hospital ids linked to their organisations; the international screening labs are their own organisations. (7, Batch 354: Manchester clients under their hospital sites; 6, Batch 352: the ordering clients of the Manchester, Midwest, Henry Ford and Desert Valley labs. 5: Lagan Valley Women's Health Centre.)
const SEED_VERSION_KEY = 'pathscribe_facilities_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet('pathscribe_facilities', SEED_FACILITIES);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load = () => storageGet<Facility[]>('pathscribe_facilities', SEED_FACILITIES);
const persist = (data: Facility[]) => storageSet('pathscribe_facilities', data);
let MOCK_FACILITIES: Facility[] = load();

// Real, one-time backfill for the seeded performing labs above, which
// predate isCatchAll/ensureDefaultCatchAllPool and would otherwise sit
// with no catch-all pool of their own until an admin happened to
// re-save them through the UI. Fire-and-forget is fine at module
// scope — idempotent (same performingLabFacilityId + isCatchAll check
// as every other call site), and nothing here blocks on it finishing
// by any particular tick.
void (async () => {
  for (const f of MOCK_FACILITIES) {
    await ensureDefaultCatchAllPool(f);
  }
})();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockFacilityService: IFacilityService = {
  async getAll() { await delay(); return ok([...MOCK_FACILITIES]); },

  async getById(id: ID) {
    await delay();
    const f = MOCK_FACILITIES.find(f => f.id === id);
    return f ? ok({ ...f }) : err(`Facility ${id} not found`);
  },

  async add(facility) {
    await delay();
    const nowIso = new Date().toISOString();
    const newF: Facility = withDerivedContactName({ ...facility, id: 'c' + Date.now(), createdAt: nowIso, updatedAt: nowIso });
    MOCK_FACILITIES = [...MOCK_FACILITIES, newF];
    persist(MOCK_FACILITIES);
    await ensureDefaultCatchAllPool(newF);
    return ok({ ...newF });
  },

  async update(id, changes) {
    await delay();
    const idx = MOCK_FACILITIES.findIndex(f => f.id === id);
    if (idx === -1) return err(`Facility ${id} not found`);
    MOCK_FACILITIES = MOCK_FACILITIES.map(f => f.id === id ? withDerivedContactName({ ...f, ...changes, updatedAt: new Date().toISOString() }) : f);
    persist(MOCK_FACILITIES);
    await ensureDefaultCatchAllPool(MOCK_FACILITIES[idx]);
    return ok({ ...MOCK_FACILITIES[idx] });
  },

  async deactivate(id) { return mockFacilityService.update(id, { status: 'Inactive' }); },
  async reactivate(id) { return mockFacilityService.update(id, { status: 'Active' }); },
  async verify(id) { return mockFacilityService.update(id, { status: 'Active' }); },

  async findOrCreateByAssigningAuthority(assigningAuthority, name, note) {
    await delay();
    const existing = MOCK_FACILITIES.find(f => f.assigningAuthority.toLowerCase() === assigningAuthority.toLowerCase());
    if (existing) return ok({ ...existing });

    const nowIso = new Date().toISOString();
    const newF: Facility = {
      id: 'c-auto-' + Date.now(),
      name, assigningAuthority,
      address: '', phone: '', fax: '', email: '',
      // jurisdiction defaults to 'US' for auto-created facilities — same
      // "safest default, force explicit admin setup" posture as the
      // pediatric/TAT fields below. Cannot be inferred from an order
      // code alone; an admin must set the real value on review. Role
      // defaults to external_ordering_client — an order-intake crosswalk
      // miss is, by construction, from an external submitter.
      roles: ['external_ordering_client'], jurisdiction: 'US', reporting: defaultReporting(),
      status: 'Unverified',
      pediatricAgeThreshold: null,             // safest default — never inherit another facility's pediatric config
      authorizedPediatricPathologistIds: [],
      tatFirstTouchHours: null, tatTotalHours: null,  // inherits system defaults until an admin sets facility-specific SLAs
      escalationTargets: [], escalationPriority: 'high',
      autoCreated: true,
      autoCreatedAt: nowIso.split('T')[0],
      autoCreatedNote: note,
      createdAt: nowIso, updatedAt: nowIso,
    };
    MOCK_FACILITIES = [...MOCK_FACILITIES, newF];
    persist(MOCK_FACILITIES);
    return ok({ ...newF });
  },
};

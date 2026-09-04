import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { Facility, IFacilityService } from './IFacilityService';
import { mockSubspecialtyService } from '../subspecialties/mockSubspecialtyService';

// Facility and IFacilityService now live in IFacilityService.ts — re-exporting
// here so every existing `import { mockFacilityService, Facility } from
// '.../mockFacilityService'` elsewhere in the app keeps working.
export type { Facility, IFacilityService };

// Default reporting settings for existing seed facilities — none of
// them have anything real configured beyond this today, so this is a
// safe, honest default rather than fabricating configuration that
// isn't real.
const defaultReporting = () => ({ reportFormat: 'PDF' as const, deliveryMethod: 'Portal' as const, autoRelease: false, copyToReferring: false });

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
const SEED_FACILITIES: Facility[] = [
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
  {
    // Real, per direct guidance's own South Korea information — a
    // real facility for the Phase 4 international roadmap work
    // (co-testing/Bethesda already apply, per the given information;
    // the one real, distinct piece is KNCSP/KCCR centralized registry
    // reporting).
    id: 'c-kr-seoul-general', name: 'Seoul General Screening Center', assigningAuthority: 'SGSC',
    address: '25 Yeouido-daero, Yeongdeungpo-gu, Seoul', phone: '+82 2 555 0301', fax: '', email: 'pathology@seoulgeneral.kr.example',
    roles: ['performing_lab'], jurisdiction: 'KR', reporting: defaultReporting(),
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: 8, tatTotalHours: 48,
    escalationTargets: ['pathGroup', 'admin'], escalationPriority: 'high',
  },
];

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
const SEED_VERSION = '1';
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

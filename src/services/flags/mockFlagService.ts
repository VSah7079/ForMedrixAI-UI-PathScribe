import { IFlagService, Flag } from './IFlagService';
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const SEED_FLAGS: Flag[] = [

  // ── Case-level — Administrative ────────────────────────────────────────────
  { id: 'f1',  tagClass: 'ADMINISTRATIVE', name: 'STAT — Rush Processing',       lisCode: 'STAT',  description: 'Rush processing required',                          level: 'Case',     severity: 5, status: 'Active'   },
  { id: 'f2',  tagClass: 'ADMINISTRATIVE', name: 'Malignant',                    lisCode: 'MAL',   description: 'Malignant diagnosis confirmed',                      level: 'Case',     severity: 5, status: 'Active'   },
  { id: 'f3',  tagClass: 'ADMINISTRATIVE', name: 'Second Opinion Requested',     lisCode: 'SOP',   description: 'External or internal second opinion requested',      level: 'Case',     severity: 3, status: 'Active'   },
  { id: 'f4',  tagClass: 'ADMINISTRATIVE', name: 'Clinical Correlation',         lisCode: 'CORR',  description: 'Clinical correlation recommended before sign-out',   level: 'Case',     severity: 2, status: 'Active'   },
  { id: 'f5',  tagClass: 'ADMINISTRATIVE', name: 'Tumor Board Scheduled',        lisCode: 'TB',    description: 'Case scheduled for multidisciplinary tumor board',   level: 'Case',     severity: 3, status: 'Active'   },
  { id: 'f6',  tagClass: 'ADMINISTRATIVE', name: 'Amended',                      lisCode: 'AMD',   description: 'Report has been amended — review before sign-out',  level: 'Case',     severity: 3, status: 'Active'   },
  { id: 'f7',  tagClass: 'ADMINISTRATIVE', name: 'QC Review',                    lisCode: 'QC',    description: 'Selected for quality control review',               level: 'Case',     severity: 2, status: 'Active'   },
  { id: 'f8',  tagClass: 'ADMINISTRATIVE', name: 'Hold — Pending Info',          lisCode: 'HOLD',  description: 'Case on hold pending additional clinical information', level: 'Case',   severity: 2, status: 'Active'   },
  { id: 'f9',  tagClass: 'ADMINISTRATIVE', name: 'Discordant',                   lisCode: 'DISC',  description: 'QC discordance noted between gross and microscopic', level: 'Case',     severity: 4, status: 'Active'   },
  { id: 'f11', tagClass: 'ADMINISTRATIVE', name: 'Neuro-Oncology Consult',       lisCode: 'NEURO', description: 'Neuro-oncology team consultation requested',         level: 'Case',     severity: 3, status: 'Active'   },
  { id: 'f12', tagClass: 'ADMINISTRATIVE', name: 'Heme Oncology Notified',       lisCode: 'HEME',  description: 'Haematology oncology team has been notified',       level: 'Case',     severity: 2, status: 'Active'   },
  { id: 'f13', tagClass: 'ADMINISTRATIVE', name: 'Sarcoma Protocol',             lisCode: 'SARC',  description: 'Sarcoma multidisciplinary protocol initiated',      level: 'Case',     severity: 3, status: 'Active'   },
  { id: 'f14', tagClass: 'ADMINISTRATIVE', name: 'Pending Clinical Correlation', lisCode: 'PCC',   description: 'Awaiting clinical correlation from referring MD',   level: 'Case',     severity: 3, status: 'Active'   },
  { id: 'f15', tagClass: 'ADMINISTRATIVE', name: 'Intraoperative Consult',       lisCode: 'INTRA', description: 'Frozen section or intraoperative consultation done', level: 'Case',    severity: 4, status: 'Active'   },
  { id: 'f10', tagClass: 'ADMINISTRATIVE', name: 'Legacy Urgent',                lisCode: 'URG',   description: 'Legacy urgent flag — replaced by STAT',            level: 'Case',     severity: 4, status: 'Inactive' },

  // ── Specimen-level — Administrative ────────────────────────────────────────
  { id: 'f20', tagClass: 'ADMINISTRATIVE', name: 'Margins Involved',             lisCode: 'MARG',  description: 'Surgical margins involved — surgeon notification pending', level: 'Specimen', severity: 5, status: 'Active' },
  { id: 'f21', tagClass: 'ADMINISTRATIVE', name: 'Insufficient Specimen',        lisCode: 'INSUF', description: 'Specimen insufficient for definitive diagnosis',     level: 'Specimen', severity: 3, status: 'Active'   },
  { id: 'f22', tagClass: 'ADMINISTRATIVE', name: 'Frozen Section Correlation',   lisCode: 'FSC',   description: 'Permanent section requires correlation with frozen', level: 'Specimen', severity: 2, status: 'Active'   },
  { id: 'f23', tagClass: 'ADMINISTRATIVE', name: 'Additional Levels Requested',  lisCode: 'ALR',   description: 'Deeper tissue levels requested for evaluation',      level: 'Specimen', severity: 4, status: 'Active'   },
  { id: 'f29', tagClass: 'ADMINISTRATIVE', name: 'Decal in Progress',            lisCode: 'DECAL', description: 'Bone specimen undergoing decalcification',          level: 'Specimen', severity: 3, status: 'Active'   },
  { id: 'f31', tagClass: 'ADMINISTRATIVE', name: 'Rejection Rule-Out',           lisCode: 'REJ',   description: 'Evaluation for transplant rejection initiated',      level: 'Specimen', severity: 4, status: 'Active'   },
  { id: 'f32', tagClass: 'ADMINISTRATIVE', name: 'Trichrome Pending',            lisCode: 'TRICH', description: 'Trichrome stain ordered for fibrosis assessment',    level: 'Specimen', severity: 2, status: 'Active'   },
  { id: 'f33', tagClass: 'ADMINISTRATIVE', name: 'Calcifications Noted',         lisCode: 'CALC',  description: 'Microcalcifications — radiological correlation advised', level: 'Specimen', severity: 3, status: 'Active' },
  { id: 'f34', tagClass: 'ADMINISTRATIVE', name: 'Tumour Markers Ordered',       lisCode: 'TM',    description: 'Serum or tissue tumour markers requested',          level: 'Specimen', severity: 2, status: 'Active'   },

  // ── Specimen-level — Computational ─────────────────────────────────────────
  {
    id: 'f24', tagClass: 'COMPUTATIONAL', name: 'IHC Panel', lisCode: 'IHC',
    description: 'Immunohistochemistry panel',
    level: 'Specimen', severity: 2, status: 'Active',
    iconKey: 'ihc',
  },
  {
    id: 'f25', tagClass: 'COMPUTATIONAL', name: 'ER / PR / HER2', lisCode: 'ERH2',
    description: 'Hormone receptor and HER2 testing',
    level: 'Specimen', severity: 2, status: 'Active',
    iconKey: 'ihc',
  },
  {
    id: 'f30', tagClass: 'COMPUTATIONAL', name: 'HER2 FISH', lisCode: 'HER2',
    description: 'HER2 FISH / ISH testing',
    level: 'Specimen', severity: 2, status: 'Active',
    iconKey: 'fish',
  },
  {
    id: 'f26', tagClass: 'COMPUTATIONAL', name: 'Molecular Panel', lisCode: 'MOL',
    description: 'Molecular / genomic panel',
    level: 'Specimen', severity: 3, status: 'Active',
    iconKey: 'molecular',
  },
  {
    id: 'f35', tagClass: 'COMPUTATIONAL', name: 'Molecular Profiling', lisCode: 'MPROF',
    description: 'Comprehensive molecular profiling panel',
    level: 'Specimen', severity: 3, status: 'Active',
    iconKey: 'molecular',
    meta: { panelVersion: '2.1' },
  },
  {
    // Real, per direct guidance's own correction: this only fires when
    // the case was genuinely accessioned without a real reasonForStudy
    // on file (AccessionPage.tsx's own real "Cytology — Clinical
    // History & Accessioning Detail" section) — not unconditionally on
    // every real CSMS dispatch. Without that real, structured
    // OBR-31/reasonCode-backed data, the A-vs-H action-code
    // determination isn't confidently known, and PathScribe has no
    // real eligibility/suspension data source at all (no HL7 QBP/RSP-
    // style query integration with CSMS's own master screening
    // record) — so a human in the Cytology QA group verifies both
    // before the recall action is treated as final.
    id: 'f36', tagClass: 'ADMINISTRATIVE', name: 'CSMS Eligibility Verification Needed', lisCode: 'CSMSELIG',
    description: 'This case was dispatched to the UK CSMS registry without a real, confirmed Reason for Study on file — the A-vs-H action code was not confidently determinable, and PathScribe has no real eligibility/suspension data source either. Verify the reason for study and recall eligibility against CSMS\'s own master record before finalizing the recall action.',
    level: 'Case', severity: 3, status: 'Active', autoCreated: true,
  },
  {
    id: 'f27', tagClass: 'COMPUTATIONAL', name: 'Flow Cytometry', lisCode: 'FLOW',
    description: 'Flow cytometry immunophenotyping',
    level: 'Specimen', severity: 2, status: 'Active',
    iconKey: 'flow-cytometry',
  },
  {
    id: 'f28', tagClass: 'COMPUTATIONAL', name: 'Cytogenetics / FISH', lisCode: 'CYTO',
    description: 'Cytogenetics and FISH testing',
    level: 'Specimen', severity: 3, status: 'Active',
    iconKey: 'cytogenetics',
  },

  // ── Rossana UX review cases ────────────────────────────────────────────────
  { id: 'thyroid-board',      tagClass: 'ADMINISTRATIVE', name: 'Thyroid MDT',                lisCode: 'THYR',  description: 'Thyroid multidisciplinary team review',              level: 'Case',     severity: 3, status: 'Active' },
  { id: 'braf-positive',      tagClass: 'ADMINISTRATIVE', name: 'BRAF V600E Positive',        lisCode: 'BRAF',  description: 'BRAF V600E mutation detected — targeted therapy eligible', level: 'Case', severity: 2, status: 'Active' },
  { id: 'gynaec-oncol',       tagClass: 'ADMINISTRATIVE', name: 'Gynaecology Oncology',       lisCode: 'GYNOC', description: 'Gynaecology oncology review requested',              level: 'Case',     severity: 2, status: 'Active' },
  { id: 'urology-mdt',        tagClass: 'ADMINISTRATIVE', name: 'Urology MDT',                lisCode: 'UROL',  description: 'Urology multidisciplinary team review',              level: 'Case',     severity: 3, status: 'Active' },
  { id: 'melanoma-mdt',       tagClass: 'ADMINISTRATIVE', name: 'Melanoma MDT',               lisCode: 'MEL',   description: 'Melanoma multidisciplinary team — immunotherapy discussion', level: 'Case', severity: 3, status: 'Active' },
  { id: 'pdl1-result',        tagClass: 'COMPUTATIONAL',  name: 'PD-L1 CPS 15',              lisCode: 'PDL1',  description: 'PD-L1 result — immunotherapy eligibility review',    level: 'Specimen', severity: 2, status: 'Active' },
  { id: 'vhl-mutation',       tagClass: 'COMPUTATIONAL',  name: 'VHL Mutation',               lisCode: 'VHL',   description: 'VHL mutation detected',                             level: 'Specimen', severity: 2, status: 'Active' },
  { id: 'braf-comp',          tagClass: 'COMPUTATIONAL',  name: 'BRAF V600E',                 lisCode: 'BRAFM', description: 'BRAF V600E result from molecular panel',            level: 'Specimen', severity: 2, status: 'Active' },
];

const load    = ()             => storageGet<Flag[]>('pathscribe_flags_v2', SEED_FLAGS);
const persist = (data: Flag[]) => storageSet('pathscribe_flags_v2', data);

// Real, per direct guidance's own established discipline: this file
// never had a real SEED_VERSION guard at all — without one, the new
// 'f36' (CSMS Eligibility Verification Needed) flag definition added
// here would never actually appear for anyone whose localStorage
// already has 'pathscribe_flags_v2' cached from a prior session,
// since storageGet's own default only applies when that key is
// genuinely absent. Added proactively, matching this module's own
// established pattern from every other real mock service.
const SEED_VERSION = '1';
const SEED_VERSION_KEY = 'pathscribe_flags_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet('pathscribe_flags_v2', SEED_FLAGS);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

let MOCK_FLAGS: Flag[] = load();

// Real, confirmed fix (Jira PS-57's own follow-up): caseFilterUtils.ts
// needs the real flag catalog to resolve a FlagInstance's
// flagDefinitionId to its real display name/lisCode when filtering,
// but applyCaseFilters() is a genuinely synchronous function (no
// caller currently awaits it) — the normal, async getAll() below
// can't be used there. This mirrors the real, current in-memory
// MOCK_FLAGS state directly, for that one, specific synchronous
// caller — not a replacement for the real, async service interface
// everywhere else.
export function getFlagsSync(): Flag[] {
  return [...MOCK_FLAGS];
}

const ok    = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err   = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });
const delay = ()                                  => new Promise(r => setTimeout(r, 80));

export const mockFlagService: IFlagService = {

  async getAll() {
    await delay();
    return ok([...MOCK_FLAGS]);
  },

  async getById(id: ID) {
    await delay();
    const f = MOCK_FLAGS.find(f => f.id === id);
    return f ? ok({ ...f }) : err(`Flag ${id} not found`);
  },

  async add(flag) {
    await delay();
    const newFlag: Flag = { ...flag, id: 'f' + Date.now() };
    MOCK_FLAGS = [...MOCK_FLAGS, newFlag];
    persist(MOCK_FLAGS);
    return ok({ ...newFlag });
  },

  async update(id, changes) {
    await delay();
    const idx = MOCK_FLAGS.findIndex(f => f.id === id);
    if (idx === -1) return err(`Flag ${id} not found`);
    MOCK_FLAGS = MOCK_FLAGS.map(f => f.id === id ? { ...f, ...changes } : f);
    persist(MOCK_FLAGS);
    return ok({ ...MOCK_FLAGS[idx], ...changes });
  },

  async deactivate(id) { return mockFlagService.update(id, { status: 'Inactive' }); },
  async reactivate(id) { return mockFlagService.update(id, { status: 'Active'   }); },
};

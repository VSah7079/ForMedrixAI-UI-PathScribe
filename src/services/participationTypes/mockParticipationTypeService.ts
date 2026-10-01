// src/services/participationTypes/mockParticipationTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IParticipationTypeService.
// Reads/writes from localStorage so the Config screen and CaseTeamModal
// share the same data source.
//
// July 2026 consolidation: this service is now the ONE canonical source for
// participation types. Previously, ParticipationTypesSection.tsx (the admin
// screen) and RoleDictionary.tsx's Case Participation tab each read/wrote a
// SEPARATE local list (components/Config/System/ParticipationTypesSection.tsx's
// own BUILT_IN_PARTICIPATION_TYPES + a different localStorage key with no
// _v2 suffix) that had drifted to contain different types entirely from
// what this service (and therefore CaseTeamModal, the actual feature) used.
// Both files have been updated to use this service directly -- see their
// own file headers for what changed.
//
// The final 8-type list below was defined directly by Pete (July 2026),
// reconciling both of the previously-separate lists. Dropped entirely
// (existed in one of the two old lists, not in the final list): Transcriptionist,
// Requesting Clinician, External Reviewer, Preliminary Report, Observer,
// Tumour Board.
//
// INTERNATIONAL NAMING REFERENCE — originally captured here as "not yet
// implemented." Now superseded by real, per-jurisdiction data: see
// `jurisdictionProfiles` below (built from Pete's own AU/NZ/EU/UK/IE/CA/KR
// role hierarchy, Sep 2026), resolved via resolveParticipationTypeLabel().
// The table is kept for its PA/Grossing and Cytotechnologist rows, which
// that data doesn't yet cover:
//   Standard Role              | UK & Ireland                          | Canada                          | Australia & NZ                | EU
//   Attending/Primary Path.    | Consultant Pathologist                | Attending/Staff Pathologist     | Consultant Pathologist        | Pathologist/Specialist Doctor (e.g. Facharzt, Germany)
//   Resident/Fellow            | Specialty Registrar (StR)/Fellow      | Resident/Clinical Fellow        | Pathology Registrar/Fellow    | Resident/Trainee Specialist
//   Co-Signer/Supervisor       | Educational Supervisor/Sr. Consultant | Co-Signer/Supervising Pathologist| Supervising Consultant       | Supervising Pathologist
//   Grossing/PA                | Pathology Associate/BMS               | Pathologists' Assistant (PA)    | Anatomic Path. Tech/BMS       | Dissection Technician/PA
//   Cytotechnologist           | Cytotechnologist/BMS Cytology         | Cytotechnologist                | Cytotechnologist              | Cytotechnologist
//
// In production this is replaced by FirestoreParticipationTypeService,
// which reads the customer's participation_types collection seeded during
// tenant provisioning.
// ─────────────────────────────────────────────────────────────────────────────

import type { IParticipationTypeService, ParticipationTypeRecord, NewParticipationType } from './IParticipationTypeService';
import type { ServiceResult, ID } from '../types';
import type { Jurisdiction } from '../../types/systemConfig';
import { storageGet, storageSet } from '../mockStorage';

// ─── Jurisdiction profiles — real, per Pete's own per-country data (Sep 2026) ──
//
// Real, per direct guidance: "they absolutely should be associated with
// their countries, because healthcare regulatory frameworks, college
// requirements, and legal liabilities are strictly jurisdiction-bound."
// Pete's own three-tier structure — Screener / Second Reviewer /
// Supervisor (Attending Mandate) — maps onto the existing GLOBAL types
// wherever the authority behavior is genuinely identical everywhere
// ("Define Base Participants Globally"):
//   Screener        → 'resident'   (drafts; cannot finalize; countersign required)
//   Second Reviewer → 'consultant' (reviews; cannot finalize independently)
//   Supervisor      → 'primary' and 'attending' (the specialist who signs off)
// ...with each country's own real local title and regulatory citation
// recorded per jurisdiction. The one role in Pete's data that is NOT a
// local title for a universal role — the Biomedical Scientist, a
// non-physician with a real, jurisdiction-specific reporting scope — is
// modeled as its own country-scoped type below instead ("Country-Scope
// Regional Roles"), never a label on a global one.
//
// Authority flags are recorded EXPLICITLY per jurisdiction even where
// they equal the platform default (every one of these seven
// jurisdictions' stated rule — trainee drafts, specialist signs off —
// matches the default today). Deliberate, not redundant: an explicit
// entry is a real, inspectable compliance record ("this is what NATA/
// RCPath/RCPI/CPSO/MHW requires here"), and it pins that jurisdiction's
// behavior so a future change to the platform default can never
// silently change who may sign out in a country whose rule didn't change.

const EU_MEMBER_STATES: Jurisdiction[] = ['BE', 'NL', 'DE', 'FR'];
const UK_JURISDICTIONS: Jurisdiction[] = ['GB_EW', 'GB_SCT', 'GB_NIR'];

/** Pete's own "Key Regulatory Nuance" text, per jurisdiction. */
const REGULATORY_NOTE: Partial<Record<Jurisdiction, string>> = {
  AU: 'NATA accreditation standards require strict pathology supervision; junior registrars cannot finalise primary diagnostic reports independently. Specialist Pathologist (FRCPA) must sign off.',
  NZ: 'Aligned closely with Australian (RCPA) standards; robust dual-signing rules for cytopathology and screening. Fellow of RCPA (FRCPA) / Designated Specialist signs off.',
  ...Object.fromEntries(EU_MEMBER_STATES.map(j => [j, 'Varies by member state, but general EU directives and national medical acts require an independent medical specialist validation step (Attending / Consultant Pathologist).'])),
  ...Object.fromEntries(UK_JURISDICTIONS.map(j => [j, 'Royal College of Pathologists (RCPath) guidelines explicitly dictate task-shifting limits — BMS primary reporting requires strict credentialing and supervision. Consultant Histopathologist signs off.'])),
  IE: 'Medical Council of Ireland rules mandate that only specialists on the Specialist Division can assume ultimate legal liability and final sign-off (Consultant Histopathologist, RCPI registered).',
  CA: 'Provincial medical colleges (such as the CPSO) and RCPSC guidelines enforce attending oversight for all resident diagnostic sign-outs (FRCPC).',
  KR: 'Ministry of Health and Welfare (MHW) regulations dictate that official medical reports must be validated and legally signed by a board-certified specialist (Jeon-mun-ui).',
};

type TierFlags = { canFinalize: boolean; requiresCountersign: boolean };
const SCREENER:   TierFlags = { canFinalize: false, requiresCountersign: true  };
const REVIEWER:   TierFlags = { canFinalize: false, requiresCountersign: false };
const SUPERVISOR: TierFlags = { canFinalize: true,  requiresCountersign: false };

/** Builds a real jurisdictionProfiles map from per-jurisdiction local titles. */
function profiles(labels: Partial<Record<Jurisdiction, string>>, flags: TierFlags): ParticipationTypeRecord['jurisdictionProfiles'] {
  return Object.fromEntries(
    (Object.keys(labels) as Jurisdiction[]).map(j => [j, { label: labels[j], regulatoryNote: REGULATORY_NOTE[j], ...flags }]),
  );
}
const eu = (label: string) => Object.fromEntries(EU_MEMBER_STATES.map(j => [j, label])) as Partial<Record<Jurisdiction, string>>;
const uk = (label: string) => Object.fromEntries(UK_JURISDICTIONS.map(j => [j, label])) as Partial<Record<Jurisdiction, string>>;

const SCREENER_PROFILES = profiles({
  AU: 'Registrar / Trainee',
  NZ: 'Registrar / Trainee',
  ...eu('Resident / Trainee'),
  ...uk('Trainee Pathologist'),
  IE: 'Registrar / Trainee',
  CA: 'Resident / Fellow',
  KR: 'Resident (Jeon-gong-ui)',
}, SCREENER);

const REVIEWER_PROFILES = profiles({
  AU: 'Senior Registrar / Fellow / Consultant',
  NZ: 'Senior Registrar / Specialist',
  ...eu('Senior Resident / Specialist Pathologist'),
  ...uk('Consultant (Second Reviewer)'),
  IE: 'Senior Registrar / Consultant',
  CA: 'Senior Fellow / Attending Pathologist',
  KR: 'Senior Resident / Fellow',
}, REVIEWER);

const SUPERVISOR_TITLES: Partial<Record<Jurisdiction, string>> = {
  AU: 'Specialist Pathologist (FRCPA)',
  NZ: 'Specialist Pathologist (FRCPA)',
  ...eu('Attending / Consultant Pathologist'),
  ...uk('Consultant Histopathologist'),
  IE: 'Consultant Histopathologist (RCPI)',
  CA: 'Attending Pathologist (FRCPC)',
  KR: 'Specialist Pathologist (Jeon-mun-ui)',
};
const PRIMARY_PROFILES = profiles(SUPERVISOR_TITLES, SUPERVISOR);
// 'attending' is the co-signing/supervising variant of the same
// specialist tier — suffixed so the two stay distinguishable on a case
// team in the same jurisdiction, never shown as two identical labels.
const ATTENDING_PROFILES = profiles(
  Object.fromEntries(Object.entries(SUPERVISOR_TITLES).map(([j, l]) => [j, `${l} — Supervising / Co-Signer`])),
  SUPERVISOR,
);

// ─── Seed data — the ONE canonical list, per Pete's final refined role list ──

const SEED: ParticipationTypeRecord[] = [
  { id: 'primary',          label: 'Attending / Primary Pathologist', description: 'The credentialed pathologist responsible for final sign-out and diagnosis.',                                                                                              color: '#8AB4F8', icon: '🔬',   allowsMultiple: false, requiresNote: false, active: true, isSystem: true, sortOrder: 1, abbreviation: 'PATH',  requiresCountersign: false, canFinalize: true,  canBeAssignedTemplate: true,  canViewWholeCase: true  },
  { id: 'resident',         label: 'Resident / Fellow',               description: 'Trainee drafting the report; requires Attending co-signature.',                                                                                                              color: '#60a5fa', icon: '🎓',   allowsMultiple: true,  requiresNote: false, active: true, isSystem: true, sortOrder: 2, abbreviation: 'RES',   requiresCountersign: true,  canFinalize: false, canBeAssignedTemplate: true,  canViewWholeCase: true  },
  { id: 'attending',        label: 'Co-Signer / Supervisor',          description: 'Supervising/co-signing pathologist — covers resident and fellow oversight (CLIA/CAP/ACGME), FPPE proctoring for onboarding attendings, PA gross-description sign-off, and mandatory QA double-reads.', color: '#818cf8', icon: '👨‍⚕️', allowsMultiple: false, requiresNote: false, active: true, isSystem: true, sortOrder: 3, abbreviation: 'ATT',   requiresCountersign: false, canFinalize: true,  canBeAssignedTemplate: true,  canViewWholeCase: true  },
  { id: 'grossing',         label: 'Grossing / PA',                   description: 'Pathologist Assistant, Resident, or Histotech who performed the gross examination and dissection.',                                                                          color: '#81C995', icon: '✂️',   allowsMultiple: true,  requiresNote: false, active: true, isSystem: true, sortOrder: 4, abbreviation: 'GROSS', requiresCountersign: true,  canFinalize: false, canBeAssignedTemplate: false, canViewWholeCase: true  },
  { id: 'cytotechnologist', label: 'Cytotechnologist',                description: 'Screened cytology slides and provided initial diagnostic triage/assessment.',                                                                                              color: '#f59e0b', icon: '🧫',   allowsMultiple: true,  requiresNote: false, active: true, isSystem: true, sortOrder: 5, abbreviation: 'CYTO',  requiresCountersign: true,  canFinalize: false, canBeAssignedTemplate: true,  canViewWholeCase: false },
  { id: 'consultant',       label: 'Consultant / Subspecialist',      description: 'Internal expert or subspecialist reviewing slides for internal consultation.',                                                                                             color: '#38bdf8', icon: '💬',   allowsMultiple: true,  requiresNote: true,  active: true, isSystem: true, sortOrder: 6, abbreviation: 'CONS',  requiresCountersign: false, canFinalize: false, canBeAssignedTemplate: true,  canViewWholeCase: false },
  { id: 'frozen',           label: 'Frozen Section Pathologist',      description: 'Pathologist who performed/interpreted the intraoperative frozen section diagnosis.',                                                                                       color: '#4ade80', icon: '🧊',   allowsMultiple: false, requiresNote: false, active: true, isSystem: true, sortOrder: 7, abbreviation: 'FS',    requiresCountersign: true,  canFinalize: false, canBeAssignedTemplate: true,  canViewWholeCase: false },
  { id: 'second_opinion',   label: 'Second Opinion',                  description: 'Secondary attending performing a mandatory QA double-read (e.g. breast/prostate core QA).',                                                                               color: '#818cf8', icon: '🔎',   allowsMultiple: true,  requiresNote: false, active: true, isSystem: true, sortOrder: 8, abbreviation: '2nd Op', requiresCountersign: false, canFinalize: false, canBeAssignedTemplate: true,  canViewWholeCase: true  },
  { id: 'provisional_hire', label: 'Provisional Hire (FPPE)',         description: 'Fully credentialed pathologist under initial Focused Professional Practice Evaluation — proctor countersign required until the defined FPPE review period concludes. Not a trainee; the countersign requirement is a temporary onboarding policy, not a credentialing limitation.', color: '#fbbf24', icon: '🪪',   allowsMultiple: true,  requiresNote: false, active: true, isSystem: true, sortOrder: 9, abbreviation: 'FPPE',  requiresCountersign: true,  canFinalize: false, canBeAssignedTemplate: true,  canViewWholeCase: true  },

  // ── Country-scoped regional roles (real, per Pete's own per-country data) ──
  // Not a local title for a universal role — a non-physician scientist
  // with a real, jurisdiction-specific reporting scope that has no
  // equivalent legal standing in the US, Canada, or South Korea's models.
  // Pete's data lists the Biomedical Scientist as a Screener in both the
  // UK and the EU; the Advanced Practitioner tier as a Second Reviewer
  // in the UK only. Both default to "cannot finalize, countersign
  // required" (RCPath: BMS primary reporting requires strict
  // credentialing and supervision) — a lab that has actually credentialed
  // a specific BMS for independent reporting grants that through the
  // facility-level authorityOverrides, the genuine lab-level exception
  // mechanism, never by loosening this country-wide default.
  { id: 'biomedical_scientist',      label: 'Biomedical Scientist (BMS)',   description: 'Non-physician scientist performing primary screening/reporting under supervision — a real, jurisdiction-specific role (UK RCPath/IBMS; EU member-state national frameworks). Not offered outside its scoped jurisdictions.', color: '#2dd4bf', icon: '🧪', allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 10, abbreviation: 'BMS',    requiresCountersign: true, canFinalize: false, canBeAssignedTemplate: true, canViewWholeCase: true,
    scopedJurisdictions: [...UK_JURISDICTIONS, ...EU_MEMBER_STATES],
    jurisdictionProfiles: profiles({ ...uk('Biomedical Scientist (BMS)'), ...eu('Biomedical Scientist') }, SCREENER) },
  { id: 'bms_advanced_practitioner', label: 'Advanced Practitioner BMS',    description: 'UK Advanced Practitioner Biomedical Scientist acting as Second Reviewer under RCPath task-shifting guidelines — strictly UK-scoped; this role and its reporting scope have no legal equivalent elsewhere.', color: '#14b8a6', icon: '🧬', allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 11, abbreviation: 'AP-BMS', requiresCountersign: true, canFinalize: false, canBeAssignedTemplate: true, canViewWholeCase: true,
    scopedJurisdictions: [...UK_JURISDICTIONS],
    jurisdictionProfiles: profiles(uk('Advanced Practitioner BMS'), SCREENER) },
];

// Attach the per-jurisdiction profiles to the global baseline types
// (kept out of the literal rows above so those rows stay readable).
const JURISDICTION_PROFILES_BY_TYPE: Record<string, ParticipationTypeRecord['jurisdictionProfiles']> = {
  resident:   SCREENER_PROFILES,
  consultant: REVIEWER_PROFILES,
  primary:    PRIMARY_PROFILES,
  attending:  ATTENDING_PROFILES,
};
for (const t of SEED) {
  if (JURISDICTION_PROFILES_BY_TYPE[t.id]) t.jurisdictionProfiles = JURISDICTION_PROFILES_BY_TYPE[t.id];
}

/**
 * Real, non-destructive upgrade of an already-persisted list: an
 * existing browser's stored list predates the jurisdiction data above,
 * and `storageGet` would otherwise keep serving that old list forever
 * (the new BMS types and every jurisdiction profile would silently never
 * appear). Bumping the storage key instead would throw away any real
 * admin edits. So: append any system seed type missing entirely, and
 * backfill `jurisdictionProfiles`/`scopedJurisdictions` onto a stored
 * system type only where the stored record has none — an admin's own
 * edits (including a deliberately-cleared profile set to {}) are never
 * overwritten. Exported for direct testing.
 */
export function mergeSeedJurisdictionData(stored: ParticipationTypeRecord[], seed: ParticipationTypeRecord[] = SEED): ParticipationTypeRecord[] {
  const merged = stored.map(s => {
    const seedRow = seed.find(x => x.id === s.id);
    if (!seedRow || !s.isSystem) return s;
    return {
      ...s,
      jurisdictionProfiles: s.jurisdictionProfiles ?? seedRow.jurisdictionProfiles,
      scopedJurisdictions:  s.scopedJurisdictions  ?? seedRow.scopedJurisdictions,
    };
  });
  const missing = seed.filter(x => x.isSystem && !stored.some(s => s.id === x.id));
  return [...merged, ...missing];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORE_KEY = 'pathscribe_participation_types_v2';

const load    = () => mergeSeedJurisdictionData(storageGet<ParticipationTypeRecord[]>(STORE_KEY, SEED));
const persist = (data: ParticipationTypeRecord[]) => storageSet(STORE_KEY, data);

let _cache: ParticipationTypeRecord[] = load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok    = <T>(data: T): ServiceResult<T>    => ({ ok: true,  data });
const err   = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });
const delay = () => new Promise(r => setTimeout(r, 60));
const sorted = (list: ParticipationTypeRecord[]) =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder);

// ─── Service ──────────────────────────────────────────────────────────────────

export const mockParticipationTypeService: IParticipationTypeService = {

  async getAll() {
    await delay();
    return ok(sorted(_cache).map(t => ({ ...t })));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache).filter(t => t.active).map(t => ({ ...t })));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(t => t.id === id);
    return found ? ok({ ...found }) : err(`ParticipationType ${id} not found`);
  },

  async add(type: NewParticipationType) {
    await delay();
    const maxOrder = _cache.reduce((m, t) => Math.max(m, t.sortOrder), 0);
    const created: ParticipationTypeRecord = {
      ...type,
      id:        'CUSTOM_' + Date.now(),
      isSystem:  false,
      sortOrder: maxOrder + 1,
    };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<ParticipationTypeRecord>) {
    await delay();
    const idx = _cache.findIndex(t => t.id === id);
    if (idx === -1) return err(`ParticipationType ${id} not found`);
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(t => t.id === id ? { ...t, ...safeChanges } : t);
    persist(_cache);
    return ok({ ..._cache.find(t => t.id === id)! });
  },

  async deactivate(id: ID) {
    return mockParticipationTypeService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockParticipationTypeService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(t => t.id === id);
    if (!target)         return err(`ParticipationType ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system type "${id}"`);
    _cache = _cache.filter(t => t.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

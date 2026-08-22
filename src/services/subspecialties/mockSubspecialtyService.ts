// src/services/subspecialties/mockSubspecialtyService.ts
import { ISubspecialtyService, Subspecialty } from './ISubspecialtyService';
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const SEED_SUBSPECIALTIES: Subspecialty[] = [
  {
    id: 'gi', name: 'Gastrointestinal',
    description: 'GI tract and hepatobiliary pathology.',
    userIds: ['1', '7'], specimenIds: ['sp1', 'sp2'], clientIds: ['c1'],
    // Real fix, per direct report: seeded case data has real, hardcoded
    // pool cases (MFT26-8807-POOL, S26-4415-BX-001) pointing to this
    // pool by name — but this record's own isWorkgroup was false,
    // meaning Configuration's own "Create Workgroup" toggle showed
    // this pool as disabled while the worklist plainly showed it
    // active. The two were never actually connected in the seed data;
    // this makes them consistent so the admin config accurately
    // reflects what's really happening.
    isWorkgroup: true,
    // Real fix, per direct follow-up report: the earlier fix that made
    // isWorkgroupEnabled mirror isWorkgroup only applied going forward,
    // on new saves through the admin UI — it never touched this
    // existing seed record, so enforcement stayed silently off here
    // even after isWorkgroup above was corrected to true. Same
    // principle, applied to existing data, not just future saves.
    isWorkgroupEnabled: true, active: true, status: 'Active',
  },
  {
    id: 'breast', name: 'Breast',
    description: 'Breast pathology including oncology and benign disease.',
    userIds: ['1', '6'], specimenIds: ['sp3'], clientIds: ['c1', 'c2'],
    isWorkgroup: false,
    isWorkgroupEnabled: false, active: true, status: 'Active',
  },
  {
    id: 'derm', name: 'Dermatopathology',
    description: 'Skin and soft tissue pathology.',
    userIds: ['6'], specimenIds: ['sp4', 'sp5'], clientIds: [],
    // Real fix — same reasoning as 'gi' above: a real, hardcoded pool
    // case (S26-4416-BX-001) exists for this pool by name.
    isWorkgroup: true,
    // Same follow-up fix as 'gi' above — isWorkgroupEnabled now
    // matches isWorkgroup for this existing record too.
    isWorkgroupEnabled: true, active: true, status: 'Active',
  },
  {
    id: 'neuro', name: 'Neuropathology',
    description: 'CNS and peripheral nervous system pathology.',
    userIds: ['6'], specimenIds: ['sp6'], clientIds: [],
    isWorkgroup: false,
    isWorkgroupEnabled: false, active: true, status: 'Active',
  },
  {
    id: 'heme', name: 'Hematopathology',
    description: 'Blood, bone marrow, and lymph node pathology.',
    userIds: ['9'], specimenIds: ['sp7'], clientIds: ['c3'],
    isWorkgroup: false,
    isWorkgroupEnabled: false, active: true, status: 'Active',
  },
  {
    id: 'gyn', name: 'Gynecological',
    description: 'Female reproductive tract pathology.',
    userIds: ['1'], specimenIds: ['sp8'], clientIds: [],
    // Real fix — same reasoning as 'gi' above: a real, hardcoded pool
    // case (MPA26-1006-POOL) exists for this pool. Its own poolName
    // was also separately fixed from 'Gynaecologic Pathology' to
    // this record's real name — see mockCaseService.ts's own comment
    // at that case for the full story.
    isWorkgroup: true,
    // Same follow-up fix as 'gi' above — isWorkgroupEnabled now
    // matches isWorkgroup for this existing record too.
    isWorkgroupEnabled: true, active: true, status: 'Active',
  },
  {
    id: 'uro', name: 'Urological',
    description: 'Urinary tract and male reproductive pathology.',
    userIds: ['7'], specimenIds: ['sp9'], clientIds: [],
    // Real fix — same reasoning as 'gi' above. Its own poolName was
    // also separately fixed from 'Uropathology' to this record's real
    // name — see mockCaseService.ts's own comment at that case.
    isWorkgroup: true,
    // Same follow-up fix as 'gi' above — isWorkgroupEnabled now
    // matches isWorkgroup for this existing record too.
    isWorkgroupEnabled: true, active: true, status: 'Active',
  },
  {
    id: 'thoracic', name: 'Thoracic',
    description: 'Pulmonary and mediastinal pathology.',
    userIds: [], specimenIds: [], clientIds: [],
    isWorkgroup: false,
    isWorkgroupEnabled: false, active: true, status: 'Active',
  },
  // ── Workgroup example ─────────────────────────────────────────────────────
  {
    id: 'oncology-pool', name: 'Oncology Pool',
    description: 'Shared queue for general oncology cases — any member can claim.',
    userIds: ['1', '6', '7', '9'], specimenIds: [], clientIds: ['c1', 'c2', 'c4'],
    isWorkgroup: true,
    isWorkgroupEnabled: false, active: true, status: 'Active',
  },
  // Real feature, per direct product decision: a read-only entry
  // describing the automatic fallback pool. This id/name pair must
  // match casePoolAssignmentService.ts's own DEFAULT_ROUTING_CONFIG
  // (fallbackPoolId: 'general', fallbackPoolName: 'General Pathology')
  // exactly — that service was already silently routing unmatched
  // cases here with zero visible, admin-editable record behind it.
  // isWorkgroupEnabled stays false deliberately, not as an oversight
  // to fix later: restricting the one pool that exists specifically to
  // catch cases nothing else matched would defeat its own purpose —
  // any pathologist should be able to pick up stray, unmatched work.
  {
    id: 'general', name: 'General Pathology',
    description: 'Automatic fallback for cases that don\u2019t match any subspecialty routing rule. Not user-configurable — managed by the system\u2019s own case-routing logic.',
    userIds: [], specimenIds: [], clientIds: [],
    isWorkgroup: true,
    isWorkgroupEnabled: false, active: true, status: 'Active',
    isSystemManaged: true,
  },
];

// Migrate legacy entries that may not have new fields
const migrate = (s: any): Subspecialty => ({
  ...s,
  description:  s.description  ?? '',
  clientIds:    s.clientIds    ?? [],
  isWorkgroup:  s.isWorkgroup  ?? false,
  active:       s.active       ?? (s.status === 'Active'),
});

const load    = () => storageGet<Subspecialty[]>('pathscribe_subspecialties', SEED_SUBSPECIALTIES).map(migrate);
const persist = (data: Subspecialty[]) => storageSet('pathscribe_subspecialties', data);
let MOCK_SUBSPECIALTIES: Subspecialty[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

const findAndUpdate = (id: ID, fn: (s: Subspecialty) => Subspecialty): ServiceResult<Subspecialty> => {
  const idx = MOCK_SUBSPECIALTIES.findIndex(s => s.id === id);
  if (idx === -1) return err(`Subspecialty ${id} not found`);
  const updated = fn(MOCK_SUBSPECIALTIES[idx]);
  MOCK_SUBSPECIALTIES = MOCK_SUBSPECIALTIES.map(s => s.id === id ? updated : s);
  persist(MOCK_SUBSPECIALTIES);
  return ok({ ...updated });
};

export const mockSubspecialtyService: ISubspecialtyService = {
  async getAll() { await delay(); return ok([...MOCK_SUBSPECIALTIES]); },

  async getById(id) {
    await delay();
    const s = MOCK_SUBSPECIALTIES.find(s => s.id === id);
    return s ? ok({ ...s }) : err(`Subspecialty ${id} not found`);
  },

  async add(sub) {
    await delay();
    const newSub: Subspecialty = {
      ...sub,
      id:          sub.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      description: sub.description ?? '',
      clientIds:   sub.clientIds   ?? [],
      isWorkgroup: sub.isWorkgroup  ?? false,
      active:      sub.active       ?? true,
    };
    MOCK_SUBSPECIALTIES = [...MOCK_SUBSPECIALTIES, newSub];
    persist(MOCK_SUBSPECIALTIES);
    return ok({ ...newSub });
  },

  async update(id, changes) {
    await delay();
    return findAndUpdate(id, s => ({ ...s, ...changes }));
  },

  async deactivate(id) {
    await delay();
    return findAndUpdate(id, s => ({ ...s, status: 'Inactive', active: false, userIds: [], specimenIds: [] }));
  },

  async reactivate(id) {
    await delay();
    return findAndUpdate(id, s => ({ ...s, status: 'Active', active: true }));
  },

  async assignUser(subspecialtyId, userId) {
    await delay();
    return findAndUpdate(subspecialtyId, s => ({
      ...s, userIds: s.userIds.includes(userId) ? s.userIds : [...s.userIds, userId],
    }));
  },

  async removeUser(subspecialtyId, userId) {
    await delay();
    return findAndUpdate(subspecialtyId, s => ({ ...s, userIds: s.userIds.filter(id => id !== userId) }));
  },

  async assignSpecimen(subspecialtyId, specimenId) {
    await delay();
    return findAndUpdate(subspecialtyId, s => ({
      ...s, specimenIds: s.specimenIds.includes(specimenId) ? s.specimenIds : [...s.specimenIds, specimenId],
    }));
  },

  async removeSpecimen(subspecialtyId, specimenId) {
    await delay();
    return findAndUpdate(subspecialtyId, s => ({ ...s, specimenIds: s.specimenIds.filter(id => id !== specimenId) }));
  },
};

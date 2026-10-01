// src/services/departments/mockDepartmentService.ts
import type { IDepartmentService, Department } from './IDepartmentService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ─── Seed data ──────────────────────────────────────────────────────────────
// One department per existing Grossing Route (protocolShared.tsx's three
// PROTOCOL_REGISTRY entries with isDiagnostic: false), plus one deliberately
// Unverified/autoCreated example so the admin approval screen has something
// to show before any real order intake exists.
const SEED_DEPARTMENTS: Department[] = [
  {
    id: 'cat-surgical-tissue',
    name: 'Surgical Tissue',
    description: 'Solid tissue biopsies and resections — sectioned, measured, inked, submitted for histology. Core needle biopsy, excisional biopsy, lumpectomy, colectomy, hysterectomy, lobectomy, radical prostatectomy, lymph node dissection, skin excision.',
    defaultGrossingTemplateId: 'grossing_standard_tissue',
    status: 'Active',
  },
  {
    id: 'cat-fluid-cytology',
    name: 'Fluid / Cytology',
    description: 'Fluid, wash, or cytological specimens processed for cell block/smear rather than sectioning. Pleural fluid, peritoneal lavage, BAL, urine cytology, CSF, ascites, pericardial fluid, thyroid FNA, bronchial wash.',
    defaultGrossingTemplateId: 'grossing_fluid_cytology',
    status: 'Active',
  },
  {
    id: 'cat-histology-only',
    name: 'Histology-Only / Consultation',
    description: 'Previously processed specimens needing histology prep only — no grossing steps. Outside consultation slides, previously embedded tissue for re-cut/re-stain, decalcified bone already grossed elsewhere, EM specimens.',
    defaultGrossingTemplateId: 'grossing_histology_only',
    status: 'Active',
  },
  // Deliberately Unverified/autoCreated — gives the admin approval screen
  // (once built) something real to display before any live order intake
  // exists, same reasoning as ph4/ph6 in mockPhysicianService.ts.
  // Deliberately left with no CaseMask of its own: this isn't a settled
  // real department yet (that's the whole point of Unverified), and in
  // real practice a frozen section is a phase within its parent
  // surgical case, not a separately-accessioned specimen type — falling
  // through to the next real scope candidate by default is
  // operationally correct here, not just unconfigured.
  {
    id: 'cat-auto-000001',
    name: 'Frozen Section',
    description: '',
    defaultGrossingTemplateId: 'grossing_standard_tissue',
    status: 'Unverified',
    autoCreated: true,
    autoCreatedAt: '2026-06-15',
    autoCreatedNote: 'No crosswalk match for order code "FRZ-INTRAOP" from facility c2 — defaulted to Surgical Tissue\'s Grossing Template pending admin review.',
  },
];

const load    = () => storageGet<Department[]>('pathscribe_departments', SEED_DEPARTMENTS);
const persist = (data: Department[]) => storageSet('pathscribe_departments', data);
let DEPARTMENTS: Department[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockDepartmentService: IDepartmentService = {
  async getAll() {
    await delay();
    return ok([...DEPARTMENTS]);
  },

  async getById(id: ID) {
    await delay();
    const c = DEPARTMENTS.find(c => c.id === id);
    return c ? ok({ ...c }) : err(`Department ${id} not found`);
  },

  async add(department) {
    await delay();
    const newC: Department = { ...department, id: 'dept-' + Date.now() };
    DEPARTMENTS = [...DEPARTMENTS, newC];
    persist(DEPARTMENTS);
    return ok({ ...newC });
  },

  async update(id, changes) {
    await delay();
    const idx = DEPARTMENTS.findIndex(c => c.id === id);
    if (idx === -1) return err(`Department ${id} not found`);
    DEPARTMENTS = DEPARTMENTS.map(c => c.id === id ? { ...c, ...changes } : c);
    return ok({ ...DEPARTMENTS[idx], ...changes });
  },

  async verify(id) {
    return mockDepartmentService.update(id, { status: 'Active' });
  },

  async deactivate(id) {
    return mockDepartmentService.update(id, { status: 'Inactive' });
  },

  async findOrCreateByName(name, note) {
    await delay();
    // Case-insensitive exact match on name — same "don't fuzzy-match
    // silently" posture as the crosswalk design: a near-miss should
    // create a new pending department for a human to reconcile (e.g. merge
    // with an existing one), not get quietly folded into something that
    // might be a different workflow than the admin intended.
    const existing = DEPARTMENTS.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return ok({ ...existing });

    const newC: Department = {
      id: 'cat-auto-' + Date.now(),
      name,
      description: '',
      defaultGrossingTemplateId: 'grossing_standard_tissue', // conservative fallback — same default evaluateGrossingTemplateAssignment fails open to
      status: 'Unverified',
      autoCreated: true,
      autoCreatedAt: new Date().toISOString().split('T')[0],
      autoCreatedNote: note,
    };
    DEPARTMENTS = [...DEPARTMENTS, newC];
    persist(DEPARTMENTS);
    return ok({ ...newC });
  },
};

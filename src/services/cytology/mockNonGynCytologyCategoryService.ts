// src/services/cytology/mockNonGynCytologyCategoryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Seed data verified directly against current, published sources
// before writing — not improvised. See INonGynCytologyCategoryService.ts's
// own header for the full source account.
//
// Milan (MSRSGC) risk-of-malignancy figures are the real, widely-
// cited canonical set (consistent across the ARUP teaching slide
// deck and multiple peer-reviewed validation studies): ND 25%,
// Non-Neoplastic 10%, AUS 20%, Benign <5%, SUMP 35%, Suspicious 60%,
// Malignant 90%.
//
// Paris (TPS 2.0) riskOfMalignancyPercent is deliberately left unset
// on every entry: confirmed directly that published ROM/ROHM figures
// vary meaningfully across studies and — for NHGUC specifically — the
// second edition's own consolidation of the former LGUN category into
// NHGUC means older, pre-2022 figures are not cleanly applicable to
// the current category structure. Rather than cite a number without a
// single, clearly-canonical current source (unlike Milan's), this is
// left honestly blank.
// ─────────────────────────────────────────────────────────────────────────────

import type { INonGynCytologyCategoryService, NonGynCytologyCategoryEntry, NonGynCytologySystem, NewNonGynCytologyCategoryEntry } from './INonGynCytologyCategoryService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'nonGynCytologyCategories';

const SEED: NonGynCytologyCategoryEntry[] = [
  // Milan System for Reporting Salivary Gland Cytopathology (MSRSGC), 2nd edition.
  { id: 'ngc-milan-1', system: 'milan', categoryNumber: 'I', label: 'Non-Diagnostic', description: 'Insufficient cellular material or specimen quality for a real diagnostic interpretation.', riskOfMalignancyPercent: 25, requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-milan-2', system: 'milan', categoryNumber: 'II', label: 'Non-Neoplastic', description: 'Diagnostic material consistent with a real, non-neoplastic process (e.g. sialadenitis, cyst content).', riskOfMalignancyPercent: 10, requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-milan-3', system: 'milan', categoryNumber: 'III', label: 'Atypia of Undetermined Significance', abbreviation: 'AUS', description: 'Cytologic atypia exceeding a benign/reactive process, but not diagnostic of neoplasm.', riskOfMalignancyPercent: 20, requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-milan-4a', system: 'milan', categoryNumber: 'IVA', label: 'Neoplasm: Benign', description: 'Diagnostic of a specific, real benign salivary gland neoplasm (e.g. pleomorphic adenoma, Warthin tumor).', riskOfMalignancyPercent: 5, requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-milan-4b', system: 'milan', categoryNumber: 'IVB', label: 'Salivary Gland Neoplasm of Uncertain Malignant Potential', abbreviation: 'SUMP', description: 'A real neoplasm whose cytologic features cannot reliably distinguish a benign from a low-grade malignant counterpart.', riskOfMalignancyPercent: 35, requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-milan-5', system: 'milan', categoryNumber: 'V', label: 'Suspicious for Malignancy', description: 'Features strongly favor malignancy but fall short of a definitive diagnosis.', riskOfMalignancyPercent: 60, requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-milan-6', system: 'milan', categoryNumber: 'VI', label: 'Malignant', description: 'Diagnostic of malignancy — subclassified into specific type and grade where cytologically feasible.', riskOfMalignancyPercent: 90, requiresPathologistReview: true, active: true, isSystem: true },

  // The Paris System for Reporting Urinary Cytology (TPS), 2nd edition (2022).
  { id: 'ngc-paris-1', system: 'paris_urinary', categoryNumber: 'I', label: 'Nondiagnostic / Unsatisfactory', description: 'Insufficient cellularity, obscuring factors, or poor preservation precluding a real evaluation for high-grade urothelial carcinoma.', requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-paris-2', system: 'paris_urinary', categoryNumber: 'II', label: 'Negative for High-Grade Urothelial Carcinoma', abbreviation: 'NHGUC', description: 'No cytologic evidence of high-grade urothelial carcinoma. Per the second edition (TPS 2.0), the former, separate Low-Grade Urothelial Neoplasm category is incorporated here — cytology cannot reliably distinguish low-grade lesions.', requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-paris-3', system: 'paris_urinary', categoryNumber: 'III', label: 'Atypical Urothelial Cells', abbreviation: 'AUC', description: 'Urothelial cells with atypia exceeding reactive change, but insufficient for a suspicious or positive interpretation.', requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-paris-4', system: 'paris_urinary', categoryNumber: 'IV', label: 'Suspicious for High-Grade Urothelial Carcinoma', abbreviation: 'SHGUC', description: 'Features highly suggestive of, but quantitatively or qualitatively insufficient for, a definitive diagnosis of high-grade urothelial carcinoma.', requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-paris-5', system: 'paris_urinary', categoryNumber: 'V', label: 'High-Grade Urothelial Carcinoma', abbreviation: 'HGUC', description: 'Diagnostic of high-grade urothelial carcinoma.', requiresPathologistReview: true, active: true, isSystem: true },
  { id: 'ngc-paris-6', system: 'paris_urinary', categoryNumber: 'VI', label: 'Other Malignancies (Primary or Metastatic)', description: 'A real, non-urothelial primary or metastatic malignancy identified in the specimen.', requiresPathologistReview: true, active: true, isSystem: true },
];

const load = (): NonGynCytologyCategoryEntry[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: NonGynCytologyCategoryEntry[]) => storageSet(STORAGE_KEY, data);
let _cache: NonGynCytologyCategoryEntry[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockNonGynCytologyCategoryService: INonGynCytologyCategoryService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getActive() {
    await delay();
    return ok(_cache.filter(e => e.active));
  },

  async getBySystem(system: NonGynCytologySystem) {
    await delay();
    return ok(_cache.filter(e => e.system === system && e.active));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(e => e.id === id);
    return found ? ok({ ...found }) : err(`NonGynCytologyCategoryEntry ${id} not found`);
  },

  async add(entry: NewNonGynCytologyCategoryEntry) {
    await delay();
    const created: NonGynCytologyCategoryEntry = { ...entry, id: 'ngc-custom-' + Date.now(), isSystem: false };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`NonGynCytologyCategoryEntry ${id} not found`);
    _cache = _cache.map(e => e.id === id ? { ...e, ...changes } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockNonGynCytologyCategoryService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockNonGynCytologyCategoryService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target) return err(`NonGynCytologyCategoryEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system category "${id}".`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

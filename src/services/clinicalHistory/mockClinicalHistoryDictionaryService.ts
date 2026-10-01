// src/services/clinicalHistory/mockClinicalHistoryDictionaryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IClinicalHistoryDictionaryService. Reads/
// writes localStorage — same "dev mock / live Firestore" split as
// every other dictionary service in this app.
//
// Seed data grounded in real, researched sources rather than
// invented: real oncologic-imaging-requisition parameters (Radiology,
// RSNA, 2026 — primary diagnosis, other malignancy, prior surgery,
// prior radiation/chemotherapy, tumor markers), a real, published
// pathology requisition form (Libre Pathology — prior biopsy, history
// of cancer + primary site, clinical stage, exposure history), real
// oncology history-taking standards (smoking history, occupational
// carcinogens, family history of malignancy, B-symptoms), and real
// clinical-trial SAP categorization of prior anti-cancer therapy
// (chemo/anthracycline, chemo/non-anthracycline, hormonal, biologic).
//
// The spec's own PRIOR_PATH example (HX_ABNL_CYTO_01) is seeded
// exactly as given. Per direct guidance following "why is LMP a
// dictionary?": priorAbnormalPapHpvHistory (Patient.ts) is real,
// genuine PRIOR_PATH material — a dated, referenceable prior event,
// not a standalone fact — and is represented here as
// HX_PRIOR_ABNL_PAP_HPV; iudOrContraceptionUse stays a simple field on
// Patient.ts, the same real reasoning as hormonalStatus, and has no
// entry here.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IClinicalHistoryDictionaryService,
  ClinicalHistoryDictionaryEntry,
  ClinicalHistoryCategoryCode,
  NewClinicalHistoryDictionaryEntry,
} from './IClinicalHistoryDictionaryService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'clinicalHistoryDictionary';

const SEED: ClinicalHistoryDictionaryEntry[] = [
  // ── SCR — Screening ──
  { id: 'HX_SCR_ROUTINE', categoryCode: 'SCR', displayText: 'Routine Screening', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 1 },
  { id: 'HX_SCR_DIAGNOSTIC_WORKUP', categoryCode: 'SCR', displayText: 'Diagnostic Workup for Symptom', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 2 },
  { id: 'HX_SCR_POST_TX_SURVEILLANCE', categoryCode: 'SCR', displayText: 'Post-Treatment Surveillance', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 3 },

  // ── SYM — Symptoms (real, per RSNA 2026 "acute or worsening symptoms" and real oncology B-symptoms) ──
  { id: 'HX_SYM_ACUTE_WORSENING', categoryCode: 'SYM', displayText: 'Acute or Worsening Symptoms', requiredMetadataSchema: [{ key: 'symptom_detail', label: 'Symptom Detail', type: 'text', required: true }], active: true, isSystem: true, sortOrder: 1 },
  { id: 'HX_SYM_PALPABLE_MASS', categoryCode: 'SYM', displayText: 'Palpable Mass', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 2 },
  { id: 'HX_SYM_ABNORMAL_BLEEDING', categoryCode: 'SYM', displayText: 'Abnormal Bleeding', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 3 },
  { id: 'HX_SYM_B_SYMPTOMS', categoryCode: 'SYM', displayText: 'B Symptoms (Unexplained Weight Loss, Night Sweats, Fatigue)', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 4 },

  // ── RAD_LAB — Radiology / Lab (real, per RSNA 2026 "prior imaging findings" and "relevant tumor markers") ──
  { id: 'HX_RADLAB_PRIOR_IMAGING', categoryCode: 'RAD_LAB', displayText: 'Prior Imaging Findings', requiredMetadataSchema: [{ key: 'imaging_finding', label: 'Finding', type: 'text', required: true }, { key: 'imaging_date', label: 'Date', type: 'date', required: false }], active: true, isSystem: true, sortOrder: 1 },
  { id: 'HX_RADLAB_TUMOR_MARKER', categoryCode: 'RAD_LAB', displayText: 'Relevant Tumor Marker', requiredMetadataSchema: [{ key: 'marker_name', label: 'Marker', type: 'text', required: true }, { key: 'marker_value', label: 'Value', type: 'text', required: false }], active: true, isSystem: true, sortOrder: 2 },
  { id: 'HX_RADLAB_ABNORMAL_RESULT', categoryCode: 'RAD_LAB', displayText: 'Abnormal Lab Result', requiredMetadataSchema: [{ key: 'result_detail', label: 'Result Detail', type: 'text', required: true }], active: true, isSystem: true, sortOrder: 3 },

  // ── PRIOR_PATH — Prior Pathology (real, per the spec's own example + Libre Pathology "previous biopsy") ──
  { id: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', displayText: 'Prior Abnormal Cytology', requiredMetadataSchema: [
    { key: 'prior_accession_number', label: 'Prior Accession Number', type: 'text', required: true },
    { key: 'prior_date', label: 'Prior Date', type: 'date', required: true },
  ], active: true, isSystem: true, sortOrder: 1 },
  // Real, per direct guidance following "why is LMP a dictionary?" —
  // migrates Patient.ts's own priorAbnormalPapHpvHistory free-text
  // field into a real, structured PRIOR_PATH entry (a dated,
  // referenceable prior event, the same real shape as HX_ABNL_CYTO_01
  // above), while iudOrContraceptionUse stays a simple field, the same
  // real reasoning as hormonalStatus.
  { id: 'HX_PRIOR_ABNL_PAP_HPV', categoryCode: 'PRIOR_PATH', displayText: 'Prior Abnormal Pap/HPV Result', requiredMetadataSchema: [
    { key: 'prior_accession_number', label: 'Prior Accession Number', type: 'text', required: false },
    { key: 'prior_date', label: 'Prior Date', type: 'date', required: false },
    { key: 'prior_diagnosis', label: 'Prior Diagnosis', type: 'text', required: true },
  ], active: true, isSystem: true, sortOrder: 2 },
  { id: 'HX_PRIOR_PATH_BIOPSY', categoryCode: 'PRIOR_PATH', displayText: 'Previous Biopsy', requiredMetadataSchema: [
    { key: 'prior_accession_number', label: 'Prior Accession Number', type: 'text', required: false },
    { key: 'prior_date', label: 'Prior Date', type: 'date', required: false },
  ], active: true, isSystem: true, sortOrder: 3 },
  { id: 'HX_PRIOR_PATH_SURGERY', categoryCode: 'PRIOR_PATH', displayText: 'Prior Surgery', requiredMetadataSchema: [
    { key: 'procedure', label: 'Procedure', type: 'text', required: true },
    { key: 'surgery_date', label: 'Date', type: 'date', required: false },
  ], active: true, isSystem: true, sortOrder: 4 },

  // ── MAL_STAGE — Malignancy / Staging (real, per Libre Pathology "history of cancer — primary site", RSNA "active cancer therapy", and clinical-trial SAP therapy categorization) ──
  { id: 'HX_MALSTAGE_HISTORY_OF_CANCER', categoryCode: 'MAL_STAGE', displayText: 'History of Cancer', requiredMetadataSchema: [
    { key: 'primary_site', label: 'Primary Site', type: 'text', required: true },
    { key: 'treatment_status', label: 'Treatment Status', type: 'text', required: false },
  ], active: true, isSystem: true, sortOrder: 1 },
  { id: 'HX_MALSTAGE_CLINICAL_STAGE', categoryCode: 'MAL_STAGE', displayText: 'Clinical Stage', requiredMetadataSchema: [{ key: 'stage', label: 'Stage', type: 'text', required: true }], active: true, isSystem: true, sortOrder: 2 },
  { id: 'HX_MALSTAGE_ACTIVE_THERAPY', categoryCode: 'MAL_STAGE', displayText: 'Active Cancer Therapy', requiredMetadataSchema: [{ key: 'therapy_type', label: 'Therapy Type (e.g. chemo/anthracycline, chemo/non-anthracycline, hormonal, biologic)', type: 'text', required: true }], active: true, isSystem: true, sortOrder: 3 },
  { id: 'HX_MALSTAGE_PRIOR_RADIATION', categoryCode: 'MAL_STAGE', displayText: 'Prior Radiation Therapy', requiredMetadataSchema: [{ key: 'radiation_site', label: 'Site', type: 'text', required: false }], active: true, isSystem: true, sortOrder: 4 },
  { id: 'HX_MALSTAGE_PRIOR_CHEMO', categoryCode: 'MAL_STAGE', displayText: 'Prior Chemotherapy', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 5 },

  // ── HIGH_RISK — High-Risk Factors (real, per oncology history-taking standards) ──
  { id: 'HX_HIGHRISK_FAMILY_HISTORY', categoryCode: 'HIGH_RISK', displayText: 'Family History of Malignancy', requiredMetadataSchema: [{ key: 'relation_and_cancer_type', label: 'Relation and Cancer Type', type: 'text', required: true }], active: true, isSystem: true, sortOrder: 1 },
  { id: 'HX_HIGHRISK_SMOKING', categoryCode: 'HIGH_RISK', displayText: 'Smoking History', requiredMetadataSchema: [], active: true, isSystem: true, sortOrder: 2 },
  { id: 'HX_HIGHRISK_OCCUPATIONAL', categoryCode: 'HIGH_RISK', displayText: 'Occupational Carcinogen Exposure', requiredMetadataSchema: [{ key: 'exposure_detail', label: 'Exposure Detail', type: 'text', required: true }], active: true, isSystem: true, sortOrder: 3 },
];

const load = (): ClinicalHistoryDictionaryEntry[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: ClinicalHistoryDictionaryEntry[]) => storageSet(STORAGE_KEY, data);
let _cache: ClinicalHistoryDictionaryEntry[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));
const sorted = (entries: ClinicalHistoryDictionaryEntry[]) => [...entries].sort((a, b) => a.sortOrder - b.sortOrder);

export const mockClinicalHistoryDictionaryService: IClinicalHistoryDictionaryService = {
  async getAll() {
    await delay();
    return ok(sorted(_cache));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache.filter(e => e.active)));
  },

  async getByCategory(categoryCode: ClinicalHistoryCategoryCode) {
    await delay();
    return ok(sorted(_cache.filter(e => e.active && e.categoryCode === categoryCode)));
  },

  async getBySpecimenFamily(specimenFamily: string) {
    await delay();
    return ok(sorted(_cache.filter(e => e.active && (!e.specimenFamilyFilter || e.specimenFamilyFilter.includes(specimenFamily)))));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(e => e.id === id);
    return found ? ok({ ...found }) : err(`ClinicalHistoryDictionaryEntry ${id} not found`);
  },

  async add(entry: NewClinicalHistoryDictionaryEntry) {
    await delay();
    if (_cache.some(e => e.id === entry.id)) return err(`ClinicalHistoryDictionaryEntry ${entry.id} already exists`);
    const maxOrder = _cache.filter(e => e.categoryCode === entry.categoryCode).reduce((m, e) => Math.max(m, e.sortOrder), 0);
    const created: ClinicalHistoryDictionaryEntry = { ...entry, isSystem: false, sortOrder: maxOrder + 1 };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<ClinicalHistoryDictionaryEntry>) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`ClinicalHistoryDictionaryEntry ${id} not found`);
    const { isSystem: _ignored, id: _idIgnored, ...safeChanges } = changes as any;
    _cache = _cache.map(e => e.id === id ? { ...e, ...safeChanges } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockClinicalHistoryDictionaryService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockClinicalHistoryDictionaryService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target)         return err(`ClinicalHistoryDictionaryEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system clinical history entry "${id}"`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

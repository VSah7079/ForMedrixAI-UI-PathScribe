// src/services/reports/mockAmendmentService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real two-stage pipeline for amendments:
//   Stage 1 (captureFields) — fires when "Amend" is clicked. Captures
//   Reason for Change and Clinical Notification up front, unlocks the
//   template for editing. The record stays 'draft' — nothing has been
//   transmitted yet, this is purely internal tracking. The hard gate
//   (notification required) is enforced HERE, at capture time, not
//   deferred to release.
//
//   Stage 2 (release) — fires at actual re-sign-out, after the
//   pathologist has made their edits. This is what marks the record
//   'released' and is the moment a real external transmission would
//   happen (Status = Corrected).
//
// Addendum stays single-stage — a genuinely new instance doesn't need
// an "unlock and edit" step the way a correction to existing data does;
// release() still accepts a direct call with everything at once for
// that case, same as it always did.
//
// CORRECTED: this file previously grew a case-level version-bundle
// creation call inside release(). That conflicted with the real,
// already-existing versioning system (reportVersionService, driven
// from SynopticReportPage.tsx, which already generates the full-case
// PDF and per-instance answers snapshot at sign-out). Reverted —
// release() only does what the interface says. `diffAnswersForSummary`
// is kept and exported as a reusable helper for Phase 3 (sign-out
// change summary), meant to be called from SynopticReportPage.tsx
// where the version history and the caller's context both already live.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { AmendmentRecord } from '@/types/reports/AmendmentRecord';
import type { IAmendmentService } from './IAmendmentService';

// Phase 3 helper — reused wherever the "here's what changed since the
// last signed-out version" confirmation is built (SynopticReportPage's
// sign-out flow), not invoked from within this service.
export interface FieldChangeSummary {
  fieldKey: string;
  lastSignedOutValue: unknown;
  newValue: unknown;
}

export function diffAnswersForSummary(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): FieldChangeSummary[] {
  if (!before || !after) return [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChangeSummary[] = [];
  for (const key of allKeys) {
    const oldValue = before[key];
    const newValue = after[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ fieldKey: key, lastSignedOutValue: oldValue, newValue });
    }
  }
  return changes;
}

const STORAGE_KEY = 'amendment_records';
const AMENDMENT_VERSION = '7';
const VERSION_KEY = 'pathscribe_mock_amendment_version';
try {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (storedVersion !== AMENDMENT_VERSION) {
    localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, AMENDMENT_VERSION);
  }
} catch { /* SSR / sandboxed env — ignore */ }

const SEED_RECORDS: AmendmentRecord[] = [
  {
    id: 'amend-seed-cp03',
    caseId: 'S26-4404',
    type: 'amendment',
    sequenceNumber: 1,
    explanationOfChange: 'Highest Score and involvement count corrected following second pathologist review of stained slides — an additional positive unit was identified on re-examination, raising the overall grade.',
    notification: { clinicianName: 'Dr. Anil Sharma', method: 'verbal_phone', notifiedAt: '2026-07-13T10:00:00.000Z' },
    body: '',
    initiatedAt: '2026-07-13T09:55:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'draft',
    originalReportSnapshot: {
      instanceId: 'S26-4404-SP-1_prostate_001',
      specimenId: 'S26-4404-SP-1',
      templateId: 'prostate_needle_biopsy',
      templateName: 'Generic Template — Prostate Needle Biopsy',
      status: 'finalized',
      answers: {
        procedure: ['procedure_opt_1'],
        positive_specimen_locations: ['positive_specimen_locations_opt_1'],
        highest_gleason_score: 'highest_gleason_score_opt_1',
        sites_with_highest_gleason: ['sites_with_highest_gleason_opt_1'],
        total_number_of_cores: 12,
        number_of_positive_cores: 3,
        greatest_percentage_core_involvement: 'greatest_percentage_core_involvement_opt_7',
        perineural_invasion: 'perineural_invasion_opt_2',
        lymphatic_vascular_invasion: 'lymphatic_vascular_invasion_opt_1',
        treatment_effect: ['treatment_effect_opt_1'],
      },
    },
  },
  {
    id: 'amend-seed-cp04b',
    caseId: 'S26-4401-BX-001',
    type: 'amendment',
    sequenceNumber: 2,
    explanationOfChange: 'Finding Type corrected (previously Option 2, now Option 4) following consensus re-review.',
    notification: { clinicianName: 'Dr. Ian Faulkner', method: 'verbal_phone', notifiedAt: '2026-07-13T14:00:00.000Z' },
    body: '',
    initiatedAt: '2026-07-13T13:50:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'draft',
    originalReportSnapshot: {
      instanceId: 'S26-4401-SP-1_breast_invasive_001',
      specimenId: 'S26-4401-SP-1',
      templateId: 'breast_invasive',
      templateName: 'Generic Template — Breast Invasive',
      status: 'finalized',
      answers: {
        histologic_type: 'histologic_type_opt_2',
        histologic_grade: 'Grade 2',
        tumor_size: '2.3 cm',
      },
    },
  },
  {
    id: 'amend-seed-cp05',
    caseId: 'S26-4402-COLON-RES',
    type: 'addendum',
    sequenceNumber: 2,
    addendumTitle: 'Ancillary Stain Panel',
    body: '',
    initiatedAt: '2026-07-13T16:00:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'draft',
    triggeredByLisNotice: true,
  },
  {
    id: 'amend-seed-001',
    caseId: 'S26-4401-BX-001',
    type: 'amendment',
    sequenceNumber: 1,
    explanationOfChange: 'Review of deeper levels and re-measurement of the primary finding revealed a larger size and higher grade than initially reported.',
    notification: { clinicianName: 'Dr. Ian Faulkner', method: 'verbal_phone', notifiedAt: '2026-07-11T09:15:00.000Z' },
    body: 'Synoptic instance S26-4401-SP-1_breast_invasive_001 corrected and re-signed out.',
    initiatedAt: '2026-07-11T09:00:00.000Z',
    releasedAt: '2026-07-11T09:20:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'released',
    originalReportSnapshot: {
      instanceId: 'S26-4401-SP-1_breast_invasive_001',
      specimenId: 'S26-4401-SP-1',
      templateId: 'breast_invasive',
      templateName: 'Generic Template — Breast Invasive',
      status: 'finalized',
      answers: {
        procedure: 'procedure_opt_2',
        specimen_laterality: 'specimen_laterality_opt_2',
        tumor_site: ['tumor_site_opt_1'],
        histologic_type: 'histologic_type_opt_2',
        histologic_grade: 'Grade 1',
        tumor_size: '1.8 cm',
        tumor_focality: 'tumor_focality_opt_1',
        lvi: 'lvi_opt_1',
        treatment_effect_breast: 'treatment_effect_breast_opt_1',
        treatment_effect_nodes: 'treatment_effect_nodes_opt_1',
        margin_status_invasive: 'margin_status_invasive_opt_2',
        distance_invasive_to_named_margins: '2.0 mm',
        margin_status_dcis: 'margin_status_dcis_opt_2',
        closest_margins_dcis: 'closest_margins_dcis_opt_3',
        regional_ln_status: 'regional_ln_status_opt_4',
        number_ln_macrometastases: '1',
        number_ln_micrometastases: '0',
        number_ln_itc: '0',
        largest_nodal_met_mm: '4.5',
        extranodal_extension: 'extranodal_extension_opt_1',
        total_ln_examined: '1',
        sentinel_ln_examined: '1',
        dcis: 'Secondary finding present, small extent',
        tumor_extent: 'Confined to primary organ',
        distant_metastasis: 'distant_metastasis_opt_1',
        ptnm_classification: 'Category A: Level 2; Category B: Level 1 (micro)',
      },
    },
  },
  {
    id: 'amend-seed-002',
    caseId: 'S26-4402-COLON-RES',
    type: 'amendment',
    sequenceNumber: 1,
    explanationOfChange: 'Re-examination of the margin on additional levels revealed closer approximation than initially measured, changing the staging category.',
    notification: { clinicianName: 'Dr. Priya Anand', method: 'secure_page', notifiedAt: '2026-07-10T15:45:00.000Z' },
    body: 'Synoptic instance S26-4402-SP-1_colon_resection_001 corrected and re-signed out.',
    initiatedAt: '2026-07-10T15:20:00.000Z',
    releasedAt: '2026-07-10T15:50:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'released',
    originalReportSnapshot: {
      instanceId: 'S26-4402-SP-1_colon_resection_001',
      specimenId: 'S26-4402-SP-1',
      templateId: 'colon_resection',
      templateName: 'Generic Template — Colon Resection',
      status: 'finalized',
      answers: {
        procedure: 'procedure_opt_4',
        tumor_site: ['tumor_site_opt_8'],
        histologic_type: 'histologic_type_opt_1',
        histologic_grade: 'histologic_grade_opt_2',
        tumor_size: '4.5 cm',
        tumor_extent: 'tumor_extent_opt_5',
        lvi: ['lvi_opt_1'],
        perineural_invasion: 'perineural_invasion_opt_2',
        margin_status_invasive: 'margin_status_invasive_opt_1',
        distance_radial_margin: '8 mm',
        regional_ln_status: 'regional_ln_status_opt_3',
        ln_with_tumor: '3',
        ln_examined: '18',
        stage_category_a: 'stage_category_a_opt_5',
        stage_category_b: 'stage_category_b_opt_6',
        treatment_effect: 'treatment_effect_opt_1',
        multiple_primary_sites: 'multiple_primary_sites_opt_1',
        macroscopic_perforation: 'macroscopic_perforation_opt_1',
        tumor_budding_score: 'tumor_budding_score_opt_2',
        distance_distal_margin: '5 cm',
        tumor_deposits: 'tumor_deposits_opt_1',
        modified_classification: 'modified_classification_opt_1',
        stage_category_a_suffix: 'stage_category_a_suffix_opt_1',
        stage_category_c: 'stage_category_c_opt_1',
        special_studies_note: 'Ancillary panel pending — see addendum when finalized.',
        comment_text: 'No additional comments.',
      },
    },
  },
  {
    id: 'amend-seed-003',
    caseId: 'S26-4403',
    type: 'addendum',
    sequenceNumber: 1,
    addendumTitle: 'Post-Operative Molecular Panel Results',
    body: 'Molecular marker panel testing completed. One targetable alteration detected; the remaining two markers tested were not detected.',
    initiatedAt: '2026-07-13T11:00:00.000Z',
    releasedAt: '2026-07-13T11:10:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'released',
  },
  {
    id: 'amend-seed-004',
    caseId: 'S26-4404',
    type: 'addendum',
    sequenceNumber: 1,
    addendumTitle: 'Immunohistochemical Confirmation',
    body: 'Dual-marker stain performed on Block A2 to confirm a focus of atypical glands. Staining pattern supports the working diagnosis (marker A positive, marker B negative in atypical glands).',
    initiatedAt: '2026-07-13T13:30:00.000Z',
    releasedAt: '2026-07-13T13:40:00.000Z',
    authoringPathologist: { userId: 'user-seed', userName: 'Dr. Reyes' },
    status: 'released',
  },
];

const load    = (): AmendmentRecord[] => storageGet<AmendmentRecord[]>(STORAGE_KEY, SEED_RECORDS);
const persist = (data: AmendmentRecord[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockAmendmentService: IAmendmentService = {
  async getByCaseId(caseId) {
    return ok(load().filter(r => r.caseId === caseId));
  },

  async getAll() {
    return ok(load());
  },

  async getOpenDraftsForPathologist(pathologistId) {
    return ok(load().filter(r => r.status === 'draft' && r.authoringPathologist.userId === pathologistId));
  },

  async startDraft(input) {
    const existing = load().filter(r => r.caseId === input.caseId && r.type === input.type);
    const newRecord: AmendmentRecord = {
      // Batch 381: a random suffix, so two drafts opened in the same
      // millisecond don't share an id (found when a test did exactly that).
      id: `amend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      caseId: input.caseId,
      type: input.type,
      reportInstanceId: input.reportInstanceId,
      specimenId: input.specimenId,
      sequenceNumber: existing.length + 1,
      body: '',
      initiatedAt: new Date().toISOString(),
      authoringPathologist: input.authoringPathologist,
      status: 'draft',
      triggeredByLisNotice: input.triggeredByLisNotice,
    };
    persist([...load(), newRecord]);
    return ok(newRecord);
  },

  async changeDraftType(id, type) {
    const records = load();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return err(`Amendment ${id} not found`);
    const record = records[idx];
    if (record.type === type) return ok({ ...record });
    if (record.status !== 'draft' || record.explanationOfChange) {
      return err('Only a draft that has not been saved yet can change between amendment, correction and addendum.');
    }
    const sameType = records.filter(r => r.caseId === record.caseId && r.type === type && r.id !== id);
    records[idx] = { ...record, type, sequenceNumber: sameType.length + 1 };
    persist(records);
    return ok({ ...records[idx] });
  },

  async captureFields(id, fields) {
    const records = load();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return err(`Amendment ${id} not found`);
    const record = records[idx];

    if (record.type === 'addendum') return err('captureFields is only for amendments and corrections — addenda release in a single step.');
    if (!fields.explanationOfChange?.trim()) {
      return err(record.type === 'correction'
        ? 'Correction requires an explanation of what was fixed and why.'
        : 'Amendment requires an explanation of what changed and why.');
    }
    // Real, per direct guidance's own detailed post-sign-out revision
    // taxonomy - required for every real AmendmentType, same hard-gate
    // posture as explanationOfChange immediately above.
    if (!fields.reasonId?.trim()) {
      return err(record.type === 'correction'
        ? 'Correction requires a reason code before the explanation.'
        : 'Amendment requires a reason code before the explanation.');
    }
    // Clinical Notification hard gate — 'amendment' only. A 'correction'
    // leaves the diagnosis untouched, so CAP's notification requirement
    // (aimed at changes affecting patient management/interpretation)
    // doesn't apply; the explanation above is still the required audit
    // trail. See AMENDMENT_STATUS_REDESIGN_BRIEF.md.
    if (record.type === 'amendment' && (!fields.notification?.clinicianName?.trim() || !fields.notification?.method)) {
      return err('Amendment cannot proceed without the Clinical Notification Log — who was notified and how.');
    }

    records[idx] = {
      ...record,
      explanationOfChange: fields.explanationOfChange.trim(),
      reasonId: fields.reasonId.trim(),
      notification: fields.notification,
      // ROOT FIX: one-time capture, not overwrite-every-call. Page-level
      // state tracking "the true pre-edit baseline" (preOverrideSnapshot
      // in SynopticReportPage.tsx) is lost on a refresh — if the
      // pathologist resumes and saves again, the caller falls back to
      // re-cloning live (by-then-edited) data. Without this guard, that
      // would silently overwrite the real original with already-changed
      // values here, corrupting the audit trail on every resumed save.
      originalReportSnapshot: record.originalReportSnapshot ?? fields.originalReportSnapshot,
    };
    persist(records);
    return ok({ ...records[idx] });
  },

  // Stage 2 — reverted to match the real interface exactly. No version
  // creation happens here; that stays owned by SynopticReportPage.tsx's
  // finalizeSignOut, alongside the PDF generation it already does.
  async release(id, fields) {
    const records = load();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return err(`Amendment/addendum ${id} not found`);
    const record = records[idx];

    if (!fields.body.trim()) {
      return err(record.type === 'addendum' ? 'Addendum body cannot be empty.' : record.type === 'correction' ? 'Correction body cannot be empty.' : 'Amendment body cannot be empty.');
    }
    if (record.type === 'addendum' && !fields.addendumTitle?.trim()) {
      return err('Addendum requires a title describing what it contains.');
    }
    // Real, per direct guidance's own detailed post-sign-out revision
    // taxonomy - required for every real AmendmentType. Addenda have
    // no captureFields stage, so this is checked fresh here every
    // time; amendment/correction use the same "already captured in
    // Stage 1" fallback structure explanationOfChange already uses
    // below.
    if (record.type === 'addendum' && !fields.reasonId?.trim()) {
      return err('Addendum requires a reason code describing what supplemental information is being added.');
    }
    // Fallback gate for a direct release() call that skipped captureFields
    // (e.g. a same-step amendment/correction). Explanation is required for
    // both; the Clinical Notification hard gate stays amendment-only —
    // see captureFields above and AMENDMENT_STATUS_REDESIGN_BRIEF.md.
    if (record.type !== 'addendum' && !record.explanationOfChange) {
      if (!fields.explanationOfChange?.trim()) {
        return err(record.type === 'correction'
          ? 'Correction requires an explanation of what was fixed and why.'
          : 'Amendment requires an explanation of what changed and why.');
      }
      if (!fields.reasonId?.trim()) {
        return err(record.type === 'correction'
          ? 'Correction requires a reason code before the explanation.'
          : 'Amendment requires a reason code before the explanation.');
      }
      if (record.type === 'amendment' && (!fields.notification?.clinicianName?.trim() || !fields.notification?.method)) {
        return err('Amendment cannot be released without the Clinical Notification Log — who was notified and how.');
      }
    }

    records[idx] = {
      ...record,
      addendumTitle: fields.addendumTitle?.trim() ?? record.addendumTitle,
      explanationOfChange: fields.explanationOfChange?.trim() ?? record.explanationOfChange,
      reasonId: fields.reasonId?.trim() ?? record.reasonId,
      notification: fields.notification ?? record.notification,
      body: fields.body.trim(),
      releasedAt: new Date().toISOString(),
      status: 'released',
    };
    persist(records);
    return ok({ ...records[idx] });
  },
};

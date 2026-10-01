// src/services/cytology/INonGynCytologyCategoryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Non-GYN Cytology Classification
// Systems gap: "Admin-editable dictionaries for the Milan System
// (salivary gland cytology) and the Paris System (urinary tract
// cytology), following this app's own established dictionary-editor
// pattern." Same real, established interface/mock/firestore-stub
// dictionary shape as ICytologyCategoryService.ts — genuinely a
// sibling dictionary, not an extension of that one. Confirmed
// directly before building: that dictionary's own section
// ('adequacy'/'general_categorization'/'interpretation_result') and
// diagnosticRank (a real, GYN-Bethesda-specific 0-5 negative→malignant
// scale, load-bearing for that module's own classifyCytologyAgreement
// "High-Grade Skip Discrepancy" check) are both genuinely specific to
// GYN cervical cytology's own three-axis structure. Milan and Paris
// each have their own, real, single-axis diagnostic category list
// with their own, real, published risk-of-malignancy figures — not
// the same shape, and not comparable on the same numeric scale.
//
// Categories verified directly against current, published sources
// before building seed data, not improvised:
// - Milan: the second-edition MSRSGC (2023) six real categories
//   (Non-Diagnostic, Non-Neoplastic, AUS, Neoplasm: Benign, Neoplasm:
//   SUMP, Suspicious for Malignancy, Malignant — category IV splits
//   into IVA/IVB, hence "six categories, seven tiers" in the real
//   literature), with the real, published ROM figures per category.
// - Paris (urinary): TPS 2.0 (2022 second edition) — confirmed
//   directly that LGUN was abolished as its own category in this
//   edition (folded into NHGUC), leaving six current, real categories:
//   Nondiagnostic/Unsatisfactory, NHGUC, AUC, SHGUC, HGUC, and Other
//   Malignancies (Primary or Metastatic).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type NonGynCytologySystem = 'milan' | 'paris_urinary';

export interface NonGynCytologyCategoryEntry {
  id: ID;
  system: NonGynCytologySystem;
  /** The real, standard roman-numeral/lettered category designation
   *  from the published system itself — e.g. "IVA", "IVB" for Milan;
   *  "I" through "VI" for Paris. Purely organizational/display
   *  ordering, never itself a selectable value. */
  categoryNumber: string;
  label: string;
  abbreviation?: string;
  description?: string;
  /** The real, published risk of malignancy for this category, per
   *  the system's own current edition — e.g. Milan category VI
   *  (Malignant): 90%. Informational/display only — never itself a
   *  computed or enforced value; a real lab's own local ROM may
   *  differ, same real reasoning as every other published ROM figure
   *  cited elsewhere in this app. */
  riskOfMalignancyPercent?: number;
  requiresPathologistReview: boolean;
  active: boolean;
  isSystem: boolean;
}

export type NewNonGynCytologyCategoryEntry = Omit<NonGynCytologyCategoryEntry, 'id' | 'isSystem'>;

export interface INonGynCytologyCategoryService {
  getAll(): Promise<ServiceResult<NonGynCytologyCategoryEntry[]>>;
  getActive(): Promise<ServiceResult<NonGynCytologyCategoryEntry[]>>;
  getBySystem(system: NonGynCytologySystem): Promise<ServiceResult<NonGynCytologyCategoryEntry[]>>;
  getById(id: ID): Promise<ServiceResult<NonGynCytologyCategoryEntry>>;
  add(entry: NewNonGynCytologyCategoryEntry): Promise<ServiceResult<NonGynCytologyCategoryEntry>>;
  update(id: ID, changes: Partial<NewNonGynCytologyCategoryEntry>): Promise<ServiceResult<NonGynCytologyCategoryEntry>>;
  deactivate(id: ID): Promise<ServiceResult<NonGynCytologyCategoryEntry>>;
  reactivate(id: ID): Promise<ServiceResult<NonGynCytologyCategoryEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}

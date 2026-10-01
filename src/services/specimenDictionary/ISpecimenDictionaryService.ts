// src/services/specimenDictionary/ISpecimenDictionaryService.ts
// ─────────────────────────────────────────────────────────────
// The real backend service for the Specimen Dictionary (SpecimenEntry) —
// the dictionary Accession, the Synoptic Report editor (SpecimenEditModal),
// and Search all actually consume.
//
// Added June 2026 to close a real architectural gap: this dictionary was
// the one domain in the app NOT following the IXxxService/mockXxxService/
// firestoreXxxService pattern used everywhere else (Facility, Physician,
// Department, Deficiencies, Order Intake) — instead, useSpecimen
// Dictionary.tsx called localStorage.getItem/setItem directly inline
// inside a React Context Provider. No interface, no Firestore path, not
// even an empty stub. Meanwhile a properly-shaped but completely dead
// service already existed at services/specimens/ISpecimenService.ts,
// pointed at an unused Specimen type with zero real callers — this
// reuses that shape, redirected at the real SpecimenEntry model.
//
// useSpecimenDictionary.tsx is now a thin hook wrapper around this
// service — same public API (dictionary, addEntries, updateEntries,
// deprecateEntries, replaceDictionary, exportDictionary), so none of the
// 6 existing consumers (AccessionPage, SpecimenEditModal, SearchPage,
// SpecimenDictionarySection, TATConfigSection, SubspecialtiesSection)
// needed to change.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { SpecimenEntry } from './specimenTypes';

export interface ISpecimenDictionaryService {
  getAll(): Promise<ServiceResult<SpecimenEntry[]>>;
  addEntries(entries: SpecimenEntry[]): Promise<ServiceResult<SpecimenEntry[]>>;
  updateEntries(entries: SpecimenEntry[]): Promise<ServiceResult<SpecimenEntry[]>>;
  /** Soft-delete — marks entries inactive rather than removing them, same
   *  as every other governed dictionary in this app (nothing is ever
   *  hard-deleted once it may have been referenced by a real case). */
  deprecateEntries(ids: string[]): Promise<ServiceResult<SpecimenEntry[]>>;
  /** Wholesale replace — used by spreadsheet "replace entire dictionary"
   *  flows, distinct from addEntries/updateEntries' incremental merge. */
  replaceDictionary(entries: SpecimenEntry[]): Promise<ServiceResult<SpecimenEntry[]>>;

  /** Same "unblock now, admin reviews after" pattern as
   *  Facility.findOrCreateByAssigningAuthority / Physician.findOrCreateByName /
   *  Department.findOrCreateByName. Case-insensitive exact match on
   *  name; no fuzzy matching, on purpose — a near-miss creates a new
   *  pending entry for a human to reconcile, not a silent guess. Added
   *  for order-intake specimen crosswalk resolution — see
   *  IOrderIntakeService.ts's SpecimenCodeCrosswalkEntry.dictionaryEntryId. */
  findOrCreateByName(name: string, note?: string): Promise<ServiceResult<SpecimenEntry>>;
}

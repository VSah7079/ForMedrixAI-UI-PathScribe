// src/services/patientHistory/IPatientHistoryCacheService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own lifecycle: "as new cases get added
// to PathScribe we fetch and store the patient's reports while the
// case is active. When the case is signed out, we destroy the
// history." This is that real lifecycle, kept genuinely separate
// from IPatientHistoryLisService.ts (the real, live fetch itself) —
// this service owns storage/lifecycle only, never talks to the LIS
// directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { PatientHistoryCacheEntry } from '@/types/patientHistory/PatientHistoryCacheEntry';

export interface IPatientHistoryCacheService {
  getAll(): Promise<ServiceResult<PatientHistoryCacheEntry[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<PatientHistoryCacheEntry | null>>;
  /** Real, per direct guidance's own "fetch and store... while the
   *  case is active" — creates a real 'pending' entry immediately (so
   *  the UI has something real to show right away, per this app's own
   *  established optimistic-state convention), which the caller then
   *  resolves via markFetched/markFailed once the real LIS call
   *  returns. */
  ensurePending(caseId: string, patientId: string): Promise<ServiceResult<PatientHistoryCacheEntry>>;
  markFetched(caseId: string, reports: PatientHistoryCacheEntry['reports']): Promise<ServiceResult<PatientHistoryCacheEntry>>;
  markFailed(caseId: string, errorMessage: string): Promise<ServiceResult<PatientHistoryCacheEntry>>;
  /** Real, per direct guidance's own "when the case is signed out, we
   *  destroy the history" — a real, deliberate data-minimization
   *  action, not a cleanup convenience. Removes the entry entirely;
   *  never soft-deletes or archives it (an archived copy would defeat
   *  the entire real reason this cache exists in Assist mode). */
  destroy(caseId: string): Promise<ServiceResult<void>>;
}

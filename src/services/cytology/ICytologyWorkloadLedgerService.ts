// src/services/cytology/ICytologyWorkloadLedgerService.ts
import type { ServiceResult } from '../types';
import type { CytologyWorkloadLedgerEntry } from '@/types/cytology/CytologyWorkloadLedgerEntry';

export interface ICytologyWorkloadLedgerService {
  /** Real, append-only — a workload entry, once recorded, is never
   *  edited or removed (the same real "always written" posture this
   *  module already established for CytologyReviewRecord itself). */
  record(entry: Omit<CytologyWorkloadLedgerEntry, 'id'>): Promise<ServiceResult<CytologyWorkloadLedgerEntry>>;
  /** Real, per-user entries within the given, real time window —
   *  the real, rolling-24-hour query direct guidance's own schema
   *  index was built for. */
  getForUserInWindow(userId: string, windowStart: string, windowEnd: string): Promise<ServiceResult<CytologyWorkloadLedgerEntry[]>>;
  /** Real, unfiltered — the full ledger, for the real supervisor
   *  audit-trail export/report. */
  getAll(): Promise<ServiceResult<CytologyWorkloadLedgerEntry[]>>;
}

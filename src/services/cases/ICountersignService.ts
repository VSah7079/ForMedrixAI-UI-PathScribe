// src/services/cases/ICountersignService.ts
import { ServiceResult } from '../types';
import type { CountersignRecord } from '@/types/case/CountersignRecord';

export interface ICountersignService {
  getAll(): Promise<ServiceResult<CountersignRecord[]>>;
  /** Real, per direct guidance ("Continue" — closing the gap where a
   *  rejection's own real attendingFeedback was captured but never
   *  actually shown to the resident anywhere): matches 'pending' OR
   *  'returned' — both real, active states a caller might genuinely
   *  need this record for. 'countersigned' (terminal, done) is
   *  deliberately excluded — a caller wanting completed-record
   *  history should use getAll()/filter, not this. */
  getForCase(caseId: string): Promise<ServiceResult<CountersignRecord | null>>;
  /** Called when a resident's sign-out is intercepted — creates the
   *  pending record and snapshots current answers for later delta
   *  comparison. */
  release(input: {
    caseId: string;
    subspecialtyId?: string;
    residentId: string;
    residentName: string;
    releasedAnswersSnapshot: Record<string, Record<string, string | string[]>>;
    /** Real, per direct follow-up — set only by Autopsy's own PAD/FAD
     *  signing flow (signAutopsyReport.ts). See CountersignRecord's
     *  own doc comment for the full, real reasoning. */
    autopsyReportTier?: 'PAD' | 'FAD';
  }): Promise<ServiceResult<CountersignRecord>>;
  /** Called when the attending actually finalizes a case that was
   *  pending countersign — computes the real delta against the
   *  snapshot and marks the record complete. */
  countersign(input: {
    caseId: string;
    attendingId: string;
    attendingName: string;
    currentAnswersByInstance: Record<string, Record<string, string | string[]>>;
    attendingFeedback?: string;
  }): Promise<ServiceResult<CountersignRecord>>;
  /** Real, per direct guidance ("Yes we should scope 'Return to
   *  Trainee'/'Reject with Notes'"): called when the attending
   *  declines to countersign as-is and sends the case back for
   *  revision instead. attendingFeedback is required here (unlike
   *  countersign's own optional feedback) — a rejection with no
   *  explanation gives the resident nothing to act on. */
  reject(input: {
    caseId: string;
    attendingId: string;
    attendingName: string;
    attendingFeedback: string;
  }): Promise<ServiceResult<CountersignRecord>>;
}

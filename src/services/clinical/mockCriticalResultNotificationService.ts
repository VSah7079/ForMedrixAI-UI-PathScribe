// src/services/clinical/mockCriticalResultNotificationService.ts
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { CriticalResultNotification } from '@/types/clinical/CriticalResultNotification';
import type { ICriticalResultNotificationService } from './ICriticalResultNotificationService';

const STORAGE_KEY = 'critical_result_notifications_v1';

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

const load    = (): CriticalResultNotification[] => storageGet<CriticalResultNotification[]>(STORAGE_KEY, []);
const persist = (records: CriticalResultNotification[]) => storageSet(STORAGE_KEY, records);

export const mockCriticalResultNotificationService: ICriticalResultNotificationService = {
  async getByCaseId(caseId) {
    return ok(load().filter(r => r.caseId === caseId));
  },

  async recordNotification(input) {
    if (!input.clinicianName.trim()) return err('A real clinician name is required.');
    if (!input.findingSummary.trim()) return err('A real finding summary is required.');

    const record: CriticalResultNotification = {
      id: `crn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      caseId: input.caseId,
      specimenId: input.specimenId,
      trigger: input.trigger,
      findingSummary: input.findingSummary.trim(),
      clinicianName: input.clinicianName.trim(),
      method: input.method,
      notifiedAt: new Date().toISOString(),
      notifiedBy: input.notifiedBy,
      readBackConfirmed: input.readBackConfirmed,
    };
    persist([...load(), record]);
    return ok(record);
  },

  async migrateIntraopVerbalReport(input) {
    if (!input.note.trim()) return err('No real verbal report note to migrate.');

    const record: CriticalResultNotification = {
      id: `crn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      caseId: input.caseId,
      specimenId: input.specimenId,
      trigger: 'intraoperative_frozen',
      findingSummary: input.note.trim(),
      clinicianName: input.surgeon,
      // Real, per direct guidance - the one real, established way an
      // intraoperative frozen callback is actually made
      // (IntraoperativeEntry.verbalReportLog's own name and doc
      // comment already say "verbal").
      method: 'verbal_phone',
      notifiedAt: input.notifiedAt,
      notifiedBy: input.notifiedBy,
    };
    persist([...load(), record]);
    return ok(record);
  },
};

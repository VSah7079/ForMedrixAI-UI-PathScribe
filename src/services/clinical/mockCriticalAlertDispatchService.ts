// src/services/clinical/mockCriticalAlertDispatchService.ts
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { CriticalAlertDispatchRecord } from '@/types/clinical/CriticalAlertDispatch';
import type { ICriticalAlertDispatchService } from './ICriticalAlertDispatchService';

const STORAGE_KEY = 'critical_alert_dispatches_v1';

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });

const load    = (): CriticalAlertDispatchRecord[] => storageGet<CriticalAlertDispatchRecord[]>(STORAGE_KEY, []);
const persist = (records: CriticalAlertDispatchRecord[]) => storageSet(STORAGE_KEY, records);

export const mockCriticalAlertDispatchService: ICriticalAlertDispatchService = {
  async getByCaseId(caseId) {
    return ok(load().filter(r => r.caseId === caseId));
  },

  async record(input) {
    const record: CriticalAlertDispatchRecord = {
      id: `cad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
      dispatchedAt: new Date().toISOString(),
    };
    persist([...load(), record]);
    return ok(record);
  },
};

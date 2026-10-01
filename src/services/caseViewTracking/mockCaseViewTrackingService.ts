// src/services/caseViewTracking/mockCaseViewTrackingService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ICaseViewTrackingService, CaseViewRecord } from './ICaseViewTrackingService';

const STORE_KEY = 'pathscribe_case_view_records';
const ok = <T>(data: T) => ({ ok: true as const, data });

const load = (): CaseViewRecord[] => storageGet(STORE_KEY, []);
const persist = (records: CaseViewRecord[]) => storageSet(STORE_KEY, records);

export const mockCaseViewTrackingService: ICaseViewTrackingService = {
  async recordView(userId, caseId) {
    const all = load();
    const exists = all.some(r => r.userId === userId && r.caseId === caseId);
    if (!exists) {
      persist([...all, { userId, caseId, firstViewedAt: new Date().toISOString() }]);
    }
    return ok(undefined);
  },

  async getViewedCaseIds(userId) {
    const all = load();
    return ok(new Set(all.filter(r => r.userId === userId).map(r => r.caseId)));
  },
};

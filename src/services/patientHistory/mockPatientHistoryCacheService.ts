// src/services/patientHistory/mockPatientHistoryCacheService.ts
import type { IPatientHistoryCacheService } from './IPatientHistoryCacheService';
import type { PatientHistoryCacheEntry } from '@/types/patientHistory/PatientHistoryCacheEntry';
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'patientHistoryCache';

const load = (): PatientHistoryCacheEntry[] => storageGet(STORAGE_KEY, []);
const persist = (data: PatientHistoryCacheEntry[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 20));

export const mockPatientHistoryCacheService: IPatientHistoryCacheService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId: string) {
    await delay();
    return ok(load().find(e => e.caseId === caseId) ?? null);
  },

  async ensurePending(caseId: string, patientId: string) {
    await delay();
    const all = load();
    const existing = all.find(e => e.caseId === caseId);
    if (existing) return ok(existing); // real, honest no-op — never resets an already-fetched or in-flight entry
    const created: PatientHistoryCacheEntry = {
      id: 'phc-' + Date.now(), caseId, patientId, status: 'pending', reports: [], failedAttemptCount: 0,
    };
    persist([...all, created]);
    return ok(created);
  },

  async markFetched(caseId: string, reports: PatientHistoryCacheEntry['reports']) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.caseId === caseId);
    if (idx === -1) return err(`No patient history cache entry for case ${caseId}`);
    const updated: PatientHistoryCacheEntry = { ...all[idx], status: 'fetched', reports, fetchedAt: new Date().toISOString(), errorMessage: undefined, failedAttemptCount: 0 };
    all[idx] = updated;
    persist(all);
    return ok(updated);
  },

  async markFailed(caseId: string, errorMessage: string) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.caseId === caseId);
    if (idx === -1) return err(`No patient history cache entry for case ${caseId}`);
    const updated: PatientHistoryCacheEntry = { ...all[idx], status: 'failed', errorMessage, fetchedAt: new Date().toISOString(), failedAttemptCount: all[idx].failedAttemptCount + 1 };
    all[idx] = updated;
    persist(all);
    return ok(updated);
  },

  async destroy(caseId: string) {
    await delay();
    persist(load().filter(e => e.caseId !== caseId));
    return ok(undefined);
  },
};

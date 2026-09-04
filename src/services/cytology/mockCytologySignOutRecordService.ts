// src/services/cytology/mockCytologySignOutRecordService.ts
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ICytologySignOutRecordService } from './ICytologySignOutRecordService';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

const STORAGE_KEY = 'cytology_sign_out_records';

const load    = (): CytologySignOutRecord[] => storageGet<CytologySignOutRecord[]>(STORAGE_KEY, []);
const persist = (data: CytologySignOutRecord[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export const mockCytologySignOutRecordService: ICytologySignOutRecordService = {
  async getByCaseId(caseId) {
    return ok(load().filter(r => r.caseId === caseId));
  },

  async getBySpecimenId(specimenId) {
    return ok(load().filter(r => r.specimenId === specimenId));
  },

  async create(record) {
    const newRecord: CytologySignOutRecord = {
      ...record,
      id: `cyto-signout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      signedAt: new Date().toISOString(),
    };
    persist([newRecord, ...load()]);
    return ok(newRecord);
  },
};

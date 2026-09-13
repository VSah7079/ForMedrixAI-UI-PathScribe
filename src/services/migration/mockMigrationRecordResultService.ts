// src/services/migration/mockMigrationRecordResultService.ts
import type { IMigrationRecordResultService, MigrationRecordResult } from './IMigrationRecordResultService';
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'migrationRecordResults';

const load = (): MigrationRecordResult[] => storageGet(STORAGE_KEY, []);
const persist = (data: MigrationRecordResult[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockMigrationRecordResultService: IMigrationRecordResultService = {
  async getByJobId(migrationJobId: string) {
    await delay();
    return ok(load().filter(r => r.migrationJobId === migrationJobId));
  },

  async record(result) {
    await delay();
    const created: MigrationRecordResult = { ...result, id: crypto.randomUUID(), processedAt: new Date().toISOString() };
    persist([...load(), created]);
    return ok(created);
  },
};

// src/services/migration/mockMigrationFieldMappingService.ts
import type { IMigrationFieldMappingService, MigrationFieldMapping, NewMigrationFieldMapping } from './IMigrationFieldMappingService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'migrationFieldMappings';

const load = (): MigrationFieldMapping[] => storageGet(STORAGE_KEY, []);
const persist = (data: MigrationFieldMapping[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockMigrationFieldMappingService: IMigrationFieldMappingService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getBySourceSystem(sourceSystemName: string) {
    await delay();
    return ok(load().filter(m => m.sourceSystemName === sourceSystemName && m.active));
  },

  async add(entry: NewMigrationFieldMapping) {
    await delay();
    const data = load();
    if (data.some(m => m.sourceSystemName === entry.sourceSystemName && m.sourceFieldName === entry.sourceFieldName && m.active)) {
      return err(`A mapping for "${entry.sourceFieldName}" already exists for "${entry.sourceSystemName}".`);
    }
    const created: MigrationFieldMapping = { ...entry, id: 'mfm-' + Date.now() };
    persist([...data, created]);
    return ok(created);
  },

  async update(id: ID, changes) {
    await delay();
    const data = load();
    const idx = data.findIndex(m => m.id === id);
    if (idx === -1) return err(`MigrationFieldMapping ${id} not found`);
    const updated = data.map(m => m.id === id ? { ...m, ...changes } : m);
    persist(updated);
    return ok(updated.find(m => m.id === id)!);
  },

  async remove(id: ID) {
    await delay();
    const data = load();
    if (!data.some(m => m.id === id)) return err(`MigrationFieldMapping ${id} not found`);
    persist(data.filter(m => m.id !== id));
    return ok(undefined);
  },
};

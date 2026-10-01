// src/services/actionGroups/mockActionGroupService.ts
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ActionGroup, IActionGroupService } from './IActionGroupService';

const STORAGE_KEY = 'action_groups';

// Real, per this app's own established version-gated re-seed
// convention, built in from day one.
const ACTION_GROUP_VERSION = '1';
const VERSION_KEY = 'pathscribe_mock_action_groups_version';
if (typeof localStorage !== 'undefined') {
  try {
    if (localStorage.getItem(VERSION_KEY) !== ACTION_GROUP_VERSION) {
      localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, ACTION_GROUP_VERSION);
    }
  } catch { /* SSR / sandboxed env — ignore */ }
}

// Real, deliberately empty seed — same real reasoning as
// mockWorkstationGroupService.ts's own empty seed: no automatic
// migration is attempted from anything existing, since nothing
// existing captures this real concept today. An admin builds real
// groups deliberately, going forward.
const SEED_ACTION_GROUPS: ActionGroup[] = [];

const load    = (): ActionGroup[] => storageGet<ActionGroup[]>(STORAGE_KEY, SEED_ACTION_GROUPS);
const persist = (data: ActionGroup[]) => storageSet(STORAGE_KEY, data);

export const mockActionGroupService: IActionGroupService = {
  async getAll(): Promise<ServiceResult<ActionGroup[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<ActionGroup>> {
    const found = load().find(g => g.id === id);
    if (!found) return { ok: false, error: `Action group ${id} not found` };
    return { ok: true, data: found };
  },

  async create(draft: Omit<ActionGroup, 'id' | 'createdAt' | 'status'>): Promise<ServiceResult<ActionGroup>> {
    const data = load();
    const newGroup: ActionGroup = { ...draft, id: 'ag-' + Date.now(), status: 'Active', createdAt: new Date().toISOString() };
    data.push(newGroup);
    persist(data);
    return { ok: true, data: newGroup };
  },

  async update(id: ID, changes: Partial<Omit<ActionGroup, 'id' | 'createdAt' | 'createdBy'>>): Promise<ServiceResult<ActionGroup>> {
    const data = load();
    const idx = data.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false, error: `Action group ${id} not found` };
    const updated = { ...data[idx], ...changes };
    data[idx] = updated;
    persist(data);
    return { ok: true, data: updated };
  },

  async deactivate(id: ID): Promise<ServiceResult<ActionGroup>> {
    return mockActionGroupService.update(id, { status: 'Inactive' });
  },

  async reactivate(id: ID): Promise<ServiceResult<ActionGroup>> {
    return mockActionGroupService.update(id, { status: 'Active' });
  },
};

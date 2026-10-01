// src/services/workstationGroups/mockWorkstationGroupService.ts
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { WorkstationGroup, IWorkstationGroupService } from './IWorkstationGroupService';
import { FUNCTIONAL_AREAS_BY_DISCIPLINE } from './IWorkstationGroupService';

const STORAGE_KEY = 'workstation_groups';

// Real, per this app's own established version-gated re-seed
// convention, built in from day one — see
// mockDeficiencyTypeService.ts's own header for why this matters
// (a real, longstanding gap there had to be fixed retroactively).
const WORKSTATION_GROUP_VERSION = '1';
const VERSION_KEY = 'pathscribe_mock_workstation_groups_version';
if (typeof localStorage !== 'undefined') {
  try {
    if (localStorage.getItem(VERSION_KEY) !== WORKSTATION_GROUP_VERSION) {
      localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, WORKSTATION_GROUP_VERSION);
    }
  } catch { /* SSR / sandboxed env — ignore */ }
}

// Real, deliberately empty seed — per PS-289's own comment thread,
// no automatic migration is attempted from ScanStation.workflowStage's
// own free text into a real group; an admin assigns membership
// deliberately, going forward. Starting empty is the honest state,
// not a placeholder guess at what a real site's groups should be.
const SEED_WORKSTATION_GROUPS: WorkstationGroup[] = [];

const load    = (): WorkstationGroup[] => storageGet<WorkstationGroup[]>(STORAGE_KEY, SEED_WORKSTATION_GROUPS);
const persist = (data: WorkstationGroup[]) => storageSet(STORAGE_KEY, data);

/** Real — a group's own functionalArea must be a member of its
 *  discipline's own real, populated set. AUTOPSY's own set is
 *  currently empty (see IWorkstationGroupService.ts's own header),
 *  so this honestly rejects every AUTOPSY group until PS-261 gives
 *  that discipline a real, populated list of its own — never a
 *  fabricated area invented to let a group through. */
function validateFunctionalArea(group: Pick<WorkstationGroup, 'discipline' | 'functionalArea'>): string | null {
  const allowed = FUNCTIONAL_AREAS_BY_DISCIPLINE[group.discipline];
  if (!allowed.includes(group.functionalArea)) {
    return allowed.length === 0
      ? `${group.discipline} has no real, populated functional areas yet — see PS-261 for why.`
      : `"${group.functionalArea}" is not a real functional area for ${group.discipline}. Valid values: ${allowed.join(', ')}.`;
  }
  return null;
}

export const mockWorkstationGroupService: IWorkstationGroupService = {
  async getAll(): Promise<ServiceResult<WorkstationGroup[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<WorkstationGroup>> {
    const found = load().find(g => g.id === id);
    if (!found) return { ok: false, error: `Workstation group ${id} not found` };
    return { ok: true, data: found };
  },

  async getByFacility(facilityId: string): Promise<ServiceResult<WorkstationGroup[]>> {
    return { ok: true, data: load().filter(g => g.performingLabFacilityId === facilityId) };
  },

  async create(draft: Omit<WorkstationGroup, 'id' | 'createdAt' | 'status'>): Promise<ServiceResult<WorkstationGroup>> {
    const validationError = validateFunctionalArea(draft);
    if (validationError) return { ok: false, error: validationError };
    const data = load();
    const newGroup: WorkstationGroup = { ...draft, id: 'wg-' + Date.now(), status: 'Active', createdAt: new Date().toISOString() };
    data.push(newGroup);
    persist(data);
    return { ok: true, data: newGroup };
  },

  async update(id: ID, changes: Partial<Omit<WorkstationGroup, 'id' | 'createdAt' | 'createdBy'>>): Promise<ServiceResult<WorkstationGroup>> {
    const data = load();
    const idx = data.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false, error: `Workstation group ${id} not found` };
    const updated = { ...data[idx], ...changes };
    const validationError = validateFunctionalArea(updated);
    if (validationError) return { ok: false, error: validationError };
    data[idx] = updated;
    persist(data);
    return { ok: true, data: updated };
  },

  async deactivate(id: ID): Promise<ServiceResult<WorkstationGroup>> {
    return mockWorkstationGroupService.update(id, { status: 'Inactive' });
  },

  async reactivate(id: ID): Promise<ServiceResult<WorkstationGroup>> {
    return mockWorkstationGroupService.update(id, { status: 'Active' });
  },
};

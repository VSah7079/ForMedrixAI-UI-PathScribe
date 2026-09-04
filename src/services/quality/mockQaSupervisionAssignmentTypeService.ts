// src/services/quality/mockQaSupervisionAssignmentTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-115. Real, localStorage-backed CRUD for QaSupervisionAssignmentType
// definitions — mirrors mockQaActivityTypeService.ts's own exact shape.
//
// Seeded with one real entry: FPPE/Credentialing Review, sharing the
// exact same id (FPPE_ACTIVITY_TYPE_ID) every real
// QaSupervisionAssignment instance already carries as its own
// activityTypeId — imported directly from
// mockQaSupervisionAssignmentService.ts rather than redefined here, so
// the real FK relationship between this definition and its real
// instances can never drift out of sync.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IQaSupervisionAssignmentTypeService } from './IQaSupervisionAssignmentTypeService';
import type { QaSupervisionAssignmentType } from '@/types/quality/QaSupervisionAssignmentType';
import { FPPE_ACTIVITY_TYPE_ID } from './mockQaSupervisionAssignmentService';

const STORAGE_KEY = 'qa_supervision_assignment_types';

const SEED_TYPES: QaSupervisionAssignmentType[] = [
  {
    id: FPPE_ACTIVITY_TYPE_ID,
    name: 'FPPE / Credentialing Review',
    description: 'Focused Professional Practice Evaluation — supervised sign-out for a newly credentialed or provisionally hired pathologist, until their real case-count or duration threshold is met.',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'AU', 'NZ', 'KR'],
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: 'system-seed',
  },
];

const load    = (): QaSupervisionAssignmentType[] => storageGet<QaSupervisionAssignmentType[]>(STORAGE_KEY, SEED_TYPES);
const persist = (data: QaSupervisionAssignmentType[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockQaSupervisionAssignmentTypeService: IQaSupervisionAssignmentTypeService = {
  async getAll() {
    return ok([...load()]);
  },

  async add(type) {
    if (!type.name.trim()) return err('A real activity name is required.');
    const types = load();
    const newType: QaSupervisionAssignmentType = {
      ...type,
      id: `qa-supervision-type-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    persist([...types, newType]);
    return ok(newType);
  },

  async update(id, changes) {
    const types = load();
    const idx = types.findIndex(t => t.id === id);
    if (idx === -1) return err(`Supervision assignment type ${id} not found.`);
    const updated = { ...types[idx], ...changes };
    const withUpdate = [...types];
    withUpdate[idx] = updated;
    persist(withUpdate);
    return ok(updated);
  },

  async deactivate(id) {
    return mockQaSupervisionAssignmentTypeService.update(id, { active: false });
  },

  async reactivate(id) {
    return mockQaSupervisionAssignmentTypeService.update(id, { active: true });
  },
};

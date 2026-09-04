// src/services/quality/IQaSupervisionAssignmentTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-115. Real CRUD for QaSupervisionAssignmentType definitions — a
// genuine gap found while scoping the Configuration Center, not a
// deliberate PS-114 omission: PS-114 built the real, working
// QaSupervisionAssignment (the instance record, with its own service
// and gate-check integration), but never a CRUD service for the
// DEFINITION type itself, since nothing needed to create/edit one yet.
// The Configuration Center is exactly that "nothing" becoming
// something — mirrors IQaActivityTypeService's own exact shape, the
// same real, proven pattern this app already uses for an admin-curated
// dictionary. deactivate/reactivate toggle the real `active` boolean,
// matching QaSupervisionAssignmentType's own actual field.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { QaSupervisionAssignmentType } from '@/types/quality/QaSupervisionAssignmentType';

export interface IQaSupervisionAssignmentTypeService {
  getAll(): Promise<ServiceResult<QaSupervisionAssignmentType[]>>;
  add(type: Omit<QaSupervisionAssignmentType, 'id' | 'createdAt'>): Promise<ServiceResult<QaSupervisionAssignmentType>>;
  update(id: ID, changes: Partial<Omit<QaSupervisionAssignmentType, 'id'>>): Promise<ServiceResult<QaSupervisionAssignmentType>>;
  deactivate(id: ID): Promise<ServiceResult<QaSupervisionAssignmentType>>;
  reactivate(id: ID): Promise<ServiceResult<QaSupervisionAssignmentType>>;
}

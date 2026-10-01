// src/services/quality/IQaActivityTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113. Real CRUD for QaActivityType definitions - mirrors
// IDeficiencyTypeService's own established shape (services/deficiencies/
// IDeficiencyService.ts) exactly, the real, proven pattern this app
// already uses for an admin-curated dictionary. deactivate/reactivate
// toggle the real `active` boolean rather than a status enum, matching
// QaActivityType's own actual field.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { QaActivityType } from '@/types/quality/QaActivityType';

export interface IQaActivityTypeService {
  getAll(): Promise<ServiceResult<QaActivityType[]>>;
  add(type: Omit<QaActivityType, 'id' | 'createdAt'>): Promise<ServiceResult<QaActivityType>>;
  update(id: ID, changes: Partial<Omit<QaActivityType, 'id'>>): Promise<ServiceResult<QaActivityType>>;
  deactivate(id: ID): Promise<ServiceResult<QaActivityType>>;
  reactivate(id: ID): Promise<ServiceResult<QaActivityType>>;
}

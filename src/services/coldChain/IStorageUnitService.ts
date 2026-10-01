// src/services/coldChain/IStorageUnitService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
// Laboratory Sensor & Cold-Chain Integration gap: "storage equipment"
// — genuinely distinct from a smart transport container
// (services/hardwareContainers/, extended for that half of this same
// gap): a StorageUnit is fixed, stationary equipment (a freezer, a
// refrigerator) that never moves between benches and is never checked
// out to a Batch — confirmed directly that nothing resembling this
// exists anywhere in this app before building it.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface StorageUnit {
  id: ID;
  name: string;
  /** The real StorageConditionType this unit is expected to maintain
   *  — e.g. a -20°C tissue freezer is tagged 'sct-frozen-tissue'. */
  storageConditionTypeId: string;
  facilityId?: string;
  active: boolean;
  createdAt: string;
}

export type NewStorageUnit = Omit<StorageUnit, 'id' | 'createdAt'>;

export interface IStorageUnitService {
  getAll(): Promise<ServiceResult<StorageUnit[]>>;
  getActive(): Promise<ServiceResult<StorageUnit[]>>;
  getById(id: ID): Promise<ServiceResult<StorageUnit>>;
  add(entry: NewStorageUnit): Promise<ServiceResult<StorageUnit>>;
  update(id: ID, changes: Partial<NewStorageUnit>): Promise<ServiceResult<StorageUnit>>;
  deactivate(id: ID): Promise<ServiceResult<StorageUnit>>;
}

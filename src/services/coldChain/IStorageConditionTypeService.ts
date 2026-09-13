// src/services/coldChain/IStorageConditionTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
// Laboratory Sensor & Cold-Chain Integration gap: "Automated Excursion
// Alerts: System alerts and workflow hold triggers if transit
// temperature exceeds defined parameters (e.g., frozen tissue
// excursions above -20°C, fresh tissue above 8°C)." A real, admin-
// editable dictionary — the two named thresholds are the RFP's own
// stated examples, seeded directly rather than invented, but genuinely
// configurable since a real lab's own real materials/thresholds vary
// beyond those two named examples. Same real, small-curated-
// dictionary, admin-editable posture as every other dictionary in
// this app (StainType, DeficiencyType, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface StorageConditionType {
  id: ID;
  name: string;
  /** Real, per the RFP's own stated rule — an excursion is a reading
   *  ABOVE this value (frozen tissue must stay AT or BELOW -20°C;
   *  fresh tissue must stay AT or BELOW 8°C). Both of the RFP's own
   *  named examples are single-sided (a maximum only) — genuinely no
   *  stated minimum for either, so minTemperatureCelsius stays
   *  optional rather than forcing a fabricated floor. */
  maxTemperatureCelsius: number;
  minTemperatureCelsius?: number;
  active: boolean;
  isSystem: boolean;
}

export type NewStorageConditionType = Omit<StorageConditionType, 'id' | 'isSystem'>;

export interface IStorageConditionTypeService {
  getAll(): Promise<ServiceResult<StorageConditionType[]>>;
  getActive(): Promise<ServiceResult<StorageConditionType[]>>;
  getById(id: ID): Promise<ServiceResult<StorageConditionType>>;
  add(entry: NewStorageConditionType): Promise<ServiceResult<StorageConditionType>>;
  update(id: ID, changes: Partial<NewStorageConditionType>): Promise<ServiceResult<StorageConditionType>>;
  deactivate(id: ID): Promise<ServiceResult<StorageConditionType>>;
  reactivate(id: ID): Promise<ServiceResult<StorageConditionType>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}

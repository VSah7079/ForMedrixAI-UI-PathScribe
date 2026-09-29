// src/services/equipment/IEquipmentLogService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 360: each device's maintenance, calibration and service history, the
// record ISO 15189 and CAP expect alongside the equipment inventory
// (services/equipment/, Batches 358-359).
//
// Append-only: an entry is never edited or deleted. A mistake is corrected by
// a new entry that says so. Adding an entry is written to the audit log.
//
// Maintenance and calibration are scheduled on the device
// (Equipment.maintenanceIntervalDays / calibrationIntervalDays); the due
// dates come from the last passing entry (equipmentLogRules.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult, ID } from '../types';

/** Stored values; labels come from equipmentLog.types.<type>. */
export const EQUIPMENT_LOG_TYPES = ['maintenance', 'calibration', 'function_check', 'repair', 'malfunction'] as const;
export type EquipmentLogType = typeof EQUIPMENT_LOG_TYPES[number];

/** Stored values; labels come from equipmentLog.outcomes.<outcome>. */
export const EQUIPMENT_LOG_OUTCOMES = ['pass', 'fail', 'not_applicable'] as const;
export type EquipmentLogOutcome = typeof EQUIPMENT_LOG_OUTCOMES[number];

export interface EquipmentLogEntry {
  id: ID;
  equipmentId: ID;
  type: EquipmentLogType;
  /** The day it was done, 'YYYY-MM-DD' (the facility's calendar). */
  performedOn: string;
  /** Who did it: a staff member or an outside service engineer. Data, not translated. */
  performedBy: string;
  outcome: EquipmentLogOutcome;
  notes?: string;
  /** When it was recorded (ISO timestamp) and by whom (user id). */
  recordedAt: string;
  recordedByUserId: string;
}

export type NewEquipmentLogEntry = Omit<EquipmentLogEntry, 'id' | 'recordedAt'>;

export type EquipmentLogError = 'equipmentNotFound' | 'invalid';

export interface IEquipmentLogService {
  /** Every entry, or one device's; newest first. */
  list(equipmentId?: ID): Promise<ServiceResult<EquipmentLogEntry[]>>;
  /** Appends an entry and audits it. `today` is the facility's date, for the no-future-dates check. */
  add(entry: NewEquipmentLogEntry, today: string): Promise<ServiceResult<EquipmentLogEntry>>;
}

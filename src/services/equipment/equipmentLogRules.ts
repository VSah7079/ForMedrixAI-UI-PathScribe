// src/services/equipment/equipmentLogRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 360: maintenance and calibration decisions, pure. Dates are
// 'YYYY-MM-DD' on the facility's calendar; `today` is passed in.
//   - validateEquipmentLogEntry: translation-key errors (equipmentLog.errors.*).
//   - nextDue: when maintenance / calibration is next due, from the last
//     entry that counts (pass, or not applicable for maintenance). A failed
//     calibration doesn't reset the clock.
//   - hasOpenMalfunction: a malfunction with no passing repair or function
//     check on or after it.
//   - equipmentServiceState: the one status the register shows per device.
//   - isServiceAlert, serviceStatesById (Batch 361): which devices are shown
//     in red, for the register and the molecular batch instrument picker.
// ─────────────────────────────────────────────────────────────────────────────
import type { Equipment } from './IEquipmentService';
import { EQUIPMENT_LOG_OUTCOMES, EQUIPMENT_LOG_TYPES, type EquipmentLogEntry, type NewEquipmentLogEntry } from './IEquipmentLogService';

/** Days before the due date that "due soon" starts. */
export const DUE_SOON_DAYS = 14;
/** The longest schedule accepted, in days (10 years). */
export const MAX_INTERVAL_DAYS = 3650;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** An interval field: empty is fine (not scheduled); otherwise a whole number of days, 1 to 10 years. */
export function isValidInterval(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 1 && value <= MAX_INTERVAL_DAYS);
}

export type EquipmentLogErrorKey = 'dateRequired' | 'dateInFuture' | 'performedByRequired' | 'typeRequired' | 'outcomeRequired' | 'notesRequired';
export type EquipmentLogErrors = Partial<Record<'performedOn' | 'performedBy' | 'type' | 'outcome' | 'notes', EquipmentLogErrorKey>>;

export function validateEquipmentLogEntry(
  draft: Pick<NewEquipmentLogEntry, 'type' | 'performedOn' | 'performedBy' | 'outcome' | 'notes'>, today: string,
): EquipmentLogErrors {
  const errors: EquipmentLogErrors = {};
  if (!(EQUIPMENT_LOG_TYPES as readonly string[]).includes(draft.type)) errors.type = 'typeRequired';
  if (!DATE.test(draft.performedOn)) errors.performedOn = 'dateRequired';
  else if (draft.performedOn > today) errors.performedOn = 'dateInFuture';
  if (!draft.performedBy.trim()) errors.performedBy = 'performedByRequired';
  if (!(EQUIPMENT_LOG_OUTCOMES as readonly string[]).includes(draft.outcome)) errors.outcome = 'outcomeRequired';
  // A failure or a malfunction must say what happened.
  if ((draft.outcome === 'fail' || draft.type === 'malfunction') && !draft.notes?.trim()) errors.notes = 'notesRequired';
  return errors;
}

export type DueState = 'overdue' | 'dueSoon' | 'ok' | 'neverDone';
export interface DueInfo { lastDone?: string; dueOn?: string; state: DueState }

/** When a scheduled activity is next due; null when the device has no schedule for it. */
export function nextDue(
  kind: 'maintenance' | 'calibration', equipment: Pick<Equipment, 'maintenanceIntervalDays' | 'calibrationIntervalDays'>,
  entries: readonly EquipmentLogEntry[], today: string,
): DueInfo | null {
  const interval = kind === 'maintenance' ? equipment.maintenanceIntervalDays : equipment.calibrationIntervalDays;
  if (!interval) return null;
  const counts = (e: EquipmentLogEntry) => e.type === kind && (e.outcome === 'pass' || (kind === 'maintenance' && e.outcome === 'not_applicable'));
  const lastDone = entries.filter(counts).map(e => e.performedOn).sort().pop();
  if (!lastDone) return { state: 'neverDone' };
  const dueOn = addDays(lastDone, interval);
  const left = daysBetween(today, dueOn);
  return { lastDone, dueOn, state: left < 0 ? 'overdue' : left <= DUE_SOON_DAYS ? 'dueSoon' : 'ok' };
}

/** A malfunction not yet followed (same day or later) by a passing repair or function check. */
export function hasOpenMalfunction(entries: readonly EquipmentLogEntry[]): boolean {
  const lastMalfunction = entries.filter(e => e.type === 'malfunction').map(e => e.performedOn).sort().pop();
  if (!lastMalfunction) return false;
  return !entries.some(e => (e.type === 'repair' || e.type === 'function_check') && e.outcome === 'pass' && e.performedOn >= lastMalfunction);
}

/** The one status the register shows, worst first. */
export type EquipmentServiceState = 'malfunction' | 'overdue' | 'neverDone' | 'dueSoon' | 'ok' | 'notScheduled';

export function equipmentServiceState(
  equipment: Pick<Equipment, 'maintenanceIntervalDays' | 'calibrationIntervalDays'>, entries: readonly EquipmentLogEntry[], today: string,
): { state: EquipmentServiceState; maintenance: DueInfo | null; calibration: DueInfo | null } {
  const maintenance = nextDue('maintenance', equipment, entries, today);
  const calibration = nextDue('calibration', equipment, entries, today);
  const states = [maintenance?.state, calibration?.state];
  const state: EquipmentServiceState =
    hasOpenMalfunction(entries) ? 'malfunction'
      : states.includes('overdue') ? 'overdue'
        : states.includes('neverDone') ? 'neverDone'
          : states.includes('dueSoon') ? 'dueSoon'
            : maintenance || calibration ? 'ok' : 'notScheduled';
  return { state, maintenance, calibration };
}

/**
 * Batch 361: states shown in red (an open malfunction, or maintenance or
 * calibration past due). Pete's decision: flag the device, don't block it.
 */
export function isServiceAlert(state: EquipmentServiceState): boolean {
  return state === 'malfunction' || state === 'overdue';
}

/** Each device's service state, by id, for pickers. */
export function serviceStatesById(
  equipment: ReadonlyArray<Pick<Equipment, 'id' | 'maintenanceIntervalDays' | 'calibrationIntervalDays'>>,
  entries: readonly EquipmentLogEntry[], today: string,
): Map<string, EquipmentServiceState> {
  const byDevice = groupLogByEquipment(entries);
  return new Map(equipment.map(e => [e.id, equipmentServiceState(e, byDevice.get(e.id) ?? [], today).state]));
}

/** Newest first: by the day done, then by when recorded. */
export function sortLogNewestFirst(entries: readonly EquipmentLogEntry[]): EquipmentLogEntry[] {
  return [...entries].sort((a, b) => b.performedOn.localeCompare(a.performedOn) || b.recordedAt.localeCompare(a.recordedAt));
}

/** Entries by device id. */
export function groupLogByEquipment(entries: readonly EquipmentLogEntry[]): Map<string, EquipmentLogEntry[]> {
  const out = new Map<string, EquipmentLogEntry[]>();
  for (const e of entries) out.set(e.equipmentId, [...(out.get(e.equipmentId) ?? []), e]);
  return out;
}

/** The earliest due date across maintenance and calibration, if any, and whether it has passed. */
export function earliestDue(today: string, ...infos: Array<DueInfo | null>): { date: string; overdue: boolean } | undefined {
  const date = infos.map(i => i?.dueOn).filter((d): d is string => !!d).sort()[0];
  return date ? { date, overdue: date < today } : undefined;
}

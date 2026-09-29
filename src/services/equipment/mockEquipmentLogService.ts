// src/services/equipment/mockEquipmentLogService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 360: this build's equipment log, kept in the browser (key
// 'equipment_log'). Append-only. Seeded, relative to the day the demo first
// loads, so the register shows each status: Panther 1 up to date, Panther 2
// calibration overdue and maintenance due soon, Panther 3 with an open
// malfunction.
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { mockEquipmentService } from './mockEquipmentService';
import { mockAuditService } from '../auditlog/mockAuditService';
import type { EquipmentLogEntry, EquipmentLogError, IEquipmentLogService } from './IEquipmentLogService';
import { addDays, sortLogNewestFirst, validateEquipmentLogEntry } from './equipmentLogRules';

export const EQUIPMENT_LOG_STORAGE_KEY = 'equipment_log';

function seed(): EquipmentLogEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  const ago = (n: number) => addDays(today, -n);
  const at = (n: number) => `${ago(n)}T15:00:00.000Z`;
  const e = (id: string, equipmentId: string, type: EquipmentLogEntry['type'], daysAgo: number, outcome: EquipmentLogEntry['outcome'], performedBy: string, notes?: string): EquipmentLogEntry =>
    ({ id, equipmentId, type, performedOn: ago(daysAgo), performedBy, outcome, notes, recordedAt: at(daysAgo), recordedByUserId: 'PATH-001' });
  return [
    e('eqlog-seed-1', 'inst-panther-01', 'maintenance', 10, 'pass', 'M. Alvarez'),
    e('eqlog-seed-2', 'inst-panther-01', 'calibration', 60, 'pass', 'Hologic field service', 'Annual calibration, all channels within limits.'),
    e('eqlog-seed-3', 'inst-panther-02', 'maintenance', 25, 'pass', 'M. Alvarez'),
    e('eqlog-seed-4', 'inst-panther-02', 'calibration', 190, 'pass', 'Hologic field service'),
    e('eqlog-seed-5', 'inst-panther-03', 'maintenance', 12, 'pass', 'J. Okafor'),
    e('eqlog-seed-6', 'inst-panther-03', 'calibration', 40, 'pass', 'Hologic field service'),
    e('eqlog-seed-7', 'inst-panther-03', 'malfunction', 3, 'fail', 'J. Okafor', 'Pipettor error during run; instrument taken out of use, service call logged.'),
  ];
}

const load = (): EquipmentLogEntry[] => {
  const stored = storageGet<EquipmentLogEntry[] | null>(EQUIPMENT_LOG_STORAGE_KEY, null);
  if (stored) return stored;
  const seeded = seed();
  storageSet(EQUIPMENT_LOG_STORAGE_KEY, seeded);
  return seeded;
};
const fail = (error: EquipmentLogError) => ({ ok: false as const, error });

export const mockEquipmentLogService: IEquipmentLogService = {
  async list(equipmentId) {
    const all = load();
    return { ok: true, data: sortLogNewestFirst(equipmentId ? all.filter(x => x.equipmentId === equipmentId) : all) };
  },

  async add(entry, today): Promise<ServiceResult<EquipmentLogEntry>> {
    const device = await mockEquipmentService.getById(entry.equipmentId);
    if (!device.ok) return fail('equipmentNotFound');
    if (Object.keys(validateEquipmentLogEntry(entry, today)).length > 0) return fail('invalid');
    const created: EquipmentLogEntry = {
      ...entry,
      id: 'eqlog-' + Date.now(),
      performedBy: entry.performedBy.trim(),
      notes: entry.notes?.trim() || undefined,
      recordedAt: new Date().toISOString(),
    };
    storageSet(EQUIPMENT_LOG_STORAGE_KEY, [...load(), created]);
    // Audit detail stays literal English (compliance record, not UI).
    await mockAuditService.logEvent({
      type: 'user',
      event: 'equipment.log_entry_added',
      detail: `Equipment ${device.data.code}: ${created.type} on ${created.performedOn} by ${created.performedBy}, outcome ${created.outcome}`,
      user: entry.recordedByUserId,
      caseId: null,
      confidence: null,
      facilityId: device.data.facilityId,
    }).catch(() => undefined);
    return { ok: true, data: created };
  },
};

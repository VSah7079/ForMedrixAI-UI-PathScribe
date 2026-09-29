// src/services/equipment/equipmentRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 358: the equipment register's decisions, pure. Generalised from
// Batch 356's instrumentRules.ts.
//   - validateEquipmentDraft: errors are translation-key suffixes
//     (equipmentSection.errors.<key>).
//   - checkBatchInstrument: a molecular batch may only target an active
//     analyser from the register.
//   - checkEquipmentStation: whether this workstation is the equipment's
//     station (worklist dispatch).
//   - equipmentForPicker, filterEquipment, stationsForEquipment: lists.
// ─────────────────────────────────────────────────────────────────────────────
import { EQUIPMENT_KINDS, type Equipment, type EquipmentDraft, type EquipmentKind } from './IEquipmentService';
import { isValidInterval } from './equipmentLogRules';

export type EquipmentDraftErrorKey =
  | 'nameRequired' | 'codeRequired' | 'codeFormat' | 'codeTaken' | 'kindRequired' | 'facilityRequired' | 'stationOtherFacility' | 'intervalInvalid';

export type EquipmentDraftErrors = Partial<Record<
  'name' | 'code' | 'kind' | 'facilityId' | 'scanStationId' | 'maintenanceIntervalDays' | 'calibrationIntervalDays', EquipmentDraftErrorKey
>>;

/** Codes are letters, digits, "_" and "-": they go into barcodes (LOC-INST-<code>-SLOT_<slot>). */
const CODE_PATTERN = /^[A-Z0-9_-]+$/i;

export function normaliseEquipmentCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isEquipmentKind(kind: string): kind is EquipmentKind {
  return (EQUIPMENT_KINDS as readonly string[]).includes(kind);
}

export function validateEquipmentDraft(
  draft: Pick<EquipmentDraft, 'name' | 'code' | 'kind' | 'facilityId' | 'scanStationId' | 'maintenanceIntervalDays' | 'calibrationIntervalDays'>,
  context: {
    existing: ReadonlyArray<Pick<Equipment, 'id' | 'code'>>;
    stations: ReadonlyArray<{ id: string; facilityId: string }>;
    /** The item being edited: its own code doesn't count as taken. */
    editingId?: string;
  },
): EquipmentDraftErrors {
  const errors: EquipmentDraftErrors = {};
  if (!draft.name.trim()) errors.name = 'nameRequired';
  const code = normaliseEquipmentCode(draft.code);
  if (!code) errors.code = 'codeRequired';
  else if (!CODE_PATTERN.test(code)) errors.code = 'codeFormat';
  else if (context.existing.some(i => i.id !== context.editingId && normaliseEquipmentCode(i.code) === code)) errors.code = 'codeTaken';
  if (!draft.kind || !isEquipmentKind(draft.kind)) errors.kind = 'kindRequired';
  if (!draft.facilityId.trim()) errors.facilityId = 'facilityRequired';
  if (draft.scanStationId && draft.facilityId) {
    const station = context.stations.find(s => s.id === draft.scanStationId);
    if (station && station.facilityId !== draft.facilityId) errors.scanStationId = 'stationOtherFacility';
  }
  // Batch 360: schedules are whole days, 1 to 10 years; empty = not scheduled.
  if (!isValidInterval(draft.maintenanceIntervalDays)) errors.maintenanceIntervalDays = 'intervalInvalid';
  if (!isValidInterval(draft.calibrationIntervalDays)) errors.calibrationIntervalDays = 'intervalInvalid';
  return errors;
}

export type BatchInstrumentCheck =
  | { ok: true; equipment: Equipment }
  | { ok: false; reason: 'unknown' | 'inactive' | 'notAnalyser' };

/** A molecular batch may only target an active analyser in the register. */
export function checkBatchInstrument(code: string, equipment: readonly Equipment[]): BatchInstrumentCheck {
  const wanted = normaliseEquipmentCode(code);
  const found = equipment.find(i => normaliseEquipmentCode(i.code) === wanted);
  if (!found) return { ok: false, reason: 'unknown' };
  if (found.kind !== 'analyser') return { ok: false, reason: 'notAnalyser' };
  if (found.status !== 'Active') return { ok: false, reason: 'inactive' };
  return { ok: true, equipment: found };
}

/**
 * Whether this workstation is the equipment's station. `null` when there is
 * nothing to check: no station on the equipment, or none set on this device.
 */
export function checkEquipmentStation(
  equipment: Pick<Equipment, 'scanStationId'> | undefined, currentStationId: string | null | undefined,
): boolean | null {
  if (!equipment?.scanStationId || !currentStationId) return null;
  return equipment.scanStationId === currentStationId;
}

/** Active equipment for a picker, optionally of one kind: this lab's first (when given), each group by name. */
export function equipmentForPicker(
  equipment: readonly Equipment[], options: { kind?: EquipmentKind; preferredFacilityId?: string } = {},
): Equipment[] {
  const { kind, preferredFacilityId } = options;
  const rank = (e: Equipment) => (preferredFacilityId && e.facilityId === preferredFacilityId ? 0 : 1);
  return equipment
    .filter(e => e.status === 'Active' && (!kind || e.kind === kind))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The register list: text (name, code, make, model, serial), kind, status and lab filters. */
export function filterEquipment(
  equipment: readonly Equipment[],
  filter: { search: string; status: 'All' | Equipment['status']; kind: 'All' | EquipmentKind; facilityId?: string },
): Equipment[] {
  const q = filter.search.trim().toLowerCase();
  return equipment.filter(e =>
    (!q || [e.name, e.code, e.make ?? '', e.model ?? '', e.serialNumber ?? ''].some(v => v.toLowerCase().includes(q))) &&
    (filter.kind === 'All' || e.kind === filter.kind) &&
    (filter.status === 'All' || e.status === filter.status) &&
    (!filter.facilityId || e.facilityId === filter.facilityId));
}

/** The stations equipment in this lab can sit at: that lab's active stations. */
export function stationsForEquipment<S extends { facilityId: string; status: string }>(stations: readonly S[], facilityId: string): S[] {
  return facilityId ? stations.filter(s => s.facilityId === facilityId && s.status === 'Active') : [];
}

// ── Batch 359: workflow settings that point at a register entry ─────────────
// Printer Profiles and Grossing Hardware keep their own settings and name the
// physical device with `equipmentId`.

/** Why a settings record's device link is refused. Not linking is fine. */
export type EquipmentLinkError = 'notFound' | 'wrongKind';

export function checkEquipmentLink(
  equipmentId: string | undefined, equipment: readonly Equipment[], kind: EquipmentKind,
): EquipmentLinkError | null {
  if (!equipmentId) return null;
  const found = equipment.find(e => e.id === equipmentId);
  if (!found) return 'notFound';
  return found.kind === kind ? null : 'wrongKind';
}

/** Devices a settings record can link to: active ones of the kind, plus the current link even if since deactivated. */
export function equipmentLinkOptions(equipment: readonly Equipment[], kind: EquipmentKind, currentId?: string): Equipment[] {
  return equipment
    .filter(e => e.kind === kind && (e.status === 'Active' || e.id === currentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface EquipmentSettingsLink { type: 'printerProfile' | 'grossingHardware'; label: string }

/** For the register list: which settings records point at each device. */
export function settingsLinksByEquipment(
  printerProfiles: ReadonlyArray<{ equipmentId?: string; printerId: string }>,
  grossingProfiles: ReadonlyArray<{ equipmentId?: string; label: string }>,
): Map<string, EquipmentSettingsLink[]> {
  const out = new Map<string, EquipmentSettingsLink[]>();
  const push = (id: string | undefined, link: EquipmentSettingsLink) => { if (id) out.set(id, [...(out.get(id) ?? []), link]); };
  for (const p of printerProfiles) push(p.equipmentId, { type: 'printerProfile', label: p.printerId });
  for (const g of grossingProfiles) push(g.equipmentId, { type: 'grossingHardware', label: g.label });
  return out;
}

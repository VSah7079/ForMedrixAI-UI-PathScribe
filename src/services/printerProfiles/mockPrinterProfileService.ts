// src/services/printerProfiles/mockPrinterProfileService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, standard mock service implementation — same real
// storageGet/storageSet-backed pattern as mockProtocolService.ts and
// every other real dictionary in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IPrinterProfileService, PrinterProfile } from './IPrinterProfileService';
import { withSeedFieldBackfill } from '../mockSeedMerge';
import { mockEquipmentService } from '../equipment/mockEquipmentService';
import { checkEquipmentLink } from '../equipment/equipmentRules';
import { EQUIPMENT_LINK_INVALID } from '../equipment/IEquipmentService';

const genId = () => `printer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SEED_PRINTER_PROFILES: PrinterProfile[] = [
  // Real, seeded directly from PS-51's own Section 2.2 worked example —
  // a real, plausible starting profile, not a placeholder.
  //
  // Real fix, PS-55: bridgeType was still 'os_print_dialog' here, a
  // real, valid PrinterProfile value but one printCassetteSlideLabel.ts/
  // dispatchZplLabel.ts explicitly document as having no working
  // dispatch implementation for this ZPL/GS1 pipeline (only 'qz_tray'
  // and 'direct_interface_engine' do). This seed predates that real
  // QZ Tray dispatch work — left at its original value, the only two
  // demo stations flagged supportsPrinting (station-gross-1,
  // station-micro-1, both pointing at this same profile) would always
  // hit the real "not yet implemented" refusal on every Print
  // Cassette/Print Slide action, never actually demonstrating the
  // real, already-built QZ Tray path. Updated to 'qz_tray' so the
  // demo's own default configuration exercises the real, working
  // dispatch it's meant to showcase.
  {
    id: 'printer-zt411-example',
    printerId: 'ZEBRA-192.168.12.85',
    model: 'ZT411',
    dpi: 300,
    supportsDataMatrix: true,
    supportsGS1: true,
    zplVersion: '7.0',
    maxPrintDensity: 300,
    moduleSize: 4,
    vendor: 'ZEBRA_ZPL',
    bridgeType: 'qz_tray',
    ipAddress: '192.168.12.85',
    port: 9100,
    // Batch 359: the physical printer in the equipment register.
    equipmentId: 'eq-zebra-zt411-01',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// Batch 359: a browser that stored the seeded profile before it had an
// equipmentId gets the link; a stored link (or an admin's removal of the
// profile) is left alone.
function load(): PrinterProfile[] {
  const stored = storageGet<PrinterProfile[] | null>('pathscribe_printer_profiles', null);
  if (!stored) return SEED_PRINTER_PROFILES.map(p => ({ ...p }));
  const { records, filled } = withSeedFieldBackfill(stored, SEED_PRINTER_PROFILES, 'equipmentId');
  if (filled > 0) storageSet('pathscribe_printer_profiles', records);
  return records;
}
const save = (profiles: PrinterProfile[]) => storageSet('pathscribe_printer_profiles', profiles);

/** Batch 359: an equipmentId must be a label printer in the register. */
async function equipmentLinkOk(equipmentId: string | undefined): Promise<boolean> {
  if (!equipmentId) return true;
  const res = await mockEquipmentService.getAll();
  return checkEquipmentLink(equipmentId, res.ok ? res.data : [], 'label_printer') === null;
}

export const mockPrinterProfileService: IPrinterProfileService = {
  async getAll(): Promise<ServiceResult<PrinterProfile[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<PrinterProfile | null>> {
    return { ok: true, data: load().find(p => p.id === id) ?? null };
  },

  async add(profile): Promise<ServiceResult<PrinterProfile>> {
    if (!(await equipmentLinkOk(profile.equipmentId))) return { ok: false, error: EQUIPMENT_LINK_INVALID };
    const now = new Date().toISOString();
    const created: PrinterProfile = { ...profile, id: genId(), createdAt: now, updatedAt: now };
    const all = load();
    save([...all, created]);
    return { ok: true, data: created };
  },

  async update(id: ID, changes): Promise<ServiceResult<PrinterProfile>> {
    const all = load();
    const existing = all.find(p => p.id === id);
    if (!existing) return { ok: false, error: `Printer profile ${id} not found.` };
    if ('equipmentId' in changes && !(await equipmentLinkOk(changes.equipmentId))) return { ok: false, error: EQUIPMENT_LINK_INVALID };
    const updated: PrinterProfile = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    save(all.map(p => p.id === id ? updated : p));
    return { ok: true, data: updated };
  },

  async remove(id: ID): Promise<ServiceResult<void>> {
    save(load().filter(p => p.id !== id));
    return { ok: true, data: undefined };
  },
};

// src/services/printerProfiles/mockPrinterProfileService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, standard mock service implementation — same real
// storageGet/storageSet-backed pattern as mockProtocolService.ts and
// every other real dictionary in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IPrinterProfileService, PrinterProfile } from './IPrinterProfileService';

const genId = () => `printer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const load = () => storageGet<PrinterProfile[]>('pathscribe_printer_profiles', [
  // Real, seeded directly from PS-51's own Section 2.2 worked example —
  // a real, plausible starting profile, not a placeholder.
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
    bridgeType: 'os_print_dialog',
    ipAddress: '192.168.12.85',
    port: 9100,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]);
const save = (profiles: PrinterProfile[]) => storageSet('pathscribe_printer_profiles', profiles);

export const mockPrinterProfileService: IPrinterProfileService = {
  async getAll(): Promise<ServiceResult<PrinterProfile[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<PrinterProfile | null>> {
    return { ok: true, data: load().find(p => p.id === id) ?? null };
  },

  async add(profile): Promise<ServiceResult<PrinterProfile>> {
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
    const updated: PrinterProfile = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    save(all.map(p => p.id === id ? updated : p));
    return { ok: true, data: updated };
  },

  async remove(id: ID): Promise<ServiceResult<void>> {
    save(load().filter(p => p.id !== id));
    return { ok: true, data: undefined };
  },
};

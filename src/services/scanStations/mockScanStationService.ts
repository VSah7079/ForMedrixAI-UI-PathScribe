// src/services/scanStations/mockScanStationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// See IScanStationService.ts's own header for the full rationale.
// Seeded with a few real, plausible stations covering the real
// workflow stages cerebroAdapter.ts's own header comment already
// documents — enough for the real scan-tracking flow
// (useMaterialScanTracking.ts) to have real, matchable data to
// dispatch against, not an empty dictionary with nothing configured.
// Real fix, per direct guidance: facilityId used to be a single,
// fabricated placeholder string ('lab-main') that matched no real
// Facility record at all, paired with a free-text UI field an admin
// had to type correctly by hand — genuinely unvalidated, confirmed
// directly (validateScanStationDraft.ts had no rule for it whatsoever).
// Now a real reference to an existing performing_lab Facility
// (services/facilities/) — same real "performing lab" concept
// resolvePerformingLabFacilityId()/getActivePerformingLabs() already
// establish everywhere else in this app — resolved via a real
// dropdown in ScanStationsSection.tsx, not free text. Still genuinely
// distinct from Location's own facilityId (a REFERRING hospital, where
// a patient physically is) — a scan station is about PathScribe's own
// lab bench, not a referring facility's ward; that distinction is
// unchanged, only which real value represents the bench's own lab is
// fixed here. Real, multi-site scoping (station-per-site rather than
// one shared facility across every seeded station) is real follow-up
// work if this ever needs it.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ScanStation, IScanStationService } from './IScanStationService';

const SEED_STATIONS: ScanStation[] = [
  // Real, deliberate example: this station is configured to print real
  // GS1 DataMatrix cassette labels via the seeded printer-zt411-example
  // profile (a real, QZ-Tray-bridged Zebra ZT411) — the other seeded
  // stations are left with neither flag set, since which real
  // hardware a given lab actually has is genuinely site-specific and
  // shouldn't be fabricated here.
  { id: 'station-gross-1', name: 'Grossing Station 1', barcodeCode: 'GROSSING-01', facilityId: 'c-fenwick-general', workflowStage: 'Grossing', status: 'Active', supportsEngraving: false, supportsPrinting: true, cassetteSlidePrinterProfileId: 'printer-zt411-example' },
  { id: 'station-gross-2', name: 'Grossing Station 2', barcodeCode: 'GROSSING-02', facilityId: 'c-fenwick-general', workflowStage: 'Grossing', status: 'Active', supportsEngraving: false, supportsPrinting: false },
  { id: 'station-gross-3', name: 'Grossing Station 3', barcodeCode: 'GROSSING-03', facilityId: 'c-fenwick-general', workflowStage: 'Grossing', status: 'Active', supportsEngraving: false, supportsPrinting: false },
  { id: 'station-embed-1', name: 'Histology — Embedding', barcodeCode: 'EMBEDDING-A', facilityId: 'c-fenwick-general', workflowStage: 'Embedding', status: 'Active', supportsEngraving: false, supportsPrinting: false },
  { id: 'station-micro-1', name: 'Microtomy — Bench 1', barcodeCode: 'MICROTOMY-01', facilityId: 'c-fenwick-general', workflowStage: 'Microtomy / Sectioning', status: 'Active', supportsEngraving: false, supportsPrinting: true, cassetteSlidePrinterProfileId: 'printer-zt411-example' },
  { id: 'station-stain-1', name: 'Staining Station 1', barcodeCode: 'STAINING-01', facilityId: 'c-fenwick-general', workflowStage: 'Staining', status: 'Active', supportsEngraving: false, supportsPrinting: false },
  { id: 'station-stain-2', name: 'Staining Station 2', barcodeCode: 'STAINING-02', facilityId: 'c-fenwick-general', workflowStage: 'Staining', status: 'Active', supportsEngraving: false, supportsPrinting: false },
  { id: 'station-archive-1', name: 'Slide Archive — Shelf 12', barcodeCode: 'ARCHIVE-12', facilityId: 'c-fenwick-general', workflowStage: 'Slide Archival', status: 'Active', supportsEngraving: false, supportsPrinting: false },
];

const STORAGE_KEY = 'scan_stations';

function load(): ScanStation[] {
  return storageGet<ScanStation[]>(STORAGE_KEY, SEED_STATIONS);
}

function save(stations: ScanStation[]): void {
  storageSet(STORAGE_KEY, stations);
}

export const mockScanStationService: IScanStationService = {
  async getAll(): Promise<ServiceResult<ScanStation[]>> {
    return { ok: true, data: load() };
  },

  async listForFacility(facilityId: string): Promise<ServiceResult<ScanStation[]>> {
    const all = load();
    return { ok: true, data: all.filter(s => s.facilityId === facilityId) };
  },

  async getById(id: ID): Promise<ServiceResult<ScanStation>> {
    const all = load();
    const found = all.find(s => s.id === id);
    if (!found) return { ok: false, error: `No scan station found for id '${id}'.` };
    return { ok: true, data: found };
  },

  async getByBarcodeCode(code: string): Promise<ServiceResult<ScanStation>> {
    const all = load();
    const found = all.find(s => s.barcodeCode.toLowerCase() === code.toLowerCase());
    if (!found) return { ok: false, error: `No scan station found for barcode code '${code}'.` };
    return { ok: true, data: found };
  },

  async create(draft): Promise<ServiceResult<ScanStation>> {
    const all = load();
    const now = new Date().toISOString();
    const created: ScanStation = { ...draft, id: `station-${Date.now()}`, createdAt: now, updatedAt: now };
    save([...all, created]);
    return { ok: true, data: created };
  },

  async update(id: ID, changes): Promise<ServiceResult<ScanStation>> {
    const all = load();
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return { ok: false, error: `No scan station found for id '${id}'.` };
    const updated: ScanStation = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    save(next);
    return { ok: true, data: updated };
  },

  async deactivate(id: ID): Promise<ServiceResult<ScanStation>> {
    return mockScanStationService.update(id, { status: 'Inactive' });
  },

  async reactivate(id: ID): Promise<ServiceResult<ScanStation>> {
    return mockScanStationService.update(id, { status: 'Active' });
  },
};

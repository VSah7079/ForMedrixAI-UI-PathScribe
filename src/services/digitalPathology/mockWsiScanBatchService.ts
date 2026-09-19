// src/services/digitalPathology/mockWsiScanBatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on Cytology Assisted Instrumentation —
// see IWsiScanBatchService.ts's own header for the full architectural
// account.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { IWsiScanBatchService, WsiScanBatch } from './IWsiScanBatchService';

// ─── Seed data ──────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Can you put some seed data in so that
// I can demonstrate the DP... columns and check the resulting page?
// Right now they are all blank") — real, plausible batches against
// real, already-seeded surgical pathology cases (mockCaseService.ts),
// not fabricated case ids. S26-4404's own real 6 specimens (Gleason
// 7/Grade Group 2 prostate biopsy) map to 6 real slides here.
const SEED_WSI_BATCHES: WsiScanBatch[] = [
  {
    id: 'wsi-batch-seed-4404', batchBarcode: 'WSI-20260913-0001', scannerInstrumentId: 'Leica Aperio GT450 #2',
    status: 'completed', loadedAt: '2026-09-13T08:00:00.000Z', dispatchedAt: '2026-09-13T08:05:00.000Z', unloadedAt: '2026-09-13T09:10:00.000Z',
    slides: [
      { slidePosition: '1', caseId: 'S26-4404', specimenId: 'S26-4404-SP-1', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T08:15:00.000Z', acquisitionMode: 'single_plane' },
      { slidePosition: '2', caseId: 'S26-4404', specimenId: 'S26-4404-SP-2', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T08:20:00.000Z', acquisitionMode: 'single_plane' },
      { slidePosition: '3', caseId: 'S26-4404', specimenId: 'S26-4404-SP-3', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T08:25:00.000Z', acquisitionMode: 'single_plane' },
      { slidePosition: '4', caseId: 'S26-4404', specimenId: 'S26-4404-SP-4', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T08:30:00.000Z', acquisitionMode: 'single_plane' },
      { slidePosition: '5', caseId: 'S26-4404', specimenId: 'S26-4404-SP-5', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T08:35:00.000Z', acquisitionMode: 'single_plane' },
      { slidePosition: '6', caseId: 'S26-4404', specimenId: 'S26-4404-SP-6', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T08:40:00.000Z', acquisitionMode: 'single_plane' },
    ],
  },
  // Real, deliberate partial/error mix — per direct guidance's own
  // original spec examples ("3/4 Partial (1 Scanning)", "2/3 Error
  // (Focus Fail)") — so the Digital Readiness badge's own three real
  // color states all have something real to show, not just green.
  {
    id: 'wsi-batch-seed-4408', batchBarcode: 'WSI-20260913-0002', scannerInstrumentId: 'Leica Aperio GT450 #1',
    status: 'scanning', loadedAt: '2026-09-13T09:00:00.000Z', dispatchedAt: '2026-09-13T09:05:00.000Z',
    slides: [
      { slidePosition: '1', caseId: 'S26-4408', specimenId: 'S26-4408-SP-1', scanStatus: 'completed', qcPassed: false, scanCompletedAt: '2026-09-13T09:20:00.000Z', failureReason: 'Out-of-focus', acquisitionMode: 'single_plane' },
      { slidePosition: '2', caseId: 'S26-4408', specimenId: 'S26-4408-SP-2', scanStatus: 'scanning', acquisitionMode: 'single_plane' },
    ],
  },
  // Real, a genuine Z-stack acquisition example (Cytology) — see
  // IWsiScanBatchService.ts's own WsiAcquisitionMode doc comment.
  {
    id: 'wsi-batch-seed-5002cyt', batchBarcode: 'WSI-20260913-0003', scannerInstrumentId: 'Hologic Genius Digital Diagnostics System',
    status: 'completed', loadedAt: '2026-09-13T07:00:00.000Z', dispatchedAt: '2026-09-13T07:05:00.000Z', unloadedAt: '2026-09-13T07:20:00.000Z',
    slides: [
      { slidePosition: '1', caseId: 'S26-5002-CYT-001', specimenId: 'S26-5002-SP-1', scanStatus: 'completed', qcPassed: true, scanCompletedAt: '2026-09-13T07:12:00.000Z', acquisitionMode: 'z_stack', focalPlaneCount: 9 },
    ],
  },
];

const STORE_KEY = 'wsi_scan_batches';
const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (message: string) => ({ ok: false as const, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

const load = (): WsiScanBatch[] => storageGet(STORE_KEY, SEED_WSI_BATCHES);
const persist = (data: WsiScanBatch[]) => storageSet(STORE_KEY, data);

export const mockWsiScanBatchService: IWsiScanBatchService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getById(id) {
    await delay();
    const found = load().find(b => b.id === id);
    if (!found) return err(`No WSI scan batch found with id "${id}".`);
    return ok(found);
  },

  async create(batch) {
    await delay();
    const all = load();
    const created: WsiScanBatch = {
      ...batch,
      id: 'wsi-batch-' + Date.now(),
      // Real, per this file's own header — this app's own established
      // barcode style (a real date + real sequence), matching
      // generateMolecularBatchBarcode.ts's own real convention.
      batchBarcode: `WSI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(all.length + 1).padStart(4, '0')}`,
      status: 'loaded',
      loadedAt: new Date().toISOString(),
    };
    persist([...all, created]);
    return ok(created);
  },

  async markDispatched(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(b => b.id === id);
    if (idx === -1) return err(`No WSI scan batch found with id "${id}".`);
    if (all[idx].status !== 'loaded') {
      return err(`Batch ${all[idx].batchBarcode} is not "loaded" (currently "${all[idx].status}") — a batch can only be dispatched once, from a real, freshly-loaded state.`);
    }
    const updated: WsiScanBatch = { ...all[idx], status: 'scanning', dispatchedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async markUnloaded(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(b => b.id === id);
    if (idx === -1) return err(`No WSI scan batch found with id "${id}".`);
    const batch = all[idx];
    const stillPending = batch.slides.filter(s => s.scanStatus === 'pending' || s.scanStatus === 'scanning');
    if (stillPending.length > 0) {
      return err(`${stillPending.length} of ${batch.slides.length} real slides in batch ${batch.batchBarcode} have not reached a real, terminal scan outcome yet — the instrument can't honestly be unloaded while a real slide is still pending/scanning.`);
    }
    const anyFailed = batch.slides.some(s => s.scanStatus === 'failed');
    const updated: WsiScanBatch = { ...batch, status: anyFailed ? 'failed' : 'completed', unloadedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async updateSlideStatus(batchId, slidePosition, update) {
    await delay();
    const all = load();
    const idx = all.findIndex(b => b.id === batchId);
    if (idx === -1) return err(`No WSI scan batch found with id "${batchId}".`);
    const batch = all[idx];
    const slideIdx = batch.slides.findIndex(s => s.slidePosition === slidePosition);
    if (slideIdx === -1) return err(`Batch ${batch.batchBarcode} has no real slide at position "${slidePosition}".`);
    const updatedSlides = [...batch.slides];
    updatedSlides[slideIdx] = { ...updatedSlides[slideIdx], ...update };
    const updated: WsiScanBatch = { ...batch, slides: updatedSlides };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};

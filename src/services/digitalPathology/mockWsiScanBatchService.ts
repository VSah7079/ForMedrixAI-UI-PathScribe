// src/services/digitalPathology/mockWsiScanBatchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on Cytology Assisted Instrumentation —
// see IWsiScanBatchService.ts's own header for the full architectural
// account.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { IWsiScanBatchService, WsiScanBatch } from './IWsiScanBatchService';

const STORE_KEY = 'wsi_scan_batches';
const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (message: string) => ({ ok: false as const, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

const load = (): WsiScanBatch[] => storageGet(STORE_KEY, []);
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

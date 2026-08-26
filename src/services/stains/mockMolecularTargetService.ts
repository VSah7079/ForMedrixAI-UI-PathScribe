// src/services/stains/mockMolecularTargetService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own worked examples (HER2 FISH -> [ERBB2,
// CEP17]; Lymphoma FISH Panel -> [IGH, BCL2, MYC, CCND1]). Deliberately
// uses the real, persistent storageGet/storageSet pattern (unlike
// mockStainTypeService.ts's own in-memory-only array) - a curated,
// admin-edited dictionary should genuinely survive a page reload, same
// posture as every other real billing-domain service built this
// session (mockOutboundChargeQueueService.ts, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult, ID } from '../types';
import type { IMolecularTargetService } from './IMolecularTargetService';
import type { MolecularTarget } from '@/types/billing/MolecularBillingRule';

const KEY = 'molecular_targets_v1';

const SEED: MolecularTarget[] = [
  // Real, per direct guidance's own worked example - "HER2 FISH ...
  // typically targets ERBB2 and CEP17 as a 2-probe dual-color set."
  { id: 'mt-erbb2', symbol: 'ERBB2', detail: '17q12', targetType: 'PROBE', active: true },
  { id: 'mt-cep17', symbol: 'CEP17', detail: '17p11.1-q11.1', targetType: 'PROBE', active: true },
  // Real, per direct guidance's own worked example - "Lymphoma FISH
  // Panel -> Pre-configured Probe Set: [IGH (14q32), BCL2 (18q21), MYC
  // (8q24), CCND1 (11q13)]."
  { id: 'mt-igh', symbol: 'IGH', detail: '14q32', targetType: 'PROBE', active: true },
  { id: 'mt-bcl2', symbol: 'BCL2', detail: '18q21', targetType: 'PROBE', active: true },
  { id: 'mt-myc', symbol: 'MYC', detail: '8q24', targetType: 'PROBE', active: true },
  { id: 'mt-ccnd1', symbol: 'CCND1', detail: '11q13', targetType: 'PROBE', active: true },
  // Real, per direct guidance's own worked example - "adding TP53 as
  // an extra control/reflex target."
  { id: 'mt-tp53', symbol: 'TP53', detail: '17p13.1', targetType: 'PROBE', active: true },
  // Real, per direct guidance's own worked example - "BRAF V600E /
  // KRAS / NRAS for PCR."
  { id: 'mt-braf-v600e', symbol: 'BRAF', detail: 'V600E', targetType: 'MUTATION_REGION', active: true },
  { id: 'mt-kras', symbol: 'KRAS', targetType: 'MUTATION_REGION', active: true },
  { id: 'mt-nras', symbol: 'NRAS', targetType: 'MUTATION_REGION', active: true },
];

const load    = (): MolecularTarget[] => storageGet<MolecularTarget[]>(KEY, SEED);
const persist = (data: MolecularTarget[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockMolecularTargetService: IMolecularTargetService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async add(entry) {
    await delay();
    const all = load();
    if (all.some(t => t.symbol.toLowerCase() === entry.symbol.toLowerCase() && t.detail === entry.detail)) {
      return err(`A target with symbol "${entry.symbol}"${entry.detail ? ` (${entry.detail})` : ''} already exists.`);
    }
    const created: MolecularTarget = { ...entry, id: `mt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    persist([...all, created]);
    return ok(created);
  },

  async update(id: ID, changes) {
    await delay();
    const all = load();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return err(`Molecular target ${id} not found`);
    const updated = { ...all[idx], ...changes };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};

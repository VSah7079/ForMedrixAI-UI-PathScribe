// src/services/molecular/mockMolecularAssayControlRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §3.2 "Dynamic Control
// Rules" / "Position Enforcements" — see
// IMolecularAssayControlRuleService.ts's own header for the full
// account of why this exists.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type {
  IMolecularAssayControlRuleService, MolecularAssayControlRule, NewMolecularAssayControlRule,
} from './IMolecularAssayControlRuleService';

const STORE_KEY = 'molecular_assay_control_rules';
const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (message: string) => ({ ok: false as const, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

// Real, seeded rule — matches the given specification's own §4.1
// worked example exactly (assay HPV_HR_PCR, an NTC fixed at A01 and a
// PTC_HIGH fixed at A02), so the seeded batch already satisfies a
// real rule out of the box rather than immediately failing one no
// rule previously existed to enforce.
const SEED: MolecularAssayControlRule[] = [
  {
    id: 'rule-001',
    // Real, per direct follow-up ("wouldn't we use the existing
    // process catalog to define the assays?") — same real fix as
    // mockMolecularBatchService.ts's own seed data: a real reference
    // to StainType.id, not a disconnected, free-typed string.
    assayCode: 'st-hpv-highrisk-screen',
    requiredControls: [
      { sampleType: 'CONTROL_NTC', positionMode: 'fixed', fixedWellPosition: 'A01' },
      { sampleType: 'CONTROL_PTC_HIGH', positionMode: 'fixed', fixedWellPosition: 'A02' },
    ],
    createdAt: '2026-09-06T15:00:00.000Z',
  },
];

const load = (): MolecularAssayControlRule[] => storageGet(STORE_KEY, SEED);
const persist = (data: MolecularAssayControlRule[]) => storageSet(STORE_KEY, data);

export const mockMolecularAssayControlRuleService: IMolecularAssayControlRuleService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByAssayCode(assayCode) {
    await delay();
    return ok(load().find(r => r.assayCode === assayCode) ?? null);
  },

  async create(rule: NewMolecularAssayControlRule) {
    await delay();
    const all = load();
    if (all.some(r => r.assayCode === rule.assayCode)) {
      return err(`A control rule already exists for assay "${rule.assayCode}" — update it instead of creating a second one.`);
    }
    const created: MolecularAssayControlRule = { ...rule, id: 'rule-' + Date.now(), createdAt: new Date().toISOString() };
    persist([...all, created]);
    return ok(created);
  },

  async update(id, patch) {
    await delay();
    const all = load();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return err(`No control rule found with id "${id}".`);
    const updated: MolecularAssayControlRule = { ...all[idx], ...patch };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async delete(id) {
    await delay();
    const all = load();
    if (!all.some(r => r.id === id)) return err(`No control rule found with id "${id}".`);
    persist(all.filter(r => r.id !== id));
    return ok(undefined);
  },
};

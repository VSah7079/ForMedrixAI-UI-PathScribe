// src/services/abnormalDetection/mockAbnormalTriggerRuleService.ts
// PS-129. Same storageGet/storageSet + CRUD pattern as
// mockResolutionTypeService.ts — see that file for the established
// precedent this mirrors.

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { AbnormalTriggerRule, IAbnormalTriggerRuleService } from './IAbnormalTriggerRuleService';

// Real, per direct spec (PS-105's own named examples) — a genuinely
// useful starting dictionary, not placeholder data. An admin can add,
// edit, or deactivate any of these, and add their own.
const SEED_TRIGGER_RULES: AbnormalTriggerRule[] = [
  {
    id: 'atr-margin-positive', fieldLabel: 'Margin Status', triggerValues: ['Positive'],
    severity: 'Critical', status: 'Active',
    description: 'A positive margin indicates residual tumor at the resection edge — directly affects surgical management.',
  },
  {
    id: 'atr-perineural-present', fieldLabel: 'Perineural Invasion', triggerValues: ['Present'],
    severity: 'Abnormal', status: 'Active',
    description: 'Perineural invasion is an adverse prognostic feature relevant to staging and adjuvant therapy decisions.',
  },
  {
    id: 'atr-lymph-node-positive', fieldLabel: 'Lymph Node Status', triggerValues: ['Positive'],
    severity: 'Critical', status: 'Active',
    description: 'Nodal involvement directly affects staging and treatment planning.',
  },
  {
    id: 'atr-lymphovascular-present', fieldLabel: 'Lymphovascular Invasion', triggerValues: ['Present'],
    severity: 'Abnormal', status: 'Active',
    description: 'Lymphovascular invasion is an adverse prognostic feature.',
  },
];

const load    = () => storageGet<AbnormalTriggerRule[]>('pathscribe_abnormal_trigger_rules', SEED_TRIGGER_RULES);
const persist = (data: AbnormalTriggerRule[]) => storageSet('pathscribe_abnormal_trigger_rules', data);
let RULES: AbnormalTriggerRule[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockAbnormalTriggerRuleService: IAbnormalTriggerRuleService = {
  async getAll() { await delay(); return ok([...RULES]); },

  async add(rule) {
    await delay();
    const newRule: AbnormalTriggerRule = { ...rule, id: 'atr-' + Date.now() };
    RULES = [...RULES, newRule];
    persist(RULES);
    return ok({ ...newRule });
  },

  async update(id, changes) {
    await delay();
    const idx = RULES.findIndex(r => r.id === id);
    if (idx === -1) return err(`Abnormal trigger rule ${id} not found`);
    RULES = RULES.map(r => r.id === id ? { ...r, ...changes } : r);
    persist(RULES);
    return ok({ ...RULES[idx], ...changes });
  },

  async deactivate(id) { return mockAbnormalTriggerRuleService.update(id, { status: 'Inactive' }); },
  async reactivate(id) { return mockAbnormalTriggerRuleService.update(id, { status: 'Active' }); },
};

// src/services/delivery/mockDeliveryRuleService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IDeliveryRuleService } from './IDeliveryRuleService';
import type { DeliveryRule } from '@/types/delivery/DeliveryRule';

const KEY = 'delivery_rules_v1';

const load    = (): DeliveryRule[] => storageGet<DeliveryRule[]>(KEY, []);
const persist = (data: DeliveryRule[]) => storageSet(KEY, data);

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockDeliveryRuleService: IDeliveryRuleService = {
  async getAll() {
    return ok(load());
  },

  async getActive() {
    return ok(load().filter(r => r.active));
  },

  async create(rule) {
    const now = new Date().toISOString();
    const newRule: DeliveryRule = { ...rule, id: 'dr-' + Date.now().toString(36), createdAt: now, updatedAt: now };
    persist([...load(), newRule]);
    return ok(newRule);
  },

  async update(id, changes) {
    const all = load();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return err(`Delivery rule ${id} not found`);
    const updated: DeliveryRule = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async remove(id) {
    persist(load().filter(r => r.id !== id));
    return { ok: true, data: undefined };
  },
};

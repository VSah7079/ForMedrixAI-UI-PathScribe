// src/services/printRouting/mockPrintRoutingRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278. localStorage-backed, same real pattern as
// mockDeliveryRuleService.ts/mockRoutingRuleService.ts. Seeded with
// one real, demonstrable example rule at each of the four real tiers
// (see PrintRoutingRule.ts's own header) so resolvePrintDestination's
// own ordered-tier walk has real, matchable data to demonstrate
// against — not an empty rule set that always falls through to
// Facility.printDeliveryConfig.directNetworkPrintDestination. Built
// against the same demo facility/location this app's other seed data
// (TAT config, mockLocationService) already uses — Fenwick General
// Hospital ('c-fenwick-general') and its own Theatre 2
// ('loc-fgh-theatre-2') — rather than inventing a parallel demo site.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IPrintRoutingRuleService } from './IPrintRoutingRuleService';
import type { PrintRoutingRule } from '@/types/printRouting/PrintRoutingRule';

const KEY = 'print_routing_rules_v1';

const SEED_RULES: PrintRoutingRule[] = [
  {
    // Most specific real tier — a named workstation in the frozen-
    // section suite gets its own directly-attached network printer,
    // real per §2.1.1's own Specimen/Case Type criterion: only for a
    // real FROZEN_SECTION job, so a routine report queued from the
    // same workstation still falls through to a less specific tier.
    id: 'prr-seed-workstation-frozen',
    scopeType: 'workstation',
    scopeId: 'ws-fgh-theatre2-01',
    specimenCaseType: 'FROZEN_SECTION',
    printDestination: {
      protocol: 'RAW_9100',
      ipAddress: '192.168.14.21',
      displayName: 'Theatre 2 Frozen Section Printer (RAW/9100)',
    },
    note: 'Frozen section results must print at the workstation inside Theatre 2 itself, never a shared corridor printer — turnaround is measured in minutes.',
    active: true,
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-01-15T09:00:00Z',
  },
  {
    // Second tier — every job originating from Theatre 2's own
    // pointOfCare (any workstation, not just the seeded one above)
    // prints to the OR floor's shared network printer via LPR/LPD.
    id: 'prr-seed-location-theatre2',
    scopeType: 'location',
    scopeId: 'Theatre 2',
    printDestination: {
      protocol: 'LPR_LPD',
      ipAddress: '192.168.14.30',
      queueName: 'or-floor-lp',
      displayName: 'OR Floor Network Printer (LPR/LPD)',
    },
    note: 'OR-suite default per the source spec’s own Use Case 3 (OR floor network printer).',
    active: true,
    createdAt: '2026-01-15T09:05:00Z',
    updatedAt: '2026-01-15T09:05:00Z',
  },
  {
    // Third tier — a specific ordering client account (a referring
    // practice) has its own contracted print destination, real per
    // §2.1.1's Event Trigger Type criterion: only for an amended
    // sign-out, so a first-time (Initial Sign-out) report from the
    // same client still falls through to the facility default.
    id: 'prr-seed-clientaccount-amended',
    scopeType: 'clientAccount',
    scopeId: 'c-fenwick-womens',
    eventTriggerType: 'AMENDED_SIGNOUT',
    printDestination: {
      protocol: 'IPP',
      ipAddress: '192.168.20.40',
      resourcePath: '/ipp/print',
      displayName: 'Fenwick Women’s Client Account Printer (IPP)',
    },
    note: 'Fenwick Women’s Hospital asked for amended reports to print at their own front-desk IPP printer for immediate manual re-filing, never their routine electronic-only path.',
    active: true,
    createdAt: '2026-01-15T09:10:00Z',
    updatedAt: '2026-01-15T09:10:00Z',
  },
  {
    // Least specific real tier — the facility-wide default, no
    // criteria set (a real, valid wildcard-everything rule, same
    // posture DeliveryRule.ts's own header documents for a rule with
    // zero criteria — lowest priority, but still real and matchable).
    id: 'prr-seed-facility-default',
    scopeType: 'facility',
    scopeId: 'c-fenwick-general',
    printDestination: {
      protocol: 'RAW_9100',
      ipAddress: '192.168.14.10',
      displayName: 'Pathology Lab Default Printer (RAW/9100)',
    },
    note: 'Facility system default — every real job at Fenwick General with no more specific real match lands here.',
    active: true,
    createdAt: '2026-01-15T09:15:00Z',
    updatedAt: '2026-01-15T09:15:00Z',
  },
];

const load    = (): PrintRoutingRule[] => storageGet<PrintRoutingRule[]>(KEY, SEED_RULES);
const persist = (data: PrintRoutingRule[]) => storageSet(KEY, data);

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockPrintRoutingRuleService: IPrintRoutingRuleService = {
  async getAll() {
    return ok(load());
  },

  async getActive() {
    return ok(load().filter(r => r.active));
  },

  async create(rule) {
    const now = new Date().toISOString();
    const newRule: PrintRoutingRule = { ...rule, id: 'prr-' + Date.now().toString(36), createdAt: now, updatedAt: now };
    persist([...load(), newRule]);
    return ok(newRule);
  },

  async update(id, changes) {
    const all = load();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return err(`Print routing rule ${id} not found`);
    const updated: PrintRoutingRule = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
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

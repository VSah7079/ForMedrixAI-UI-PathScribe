// src/services/routingRules/mockRoutingRuleService.ts
import type { IRoutingRuleService, RoutingRule, RoutingRuleType } from './IRoutingRuleService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const KEY     = 'pathscribe_routing_rules_v1';

function load(): RoutingRule[] {
  return storageGet<RoutingRule[]>(KEY, []) ?? [];
}
function save(rules: RoutingRule[]): void {
  storageSet(KEY, rules);
}
function genId(): string {
  return `rr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data } as any;
}
function err(msg: string): ServiceResult<never> {
  return { ok: false, error: msg } as any;
}

/**
 * Real, per direct guidance ("Routing Rules should also be tied to a
 * Performing Lab facility"): builds the { entityId: templateId } map
 * TemplateRoutingService actually consumes, resolving the single most
 * specific real rule per entityId when more than one exists for it —
 * a rule scoped to performingLabFacilityId always wins over a Global
 * one (undefined performingLabFacilityId) for that same lab's own
 * cases, same most-specific-wins precedence TAT Configuration and
 * Template Routing's own Pass 0 already use elsewhere. Exported (not
 * just used internally) so RoutingRulesTab.tsx's own Test panel can
 * reuse the exact same resolution logic against its own, not-yet-saved
 * draft rules, rather than a second, parallel implementation that
 * could drift from this one.
 */
export function buildRoutingRuleMap(rules: RoutingRule[], performingLabFacilityId?: string): Record<string, string> {
  const byEntity = new Map<string, RoutingRule[]>();
  rules.forEach(r => {
    const list = byEntity.get(r.entityId) ?? [];
    list.push(r);
    byEntity.set(r.entityId, list);
  });
  const map: Record<string, string> = {};
  byEntity.forEach((candidates, entityId) => {
    const labSpecific = performingLabFacilityId
      ? candidates.find(r => r.performingLabFacilityId === performingLabFacilityId)
      : undefined;
    const winner = labSpecific ?? candidates.find(r => !r.performingLabFacilityId);
    if (winner) map[entityId] = winner.templateId;
  });
  return map;
}

export const mockRoutingRuleService: IRoutingRuleService = {
  async getAll() {
    return ok(load());
  },
  async getByType(type: RoutingRuleType) {
    return ok(load().filter(r => r.type === type));
  },
  async getById(id: ID) {
    const r = load().find(r => r.id === id);
    return r ? ok(r) : err(`Routing rule ${id} not found`);
  },
  async add(rule) {
    const rules = load();
    const now   = new Date().toISOString();
    const newRule: RoutingRule = {
      ...rule,
      id:        genId(),
      createdAt: now,
      updatedAt: now,
    };
    save([...rules, newRule]);
    return ok(newRule);
  },
  async update(id, changes) {
    const rules = load();
    const idx   = rules.findIndex(r => r.id === id);
    if (idx < 0) return err(`Routing rule ${id} not found`);
    const updated = { ...rules[idx], ...changes, updatedAt: new Date().toISOString() };
    rules[idx] = updated;
    save(rules);
    return ok(updated);
  },
  async remove(id) {
    save(load().filter(r => r.id !== id));
    return ok(undefined as void);
  },
  async getFacilityMap(performingLabFacilityId) {
    const rules = load().filter(r => r.type === 'client' && r.active);
    return ok(buildRoutingRuleMap(rules, performingLabFacilityId));
  },
  async getPhysicianMap(performingLabFacilityId) {
    const rules = load().filter(r => r.type === 'physician' && r.active);
    return ok(buildRoutingRuleMap(rules, performingLabFacilityId));
  },
  async getProtocolMap(performingLabFacilityId) {
    const rules = load().filter(r => r.type === 'protocol' && r.active);
    return ok(buildRoutingRuleMap(rules, performingLabFacilityId));
  },
};

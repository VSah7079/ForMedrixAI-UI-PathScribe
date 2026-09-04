// src/services/routingRules/IRoutingRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Contract for template routing rule persistence.
// Rules are admin-defined overrides that take priority over the default
// synoptic protocol → subspecialty → gold-standard resolution chain.
//
// Priority order (matches TemplateRoutingService):
//   Pass 0  — Client override   (clientId → templateId)
//   Pass 0a — Enterprise client override (real, per direct guidance —
//             an affiliate facility with no own rule rolls up to its
//             real Enterprise parent's own rule, one hop, via the same
//             clientId → templateId map — no separate storage)
//   Pass 0b — Physician pref    (physicianId → templateId)
//   Pass 1  — Synoptic protocol (admin-defined rules below, merged with the
//                                 hardcoded fallback map in TemplateRoutingService —
//                                 admin rules take precedence)
//   Pass 2  — Subspecialty      (hardcoded in TemplateRoutingService)
//   Pass 3  — Gold standard     (universal fallback)
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type RoutingRuleType = 'client' | 'physician' | 'protocol';

export interface RoutingRule {
  id:           ID;
  type:         RoutingRuleType;
  /** clientId, physicianId, or synoptic protocol ID, depending on type */
  entityId:     string;
  /** Cached display name — avoids async lookup */
  entityName:   string;
  /** Target report template ID */
  templateId:   string;
  /** Cached template name */
  templateName: string;
  /** Optional note explaining why this override exists */
  note?:        string;
  /**
   * Real, per direct guidance: which real performing lab this rule
   * applies to — same Global/scoped convention as everywhere else in
   * this app (ContainerType/DeficiencyType/CaseRouting pools/
   * PrinterProfile). Undefined = Global, checked for every performing
   * lab's cases; set = only ever considered for that lab's own cases.
   * Most-specific-wins when two rules share the same entityId — a
   * lab-specific rule always beats a Global one for that lab, same
   * precedence TAT Configuration and Template Routing's own Pass 0
   * already use elsewhere. Resolved via resolvePerformingLabFacilityId()
   * on the case's own ordering facility, never a direct field read.
   */
  performingLabFacilityId?: string;
  active:       boolean;
  createdAt:    string;
  updatedAt:    string;
  createdBy:    string;
}

export interface IRoutingRuleService {
  getAll():                               Promise<ServiceResult<RoutingRule[]>>;
  getByType(type: RoutingRuleType):       Promise<ServiceResult<RoutingRule[]>>;
  getById(id: ID):                        Promise<ServiceResult<RoutingRule>>;
  add(rule: Omit<RoutingRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<RoutingRule>>;
  update(id: ID, changes: Partial<Omit<RoutingRule, 'id' | 'createdAt'>>): Promise<ServiceResult<RoutingRule>>;
  remove(id: ID):                         Promise<ServiceResult<void>>;
  /**
   * Returns the map used by TemplateRoutingService — { entityId: templateId }.
   * Real, per direct guidance: performingLabFacilityId picks the real,
   * most-specific rule per entityId when more than one exists for it
   * (a lab-specific rule wins over a Global one for that lab) —
   * resolved here, inside the map-building step, so
   * TemplateRoutingService's own flat-map-merge logic never has to
   * change to support lab-scoping.
   */
  getFacilityMap(performingLabFacilityId?: string):  Promise<ServiceResult<Record<string, string>>>;
  getPhysicianMap(performingLabFacilityId?: string): Promise<ServiceResult<Record<string, string>>>;
  /** Admin-defined synoptic protocol → template overrides — { protocolId: templateId } */
  getProtocolMap(performingLabFacilityId?: string):  Promise<ServiceResult<Record<string, string>>>;
}

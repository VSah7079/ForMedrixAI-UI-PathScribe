// src/services/cytologyQc/ICytologyQcRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §2.1's own Rule Configuration Engine — CRUD for the
// admin-defined rules themselves, genuinely separate from
// ICytologyQcCaseAssignmentService.ts (which manages what happens
// once a real case is evaluated against these rules).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { CytologyQcRule } from '@/types/cytologyQc/CytologyQcRule';

export type NewCytologyQcRule = Omit<CytologyQcRule, 'id'>;

export interface ICytologyQcRuleService {
  getAll(): Promise<ServiceResult<CytologyQcRule[]>>;
  getActive(): Promise<ServiceResult<CytologyQcRule[]>>;
  getById(id: ID): Promise<ServiceResult<CytologyQcRule>>;
  add(rule: NewCytologyQcRule): Promise<ServiceResult<CytologyQcRule>>;
  update(id: ID, changes: Partial<NewCytologyQcRule>): Promise<ServiceResult<CytologyQcRule>>;
  deactivate(id: ID): Promise<ServiceResult<CytologyQcRule>>;
  reactivate(id: ID): Promise<ServiceResult<CytologyQcRule>>;
  remove(id: ID): Promise<ServiceResult<void>>;
  /** Real, per direct guidance — copies an existing rule's own real
   *  criteria/sampling/tier/SLA config into a brand-new rule, ready
   *  for a small, targeted edit rather than rebuilding a similar
   *  rule from scratch. Real, deliberate: the copy starts inactive —
   *  never live, matching-real-cases, until an admin has actually
   *  reviewed and explicitly reactivated it. */
  duplicate(id: ID): Promise<ServiceResult<CytologyQcRule>>;
}

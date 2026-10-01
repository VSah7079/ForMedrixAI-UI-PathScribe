// src/services/printRouting/IPrintRoutingRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Standard interface/mock pattern, same as every other admin-defined
// rule set in this app (IRoutingRuleService, IDeliveryRuleService).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { PrintRoutingRule } from '@/types/printRouting/PrintRoutingRule';

export interface IPrintRoutingRuleService {
  getAll(): Promise<ServiceResult<PrintRoutingRule[]>>;
  getActive(): Promise<ServiceResult<PrintRoutingRule[]>>;
  create(rule: Omit<PrintRoutingRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<PrintRoutingRule>>;
  update(id: ID, changes: Partial<Omit<PrintRoutingRule, 'id' | 'createdAt'>>): Promise<ServiceResult<PrintRoutingRule>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}

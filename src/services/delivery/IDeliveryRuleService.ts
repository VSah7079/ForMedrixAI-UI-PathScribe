// src/services/delivery/IDeliveryRuleService.ts
import type { ServiceResult } from '../types';
import type { DeliveryRule } from '@/types/delivery/DeliveryRule';

export interface IDeliveryRuleService {
  getAll(): Promise<ServiceResult<DeliveryRule[]>>;
  getActive(): Promise<ServiceResult<DeliveryRule[]>>;
  create(rule: Omit<DeliveryRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<DeliveryRule>>;
  update(id: string, changes: Partial<Omit<DeliveryRule, 'id' | 'createdAt'>>): Promise<ServiceResult<DeliveryRule>>;
  remove(id: string): Promise<ServiceResult<void>>;
}

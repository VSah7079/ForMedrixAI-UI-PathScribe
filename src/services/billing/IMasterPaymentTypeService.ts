// src/services/billing/IMasterPaymentTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: a simple, direct CRUD dictionary service —
// NOT the heavier versioned/dual-control-approval pattern
// IModifierDictionaryService.ts uses. That pattern exists because CPT
// modifiers are real, licensed AMA content with a genuine regulatory
// reason to track who approved what version. Master Payment Type is
// structural, jurisdiction-agnostic reference data an admin
// configures directly — same simple shape as TATConfigSection.tsx's
// own TATEntry CRUD, not a licensed code table.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { MasterPaymentType, GuarantorRequirement } from '../../types/billing/MasterPaymentType';

export interface IMasterPaymentTypeService {
  getAll(): Promise<ServiceResult<MasterPaymentType[]>>;
  getById(id: string): Promise<ServiceResult<MasterPaymentType>>;
  add(input: {
    id: string;
    displayName: string;
    requiresSubscriberId: boolean;
    subscriberIdLabel?: string;
    requiresGuarantor: GuarantorRequirement;
    supportsSplitBilling: boolean;
    notes?: string;
  }): Promise<ServiceResult<MasterPaymentType>>;
  update(id: string, changes: Partial<Omit<MasterPaymentType, 'id' | 'createdAt'>>): Promise<ServiceResult<MasterPaymentType>>;
  deactivate(id: string): Promise<ServiceResult<MasterPaymentType>>;
  reactivate(id: string): Promise<ServiceResult<MasterPaymentType>>;
}

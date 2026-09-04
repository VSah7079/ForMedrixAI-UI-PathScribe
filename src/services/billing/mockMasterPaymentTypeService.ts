// src/services/billing/mockMasterPaymentTypeService.ts
import { IMasterPaymentTypeService } from './IMasterPaymentTypeService';
import { MasterPaymentType } from '../../types/billing/MasterPaymentType';
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';

function ok<T>(data: T): ServiceResult<T> { return { ok: true, data } as any; }
function err(msg: string): ServiceResult<never> { return { ok: false, error: msg } as any; }

// Real, per direct guidance — every row transcribed directly from the
// source spec's own Section 3.1 table (Master Payment Type Dictionary
// (Core Schema)), not invented. id is the spec's own "Master Category
// ID" column, kept verbatim since JurisdictionPaymentMapping rows
// reference it directly.
const SEED: MasterPaymentType[] = [
  { id: 'SELF_PAY', displayName: 'Self-Pay / Direct Patient', requiresSubscriberId: false, requiresGuarantor: 'optional', supportsSplitBilling: false, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'PATIENT_COPAY_GAP', displayName: 'Statutory Co-Pay / Gap Fee', requiresSubscriberId: false, requiresGuarantor: 'required', supportsSplitBilling: true, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'COMMERCIAL_INSURANCE', displayName: 'Commercial / Private Health Insurance', requiresSubscriberId: true, requiresGuarantor: 'required', supportsSplitBilling: true, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'MUTUELLE_COMPLEMENTARY', displayName: 'Secondary / Complementary Insurance', requiresSubscriberId: true, requiresGuarantor: 'not_required', supportsSplitBilling: true, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'STATUTORY_SOCIAL_HEALTH', displayName: 'Statutory / Social Health Insurance (GKV, CPAM, NHIS)', requiresSubscriberId: true, requiresGuarantor: 'not_required', supportsSplitBilling: true, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'PUBLIC_UNIVERSAL_BENEFIT', displayName: 'Public Universal Benefit (Medicare, OHIP, MBS)', requiresSubscriberId: true, requiresGuarantor: 'not_required', supportsSplitBilling: true, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'PUBLIC_NHS', displayName: 'National Health Service (UK/Devolved Nations)', requiresSubscriberId: true, subscriberIdLabel: 'NHS Number', requiresGuarantor: 'not_required', supportsSplitBilling: false, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'RECIPROCAL_INTERNATIONAL', displayName: 'Reciprocal / Cross-Border (EHIC/GHIC, RHCA)', requiresSubscriberId: true, requiresGuarantor: 'not_required', supportsSplitBilling: false, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'SPONSOR_CLINICAL_TRIAL', displayName: 'Third-Party Sponsor / Clinical Trial', requiresSubscriberId: false, requiresGuarantor: 'not_required', supportsSplitBilling: false, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'OCCUPATIONAL_WORKERS_COMP', displayName: "Workers' Compensation / Occupational Health", requiresSubscriberId: true, subscriberIdLabel: 'Claim #', requiresGuarantor: 'required', supportsSplitBilling: false, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'DIRECT_CONTRACT_INSTITUTIONAL', displayName: 'Direct B2B / Facility Account Contract', requiresSubscriberId: false, requiresGuarantor: 'not_required', supportsSplitBilling: false, active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

const STORAGE_KEY = 'pathscribe_master_payment_types';
const load = () => storageGet<MasterPaymentType[]>(STORAGE_KEY, SEED);
const persist = (data: MasterPaymentType[]) => storageSet(STORAGE_KEY, data);

export const mockMasterPaymentTypeService: IMasterPaymentTypeService = {
  async getAll() {
    return ok(load());
  },
  async getById(id) {
    const found = load().find(t => t.id === id);
    return found ? ok(found) : err(`Master payment type ${id} not found`);
  },
  async add(input) {
    const all = load();
    if (all.some(t => t.id === input.id)) return err(`Master payment type ${input.id} already exists`);
    const now = new Date().toISOString();
    const created: MasterPaymentType = { ...input, active: true, createdAt: now, updatedAt: now };
    persist([...all, created]);
    return ok(created);
  },
  async update(id, changes) {
    const all = load();
    const idx = all.findIndex(t => t.id === id);
    if (idx < 0) return err(`Master payment type ${id} not found`);
    const updated = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    all[idx] = updated;
    persist(all);
    return ok(updated);
  },
  async deactivate(id) {
    return this.update(id, { active: false });
  },
  async reactivate(id) {
    return this.update(id, { active: true });
  },
};

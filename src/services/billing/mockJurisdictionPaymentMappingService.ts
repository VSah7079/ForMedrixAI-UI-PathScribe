// src/services/billing/mockJurisdictionPaymentMappingService.ts
import { IJurisdictionPaymentMappingService } from './IJurisdictionPaymentMappingService';
import { JurisdictionPaymentMapping } from '../../types/billing/JurisdictionPaymentMapping';
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';

function ok<T>(data: T): ServiceResult<T> { return { ok: true, data } as any; }
function err(msg: string): ServiceResult<never> { return { ok: false, error: msg } as any; }

function genId(): string {
  return 'jpm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// Real, per direct guidance — every row transcribed directly from the
// source spec's own Section 3.2 table (Jurisdiction Mapping Dictionary
// Matrix), not invented. masterPaymentTypeId values match
// mockMasterPaymentTypeService.ts's own real seed ids exactly.
const SEED: JurisdictionPaymentMapping[] = [
  { id: 'jpm-us-medicare', countryCode: 'US', localSchemeCode: 'US_MEDICARE', localDisplayTerminology: 'Medicare Part B', masterPaymentTypeId: 'PUBLIC_UNIVERSAL_BENEFIT', primaryOutboundFormat: 'X12 837P', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-us-commercial', countryCode: 'US', localSchemeCode: 'US_COMMERCIAL', localDisplayTerminology: 'Commercial Plan (PPO/HMO)', masterPaymentTypeId: 'COMMERCIAL_INSURANCE', primaryOutboundFormat: 'X12 837P', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-ca-ohip', countryCode: 'CA_ON', localSchemeCode: 'CA_OHIP', localDisplayTerminology: 'Ontario Health Insurance Plan', masterPaymentTypeId: 'PUBLIC_UNIVERSAL_BENEFIT', primaryOutboundFormat: 'EDT Claims File', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-uk-nhs', countryCode: 'UK', localSchemeCode: 'UK_NHS_TRUST', localDisplayTerminology: 'NHS Commissioned Work', masterPaymentTypeId: 'PUBLIC_NHS', primaryOutboundFormat: 'NHS Trust Summary Batch', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-de-gkv', countryCode: 'DE', localSchemeCode: 'DE_GKV', localDisplayTerminology: 'Gesetzliche Krankenversicherung', masterPaymentTypeId: 'STATUTORY_SOCIAL_HEALTH', primaryOutboundFormat: 'KBV / KVDT Format', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-de-bg', countryCode: 'DE', localSchemeCode: 'DE_BG', localDisplayTerminology: 'Berufsgenossenschaft (BG)', masterPaymentTypeId: 'OCCUPATIONAL_WORKERS_COMP', primaryOutboundFormat: 'BG-Abrechnung', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-fr-cpam', countryCode: 'FR', localSchemeCode: 'FR_CPAM', localDisplayTerminology: 'Sécurité Sociale (CPAM)', masterPaymentTypeId: 'STATUTORY_SOCIAL_HEALTH', primaryOutboundFormat: 'SESAM-Vitale / B2', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-fr-mutuelle', countryCode: 'FR', localSchemeCode: 'FR_MUTUELLE', localDisplayTerminology: 'Mutuelle Complémentaire', masterPaymentTypeId: 'MUTUELLE_COMPLEMENTARY', primaryOutboundFormat: 'Tiers Payant Direct', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-nl-basis', countryCode: 'NL', localSchemeCode: 'NL_BASIS', localDisplayTerminology: 'Basisverzekering', masterPaymentTypeId: 'STATUTORY_SOCIAL_HEALTH', primaryOutboundFormat: 'Vektis EI Standard', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-be-mut', countryCode: 'BE', localSchemeCode: 'BE_MUT', localDisplayTerminology: 'Ziekenfonds / Mutualité', masterPaymentTypeId: 'STATUTORY_SOCIAL_HEALTH', primaryOutboundFormat: 'INAMI / RIZIV Record', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-au-mbs', countryCode: 'AU', localSchemeCode: 'AU_MBS', localDisplayTerminology: 'Medicare / Bulk Billing', masterPaymentTypeId: 'PUBLIC_UNIVERSAL_BENEFIT', primaryOutboundFormat: 'Medicare Online / ECLIPSE', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-nz-acc', countryCode: 'NZ', localSchemeCode: 'NZ_ACC', localDisplayTerminology: 'Accident Compensation Corp', masterPaymentTypeId: 'OCCUPATIONAL_WORKERS_COMP', primaryOutboundFormat: 'ACC Online Claim', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'jpm-kr-nhis', countryCode: 'KR', localSchemeCode: 'KR_NHIS', localDisplayTerminology: 'National Health Insurance (NHIS)', masterPaymentTypeId: 'STATUTORY_SOCIAL_HEALTH', primaryOutboundFormat: 'HIRA Electronic EDI', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

const STORAGE_KEY = 'pathscribe_jurisdiction_payment_mappings';
const load = () => storageGet<JurisdictionPaymentMapping[]>(STORAGE_KEY, SEED);
const persist = (data: JurisdictionPaymentMapping[]) => storageSet(STORAGE_KEY, data);

export const mockJurisdictionPaymentMappingService: IJurisdictionPaymentMappingService = {
  async getAll() {
    return ok(load());
  },
  async getById(id) {
    const found = load().find(m => m.id === id);
    return found ? ok(found) : err(`Jurisdiction payment mapping ${id} not found`);
  },
  async getByCountry(countryCode) {
    return ok(load().filter(m => m.countryCode === countryCode && m.active));
  },
  async add(input) {
    const all = load();
    const now = new Date().toISOString();
    const created: JurisdictionPaymentMapping = { ...input, id: genId(), active: true, createdAt: now, updatedAt: now };
    persist([...all, created]);
    return ok(created);
  },
  async update(id, changes) {
    const all = load();
    const idx = all.findIndex(m => m.id === id);
    if (idx < 0) return err(`Jurisdiction payment mapping ${id} not found`);
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

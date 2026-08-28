// src/services/billing/mockBillingDeficiencyService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IBillingDeficiencyService } from './IBillingDeficiencyService';
import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';

const KEY = 'billing_deficiency_records_v1';

const load    = (): BillingDeficiencyRecord[] => storageGet<BillingDeficiencyRecord[]>(KEY, SEED_BILLING_DEFICIENCIES);
const persist = (data: BillingDeficiencyRecord[]) => storageSet(KEY, data);

// Real, per direct request ahead of the Billing expert meeting — same
// real gap as mockServiceChargeService.ts's own (zero seed data,
// confirmed directly), leaving the Financials pillar's KPI cards and
// table entirely empty on a fresh session. Three real
// checkSignOutBillingDeficiencies.ts triggers, shown across all three
// real severity categories and two real lifecycle stages (OPEN,
// RESOLVED) — not one static example.
const SEED_BILLING_DEFICIENCIES: BillingDeficiencyRecord[] = [
  {
    id: 'bd-seed-001', caseId: 'S26-4402-COLON-RES', chargeRecordId: 'chg-S26-4402-COLON-RES-A-88307',
    deficiencyType: 'MODIFIER_MISMATCH', severity: 'CRITICAL_REJECTION_RISK', status: 'OPEN',
    raisedByTrigger: 'AUTO_NCCI_CHECK',
    auditorNotes: '88307 resolved with billingType \u2019TC\u2019 but no -TC modifier was attached to the charge — technical/professional split configured on the rule but the resolved charge is missing the expected modifier. Payer rejection risk if exported as-is.',
    createdAt: '2026-08-26T11:20:00.000Z', createdBy: 'system',
  },
  {
    id: 'bd-seed-002', caseId: 'S26-4402-COLON-RES', chargeRecordId: 'chg-S26-4402-COLON-RES-B-88305',
    deficiencyType: 'ZERO_FEE_MAPPING_ERROR', severity: 'REVENUE_LEAKAGE', status: 'OPEN',
    raisedByTrigger: 'AUTO_CROSSWALK_CHECK',
    auditorNotes: '88305 resolved with rvuWork, rvuPe, and rvuMp all $0.00/unset and no explicit suppressionAdvisory on the billing rule — this charge would export with zero real fee value attached, silently losing billable revenue rather than being an intentional, documented suppression.',
    createdAt: '2026-08-27T07:45:00.000Z', createdBy: 'system',
  },
  {
    id: 'bd-seed-003', caseId: 'S26-4401-BX-001',
    deficiencyType: 'MISSING_DIAGNOSTIC_ICD10', severity: 'COMPLIANCE_WARNING', status: 'RESOLVED',
    raisedByTrigger: 'AUTO_CROSSWALK_CHECK',
    resolutionReasonCode: 'PHYSICIAN_ADDENDUM_ADDED',
    auditorNotes: 'Case-wide charge generation completed at sign-out with no cross-mapped ICD-10 diagnosis code attached to Specimen A — required for claim submission.',
    createdAt: '2026-08-24T15:10:00.000Z', createdBy: 'system',
    resolvedAt: '2026-08-24T16:55:00.000Z', resolvedBy: 'PATH-001',
  },
];

const delay = () => new Promise(r => setTimeout(r, 120));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockBillingDeficiencyService: IBillingDeficiencyService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(d => d.caseId === caseId));
  },

  async raise(deficiency) {
    await delay();
    const newRecord: BillingDeficiencyRecord = {
      ...deficiency,
      id: 'bdef-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    const all = load();
    persist([...all, newRecord]);
    return ok(newRecord);
  },

  async resolve(id, resolution) {
    await delay();
    const all = load();
    const idx = all.findIndex(d => d.id === id);
    if (idx === -1) return err(`Billing deficiency ${id} not found`);
    const updated: BillingDeficiencyRecord = {
      ...all[idx],
      status: 'RESOLVED',
      resolutionReasonCode: resolution.resolutionReasonCode,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};

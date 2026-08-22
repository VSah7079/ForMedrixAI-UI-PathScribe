// src/services/billing/mockBillingRuleService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IBillingRuleService } from './IBillingRuleService';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import { resolveBillingRuleAt } from './resolveBillingRuleAt';

const STORAGE_KEY = 'billing_rule_versions_v1';

// Real, initial migration seed, per direct guidance's own "Initial
// migration" instructions: version 1 for every existing real
// billingCode this app already resolves against
// (codeMapTable.ts/CODE_MAP_TABLE - kept in sync with those same real,
// verified CPT codes/RVU values, including the same honest, disclosed
// RVU gaps for IHC-ADDL/PIN4-PANEL/FROZEN-FIRST/FROZEN-ADDL - real
// coding rule verified via direct search, RVU not fabricated). No real
// changeReason/approvedBy for this seed - it represents existing,
// already-shipped behavior being formally versioned for the first
// time, not a real rule change with a real approver behind it.
const SEED_VERSIONS: BillingRuleVersion[] = [
  { billingCode: '88302', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88302', description: 'Surgical pathology, gross examination only (Level II)', rvuWork: 0.13, quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88304', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88304', description: 'Surgical pathology, gross and microscopic examination (Level III)', rvuWork: 0.21, quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88305', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88305', description: 'Surgical pathology, gross and microscopic examination (Level IV)', rvuWork: 0.73, quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88307', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88307', description: 'Surgical pathology, gross and microscopic examination (Level V)', rvuWork: 1.55, quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: 'SPECIAL-STAIN', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88312', description: 'Special stain (group 1), including interpretation', rvuWork: 0.53, quantityRules: 'per special stain ordered', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: 'IHC-FIRST', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88342', description: 'Immunohistochemistry, first single antibody stain', rvuWork: 0.68, modifiersAllowed: ['26', 'TC'], quantityRules: 'per block, first real IHC stain', bundlingRules: 'IHC sequence first', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: 'IHC-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88341', description: 'Immunohistochemistry, each additional single antibody stain', modifiersAllowed: ['26', 'TC'], quantityRules: 'per block, each additional real IHC stain', bundlingRules: 'IHC sequence additional', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  { billingCode: 'PIN4-PANEL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88344', description: 'Immunohistochemistry, each multiplex antibody stain procedure (e.g. "PIN-4")', quantityRules: 'per specimen, standalone multiplex panel', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  { billingCode: 'FROZEN-FIRST', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88331', description: 'Pathology consultation during surgery, first tissue block, with frozen section(s), single specimen', quantityRules: 'per specimen, first frozen tissue block', documentationRequirements: ['pathologist interpretation'], country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  { billingCode: 'FROZEN-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88332', description: 'Pathology consultation during surgery, each additional tissue block with frozen section(s)', quantityRules: 'per specimen, each additional frozen tissue block', documentationRequirements: ['pathologist interpretation'], country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
];

const load    = (): BillingRuleVersion[] => storageGet<BillingRuleVersion[]>(STORAGE_KEY, SEED_VERSIONS);
const persist = (versions: BillingRuleVersion[]) => storageSet(STORAGE_KEY, versions);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockBillingRuleService: IBillingRuleService = {
  async getAll() {
    return ok([...load()].sort((a, b) => a.billingCode.localeCompare(b.billingCode) || (a.siteId ?? '').localeCompare(b.siteId ?? '') || a.version - b.version));
  },

  async getVersionsForBillingCode(billingCode, siteId) {
    // Real, deliberate: when siteId is given, returns ONLY that site's
    // own real version history for this billingCode - NOT merged with
    // the enterprise-wide one, since those are genuinely independent
    // real sequences (see BillingRuleVersion.ts's own header). Omitting
    // siteId returns the enterprise-wide history, exactly as before
    // site scoping existed.
    return ok(load().filter(v => v.billingCode === billingCode && (v.siteId ?? undefined) === (siteId ?? undefined)).sort((a, b) => a.version - b.version));
  },

  async getActiveRuleAt(billingCode, dateOfService, siteId) {
    return ok(resolveBillingRuleAt(billingCode, dateOfService, load(), siteId));
  },

  async createVersion(input) {
    if (!input.billingCode.trim()) return err('A billingCode is required.');
    if (!input.effectiveFrom) return err('A real effectiveFrom date is required.');
    if (!input.cpt.trim()) return err('A real CPT code is required — customers may create custom billingCodes, but they must map to a real CPT/HCPCS/RVU value, never invent their own.');

    const versions = load();
    // Real, deliberate: version numbering is scoped to
    // (billingCode, siteId) together - a site's own override history
    // is a real, independent sequence from the enterprise-wide row's
    // own history for the same billingCode, per direct, explicit
    // guidance and BillingRuleVersion.ts's own header.
    const existingForScope = versions.filter(v => v.billingCode === input.billingCode && (v.siteId ?? undefined) === (input.siteId ?? undefined));
    const nextVersion = existingForScope.length === 0 ? 1 : Math.max(...existingForScope.map(v => v.version)) + 1;

    // Real governance rule, per direct guidance: any version beyond
    // the first real one for a (billingCode, siteId) scope needs a
    // real changeReason on record - a rule change without a stated
    // reason isn't real audit history. A site's very first override of
    // an already-existing enterprise billingCode is still that site's
    // OWN version 1 - a real, new record, not "beyond the first" for
    // that site's own scope, so no changeReason is forced on it.
    if (nextVersion > 1 && !input.changeReason?.trim()) {
      return err('A real change reason is required when creating a new version of an existing billingCode/site combination.');
    }

    const newVersion: BillingRuleVersion = {
      ...input,
      version: nextVersion,
      status: input.status ?? 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    persist([...versions, newVersion]);
    return ok(newVersion);
  },

  async retireVersion(billingCode, version, effectiveTo, siteId) {
    const versions = load();
    const idx = versions.findIndex(v => v.billingCode === billingCode && v.version === version && (v.siteId ?? undefined) === (siteId ?? undefined));
    if (idx === -1) return err(`No real version ${version} found for billingCode "${billingCode}"${siteId ? ` at site "${siteId}"` : ' (enterprise-wide)'}.`);

    const updated: BillingRuleVersion = { ...versions[idx], status: 'RETIRED', effectiveTo: effectiveTo ?? versions[idx].effectiveTo ?? new Date().toISOString() };
    const next = [...versions];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};

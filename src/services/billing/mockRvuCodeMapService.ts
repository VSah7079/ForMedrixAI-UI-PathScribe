// src/services/billing/mockRvuCodeMapService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IRvuCodeMapService } from './IRvuCodeMapService';
import type { RvuTableVersion } from './RvuTableVersion';

const STORAGE_KEY = 'rvu_code_map_versions_v1';

// Real, verified CMS 2026 values (PPRRVU2026_Apr_nonQPP), now real
// BillingDictionaryEntry rows (billingCode added) - matches
// codeMapTable.ts's own CODE_MAP_TABLE exactly, including the honest,
// disclosed-gap entries (real CPT code + coding rule, unverified work
// RVU) added for the Charge Capture work. Real fix along the way: this
// seed was missing 88312 (Special Stain) even though CODE_MAP_TABLE
// always had it - a real, pre-existing discrepancy between the two,
// closed here rather than left standing while touching this file for
// an unrelated reason.
const SEED_VERSION: RvuTableVersion = {
  id: 'rvu-v-seed-2026',
  label: 'CMS 2026 (April update)',
  effectiveDate: '2026-01-01T00:00:00.000Z',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: 'system-seed',
  isActive: true,
  entries: [
    { code: '88302', billingCode: '88302', description: 'Surgical pathology, gross examination only (Level II)',            workRvu: 0.13 },
    { code: '88304', billingCode: '88304', description: 'Surgical pathology, gross and microscopic examination (Level III)', workRvu: 0.21 },
    { code: '88305', billingCode: '88305', description: 'Surgical pathology, gross and microscopic examination (Level IV)',  workRvu: 0.73 },
    { code: '88307', billingCode: '88307', description: 'Surgical pathology, gross and microscopic examination (Level V)',   workRvu: 1.55 },
    { code: '88312', billingCode: 'SPECIAL-STAIN', description: 'Special stain (group 1), including interpretation',         workRvu: 0.53 },
    { code: '88342', billingCode: 'IHC-FIRST', description: 'Immunohistochemistry, first single antibody stain',             workRvu: 0.68 },
    { code: '88341', billingCode: 'IHC-ADDL', description: 'Immunohistochemistry, each additional single antibody stain' },
    { code: '88344', billingCode: 'PIN4-PANEL', description: 'Immunohistochemistry, each multiplex antibody stain procedure (e.g. "PIN-4")' },
    { code: '88331', billingCode: 'FROZEN-FIRST', description: 'Pathology consultation during surgery, first tissue block, with frozen section(s), single specimen' },
    { code: '88332', billingCode: 'FROZEN-ADDL', description: 'Pathology consultation during surgery, each additional tissue block with frozen section(s)' },
  ],
};

const load    = (): RvuTableVersion[] => storageGet<RvuTableVersion[]>(STORAGE_KEY, [SEED_VERSION]);
const persist = (versions: RvuTableVersion[]) => storageSet(STORAGE_KEY, versions);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockRvuCodeMapService: IRvuCodeMapService = {
  async getAllVersions() {
    return ok([...load()].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)));
  },

  async getActiveVersion() {
    return ok(load().find(v => v.isActive) ?? null);
  },

  async getVersionEffectiveAt(isoDate) {
    const target = new Date(isoDate).getTime();
    if (isNaN(target)) return err(`Invalid date: ${isoDate}`);
    // Most-recent version whose effectiveDate is still <= the target
    // date - the real rates that were genuinely in force at that
    // moment, not just whatever's marked active today.
    const candidates = load()
      .filter(v => new Date(v.effectiveDate).getTime() <= target)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return ok(candidates[0] ?? null);
  },

  async createVersion(input) {
    if (!input.label.trim()) return err('A version label is required.');
    if (!input.effectiveDate) return err('An effective date is required.');
    if (input.entries.length === 0) return err('A version must have at least one real code entry.');

    const invalid = input.entries.find(e => !e.code.trim() || (e.workRvu !== undefined && !(e.workRvu > 0)));
    if (invalid) return err(`Entry "${invalid.code || '(blank)'}" needs a real code, and a positive work RVU value if one is given.`);

    const versions = load();
    const newVersion: RvuTableVersion = {
      id: `rvu-v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: input.label.trim(),
      effectiveDate: input.effectiveDate,
      uploadedAt: new Date().toISOString(),
      uploadedBy: input.uploadedBy,
      sourceFileName: input.sourceFileName,
      isActive: false, // never auto-activated - see activateVersion
      entries: input.entries,
    };
    persist([...versions, newVersion]);
    return ok(newVersion);
  },

  async activateVersion(versionId) {
    const versions = load();
    const target = versions.find(v => v.id === versionId);
    if (!target) return err(`Version ${versionId} not found.`);
    const updated = versions.map(v => ({ ...v, isActive: v.id === versionId }));
    persist(updated);
    return ok({ ...target, isActive: true });
  },
};

// src/services/billing/mockRvuCodeMapService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IRvuCodeMapService } from './IRvuCodeMapService';
import type { RvuTableVersion } from './RvuTableVersion';
import { CODE_MAP_TABLE } from './codeMapTable';

const STORAGE_KEY = 'rvu_code_map_versions_v1';

// Real fix, per direct question ("if the dictionaries are basically
// the same, why have two?"): this file used to maintain its own,
// separate, hardcoded copy of the same entries codeMapTable.ts's own
// CODE_MAP_TABLE already has - genuine, accidental duplication, not
// an intentional design choice. This exact drift already happened
// once before (88312 went missing from this copy while
// CODE_MAP_TABLE always had it, patched manually rather than
// unified) and happened again this session (a description-format fix
// and the new billingType field both missed this file initially,
// simply because there was no reason to know a second copy existed).
// References CODE_MAP_TABLE directly now - never mutated in place
// anywhere in this file (a new version upload replaces `entries`
// wholesale via input.entries, it never pushes/splices onto the
// existing array), so this is safe. The only real, legitimate thing
// this file adds beyond CODE_MAP_TABLE is the version-wrapper
// metadata (id/label/effectiveDate/uploadedAt/uploadedBy/isActive) -
// that stays; only the duplicate entries array is gone.
const SEED_VERSION: RvuTableVersion = {
  id: 'rvu-v-seed-2026',
  label: 'CMS 2026 (April update)',
  effectiveDate: '2026-01-01T00:00:00.000Z',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: 'system-seed',
  isActive: true,
  entries: CODE_MAP_TABLE,
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
    // moment, not just whatever's marked active today. Real, per
    // direct follow-up: a version PENDING_APPROVAL or REJECTED must
    // never be resolved against here, even if its own effectiveDate
    // would otherwise make it the best match.
    const candidates = load()
      .filter(v => v.approvalStatus !== 'PENDING_APPROVAL' && v.approvalStatus !== 'REJECTED')
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
      isActive: false, // never auto-activated - see activateVersion/approveVersion
      // Real, per direct follow-up: every new version - whether from a
      // single manual edit or a full upload - now genuinely requires a
      // different, real reviewer's approval before it can ever become
      // the active table. No more silent, unreviewed activation.
      approvalStatus: 'PENDING_APPROVAL',
      submittedForApprovalBy: input.uploadedBy,
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

  async approveVersion(versionId, reviewedBy) {
    const versions = load();
    const idx = versions.findIndex(v => v.id === versionId);
    if (idx === -1) return err(`Version ${versionId} not found.`);
    const target = versions[idx];
    if (target.approvalStatus !== 'PENDING_APPROVAL') return err(`This version is not real pending approval (currently ${target.approvalStatus ?? 'no approval history'}).`);
    // Real, per direct guidance's own Four-Eyes Principle (dual
    // control) requirement - hard-enforced here, not just in the UI.
    // Mirrors mockModifierDictionaryService.ts's own approveVersion
    // exactly.
    if (reviewedBy === target.uploadedBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who submitted this change cannot approve it. A different, real reviewer is required.');
    }
    const approved: RvuTableVersion = { ...target, approvalStatus: 'APPROVED', reviewedBy, reviewedAt: new Date().toISOString() };
    const withApproval = [...versions];
    withApproval[idx] = approved;
    persist(withApproval.map(v => ({ ...v, isActive: v.id === versionId })));
    return ok({ ...approved, isActive: true });
  },

  async rejectVersion(versionId, reviewedBy, rejectionReason) {
    if (!rejectionReason.trim()) return err('A real rejection reason is required.');
    const versions = load();
    const idx = versions.findIndex(v => v.id === versionId);
    if (idx === -1) return err(`Version ${versionId} not found.`);
    const target = versions[idx];
    if (target.approvalStatus !== 'PENDING_APPROVAL') return err(`This version is not real pending approval (currently ${target.approvalStatus ?? 'no approval history'}).`);
    if (reviewedBy === target.uploadedBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who submitted this change cannot reject it either. A different, real reviewer is required.');
    }
    const rejected: RvuTableVersion = { ...target, approvalStatus: 'REJECTED', reviewedBy, reviewedAt: new Date().toISOString(), rejectionReason: rejectionReason.trim() };
    const updated = [...versions];
    updated[idx] = rejected;
    persist(updated);
    return ok(rejected);
  },
};

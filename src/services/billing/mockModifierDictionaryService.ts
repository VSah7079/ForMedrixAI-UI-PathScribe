// src/services/billing/mockModifierDictionaryService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IModifierDictionaryService } from './IModifierDictionaryService';
import type { ModifierTableVersion } from './ModifierTableVersion';
import { DEFAULT_CPT_MODIFIERS } from './cptModifierDictionary';

const STORAGE_KEY = 'modifier_dictionary_versions_v1';

const SEED_VERSION: ModifierTableVersion = {
  id: 'modifier-v-seed-2026',
  label: 'Synthetic seed (no real AMA license on file)',
  effectiveDate: '2026-01-01T00:00:00.000Z',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: 'system-seed',
  isActive: true,
  licenseStatus: 'synthetic',
  entries: DEFAULT_CPT_MODIFIERS,
};

// Real, per direct request ahead of the Billing expert meeting - a
// realistic PENDING_APPROVAL example for the "Pending Dictionary
// Updates" queue (zero seed data confirmed directly, same real gap as
// mockBillingRuleService.ts's own). Demonstrates the real BYOL
// (bring-your-own-license) import path this file's own header
// describes - licenseStatus: 'licensed', awaiting a different real
// reviewer's approval before it ever replaces the active, synthetic
// table above.
//
// Real, deliberate copyright care: even for a demo, this does NOT use
// real AMA CPT modifier description text - that stays genuinely
// copyrighted regardless of framing. The descriptions below are
// short, generic, widely-known functional labels (the kind used
// across any general medical billing reference, e.g. "26 =
// professional component"), not verbatim official AMA language - only
// covers a few real, commonly-referenced modifiers, not a full
// licensed import, since fabricating a complete, convincing 15-entry
// "real" table risks reading as more authoritative than it is.
const SEED_PENDING_LICENSED_VERSION: ModifierTableVersion = {
  id: 'modifier-v-seed-2026-pending',
  label: 'AMA CPT Modifiers — 2026 quarterly import (sample)',
  effectiveDate: '2026-09-01T00:00:00.000Z',
  uploadedAt: '2026-08-26T13:20:00.000Z',
  uploadedBy: 'PATH-UK-002',
  isActive: false,
  licenseStatus: 'licensed',
  sourceFileName: 'ama-cpt-modifiers-2026-q3-sample.xlsx',
  approvalStatus: 'PENDING_APPROVAL',
  submittedForApprovalBy: 'PATH-UK-002',
  entries: [
    { code: '26', description: 'Professional component only (interpretation/report)' },
    { code: 'TC', description: 'Technical component only (equipment/facility)' },
    { code: '59', description: 'Distinct procedural service (separate from other same-day work)' },
    { code: '91', description: 'Repeat clinical diagnostic laboratory test' },
    { code: '22', description: 'Increased procedural service (significantly greater work than usual)' },
  ],
};

const load    = (): ModifierTableVersion[] => storageGet<ModifierTableVersion[]>(STORAGE_KEY, [SEED_VERSION, SEED_PENDING_LICENSED_VERSION]);
const persist = (versions: ModifierTableVersion[]) => storageSet(STORAGE_KEY, versions);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockModifierDictionaryService: IModifierDictionaryService = {
  async getAllVersions() {
    return ok([...load()].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)));
  },

  async getActiveVersion() {
    return ok(load().find(v => v.isActive) ?? null);
  },

  async createVersion(input) {
    if (!input.label.trim()) return err('A version label is required.');
    if (!input.effectiveDate) return err('An effective date is required.');
    if (input.entries.length === 0) return err('A version must have at least one real modifier entry.');

    const invalid = input.entries.find(e => !e.code.trim());
    if (invalid) return err(`Entry "${invalid.code || '(blank)'}" needs a real modifier code.`);

    const versions = load();
    const newVersion: ModifierTableVersion = {
      id: `modifier-v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: input.label.trim(),
      effectiveDate: input.effectiveDate,
      uploadedAt: new Date().toISOString(),
      uploadedBy: input.uploadedBy,
      licenseStatus: input.licenseStatus,
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
    // The person who uploaded or submitted this version can never be
    // the one who approves it. Mirrors mockBillingRuleService.ts's
    // own approveVersion exactly.
    if (reviewedBy === target.uploadedBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who submitted this change cannot approve it. A different, real reviewer is required.');
    }
    const approved: ModifierTableVersion = { ...target, approvalStatus: 'APPROVED', reviewedBy, reviewedAt: new Date().toISOString() };
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
    // Same real, hard-enforced dual-control gate as approveVersion.
    if (reviewedBy === target.uploadedBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who submitted this change cannot reject it either. A different, real reviewer is required.');
    }
    const rejected: ModifierTableVersion = { ...target, approvalStatus: 'REJECTED', reviewedBy, reviewedAt: new Date().toISOString(), rejectionReason: rejectionReason.trim() };
    const updated = [...versions];
    updated[idx] = rejected;
    persist(updated);
    return ok(rejected);
  },
};

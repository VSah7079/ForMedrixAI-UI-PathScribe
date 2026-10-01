// src/services/billing/mockNcciEditService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { INcciEditService } from './IServiceNcciEdit';
import type { NcciPtpEditPair, NcciPtpEditImport } from '@/types/billing/NcciPtpEdit';

const IMPORTS_KEY = 'ncci_ptp_edit_imports_v2';

// Real, per direct guidance: PathScribe does not ship with real,
// current NCCI PTP edit data - see NcciPtpEdit.ts's own header for
// why (the real download itself requires accepting AMA copyright
// terms, the same real constraint PS-92 tracks). This is a small,
// deliberately synthetic demo pair, not a verified, real, current
// CMS edit - isSyntheticSeed: true is carried on the import record
// itself and surfaced directly in the admin UI so nobody mistakes
// this for real data. The two real, verified codes used here
// (88300/88305, confirmed elsewhere this session via direct search)
// are genuine, existing CPT codes - only the PAIRING itself (that
// they're bundled together) is made up for this demo, not sourced
// from any real NCCI table.
const SEED_PAIRS: NcciPtpEditPair[] = [
  {
    id: 'ncci-seed-1',
    columnOneCode: '88305',
    columnTwoCode: '88300',
    modifierIndicator: '0',
    effectiveDate: '2026-01-01',
  },
];
const SEED_IMPORT: NcciPtpEditImport = {
  id: 'ncci-import-seed',
  quarterVersion: 'DEMO',
  importedAt: '2026-01-01T00:00:00.000Z',
  importedBy: 'system-seed',
  pairCount: SEED_PAIRS.length,
  pairs: SEED_PAIRS,
  isSyntheticSeed: true,
  isActive: true,
  // No approvalStatus - predates this feature, same honest posture
  // as ModifierTableVersion's own seed.
};

const load    = (): NcciPtpEditImport[] => storageGet<NcciPtpEditImport[]>(IMPORTS_KEY, [SEED_IMPORT]);
const persist = (imports: NcciPtpEditImport[]) => storageSet(IMPORTS_KEY, imports);

const delay = () => new Promise(r => setTimeout(r, 120));
const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockNcciEditService: INcciEditService = {
  async getAll() {
    await delay();
    const active = load().find(i => i.isActive);
    return ok(active?.pairs ?? []);
  },

  async getCurrentImport() {
    await delay();
    return ok(load().find(i => i.isActive) ?? null);
  },

  async getAllImports() {
    await delay();
    return ok([...load()].sort((a, b) => b.importedAt.localeCompare(a.importedAt)));
  },

  async importQuarter(pairs, quarterVersion, importedBy) {
    await delay();
    const imports = load();
    const withIds: NcciPtpEditPair[] = pairs.map((p, i) => ({
      ...p,
      id: `ncci-${quarterVersion}-${i}-${Date.now()}`,
    }));
    // Real, per direct follow-up: staged, never immediately active -
    // a different, real reviewer must approve it first. Mirrors
    // mockModifierDictionaryService.ts's own createVersion exactly.
    const newImport: NcciPtpEditImport = {
      id: 'ncci-import-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      quarterVersion,
      importedAt: new Date().toISOString(),
      importedBy,
      pairCount: withIds.length,
      pairs: withIds,
      isSyntheticSeed: false,
      isActive: false,
      approvalStatus: 'PENDING_APPROVAL',
      submittedForApprovalBy: importedBy,
    };
    persist([...imports, newImport]);
    return ok(newImport);
  },

  async approveImport(importId, reviewedBy) {
    await delay();
    const imports = load();
    const idx = imports.findIndex(i => i.id === importId);
    if (idx === -1) return err(`Import ${importId} not found.`);
    const target = imports[idx];
    if (target.approvalStatus !== 'PENDING_APPROVAL') return err(`This import is not real pending approval (currently ${target.approvalStatus ?? 'no approval history'}).`);
    // Real, per direct guidance's own Four-Eyes Principle (dual
    // control) requirement - hard-enforced here, not just in the UI.
    // Mirrors mockModifierDictionaryService.ts's own approveVersion
    // exactly.
    if (reviewedBy === target.importedBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who submitted this change cannot approve it. A different, real reviewer is required.');
    }
    const approved: NcciPtpEditImport = { ...target, approvalStatus: 'APPROVED', reviewedBy, reviewedAt: new Date().toISOString() };
    const withApproval = [...imports];
    withApproval[idx] = approved;
    persist(withApproval.map(i => ({ ...i, isActive: i.id === importId })));
    return ok({ ...approved, isActive: true });
  },

  async rejectImport(importId, reviewedBy, rejectionReason) {
    await delay();
    if (!rejectionReason.trim()) return err('A real rejection reason is required.');
    const imports = load();
    const idx = imports.findIndex(i => i.id === importId);
    if (idx === -1) return err(`Import ${importId} not found.`);
    const target = imports[idx];
    if (target.approvalStatus !== 'PENDING_APPROVAL') return err(`This import is not real pending approval (currently ${target.approvalStatus ?? 'no approval history'}).`);
    if (reviewedBy === target.importedBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who submitted this change cannot reject it either. A different, real reviewer is required.');
    }
    const rejected: NcciPtpEditImport = { ...target, approvalStatus: 'REJECTED', reviewedBy, reviewedAt: new Date().toISOString(), rejectionReason: rejectionReason.trim() };
    const updated = [...imports];
    updated[idx] = rejected;
    persist(updated);
    return ok(rejected);
  },
};

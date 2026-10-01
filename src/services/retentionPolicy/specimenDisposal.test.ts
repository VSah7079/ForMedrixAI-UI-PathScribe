// src/services/retentionPolicy/specimenDisposal.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "does disposal queue include
// container id so specimens can be disposed?" Confirmed directly: it
// didn't — computeDisposalQueue.ts never enumerated specimens, and
// disposeItemByScan.ts explicitly rejected a specimen-level scan.
// Both are now real and wired to the real, existing 'wet_tissue'
// RetainableMaterialType and its real, already-seeded governing-body
// retention windows.
//
// Tests both files together, deliberately — the queue and the scan-
// dispose action must always agree on the same real set of eligible
// items; testing them in isolation risks missing a real disagreement
// between the two.
//
// Real, minimal test-case setup, matching the established pattern
// this codebase already uses (mockReportReleaseService.test.ts's own
// seedCase helper) — real caseRouter.createCase, not a synthetic
// fixture the real services never actually touch.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { caseRouter } = await import('../cases/CaseRouter');
const { computeDisposalQueue } = await import('./computeDisposalQueue');
const { disposeItemByScan } = await import('./disposeItemByScan');
const { specimenIdentifier } = await import('@/types/labels/LabelData');

let counter = 0;
function makeCaseId(): string {
  counter += 1;
  return `S26-DISPOSAL-TEST-${counter}`;
}

// Real, safely-old date — well past every real, seeded governing-body
// wet_tissue window (CAP: 2 weeks, others up to 4 weeks) — see this
// file's own header for why 6 months was chosen deliberately, not an
// arbitrary round number.
const SIX_MONTHS_AGO = new Date(Date.now() - 1000 * 60 * 60 * 24 * 182).toISOString();
// Real, safely-old date for the 'slide' RetainableMaterialType
// specifically — that window is genuinely much longer than
// wet_tissue's (real, seeded governing-body figures run 8-30 years
// for slides vs. 2-4 weeks for wet_tissue) — SIX_MONTHS_AGO clears
// wet_tissue but not this.
const THIRTY_FIVE_YEARS_AGO = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 35).toISOString();
const YESTERDAY = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

async function seedCaseWithSpecimen(overrides: Record<string, unknown> = {}, specimenOverrides: Record<string, unknown> = {}) {
  const id = makeCaseId();
  const fullAccession = id;
  await caseRouter.createCase({
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'signed-out',
    accession: { fullAccession },
    participants: [],
    synopticReports: [],
    order: { priority: 'Routine' },
    specimens: [
      { id: `${id}-SP-A`, label: 'A', description: 'Test specimen', blocks: [], ...specimenOverrides },
    ],
    ...overrides,
  } as any);
  return { caseId: id, fullAccession, scanValue: specimenIdentifier(fullAccession, 'A') };
}

describe('Specimen-level disposal — real, first wiring of RetainableMaterialType(\'wet_tissue\') into the disposal queue + scan-dispose action', () => {
  beforeEach(() => { counter += 1000; }); // real, distinct case ids per test file run — avoids any cross-test id collision

  describe('computeDisposalQueue — real specimen enumeration', () => {
    it('includes a real, retention-eligible specimen in the queue, with materialType wet_tissue', async () => {
      const { caseId, scanValue } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO });
      const queue = await computeDisposalQueue(undefined);
      const item = queue.find(i => i.caseId === caseId && i.materialType === 'wet_tissue');
      expect(item).toBeDefined();
      expect(item!.displayId).toBe(scanValue);
      expect(item!.specimenLabel).toBe('A');
    });

    it('excludes a specimen whose case was only recently finalized — not yet retention-eligible', async () => {
      const { caseId } = await seedCaseWithSpecimen({ finalizedAt: YESTERDAY });
      const queue = await computeDisposalQueue(undefined);
      expect(queue.find(i => i.caseId === caseId && i.materialType === 'wet_tissue')).toBeUndefined();
    });

    it('excludes a specimen whose case has never been finalized at all', async () => {
      const { caseId } = await seedCaseWithSpecimen({ finalizedAt: undefined });
      const queue = await computeDisposalQueue(undefined);
      expect(queue.find(i => i.caseId === caseId && i.materialType === 'wet_tissue')).toBeUndefined();
    });

    it('excludes a specimen already disposed', async () => {
      const { caseId } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO }, { disposedAt: SIX_MONTHS_AGO, disposedBy: 'PATH-001' });
      const queue = await computeDisposalQueue(undefined);
      expect(queue.find(i => i.caseId === caseId && i.materialType === 'wet_tissue')).toBeUndefined();
    });

    it('excludes a specimen whose case has an active retention hold', async () => {
      const { caseId } = await seedCaseWithSpecimen({
        finalizedAt: SIX_MONTHS_AGO,
        retentionHolds: [{ id: 'hold-1', reason: 'legal_hold', note: 'Real, active hold for this test', setAt: SIX_MONTHS_AGO, setByUserId: 'PATH-001', setByUserName: 'Dr. Test', active: true }],
      });
      const queue = await computeDisposalQueue(undefined);
      expect(queue.find(i => i.caseId === caseId && i.materialType === 'wet_tissue')).toBeUndefined();
    });
  });

  describe('disposeItemByScan — real specimen-level dispose action', () => {
    it('a real, eligible specimen scan disposes successfully', async () => {
      const { scanValue } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO });
      const result = await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('disposed');
    });

    it('the real, persisted specimen record has disposedAt/disposedBy set after a successful dispose', async () => {
      const { caseId, scanValue } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO });
      await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      const after = await caseRouter.getCase(caseId);
      const specimen = after?.specimens?.find((s: any) => s.label === 'A');
      expect(specimen?.disposedAt).toBeDefined();
      expect(specimen?.disposedBy).toBe('PATH-001');
    });

    it('rejects a specimen not yet retention-eligible, with a real, specific reason', async () => {
      const { scanValue } = await seedCaseWithSpecimen({ finalizedAt: YESTERDAY });
      const result = await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('rejected');
      if (result.outcome === 'rejected') expect(result.reason).toContain('retention-eligible');
    });

    it('rejects a specimen whose case has an active retention hold', async () => {
      const { scanValue } = await seedCaseWithSpecimen({
        finalizedAt: SIX_MONTHS_AGO,
        retentionHolds: [{ id: 'hold-1', reason: 'legal_hold', note: 'Real, active hold for this test', setAt: SIX_MONTHS_AGO, setByUserId: 'PATH-001', setByUserName: 'Dr. Test', active: true }],
      });
      const result = await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('rejected');
      if (result.outcome === 'rejected') expect(result.reason).toContain('retention hold');
    });

    it('rejects a specimen already disposed, never double-disposing', async () => {
      const { scanValue } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO });
      const first = await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(first.outcome).toBe('disposed');
      const second = await disposeItemByScan(scanValue, undefined, 'PATH-002', 'Dr. Second User');
      expect(second.outcome).toBe('rejected');
      if (second.outcome === 'rejected') expect(second.reason).toContain('already disposed');
    });

    it('the queue and the scan-dispose action agree — a real item the queue includes is genuinely disposable by scan', async () => {
      const { caseId, scanValue } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO });
      const queue = await computeDisposalQueue(undefined);
      expect(queue.find(i => i.caseId === caseId)).toBeDefined();
      const result = await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('disposed');
      // And the real, disposed item no longer appears in a fresh queue.
      const queueAfter = await computeDisposalQueue(undefined);
      expect(queueAfter.find(i => i.caseId === caseId && i.materialType === 'wet_tissue')).toBeUndefined();
    });
  });

  describe('decant + decant_slide disposal — real fix, per direct follow-up: "please wire decants for disposal"', () => {
    it('a real, retention-eligible decant is included in the queue, materialType wet_tissue', async () => {
      const { caseId, fullAccession } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO }, {
        decants: [{ id: 'dcnt-1', label: 'D1', decantType: 'cell_block', stains: [], createdAt: SIX_MONTHS_AGO }],
      });
      const { decantIdentifier } = await import('@/types/labels/LabelData');
      const queue = await computeDisposalQueue(undefined);
      const item = queue.find(i => i.caseId === caseId && i.materialType === 'wet_tissue' && i.displayId === decantIdentifier(fullAccession, 'A', 'D1'));
      expect(item).toBeDefined();
    });

    it('a real decant scan disposes successfully — genuinely no longer rejected', async () => {
      const { fullAccession } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO }, {
        decants: [{ id: 'dcnt-1', label: 'D1', decantType: 'cell_block', stains: [], createdAt: SIX_MONTHS_AGO }],
      });
      const { decantIdentifier } = await import('@/types/labels/LabelData');
      const result = await disposeItemByScan(decantIdentifier(fullAccession, 'A', 'D1'), undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('disposed');
    });

    it('the real, persisted decant record has disposedAt/disposedBy set, and its own real slide is genuinely untouched by disposing the decant itself', async () => {
      const { caseId, fullAccession } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO }, {
        decants: [{
          id: 'dcnt-1', label: 'D1', decantType: 'cell_block', createdAt: SIX_MONTHS_AGO,
          stains: [{ id: 'stain-1', stainName: 'H&E', status: 'Ordered' }],
        }],
      });
      const { decantIdentifier } = await import('@/types/labels/LabelData');
      await disposeItemByScan(decantIdentifier(fullAccession, 'A', 'D1'), undefined, 'PATH-001', 'Dr. Test Pathologist');
      const after = await caseRouter.getCase(caseId);
      const decant = after?.specimens?.find((s: any) => s.label === 'A')?.decants?.find((d: any) => d.label === 'D1');
      expect(decant?.disposedAt).toBeDefined();
      expect(decant?.disposedBy).toBe('PATH-001');
      // Real, deliberate confirmation — disposing the decant CONTAINER
      // never touches its own, separately-disposable slide.
      expect(decant?.stains?.[0]?.disposedAt).toBeUndefined();
    });

    it('a real decant SLIDE (decant_slide) resolves independently of its own parent decant, on the real, longer \'slide\' retention window (not wet_tissue\'s much shorter one)', async () => {
      const { caseId, fullAccession } = await seedCaseWithSpecimen({ finalizedAt: THIRTY_FIVE_YEARS_AGO }, {
        decants: [{
          id: 'dcnt-1', label: 'D1', decantType: 'cell_block', createdAt: THIRTY_FIVE_YEARS_AGO,
          stains: [{ id: 'stain-1', stainName: 'H&E', status: 'Ordered' }],
        }],
      });
      const { decantSlideIdentifier } = await import('@/types/labels/LabelData');
      const result = await disposeItemByScan(decantSlideIdentifier(fullAccession, 'A', 'D1', 'L1'), undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('disposed');
      const after = await caseRouter.getCase(caseId);
      const decant = after?.specimens?.find((s: any) => s.label === 'A')?.decants?.find((d: any) => d.label === 'D1');
      expect(decant?.stains?.[0]?.disposedAt).toBeDefined();
      // The real, parent decant container itself remains undisposed.
      expect(decant?.disposedAt).toBeUndefined();
    });

    it('confirms the real, deliberate distinction: a decant_slide is genuinely NOT yet eligible on wet_tissue\'s own, much shorter window — it correctly uses \'slide\' instead', async () => {
      const { fullAccession } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO }, {
        decants: [{
          id: 'dcnt-1', label: 'D1', decantType: 'cell_block', createdAt: SIX_MONTHS_AGO,
          stains: [{ id: 'stain-1', stainName: 'H&E', status: 'Ordered' }],
        }],
      });
      const { decantSlideIdentifier } = await import('@/types/labels/LabelData');
      const result = await disposeItemByScan(decantSlideIdentifier(fullAccession, 'A', 'D1', 'L1'), undefined, 'PATH-001', 'Dr. Test Pathologist');
      // Real, deliberate expectation: six months clears wet_tissue's
      // real, short window but not the real, much longer slide window
      // a decant_slide is correctly evaluated against instead.
      expect(result.outcome).toBe('rejected');
      if (result.outcome === 'rejected') expect(result.reason).toContain('retention-eligible');
    });

    it('rejects a decant not yet retention-eligible', async () => {
      const { fullAccession } = await seedCaseWithSpecimen({ finalizedAt: YESTERDAY }, {
        decants: [{ id: 'dcnt-1', label: 'D1', decantType: 'residual_fluid', stains: [], createdAt: YESTERDAY }],
      });
      const { decantIdentifier } = await import('@/types/labels/LabelData');
      const result = await disposeItemByScan(decantIdentifier(fullAccession, 'A', 'D1'), undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('rejected');
      if (result.outcome === 'rejected') expect(result.reason).toContain('retention-eligible');
    });

    it('rejects a decant already disposed, never double-disposing', async () => {
      const { fullAccession } = await seedCaseWithSpecimen({ finalizedAt: SIX_MONTHS_AGO }, {
        decants: [{ id: 'dcnt-1', label: 'D1', decantType: 'cell_block', stains: [], createdAt: SIX_MONTHS_AGO }],
      });
      const { decantIdentifier } = await import('@/types/labels/LabelData');
      const scanValue = decantIdentifier(fullAccession, 'A', 'D1');
      const first = await disposeItemByScan(scanValue, undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(first.outcome).toBe('disposed');
      const second = await disposeItemByScan(scanValue, undefined, 'PATH-002', 'Dr. Second User');
      expect(second.outcome).toBe('rejected');
      if (second.outcome === 'rejected') expect(second.reason).toContain('already disposed');
    });

    it('rejects a decant whose case has an active retention hold', async () => {
      const { fullAccession } = await seedCaseWithSpecimen({
        finalizedAt: SIX_MONTHS_AGO,
        retentionHolds: [{ id: 'hold-1', reason: 'legal_hold', note: 'Real, active hold for this test', setAt: SIX_MONTHS_AGO, setByUserId: 'PATH-001', setByUserName: 'Dr. Test', active: true }],
      }, {
        decants: [{ id: 'dcnt-1', label: 'D1', decantType: 'cell_block', stains: [], createdAt: SIX_MONTHS_AGO }],
      });
      const { decantIdentifier } = await import('@/types/labels/LabelData');
      const result = await disposeItemByScan(decantIdentifier(fullAccession, 'A', 'D1'), undefined, 'PATH-001', 'Dr. Test Pathologist');
      expect(result.outcome).toBe('rejected');
      if (result.outcome === 'rejected') expect(result.reason).toContain('retention hold');
    });
  });
});

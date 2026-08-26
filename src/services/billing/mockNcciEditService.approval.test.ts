// src/services/billing/mockNcciEditService.approval.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "we just need to track the changes so
// we know who is responsible and have it go through the approval
// process." Tests the new Four-Eyes approval workflow added to NCCI
// Edit Rules - matches mockModifierDictionaryService.approval.test.ts's
// own established Four-Eyes test pattern exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { mockNcciEditService } from './mockNcciEditService';

// Real, minimal localStorage mock - same pattern as
// mockBillingRuleService.test.ts.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const samplePair = { columnOneCode: '99999', columnTwoCode: '88888', modifierIndicator: '0' as const, effectiveDate: '2028-01-01' };

describe('mockNcciEditService — real, initial seed', () => {
  it('the real, initial synthetic seed pair is present and active', async () => {
    const res = await mockNcciEditService.getAll();
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBeGreaterThan(0);
    const current = await mockNcciEditService.getCurrentImport();
    if (!current.ok) throw new Error('setup failed');
    expect(current.data?.isSyntheticSeed).toBe(true);
  });
});

describe('mockNcciEditService — Four-Eyes approval workflow', () => {
  it('importQuarter never activates immediately - starts real PENDING_APPROVAL', async () => {
    const res = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.isActive).toBe(false);
    expect(res.data.approvalStatus).toBe('PENDING_APPROVAL');
    expect(res.data.submittedForApprovalBy).toBe('uploader-1');
    // The real, previously-active seed import is untouched.
    const active = await mockNcciEditService.getCurrentImport();
    if (!active.ok) throw new Error('lookup failed');
    expect(active.data?.isSyntheticSeed).toBe(true);
  });

  it('Four-Eyes Principle: rejects approval when reviewedBy matches the real submitter', async () => {
    const created = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!created.ok) throw new Error('setup failed');
    const res = await mockNcciEditService.approveImport(created.data.id, 'uploader-1');
    expect(res.ok).toBe(false);
  });

  it('a real, genuinely different reviewer can approve, making the import active', async () => {
    const created = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!created.ok) throw new Error('setup failed');
    const res = await mockNcciEditService.approveImport(created.data.id, 'reviewer-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.isActive).toBe(true);
      expect(res.data.approvalStatus).toBe('APPROVED');
    }
    const activePairs = await mockNcciEditService.getAll();
    if (!activePairs.ok) throw new Error('lookup failed');
    expect(activePairs.data.some(p => p.columnOneCode === '99999')).toBe(true);
  });

  it('approving a new import genuinely retires whichever import was previously active', async () => {
    const created = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!created.ok) throw new Error('setup failed');
    await mockNcciEditService.approveImport(created.data.id, 'reviewer-1');
    const all = await mockNcciEditService.getAllImports();
    if (!all.ok) throw new Error('lookup failed');
    const seed = all.data.find(i => i.isSyntheticSeed);
    expect(seed?.isActive).toBe(false);
  });

  it('rejectImport requires a real rejection reason', async () => {
    const created = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!created.ok) throw new Error('setup failed');
    const res = await mockNcciEditService.rejectImport(created.data.id, 'reviewer-1', '');
    expect(res.ok).toBe(false);
  });

  it('a real, different reviewer can reject, and the rejected import never becomes active', async () => {
    const created = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!created.ok) throw new Error('setup failed');
    const res = await mockNcciEditService.rejectImport(created.data.id, 'reviewer-1', 'Not accurate');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('REJECTED');
      expect(res.data.isActive).toBe(false);
    }
  });

  it('rejects approving an import that is not currently PENDING_APPROVAL', async () => {
    const created = await mockNcciEditService.importQuarter([samplePair], '2028Q1', 'uploader-1');
    if (!created.ok) throw new Error('setup failed');
    await mockNcciEditService.approveImport(created.data.id, 'reviewer-1');
    const res = await mockNcciEditService.approveImport(created.data.id, 'reviewer-2');
    expect(res.ok).toBe(false);
  });
});

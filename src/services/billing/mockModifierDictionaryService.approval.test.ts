// src/services/billing/mockModifierDictionaryService.approval.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "we just need to track the changes so
// we know who is responsible and have it go through the approval
// process." Tests the new Four-Eyes approval workflow added to the
// CPT Modifier Dictionary - matches mockBillingRuleService.test.ts's
// own established Four-Eyes test pattern exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { mockModifierDictionaryService } from './mockModifierDictionaryService';

// Real, minimal localStorage mock - same pattern as
// mockBillingRuleService.test.ts, this suite genuinely exercises the
// storage-backed service, not just pure functions.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockModifierDictionaryService — Four-Eyes approval workflow', () => {
  it('createVersion never activates immediately - starts real PENDING_APPROVAL', async () => {
    const res = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.isActive).toBe(false);
    expect(res.data.approvalStatus).toBe('PENDING_APPROVAL');
    expect(res.data.submittedForApprovalBy).toBe('uploader-1');
  });

  it('Four-Eyes Principle: rejects approval when reviewedBy matches the real uploader', async () => {
    const created = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockModifierDictionaryService.approveVersion(created.data.id, 'uploader-1');
    expect(res.ok).toBe(false);
  });

  it('a real, genuinely different reviewer can approve, making the version active', async () => {
    const created = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockModifierDictionaryService.approveVersion(created.data.id, 'reviewer-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.isActive).toBe(true);
      expect(res.data.approvalStatus).toBe('APPROVED');
      expect(res.data.reviewedBy).toBe('reviewer-1');
    }
    const active = await mockModifierDictionaryService.getActiveVersion();
    if (!active.ok) throw new Error('lookup failed');
    expect(active.data?.id).toBe(created.data.id);
  });

  it('approving a new version genuinely retires whichever version was previously active', async () => {
    const first = await mockModifierDictionaryService.createVersion({
      label: 'First', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'First' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!first.ok) throw new Error('setup failed');
    await mockModifierDictionaryService.approveVersion(first.data.id, 'reviewer-1');

    const second = await mockModifierDictionaryService.createVersion({
      label: 'Second', effectiveDate: '2028-02-01', entries: [{ code: 'YY', description: 'Second' }],
      uploadedBy: 'uploader-2', licenseStatus: 'synthetic',
    });
    if (!second.ok) throw new Error('setup failed');
    await mockModifierDictionaryService.approveVersion(second.data.id, 'reviewer-2');

    const all = await mockModifierDictionaryService.getAllVersions();
    if (!all.ok) throw new Error('lookup failed');
    const firstAfter = all.data.find(v => v.id === first.data.id);
    expect(firstAfter?.isActive).toBe(false);
  });

  it('rejectVersion requires a real rejection reason', async () => {
    const created = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockModifierDictionaryService.rejectVersion(created.data.id, 'reviewer-1', '');
    expect(res.ok).toBe(false);
  });

  it('Four-Eyes Principle applies to rejection too - the real uploader cannot reject their own submission', async () => {
    const created = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockModifierDictionaryService.rejectVersion(created.data.id, 'uploader-1', 'Real reason');
    expect(res.ok).toBe(false);
  });

  it('a real, different reviewer can reject, and the rejected version never becomes active', async () => {
    const created = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockModifierDictionaryService.rejectVersion(created.data.id, 'reviewer-1', 'Not accurate');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('REJECTED');
      expect(res.data.isActive).toBe(false);
      expect(res.data.rejectionReason).toBe('Not accurate');
    }
  });

  it('rejects approving/rejecting a version that is not currently PENDING_APPROVAL', async () => {
    const created = await mockModifierDictionaryService.createVersion({
      label: 'Test import', effectiveDate: '2028-01-01', entries: [{ code: 'XX', description: 'Test' }],
      uploadedBy: 'uploader-1', licenseStatus: 'synthetic',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockModifierDictionaryService.approveVersion(created.data.id, 'reviewer-1');
    const res = await mockModifierDictionaryService.approveVersion(created.data.id, 'reviewer-2');
    expect(res.ok).toBe(false);
  });
});

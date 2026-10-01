// src/services/billing/mockRvuCodeMapService.approval.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "we just need to track the changes so
// we know who is responsible and have it go through the approval
// process." Tests the new Four-Eyes approval workflow added to RVU
// Code Map - matches mockModifierDictionaryService.approval.test.ts's
// own established Four-Eyes test pattern exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { mockRvuCodeMapService } from './mockRvuCodeMapService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const sampleEntry = { code: '77777', billingCode: '77777', description: 'Test', workRvu: 0.5, level: 'specimen' as const, billingType: 'Global' as const };

describe('mockRvuCodeMapService — Four-Eyes approval workflow', () => {
  it('createVersion starts real PENDING_APPROVAL and is not active', async () => {
    const res = await mockRvuCodeMapService.createVersion({ label: 'Test', effectiveDate: '2028-01-01', entries: [sampleEntry], uploadedBy: 'uploader-1' });
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.isActive).toBe(false);
    expect(res.data.approvalStatus).toBe('PENDING_APPROVAL');
    expect(res.data.submittedForApprovalBy).toBe('uploader-1');
  });

  it('Four-Eyes Principle: rejects approval when reviewedBy matches the real uploader', async () => {
    const created = await mockRvuCodeMapService.createVersion({ label: 'Test', effectiveDate: '2028-01-01', entries: [sampleEntry], uploadedBy: 'uploader-1' });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockRvuCodeMapService.approveVersion(created.data.id, 'uploader-1');
    expect(res.ok).toBe(false);
  });

  it('a real, genuinely different reviewer can approve, making the version active', async () => {
    const created = await mockRvuCodeMapService.createVersion({ label: 'Test', effectiveDate: '2028-01-01', entries: [sampleEntry], uploadedBy: 'uploader-1' });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockRvuCodeMapService.approveVersion(created.data.id, 'reviewer-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.isActive).toBe(true);
      expect(res.data.approvalStatus).toBe('APPROVED');
    }
  });

  it('rejectVersion requires a real rejection reason and applies Four-Eyes too', async () => {
    const created = await mockRvuCodeMapService.createVersion({ label: 'Test', effectiveDate: '2028-01-01', entries: [sampleEntry], uploadedBy: 'uploader-1' });
    if (!created.ok) throw new Error('setup failed');
    const noReason = await mockRvuCodeMapService.rejectVersion(created.data.id, 'reviewer-1', '');
    expect(noReason.ok).toBe(false);
    const selfReject = await mockRvuCodeMapService.rejectVersion(created.data.id, 'uploader-1', 'Real reason');
    expect(selfReject.ok).toBe(false);
    const res = await mockRvuCodeMapService.rejectVersion(created.data.id, 'reviewer-1', 'Not accurate');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('REJECTED');
      expect(res.data.isActive).toBe(false);
    }
  });

  it('rejects approving a version that is not currently PENDING_APPROVAL', async () => {
    const created = await mockRvuCodeMapService.createVersion({ label: 'Test', effectiveDate: '2028-01-01', entries: [sampleEntry], uploadedBy: 'uploader-1' });
    if (!created.ok) throw new Error('setup failed');
    await mockRvuCodeMapService.approveVersion(created.data.id, 'reviewer-1');
    const res = await mockRvuCodeMapService.approveVersion(created.data.id, 'reviewer-2');
    expect(res.ok).toBe(false);
  });
});

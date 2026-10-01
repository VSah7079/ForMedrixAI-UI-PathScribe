// @vitest-environment happy-dom
// Batch 364 (PS-349): a support ticket names the page type and the case's
// support reference, never the page address (which carries the case number).
import { describe, expect, it, vi } from 'vitest';
import { captureMetadata, supportReferencesForCaseNumbers } from './enhancementRequestService';
import { buildEnhancementHtml, buildEnhancementText } from './communications/emailTemplates/enhancementEmailTemplates';
import type { ISupportReferenceService } from './supportReferences/ISupportReferenceService';

const refs: ISupportReferenceService = {
  forRecord: vi.fn(async (kind, recordId) => ({ ok: true as const, data: { ref: 'SR-7K2Q-9MXD', kind, recordId, createdAt: '' } })),
  resolve: vi.fn(),
};
const user = { id: 'u1', name: 'Dr. Test', role: 'pathologist' };

describe('captureMetadata', () => {
  it('on a case page: the route pattern and the case\'s support reference, no case number anywhere', async () => {
    const m = await captureMetadata(user, { supportReferenceService: refs, pathname: '/report/S26-4403' });
    expect(m?.currentPage).toBe('/report/:caseId');
    expect(m?.caseSupportReference).toBe('SR-7K2Q-9MXD');
    expect(refs.forRecord).toHaveBeenCalledWith('case', 'S26-4403');
    expect(JSON.stringify(m)).not.toContain('S26-4403');
  });
  it('elsewhere: just the route pattern', async () => {
    const m = await captureMetadata(user, { supportReferenceService: refs, pathname: '/worklist' });
    expect(m?.currentPage).toBe('/worklist');
    expect(m?.caseSupportReference).toBeUndefined();
  });
  it('the emails show the page type and the reference', async () => {
    const metadata = await captureMetadata(user, { supportReferenceService: refs, pathname: '/case/S26-4403/synoptic' });
    const payload = { title: 't', description: 'd', category: 'UI' as const, attachments: [], includeSystem: true, metadata };
    for (const body of [buildEnhancementText(payload), buildEnhancementHtml(payload)]) {
      expect(body).toContain('/case/:caseId/synoptic');
      expect(body).toContain('SR-7K2Q-9MXD');
      expect(body).not.toContain('S26-4403');
      expect(body).not.toContain('null');
    }
  });
});

describe('supportReferencesForCaseNumbers', () => {
  it('gives a reference for each typed case number PathScribe holds, and skips the rest', async () => {
    const caseService = { getCase: vi.fn(async (id: string) => (id === 'S26-4403' ? ({ id: 'S26-4403' } as never) : null)) };
    const map = await supportReferencesForCaseNumbers(['s26-4403', 'S99-0001'], { caseService, supportReferenceService: refs });
    expect([...map]).toEqual([['s26-4403', 'SR-7K2Q-9MXD']]);
  });
});

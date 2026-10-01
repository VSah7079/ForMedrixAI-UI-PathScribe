// Archive / restore / New Version lineage in the mock template service (Batch 317, PS-73).
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  const store: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  // Drafting needs Template Author or Admin (PS-63, Batch 329).
  store['pathscribe-user'] = JSON.stringify({ id: 'author-archive-test', role: 'admin' });
});

describe('templateService — archive, restore, and publishing a new version', () => {
  it('archive takes a protocol out of status-filtered lists; restore brings it back as a draft', async () => {
    const svc = await import('./templateService');
    const { PROTOCOL_REGISTRY } = await import('@/components/Config/Protocols/protocolShared');
    const target = PROTOCOL_REGISTRY.find(p => p.status === 'published')!;

    expect((await svc.listTemplatesCached('published')).some(p => p.id === target.id)).toBe(true);
    await svc.archiveTemplate(target.id);
    const archived = PROTOCOL_REGISTRY.find(p => p.id === target.id)!;
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeTruthy();
    // The cached 'published' list is invalidated by the registry change.
    expect((await svc.listTemplatesCached('published')).some(p => p.id === target.id)).toBe(false);
    await expect(svc.archiveTemplate(target.id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    // The reviewer page's cached state must not survive a restore, or the
    // restored draft would still show as 'published' there.
    localStorage.setItem(`ps_state_${target.id}`, 'published');
    await svc.restoreTemplate(target.id);
    expect(PROTOCOL_REGISTRY.find(p => p.id === target.id)!.status).toBe('draft');
    expect(localStorage.getItem(`ps_state_${target.id}`)).toBeNull();
    await expect(svc.restoreTemplate(target.id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('publishing a new version archives the published version it supersedes', async () => {
    const svc = await import('./templateService');
    const { PROTOCOL_REGISTRY } = await import('@/components/Config/Protocols/protocolShared');
    const v1 = PROTOCOL_REGISTRY.find(p => p.status === 'published')!;

    // One SNOMED-coded field, so the PS-63 coverage rule (≥80%) is met.
    const sections = [{ id: 's1', title: 'S', fields: [{ id: 'f1', label: 'F', type: 'text', required: false, options: [], snomed: '123456' }] }] as never;
    await svc.saveDraft({ id: 'v2-test', name: v1.name, source: v1.source, version: '9.1.0', category: v1.category, sections, supersedesId: v1.id });
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'v2-test')!.supersedesId).toBe(v1.id);
    expect(PROTOCOL_REGISTRY.find(p => p.id === v1.id)!.status).toBe('published'); // still live until v2 is published

    // PS-63: publishing needs an approver's independent approval.
    localStorage.setItem('pathscribe-user', JSON.stringify({ id: 'reviewer-archive-test', role: 'admin' }));
    await svc.approveTemplate('v2-test', undefined, 'Reviewer');
    await svc.publishTemplate('v2-test');
    localStorage.setItem('pathscribe-user', JSON.stringify({ id: 'author-archive-test', role: 'admin' }));
    expect(PROTOCOL_REGISTRY.find(p => p.id === 'v2-test')!.status).toBe('published');
    expect(PROTOCOL_REGISTRY.find(p => p.id === v1.id)!.status).toBe('archived');
  });

  it('a copy of a non-diagnostic protocol stays non-diagnostic on its first save', async () => {
    const svc = await import('./templateService');
    const { PROTOCOL_REGISTRY, isDiagnosticProtocol } = await import('@/components/Config/Protocols/protocolShared');
    const grossing = PROTOCOL_REGISTRY.find(p => p.isDiagnostic === false)!;
    expect(grossing).toBeTruthy();
    await svc.saveDraft({ id: 'copy-test', name: 'Grossing copy', source: grossing.source, version: '1.0.1', category: grossing.category, sections: [], copiedFromId: grossing.id });
    const copy = PROTOCOL_REGISTRY.find(p => p.id === 'copy-test')!;
    expect(isDiagnosticProtocol(copy)).toBe(false);
    expect(copy.type).toBe(grossing.type);
  });
});

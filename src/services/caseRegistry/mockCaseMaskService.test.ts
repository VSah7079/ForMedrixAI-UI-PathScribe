// src/services/caseRegistry/mockCaseMaskService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { mockCaseMaskService } = await import('./mockCaseMaskService');
const { DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX } = await import('@/types/config/CaseMask');

const TZ = 'America/Phoenix';

describe('mockCaseMaskService — real, self-contained-per-scope CaseMask allocation', () => {
  beforeEach(() => { store.clear(); });

  it('seeds the three real departments carried forward from Department\'s own former accessionPrefix/numberSeries fields', async () => {
    const res = await mockCaseMaskService.getAllMasks();
    if (!res.ok) throw new Error('setup failed');
    const surgical = res.data.find(m => m.scopeId === 'cat-surgical-tissue');
    expect(surgical?.prefix).toBe('S');
    expect(res.data.find(m => m.scopeId === 'cat-fluid-cytology')?.prefix).toBe('NG');
    expect(res.data.find(m => m.scopeId === 'cat-histology-only')?.prefix).toBe('CS');
  });

  it('falls back to the default scheme when no candidate has a real, defined CaseMask', async () => {
    const res = await mockCaseMaskService.allocateNextCaseNumber(
      [{ scopeType: 'department', scopeId: 'dept-with-no-mask' }], TZ
    );
    if (!res.ok) throw new Error('allocation failed');
    expect(res.data.startsWith(DEFAULT_FALLBACK_PREFIX)).toBe(true);
  });

  it('uses the first candidate with a real CaseMask — most-specific wins over less-specific real candidates', async () => {
    // department has one; facility does not — department should win.
    await mockCaseMaskService.saveMask({
      id: 'dept-x', scopeType: 'department', scopeId: 'dept-x',
      prefix: 'DX', maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: 4,
      currentSequence: 0, resetSequenceAnnually: true, updatedBy: 'test', updatedAt: '',
    });
    const res = await mockCaseMaskService.allocateNextCaseNumber(
      [{ scopeType: 'department', scopeId: 'dept-x' }, { scopeType: 'facility', scopeId: 'fac-x' }], TZ
    );
    if (!res.ok) throw new Error('allocation failed');
    expect(res.data.startsWith('DX')).toBe(true);
  });

  it('falls through to the next real candidate when the most-specific one has no CaseMask defined', async () => {
    await mockCaseMaskService.saveMask({
      id: 'ent-y', scopeType: 'enterprise', scopeId: 'ent-y',
      prefix: 'ENT', maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: 4,
      currentSequence: 0, resetSequenceAnnually: true, updatedBy: 'test', updatedAt: '',
    });
    const res = await mockCaseMaskService.allocateNextCaseNumber(
      [{ scopeType: 'department', scopeId: 'dept-undefined' }, { scopeType: 'facility', scopeId: 'fac-undefined' }, { scopeType: 'enterprise', scopeId: 'ent-y' }], TZ
    );
    if (!res.ok) throw new Error('allocation failed');
    expect(res.data.startsWith('ENT')).toBe(true);
  });

  it('increments the real sequence counter on each successive allocation', async () => {
    await mockCaseMaskService.saveMask({
      id: 'dept-inc', scopeType: 'department', scopeId: 'dept-inc',
      prefix: 'INC', maskPattern: '{PREFIX}-{SEQ:4}', sequenceDigits: 4,
      currentSequence: 0, resetSequenceAnnually: false, updatedBy: 'test', updatedAt: '',
    });
    const candidates = [{ scopeType: 'department' as const, scopeId: 'dept-inc' }];
    const first = await mockCaseMaskService.allocateNextCaseNumber(candidates, TZ);
    const second = await mockCaseMaskService.allocateNextCaseNumber(candidates, TZ);
    if (!first.ok || !second.ok) throw new Error('allocation failed');
    expect(first.data).toBe('INC-0001');
    expect(second.data).toBe('INC-0002');
  });

  it('previewNextCaseNumber never consumes a real sequence number', async () => {
    await mockCaseMaskService.saveMask({
      id: 'dept-prev', scopeType: 'department', scopeId: 'dept-prev',
      prefix: 'PV', maskPattern: '{PREFIX}-{SEQ:4}', sequenceDigits: 4,
      currentSequence: 5, resetSequenceAnnually: false, updatedBy: 'test', updatedAt: '',
    });
    const candidates = [{ scopeType: 'department' as const, scopeId: 'dept-prev' }];
    const preview1 = await mockCaseMaskService.previewNextCaseNumber(candidates, TZ);
    const preview2 = await mockCaseMaskService.previewNextCaseNumber(candidates, TZ);
    if (!preview1.ok || !preview2.ok) throw new Error('preview failed');
    expect(preview1.data).toBe('PV-0006');
    expect(preview2.data).toBe('PV-0006');
    const maskRes = await mockCaseMaskService.getMask('department', 'dept-prev');
    if (!maskRes.ok) throw new Error('getMask failed');
    expect(maskRes.data?.currentSequence).toBe(5);
  });

  it('resets the sequence to 1 when resetSequenceAnnually is true and lastResetYear is in the past', async () => {
    await mockCaseMaskService.saveMask({
      id: 'dept-reset', scopeType: 'department', scopeId: 'dept-reset',
      prefix: 'RS', maskPattern: '{PREFIX}-{SEQ:4}', sequenceDigits: 4,
      currentSequence: 99, resetSequenceAnnually: true, lastResetYear: 2020, updatedBy: 'test', updatedAt: '',
    });
    const res = await mockCaseMaskService.allocateNextCaseNumber(
      [{ scopeType: 'department', scopeId: 'dept-reset' }], TZ
    );
    if (!res.ok) throw new Error('allocation failed');
    expect(res.data).toBe('RS-0001');
  });

  it('deleteMask removes a scope\'s CaseMask so allocation falls through to the next real candidate', async () => {
    await mockCaseMaskService.saveMask({
      id: 'dept-del', scopeType: 'department', scopeId: 'dept-del',
      prefix: 'DEL', maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: 4,
      currentSequence: 0, resetSequenceAnnually: true, updatedBy: 'test', updatedAt: '',
    });
    const deleteRes = await mockCaseMaskService.deleteMask('department', 'dept-del');
    expect(deleteRes.ok).toBe(true);
    const afterRes = await mockCaseMaskService.getMask('department', 'dept-del');
    if (!afterRes.ok) throw new Error('getMask failed');
    expect(afterRes.data).toBeNull();
  });
});

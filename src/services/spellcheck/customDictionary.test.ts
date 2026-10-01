// src/services/spellcheck/customDictionary.test.ts — PS-342 (Batch 336), AC5.
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeCustomWord, canManageFacilityDictionary } from './customDictionaryRules';
import { mockCustomDictionaryService as svc } from './mockCustomDictionaryService';
import { mockAuditService } from '../auditlog/mockAuditService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
});

const admin = { userId: 'a1', userName: 'Lab Admin', role: 'admin' };
const pathologist = { userId: 'p1', userName: 'Dr Path', role: 'pathologist' };

describe('custom dictionaries', () => {
  it('accepts single words only', () => {
    expect(normalizeCustomWord("  O’Brien ")).toEqual({ ok: true, word: "O'Brien" });
    expect(normalizeCustomWord('two words')).toEqual({ ok: false, code: 'NOT_A_WORD' });
    expect(normalizeCustomWord(' ')).toEqual({ ok: false, code: 'EMPTY' });
    expect(normalizeCustomWord('x'.repeat(65))).toEqual({ ok: false, code: 'TOO_LONG' });
    expect(['admin', 'pathologist-admin', 'superadmin', 'pathologist', undefined].map(canManageFacilityDictionary)).toEqual([true, true, true, false, false]);
  });

  it('personal words: add once, remove, not audited', async () => {
    await svc.addPersonal('p1', 'pHx', pathologist);
    const again = await svc.addPersonal('p1', 'PHX', pathologist);
    expect(again.ok && again.data.map(e => e.word)).toEqual(['pHx']);
    expect(await svc.listPersonal('p2')).toEqual({ ok: true, data: [] });
    expect(await svc.removePersonal('p1', 'phx')).toEqual({ ok: true, data: [] });
    expect(await svc.removePersonal('p1', 'phx')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('facility words: admins only, immediate, audited in English', async () => {
    expect(await svc.addFacility('LAB1', 'megablock', pathologist)).toMatchObject({ ok: false, code: 'NOT_PERMITTED' });
    const added = await svc.addFacility('LAB1', 'megablock', admin, 'Fenwick Pathology Lab');
    expect(added.ok && added.data.map(e => [e.word, e.addedBy.userName])).toEqual([['megablock', 'Lab Admin']]);
    await svc.addFacility('LAB1', 'Megablock', admin, 'Fenwick Pathology Lab'); // duplicate: no second audit entry
    await svc.removeFacility('LAB1', 'megablock', admin, 'Fenwick Pathology Lab');
    const logs = await mockAuditService.getAuditLogs({});
    const mine = (logs.ok ? logs.data : []).filter(l => /spelling dictionary/.test(l.event));
    expect(mine.map(l => [l.event, l.detail, l.user])).toEqual([
      ['Facility spelling dictionary word removed', '"megablock" removed from the spelling dictionary of Fenwick Pathology Lab', 'Lab Admin'],
      ['Facility spelling dictionary word added', '"megablock" added to the spelling dictionary of Fenwick Pathology Lab', 'Lab Admin'],
    ]);
  });
});

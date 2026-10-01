// @vitest-environment happy-dom
// Batch 353: the TAT target service (was the TAT settings screen's own storage).
import { beforeEach, describe, expect, it } from 'vitest';
import { mockTatTargetService, TAT_TARGET_STORAGE_KEY } from './mockTatTargetService';
import { SYSTEM_DEFAULT_TAT_ENTRIES, isSystemDefaultTatEntryId } from './systemDefaultTatEntries';
import type { TATEntry } from '@/types/quality/TatConfigEntry';

const custom = (over: Partial<TATEntry> = {}): TATEntry => ({
  id: 'tat-1', type: 'TOTAL_CASE', targetHours: 12, urgency: 'ROUTINE', facilityId: 'c1', performingLabFacilityId: null,
  specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: '', createdAt: '2026-09-27T00:00:00Z', ...over,
});

describe('mockTatTargetService', () => {
  beforeEach(() => localStorage.removeItem(TAT_TARGET_STORAGE_KEY));

  it('starts with the system defaults', async () => {
    const res = await mockTatTargetService.getAll();
    expect(res.ok && res.data.map(e => e.id)).toEqual(SYSTEM_DEFAULT_TAT_ENTRIES.map(e => e.id));
  });

  it('adds, updates and removes a target, and keeps what the TAT screen already stored', async () => {
    expect((await mockTatTargetService.add(custom())).ok).toBe(true);
    expect(await mockTatTargetService.add(custom())).toEqual({ ok: false, error: 'duplicateId' });
    expect((await mockTatTargetService.update(custom({ targetHours: 8 }))).ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem(TAT_TARGET_STORAGE_KEY)!) as TATEntry[];
    expect(stored.find(e => e.id === 'tat-1')?.targetHours).toBe(8);
    expect((await mockTatTargetService.remove('tat-1')).ok).toBe(true);
    expect(await mockTatTargetService.remove('tat-1')).toEqual({ ok: false, error: 'notFound' });
    expect(await mockTatTargetService.update(custom({ id: 'nope' }))).toEqual({ ok: false, error: 'notFound' });
  });

  it('refuses to delete a system default, but it can be switched off', async () => {
    expect(await mockTatTargetService.remove('sys-tc-r')).toEqual({ ok: false, error: 'systemDefault' });
    const tc = SYSTEM_DEFAULT_TAT_ENTRIES.find(e => e.id === 'sys-tc-r')!;
    expect((await mockTatTargetService.update({ ...tc, active: false })).ok).toBe(true);
    const res = await mockTatTargetService.getAll();
    expect(res.ok && res.data.find(e => e.id === 'sys-tc-r')?.active).toBe(false);
    // The shared defaults list itself is untouched.
    expect(tc.active).toBe(true);
  });

  it('isSystemDefaultTatEntryId', () => {
    expect(isSystemDefaultTatEntryId('sys-ft-r')).toBe(true);
    expect(isSystemDefaultTatEntryId('tat-1')).toBe(false);
  });
});

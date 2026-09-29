import { describe, it, expect } from 'vitest';
import { buildTatEntry, findTatConflict } from './tatConfigRules';
import type { TATEntry } from '@/types/quality/TatConfigEntry';

const base: TATEntry = {
  id: 'sys-so-r', type: 'SIGN_OUT', targetHours: 4, urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null,
  specimenId: null, subspecialtyId: null, roleId: 'Resident', active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z',
};
const opts = { now: '2026-09-24T00:00:00Z', newId: () => 'tat-new' };

describe('buildTatEntry', () => {
  it('edit keeps the stored id and createdAt, and keeps roleId (regression: it was forced to null)', () => {
    const r = buildTatEntry({ ...base, targetHours: 6 }, 'edit', base, [base], opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.id).toBe('sys-so-r');
      expect(r.entry.createdAt).toBe(base.createdAt);
      expect(r.entry.roleId).toBe('Resident');
      expect(r.entry.targetHours).toBe(6);
    }
  });

  it('a duplicate is an ADD: new id, and an unchanged copy is blocked by the conflict check instead of overwriting its source', () => {
    const copy = { ...base, id: '__clone__' };
    const blocked = buildTatEntry(copy, 'add', undefined, [base], opts);
    expect(blocked).toMatchObject({ ok: false, error: 'conflict', conflict: base });
    const changed = buildTatEntry({ ...copy, performingLabFacilityId: 'lab-2' }, 'add', undefined, [base], opts);
    expect(changed.ok && changed.entry.id).toBe('tat-new');
    expect(changed.ok && changed.entry.createdAt).toBe(opts.now);
  });

  it('validates type and hours', () => {
    expect(buildTatEntry({ ...base, type: '' }, 'add', undefined, [], opts)).toMatchObject({ ok: false, error: 'typeRequired' });
    expect(buildTatEntry({ ...base, targetHours: 0 }, 'add', undefined, [], opts)).toMatchObject({ ok: false, error: 'hoursRequired' });
  });
});

describe('findTatConflict', () => {
  it('ignores inactive entries and the excluded (edited) entry', () => {
    expect(findTatConflict([{ ...base, active: false }], base)).toBeNull();
    expect(findTatConflict([base], base, base.id)).toBeNull();
    expect(findTatConflict([base], { ...base, roleId: null })).toBeNull();
  });
});

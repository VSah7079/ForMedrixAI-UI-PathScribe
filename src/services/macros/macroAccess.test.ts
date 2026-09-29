// src/services/macros/macroAccess.test.ts — Batch 349 (PS-126)
import { describe, it, expect } from 'vitest';
import type { Macro } from './IMacroService';
import { canEditMacro, canManageAllMacros, groupAllMacros, macroTiersFor } from './macroAccess';

const m = (id: string, name: string, over: Partial<Macro> = {}): Macro =>
  ({ id, name, shortcut: `;${id}`, content: '', category: 'Custom', subspecialtyIds: [], snomedCodes: [], icdCodes: [], createdBy: 'x', status: 'Active', ...over } as Macro);

describe('macro access', () => {
  it('only administrators manage every macro and see the Enterprise option', () => {
    for (const r of ['admin', 'pathologist-admin', 'superadmin']) {
      expect(canManageAllMacros(r)).toBe(true);
      expect(macroTiersFor(r)).toEqual(['enterprise', 'facility', 'personal']);
    }
    for (const r of ['pathologist', 'pa', undefined]) {
      expect(canManageAllMacros(r)).toBe(false);
      expect(macroTiersFor(r)).toEqual(['facility', 'personal']);
    }
  });

  it('who may change a macro', () => {
    const ent = m('e', 'E'); const fac = m('f', 'F', { performingLabFacilityId: 'lab-1' }); const mine = m('p', 'P', { ownerUserId: 'u1' });
    expect(canEditMacro(ent, 'u1', 'pathologist')).toBe(false);
    expect(canEditMacro(ent, 'u1', 'admin')).toBe(true);
    expect(canEditMacro(fac, 'u1', 'pathologist')).toBe(true);
    expect(canEditMacro(mine, 'u1', 'pathologist')).toBe(true);
    expect(canEditMacro(mine, 'u2', 'pathologist')).toBe(false);
    expect(canEditMacro(mine, 'u2', 'admin')).toBe(true);
  });

  it('groups all macros: Enterprise, then facilities by name, then users by name; macros by name', () => {
    const list = [
      m('1', 'Zeta', { ownerUserId: 'u-b' }), m('2', 'Beta'), m('3', 'Alpha'),
      m('4', 'Gamma', { performingLabFacilityId: 'lab-2' }), m('5', 'Delta', { ownerUserId: 'u-a' }),
      m('6', 'Eps', { performingLabFacilityId: 'lab-1' }), m('7', 'Alpha2', { ownerUserId: 'u-b' }),
    ];
    const groups = groupAllMacros(list, id => ({ 'lab-1': 'North Lab', 'lab-2': 'Central Lab' } as Record<string, string>)[id], id => ({ 'u-a': 'Adams, Kim', 'u-b': 'Brown, Lee' } as Record<string, string>)[id]);
    expect(groups.map(g => [g.tier, g.label, g.macros.map(x => x.name)])).toEqual([
      ['enterprise', '', ['Alpha', 'Beta']],
      ['facility', 'Central Lab', ['Gamma']],
      ['facility', 'North Lab', ['Eps']],
      ['personal', 'Adams, Kim', ['Delta']],
      ['personal', 'Brown, Lee', ['Alpha2', 'Zeta']],
    ]);
  });
});

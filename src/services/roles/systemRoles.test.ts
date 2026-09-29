// src/services/roles/systemRoles.test.ts — built-in roles by fixed id (Batch 329, PS-63).
import { describe, it, expect } from 'vitest';
import { mergeBuiltInRoles, renameRoleInList, roleIdsForNames, SYSTEM_ROLE_IDS } from './systemRoles';

const seeds = [
  { id: 'admin', name: 'Admin', builtIn: true },
  { id: 'template-author', name: 'Template Author', builtIn: true },
  { id: 'lab-director', name: 'Lab Director', builtIn: true },
];

describe('mergeBuiltInRoles', () => {
  it('adds missing built-in roles and keeps stored ones as the admin left them', () => {
    const stored = [{ id: 'admin', name: 'Administrator', builtIn: true }, { id: 'custom-1', name: 'Custom', builtIn: false }];
    const { roles, added } = mergeBuiltInRoles(stored, seeds);
    expect(added).toEqual(['template-author', 'lab-director']);
    expect(roles.map(r => r.id)).toEqual(['admin', 'custom-1', 'template-author', 'lab-director']);
    expect(roles[0].name).toBe('Administrator');
    expect(mergeBuiltInRoles(roles, seeds).added).toEqual([]);
  });
});

describe('roleIdsForNames', () => {
  it('matches names to ids through the catalog, ignoring case and spacing', () => {
    expect(roleIdsForNames([' lab director', 'Admin', 'Unknown'], seeds)).toEqual(['lab-director', 'admin']);
    expect(roleIdsForNames(undefined, seeds)).toEqual([]);
  });

  it('still finds a renamed built-in role by id', () => {
    const renamed = seeds.map(r => (r.id === SYSTEM_ROLE_IDS.LAB_DIRECTOR ? { ...r, name: 'Laboratory Director' } : r));
    expect(roleIdsForNames(['Laboratory Director'], renamed)).toEqual(['lab-director']);
  });
});

describe('renameRoleInList', () => {
  it('renames the role on a staff record without duplicating it', () => {
    expect(renameRoleInList(['Pathologist', 'Lab Director'], 'lab director', 'Laboratory Director')).toEqual(['Pathologist', 'Laboratory Director']);
    expect(renameRoleInList(['A', 'B'], 'A', 'B')).toEqual(['B']);
  });
});

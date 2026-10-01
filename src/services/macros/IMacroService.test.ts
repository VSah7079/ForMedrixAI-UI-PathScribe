import { describe, it, expect } from 'vitest';
import { isMacroVisibleTo, type Macro } from './IMacroService';
import { generateShortcutFromName } from './generateShortcutFromName';

const base: Omit<Macro, 'performingLabFacilityId' | 'ownerUserId'> = {
  id: 'm1', name: 'Test', shortcut: ';t', category: 'Custom', content: 'x',
  subspecialtyIds: [], snomedCodes: [], icdCodes: [], createdBy: 'PATH-001', status: 'Active',
};

describe('isMacroVisibleTo — real three-tier resolution (Enterprise / Facility / Personal)', () => {
  it('Enterprise tier (no facility, no owner) is visible to every real user, regardless of facility', () => {
    const macro: Macro = { ...base };
    expect(isMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(true);
    expect(isMacroVisibleTo(macro, 'PATH-002', undefined)).toBe(true);
    expect(isMacroVisibleTo(macro, 'PATH-002', 'FAC-B')).toBe(true);
  });

  it('Facility tier is visible only to a user whose current facility matches, regardless of who owns/created it', () => {
    const macro: Macro = { ...base, performingLabFacilityId: 'FAC-A' };
    expect(isMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(true);
    expect(isMacroVisibleTo(macro, 'PATH-002', 'FAC-B')).toBe(false);
    expect(isMacroVisibleTo(macro, 'PATH-002', undefined)).toBe(false);
  });

  it('Personal tier is visible only to its real owner — facility is irrelevant once ownerUserId is set', () => {
    const macro: Macro = { ...base, ownerUserId: 'PATH-001' };
    expect(isMacroVisibleTo(macro, 'PATH-001', 'FAC-A')).toBe(true);
    expect(isMacroVisibleTo(macro, 'PATH-001', undefined)).toBe(true);
    expect(isMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(false);
  });

  it('real precedence: ownerUserId always wins over performingLabFacilityId when both happen to be set', () => {
    // Real, defensive case: a personal macro that also carries a
    // performingLabFacilityId (e.g. captured while working at a real
    // facility, for provenance) must still resolve as personal only —
    // never leak to that facility's whole staff.
    const macro: Macro = { ...base, ownerUserId: 'PATH-001', performingLabFacilityId: 'FAC-A' };
    expect(isMacroVisibleTo(macro, 'PATH-001', 'FAC-A')).toBe(true);
    // A different real user at the SAME facility must NOT see it.
    expect(isMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(false);
  });
});

describe('generateShortcutFromName — real, per direct guidance (Word AutoText import)', () => {
  it('sanitizes a real name into a valid ;-prefixed shortcut', () => {
    expect(generateShortcutFromName('Normal Colon', new Set())).toBe(';normalcolon');
  });

  it('strips real punctuation/spaces, keeping only real alphanumerics', () => {
    // 'adequatespecimencomment' is 23 real chars — truncated to 20,
    // same real limit this function always applies.
    expect(generateShortcutFromName("Adequate Specimen (Comment)!", new Set())).toBe(';adequatespecimencomm');
  });

  it('real deduplication: a colliding shortcut gets a real, incrementing numeric suffix', () => {
    const existing = new Set([';normalcolon']);
    expect(generateShortcutFromName('Normal Colon', existing)).toBe(';normalcolon2');
  });

  it('keeps incrementing past a real, already-taken numbered suffix too', () => {
    const existing = new Set([';normalcolon', ';normalcolon2', ';normalcolon3']);
    expect(generateShortcutFromName('Normal Colon', existing)).toBe(';normalcolon4');
  });

  it('a name with no real alphanumeric characters at all falls back to a real, generic placeholder', () => {
    expect(generateShortcutFromName('!!!', new Set())).toBe(';imported');
  });

  it('truncates a real, very long name rather than producing an unwieldy shortcut', () => {
    const result = generateShortcutFromName('A Very Long Building Block Entry Name That Goes On', new Set());
    expect(result.length).toBeLessThanOrEqual(21); // ';' + 20 chars
  });
});

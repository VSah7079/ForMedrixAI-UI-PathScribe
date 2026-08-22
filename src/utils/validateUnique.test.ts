import { describe, it, expect } from 'vitest';
import { findDuplicate } from './validateUnique';

describe('findDuplicate', () => {
  const entries = [
    { id: 's1', name: 'Ki-67', category: 'IHC' },
    { id: 's2', name: 'H&E', category: 'Routine' },
  ];

  it('finds a collision on a single key, case-insensitively', () => {
    const result = findDuplicate(entries, { name: 'ki-67' }, ['name']);
    expect(result?.id).toBe('s1');
  });

  it('trims whitespace before comparing', () => {
    const result = findDuplicate(entries, { name: '  H&E  ' }, ['name']);
    expect(result?.id).toBe('s2');
  });

  it('returns undefined when there is no real collision', () => {
    const result = findDuplicate(entries, { name: 'Masson Trichrome' }, ['name']);
    expect(result).toBeUndefined();
  });

  it('excludes the entry being edited, so saving it unchanged does not flag itself', () => {
    const result = findDuplicate(entries, { name: 'Ki-67' }, ['name'], 's1');
    expect(result).toBeUndefined();
  });

  it('still catches a real collision against a DIFFERENT entry while excluding self', () => {
    const result = findDuplicate(entries, { name: 'H&E' }, ['name'], 's1');
    expect(result?.id).toBe('s2');
  });

  it('requires ALL given keys to match — a partial match on a multi-key check is not a collision', () => {
    const crosswalk = [
      { id: 'x1', clientId: 'client-a', externalCode: 'TISSUE-01' },
      { id: 'x2', clientId: 'client-b', externalCode: 'TISSUE-01' },
    ];
    // Same code, but a genuinely different client — must NOT collide.
    const result = findDuplicate(crosswalk, { clientId: 'client-c', externalCode: 'TISSUE-01' }, ['clientId', 'externalCode']);
    expect(result).toBeUndefined();
  });

  it('catches a real multi-key collision — same client AND same code', () => {
    const crosswalk = [
      { id: 'x1', clientId: 'client-a', externalCode: 'TISSUE-01' },
    ];
    const result = findDuplicate(crosswalk, { clientId: 'client-a', externalCode: 'tissue-01' }, ['clientId', 'externalCode']);
    expect(result?.id).toBe('x1');
  });

  it('does not treat non-string equal values as a false collision source of bugs (e.g. two different ids)', () => {
    const result = findDuplicate(entries, { name: 'Totally New' }, ['name']);
    expect(result).toBeUndefined();
  });
});

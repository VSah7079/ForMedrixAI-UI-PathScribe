import { describe, it, expect } from 'vitest';
import { prepareDuplicate } from './duplicateEntry';

// Stand-ins for t('common.copyOfName', { name }) in two languages: the marker
// always comes from the caller, never from this helper.
const en = (name: string) => `${name} (Copy)`;
const de = (name: string) => `${name} (Kopie)`;

describe('prepareDuplicate', () => {
  it('marks the name with the caller-supplied, localized formatter', () => {
    const source = { id: 's1', name: 'Ki-67', category: 'IHC' };
    expect(prepareDuplicate(source, 'name', en).name).toBe('Ki-67 (Copy)');
    expect(prepareDuplicate(source, 'name', de).name).toBe('Ki-67 (Kopie)');
  });

  it('leaves every other field untouched', () => {
    const source = { id: 's1', name: 'Ki-67', category: 'IHC', active: true };
    const result = prepareDuplicate(source, 'name', en);
    expect(result.id).toBe('s1');
    expect(result.category).toBe('IHC');
    expect(result.active).toBe(true);
  });

  it('supports any name-like key, e.g. "label"', () => {
    const source = { id: 'm1', label: 'Standard H&E' };
    expect(prepareDuplicate(source, 'label', en).label).toBe('Standard H&E (Copy)');
  });

  it('does not mutate the original source object', () => {
    const source = { id: 's1', name: 'Ki-67' };
    prepareDuplicate(source, 'name', en);
    expect(source.name).toBe('Ki-67');
  });

  it('leaves an empty or whitespace-only name alone rather than producing a bare marker', () => {
    const source = { id: 's1', name: '   ' };
    expect(prepareDuplicate(source, 'name', en).name).toBe('   ');
  });

  it('handles a missing name field without throwing or calling the formatter', () => {
    const source = { id: 's1' } as { id: string; name?: string };
    let called = false;
    const result = prepareDuplicate(source, 'name', n => { called = true; return n; });
    expect(result.name).toBeUndefined();
    expect(called).toBe(false);
  });
});

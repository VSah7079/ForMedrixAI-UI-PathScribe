import { describe, it, expect } from 'vitest';
import { prepareDuplicate, preparePersonDuplicate } from './duplicateEntry';

describe('prepareDuplicate', () => {
  it('suffixes the default "name" field with " (Copy)"', () => {
    const source = { id: 's1', name: 'Ki-67', category: 'IHC' };
    const result = prepareDuplicate(source);
    expect(result.name).toBe('Ki-67 (Copy)');
  });

  it('leaves every other field untouched', () => {
    const source = { id: 's1', name: 'Ki-67', category: 'IHC', active: true };
    const result = prepareDuplicate(source);
    expect(result.id).toBe('s1');
    expect(result.category).toBe('IHC');
    expect(result.active).toBe(true);
  });

  it('supports a custom name-like key, e.g. "label" or "fullName"', () => {
    const source = { id: 'm1', label: 'Standard H&E' };
    const result = prepareDuplicate(source, 'label');
    expect(result.label).toBe('Standard H&E (Copy)');
  });

  it('does not mutate the original source object', () => {
    const source = { id: 's1', name: 'Ki-67' };
    prepareDuplicate(source);
    expect(source.name).toBe('Ki-67');
  });

  it('leaves an empty or whitespace-only name field alone rather than producing " (Copy)"', () => {
    const source = { id: 's1', name: '   ' };
    const result = prepareDuplicate(source);
    expect(result.name).toBe('   ');
  });

  it('handles a missing/undefined name field without throwing', () => {
    const source = { id: 's1' } as { id: string; name?: string };
    const result = prepareDuplicate(source);
    expect(result.name).toBeUndefined();
  });
});

describe('preparePersonDuplicate', () => {
  const physician = {
    id: 'ph1',
    givenNames: 'Robert',
    familyNames: 'Williams',
    npi: '9876543210',
    physicianCode: 'PHY-0001',
    phone: '555-1001',
    specialty: 'Gastroenterology',
    clientIds: ['c1', 'c2'],
    preferredContact: 'Fax' as const,
    status: 'Active' as const,
  };

  it('clears only the listed person-specific string fields', () => {
    const result = preparePersonDuplicate(physician, ['givenNames', 'familyNames', 'npi', 'physicianCode', 'phone']);
    expect(result.givenNames).toBe('');
    expect(result.familyNames).toBe('');
    expect(result.npi).toBe('');
    expect(result.physicianCode).toBe('');
    expect(result.phone).toBe('');
  });

  it('leaves fields not listed untouched, including other strings', () => {
    const result = preparePersonDuplicate(physician, ['givenNames']);
    expect(result.specialty).toBe('Gastroenterology');
    expect(result.preferredContact).toBe('Fax');
  });

  it('leaves non-string fields (arrays, etc.) untouched even if listed', () => {
    const result = preparePersonDuplicate(physician, ['clientIds' as keyof typeof physician]);
    expect(result.clientIds).toEqual(['c1', 'c2']);
  });

  it('does not mutate the original source object', () => {
    preparePersonDuplicate(physician, ['givenNames', 'familyNames']);
    expect(physician.givenNames).toBe('Robert');
    expect(physician.familyNames).toBe('Williams');
  });

  it('leaves an already-empty string field as empty, not undefined', () => {
    const source = { id: 'ph2', givenNames: '' };
    const result = preparePersonDuplicate(source, ['givenNames']);
    expect(result.givenNames).toBe('');
  });

  it('handles an empty personFields list as a no-op copy', () => {
    const result = preparePersonDuplicate(physician, []);
    expect(result).toEqual(physician);
    expect(result).not.toBe(physician);
  });
});

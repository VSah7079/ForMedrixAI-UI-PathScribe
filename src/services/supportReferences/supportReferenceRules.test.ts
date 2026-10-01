// Batch 364 (PS-350): the support reference format.
import { describe, expect, it } from 'vitest';
import { generateSupportReference, isSupportReference, normaliseSupportReference, SUPPORT_REFERENCE_IN_TEXT } from './supportReferenceRules';

const bytes = (...v: number[]) => () => new Uint8Array(v);

describe('generateSupportReference', () => {
  it('builds SR-XXXX-XXXX from random bytes, Crockford base 32', () => {
    expect(generateSupportReference(bytes(0, 1, 2, 3, 28, 29, 30, 31))).toBe('SR-0123-WXYZ');
    expect(generateSupportReference(bytes(255, 32, 64, 18, 19, 20, 21, 22))).toBe('SR-Z00J-KMNP');
  });
  it('never uses I, L, O or U', () => {
    const all = generateSupportReference(bytes(...Array.from({ length: 8 }, (_, i) => i * 4 + 1)));
    expect(all).not.toMatch(/[ILOU]/);
  });
});

describe('normaliseSupportReference', () => {
  it('accepts what people type: case, spaces, missing dashes, look-alike letters', () => {
    expect(normaliseSupportReference(' sr-7k2q-9mxd ')).toBe('SR-7K2Q-9MXD');
    expect(normaliseSupportReference('SR7K2Q9MXD')).toBe('SR-7K2Q-9MXD');
    expect(normaliseSupportReference('SR-7K2Q 9MXD')).toBe('SR-7K2Q-9MXD');
    expect(normaliseSupportReference('SR-OI2Q-9MXL')).toBe('SR-012Q-9MX1');
  });
  it('rejects anything else', () => {
    expect(normaliseSupportReference('SR-7K2Q-9MX')).toBeNull();
    expect(normaliseSupportReference('SR-7K2Q-9MXU')).toBeNull();
    expect(normaliseSupportReference('')).toBeNull();
  });
  it('isSupportReference needs the SR prefix, so a case number is never taken for one', () => {
    expect(isSupportReference('SR-7K2Q-9MXD')).toBe(true);
    expect(isSupportReference('7K2Q9MXD')).toBe(false);
    expect(isSupportReference('S26-4403')).toBe(false);
  });
});

it('SUPPORT_REFERENCE_IN_TEXT finds references inside a sentence', () => {
  expect('See SR-7K2Q-9MXD and sr-abcd-1234.'.match(SUPPORT_REFERENCE_IN_TEXT)).toEqual(['SR-7K2Q-9MXD', 'sr-abcd-1234']);
});

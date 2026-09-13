// src/utils/formatAddress.test.ts
import { describe, it, expect } from 'vitest';
import { formatAddress, type Address } from './formatAddress';

const ADDRESS: Address = {
  street: '123 Main St', city: 'Springfield', region: 'IL', postalCode: '62704', country: 'United States',
};

describe('formatAddress — real, per-jurisdiction structural line ordering', () => {
  it('real, US format is street, then "city, region postalCode"', () => {
    const lines = formatAddress(ADDRESS, 'US');
    expect(lines[0]).toBe('123 Main St');
    expect(lines[1]).toBe('Springfield, IL 62704');
  });

  it('real, FR format is street, then "postalCode city" with no comma', () => {
    const lines = formatAddress({ street: '10 Rue de Paris', city: 'Lyon', postalCode: '69001', country: 'France' }, 'FR');
    expect(lines[1]).toBe('69001 Lyon');
  });

  it('real, DE format matches the same continental-European ordering as FR', () => {
    const lines = formatAddress({ street: 'Hauptstraße 5', city: 'Berlin', postalCode: '10115', country: 'Germany' }, 'DE');
    expect(lines[1]).toBe('10115 Berlin');
  });

  it('real, NL format matches the same continental-European ordering', () => {
    const lines = formatAddress({ street: 'Kerkstraat 1', city: 'Amsterdam', postalCode: '1017 GC', country: 'Netherlands' }, 'NL');
    expect(lines[1]).toBe('1017 GC Amsterdam');
  });

  it('real, Korea is the genuine structural outlier — most-general-to-most-specific, postal code first', () => {
    const lines = formatAddress({ street: '123 Teheran-ro', city: 'Gangnam-gu', region: 'Seoul', postalCode: '06134', country: 'South Korea' }, 'KR');
    expect(lines[0]).toBe('06134');
    expect(lines[1]).toBe('Seoul Gangnam-gu');
    expect(lines[2]).toBe('123 Teheran-ro');
  });

  it('real, an optional street2/region that is genuinely absent never produces an empty line', () => {
    const lines = formatAddress({ street: '10 Rue de Paris', city: 'Lyon', postalCode: '69001', country: 'France' }, 'FR');
    expect(lines.every(l => l.trim().length > 0)).toBe(true);
  });
});

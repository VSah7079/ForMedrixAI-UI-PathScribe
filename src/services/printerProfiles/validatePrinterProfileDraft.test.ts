// src/services/printerProfiles/validatePrinterProfileDraft.test.ts
import { describe, it, expect } from 'vitest';
import { isPrinterProfileDraftValid } from './validatePrinterProfileDraft';

describe('isPrinterProfileDraftValid — extracted out of PrinterProfilesSection.tsx (no business logic in the UI code)', () => {
  it('valid when both printerId and model are present', () => {
    expect(isPrinterProfileDraftValid({ printerId: 'ZEBRA-01', model: 'ZT411' })).toBe(true);
  });

  it('invalid with an empty printerId', () => {
    expect(isPrinterProfileDraftValid({ printerId: '', model: 'ZT411' })).toBe(false);
  });

  it('invalid with an empty model', () => {
    expect(isPrinterProfileDraftValid({ printerId: 'ZEBRA-01', model: '' })).toBe(false);
  });

  it('invalid with only whitespace in either field', () => {
    expect(isPrinterProfileDraftValid({ printerId: '   ', model: 'ZT411' })).toBe(false);
  });
});

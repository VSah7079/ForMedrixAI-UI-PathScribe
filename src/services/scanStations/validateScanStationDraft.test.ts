// src/services/scanStations/validateScanStationDraft.test.ts
import { describe, it, expect } from 'vitest';
import { validateScanStationDraft } from './validateScanStationDraft';

const validDraft = { name: 'Grossing Station 4', barcodeCode: 'GROSSING-04', facilityId: 'lab-main', supportsPrinting: false };

describe('validateScanStationDraft — real fix, extracted out of ScanStationsSection.tsx (no business logic in the UI code)', () => {
  it('a real, complete, valid draft has no errors', () => {
    expect(validateScanStationDraft(validDraft)).toEqual({});
  });

  it('requires a real name', () => {
    const errors = validateScanStationDraft({ ...validDraft, name: '' });
    expect(errors.name).toBe('Required');
  });

  it('requires a real barcodeCode', () => {
    const errors = validateScanStationDraft({ ...validDraft, barcodeCode: '' });
    expect(errors.barcodeCode).toBeDefined();
  });

  it('real fix, per direct guidance: requires a real facilityId — genuinely unvalidated before the free-text field was replaced with a real dropdown', () => {
    const errors = validateScanStationDraft({ ...validDraft, facilityId: '' });
    expect(errors.facilityId).toBeDefined();
  });

  it('every real error is reported together, not just the first', () => {
    const errors = validateScanStationDraft({ name: '', barcodeCode: '', facilityId: '', supportsPrinting: false });
    expect(errors.name).toBeDefined();
    expect(errors.barcodeCode).toBeDefined();
    expect(errors.facilityId).toBeDefined();
  });

  it('real, deliberate domain rule: supportsPrinting on with no real printer profile is rejected', () => {
    const errors = validateScanStationDraft({ ...validDraft, supportsPrinting: true, cassetteSlidePrinterProfileId: '' });
    expect(errors.cassetteSlidePrinterProfileId).toBe('Required when Supports Printing is on');
  });

  it('supportsPrinting on WITH a real printer profile is valid', () => {
    const errors = validateScanStationDraft({ ...validDraft, supportsPrinting: true, cassetteSlidePrinterProfileId: 'printer-1' });
    expect(errors.cassetteSlidePrinterProfileId).toBeUndefined();
  });

  it('supportsPrinting off never requires a printer profile, regardless of whether one is set', () => {
    expect(validateScanStationDraft({ ...validDraft, supportsPrinting: false, cassetteSlidePrinterProfileId: '' }).cassetteSlidePrinterProfileId).toBeUndefined();
  });
});

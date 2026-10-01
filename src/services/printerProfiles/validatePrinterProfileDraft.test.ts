// src/services/printerProfiles/validatePrinterProfileDraft.test.ts
import { describe, it, expect } from 'vitest';
import { hasInvalidAgentPort, isPrinterProfileDraftValid, printerProfileDraftForSave } from './validatePrinterProfileDraft';

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

describe('PathScribe Agent port (Batch 346, PS-52)', () => {
  const base = { printerId: 'ZD421', model: 'ZD421', bridgeType: 'pathscribe_agent' as const };

  it('is optional, and must be 1024–65535 when set', () => {
    expect(isPrinterProfileDraftValid(base)).toBe(true);
    expect(isPrinterProfileDraftValid({ ...base, agentPort: 9200 })).toBe(true);
    for (const bad of [80, 1023, 65536, 9100.5]) {
      expect(hasInvalidAgentPort({ ...base, agentPort: bad })).toBe(true);
      expect(isPrinterProfileDraftValid({ ...base, agentPort: bad })).toBe(false);
    }
  });

  it('is ignored for other bridges, and not saved for them', () => {
    expect(hasInvalidAgentPort({ bridgeType: 'qz_tray', agentPort: 5 })).toBe(false);
    expect(printerProfileDraftForSave({ ...base, bridgeType: 'qz_tray', agentPort: 9200 })).toEqual({ printerId: 'ZD421', model: 'ZD421', bridgeType: 'qz_tray' });
    expect(printerProfileDraftForSave({ ...base, agentPort: 9200 })).toEqual({ ...base, agentPort: 9200 });
  });
});

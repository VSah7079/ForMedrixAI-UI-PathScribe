import { describe, it, expect } from 'vitest';
import { detectIdentifierType, resolveIdentifierApplication } from './detectIdentifierType';
import type { IdentifierFormat } from '@/types/systemConfig';

// Real, minimal, handcrafted fixtures matching the real, shipped
// IDENTIFIER_FORMAT_LIBRARY patterns (systemConfig.ts) - just enough
// of each real field this module actually reads.
const fmt = (over: Partial<IdentifierFormat>): IdentifierFormat => ({
  id: 'test', kind: 'accession', label: 'Test', description: '', pattern: '',
  barcodeTypes: [], tier: 1, navigateToCaseOnMatch: false, jurisdictions: [],
  lisPresets: [], enabled: true, example: '',
  ...over,
});

const US_ACCESSION = fmt({ id: 'acc-us', kind: 'accession', pattern: '^[A-Z]\\d{2}-\\d{4,6}$' });
const UK_ACCESSION = fmt({ id: 'acc-uk', kind: 'accession', pattern: '^[A-Z]{1,2}\\d{2}-\\d{4,6}$' });
const US_MRN = fmt({ id: 'mrn-us', kind: 'mrn', pattern: '^\\d{5,10}$' });
const SLIDE_1D = fmt({ id: 'slide-1d', kind: 'slide', pattern: '^[A-Za-z]{1,3}\\d{2}-\\d{4,6}-[A-Za-z0-9]+$' });
const REQUISITION = fmt({ id: 'req', kind: 'requisition', pattern: '^REQ-\\d{6}$' });

const ALL_FORMATS = [US_ACCESSION, UK_ACCESSION, US_MRN, SLIDE_1D, REQUISITION];

describe('detectIdentifierType — real, direct branch verification', () => {
  it('returns null for an empty or whitespace-only string', () => {
    expect(detectIdentifierType('', ALL_FORMATS)).toBeNull();
    expect(detectIdentifierType('   ', ALL_FORMATS)).toBeNull();
  });

  it('detects a real slide barcode (tier 1) before anything else', () => {
    expect(detectIdentifierType('S26-4200-A1', ALL_FORMATS)).toBe('slide');
  });

  it('does not detect a slide format at tier 2', () => {
    const tier2Slide = fmt({ id: 'slide-tier2', kind: 'slide', tier: 2, pattern: '^[A-Za-z]{1,3}\\d{2}-\\d{4,6}-[A-Za-z0-9]+$' });
    expect(detectIdentifierType('S26-4200-A1', [tier2Slide, US_ACCESSION])).not.toBe('slide');
  });

  it('detects a real MPI id (PID- prefix) regardless of configured formats', () => {
    expect(detectIdentifierType('PID-12345', [])).toBe('mpi');
    expect(detectIdentifierType('pid-12345', [])).toBe('mpi');
  });

  it('detects a real US accession number', () => {
    expect(detectIdentifierType('S26-4200', ALL_FORMATS)).toBe('accession');
  });

  it('detects a real UK accession number using a DIFFERENT enabled format than the US one', () => {
    expect(detectIdentifierType('SP26-4200', ALL_FORMATS)).toBe('accession');
  });

  it('does not match an accession format that is not enabled', () => {
    const disabledUk = { ...UK_ACCESSION, enabled: false };
    expect(detectIdentifierType('SP26-4200', [US_ACCESSION, disabledUk])).not.toBe('accession');
  });

  it('detects a real MRN', () => {
    expect(detectIdentifierType('1234567', ALL_FORMATS)).toBe('mrn');
  });

  it('detects a real requisition number', () => {
    expect(detectIdentifierType('REQ-123456', ALL_FORMATS)).toBe('requisition');
  });

  it('falls back to "name" for a real, alphabetic string matching no configured format', () => {
    expect(detectIdentifierType('Smith, John', ALL_FORMATS)).toBe('name');
    expect(detectIdentifierType('Smith John', ALL_FORMATS)).toBe('name');
  });

  it('falls back to "ambiguous" for a string that is neither a real format match nor name-like', () => {
    expect(detectIdentifierType('999999999999999', ALL_FORMATS.filter(f => f.kind !== 'mrn'))).toBe('ambiguous');
  });

  it('falls through gracefully on an invalid regex pattern rather than throwing', () => {
    const badFormat = fmt({ id: 'bad', kind: 'accession', pattern: '[' });
    expect(() => detectIdentifierType('S26-4200', [badFormat])).not.toThrow();
  });
});

describe('resolveIdentifierApplication — real, structured result, never a direct side effect', () => {
  it('a real, pipe-delimited slide payload with both ACC and SPEC navigates with a specimen param', () => {
    const res = resolveIdentifierApplication('ACC:S26-4200|SPEC:A1', 'slide', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'navigate', path: '/case/S26-4200/synoptic?specimen=A1' });
  });

  it('a real, pipe-delimited slide payload with only ACC navigates without a specimen param', () => {
    const res = resolveIdentifierApplication('ACC:S26-4200|OTHER:x', 'slide', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'navigate', path: '/case/S26-4200/synoptic' });
  });

  it('a real 1D slide barcode extracts its own accession prefix and navigates', () => {
    const res = resolveIdentifierApplication('S26-4200-A1-1', 'slide', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'navigate', path: '/case/S26-4200/synoptic' });
  });

  it('a slide value matching neither real slide shape falls back to setting accessionNo directly', () => {
    const res = resolveIdentifierApplication('unrecognized-slide-value', 'slide', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'setFilters', patientName: '', hospitalId: '', patientId: '', accessionNo: 'unrecognized-slide-value', orderNo: '', anyIdentifier: '' });
  });

  it('a real accession value normalizes and sets accessionNo only', () => {
    const res = resolveIdentifierApplication('S26-4200', 'accession', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res.action).toBe('setFilters');
    if (res.action === 'setFilters') {
      expect(res.accessionNo).toBeTruthy();
      expect(res.patientName).toBe('');
      expect(res.hospitalId).toBe('');
      expect(res.patientId).toBe('');
    }
  });

  it('a real MRN sets hospitalId only', () => {
    const res = resolveIdentifierApplication('1234567', 'mrn', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'setFilters', patientName: '', hospitalId: '1234567', patientId: '', accessionNo: '', orderNo: '', anyIdentifier: '' });
  });

  it('a real MPI sets patientId only', () => {
    const res = resolveIdentifierApplication('PID-12345', 'mpi', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'setFilters', patientName: '', hospitalId: '', patientId: 'PID-12345', accessionNo: '', orderNo: '', anyIdentifier: '' });
  });

  it('a real name sets patientName only', () => {
    const res = resolveIdentifierApplication('Smith, John', 'name', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'setFilters', patientName: 'Smith, John', hospitalId: '', patientId: '', accessionNo: '', orderNo: '', anyIdentifier: '' });
  });

  it('a requisition number fills the order-number filter (Batch 350: it used to fill the accession filter, which never matched)', () => {
    const res = resolveIdentifierApplication('REQ-123456', 'requisition', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({ action: 'setFilters', patientName: '', hospitalId: '', patientId: '', accessionNo: '', orderNo: 'REQ-123456', anyIdentifier: '' });
  });

  it('an ambiguous value matches any identifier (Batch 349, PS-101): it used to fill all three fields, which must all match, so an MRN alone found nothing', () => {
    const res = resolveIdentifierApplication('999999999999999', 'ambiguous', ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res).toEqual({
      action: 'setFilters',
      patientName: '', hospitalId: '', patientId: '', accessionNo: '', orderNo: '', anyIdentifier: '999999999999999',
    });
  });

  it('a null type (empty query) also falls back to the ambiguous, set-everything behavior', () => {
    const res = resolveIdentifierApplication('x', null, ALL_FORMATS, '^[A-Z]\\d{2}-\\d{4,6}$');
    expect(res.action).toBe('setFilters');
  });
});

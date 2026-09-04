// src/services/abnormalDetection/resolveSyntheticCoding.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSyntheticCoding } from './resolveSyntheticCoding';

// Real SNOMED CT codes are bare numeric strings; real ICD-O-3 codes
// match \d{4}/\d (morphology) or similar strict numeric/slash formats.
// Neither real format ever contains a letter.
const REAL_SNOMED_FORMAT = /^\d+$/;
const REAL_ICDO3_FORMAT = /^\d{4}\/\d$/;

describe('resolveSyntheticCoding — the real structural safety boundary (PS-130 stays blocked; this is architecture-testing only)', () => {
  const allSeverities: Array<'Abnormal' | 'Critical' | 'Malignant'> = ['Abnormal', 'Critical', 'Malignant'];

  it('every real code value, for every severity, is structurally impossible to mistake for a real SNOMED CT or ICD-O-3 code', () => {
    for (const severity of allSeverities) {
      const terms = resolveSyntheticCoding(severity);
      expect(terms.length).toBeGreaterThan(0);
      for (const term of terms) {
        expect(term.code).toMatch(/^TEST-/);
        expect(term.code).not.toMatch(REAL_SNOMED_FORMAT);
        expect(term.code).not.toMatch(REAL_ICDO3_FORMAT);
      }
    }
  });

  it('every display string is unambiguously labeled synthetic, even read completely alone', () => {
    for (const severity of allSeverities) {
      for (const term of resolveSyntheticCoding(severity)) {
        expect(term.display).toContain('[SYNTHETIC — TEST ONLY]');
      }
    }
  });

  it('returns a real, distinct set for Malignant including a synthetic ICD-O-3 term, matching the real spec\'s own morphology-coding intent', () => {
    const terms = resolveSyntheticCoding('Malignant');
    expect(terms.some(t => t.system === 'TEST-ICDO3')).toBe(true);
  });
});

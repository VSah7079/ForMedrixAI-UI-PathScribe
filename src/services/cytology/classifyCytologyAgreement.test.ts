// src/services/cytology/classifyCytologyAgreement.test.ts
import { describe, it, expect } from 'vitest';
import { classifyCytologyAgreement } from './classifyCytologyAgreement';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

const rank = (id: string, diagnosticRank: number): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: id, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, diagnosticRank,
});

const CATEGORIES: CytologyCategoryEntry[] = [
  rank('nilm', 0), rank('nilm-reactive', 0), rank('nilm-trichomonas', 0),
  rank('ascus', 1), rank('lsil', 2), rank('asch', 3), rank('agc-nos', 3),
  rank('hsil', 4), rank('ais', 4), rank('scc', 5), rank('adenoca', 5),
  { id: 'adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Satisfactory', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1, isUnsatisfactory: false },
  { id: 'adeq-rejected', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Rejected', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2, isUnsatisfactory: true },
  { id: 'adeq-insufficient', section: 'adequacy', nomenclatureSystem: 'bethesda', label: 'Processed, Insufficient', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3, isUnsatisfactory: true },
];

describe('classifyCytologyAgreement — real, standard cytology QA taxonomy', () => {
  describe('1. Exact Agreement', () => {
    it('the same diagnostic entity on both sides is Exact', () => {
      expect(classifyCytologyAgreement({ primaryInterpretationId: 'nilm' }, { primaryInterpretationId: 'nilm' }, CATEGORIES).level).toBe('exact');
      expect(classifyCytologyAgreement({ primaryInterpretationId: 'hsil' }, { primaryInterpretationId: 'hsil' }, CATEGORIES).level).toBe('exact');
    });
  });

  describe('2. Minor Discrepancy — direct guidance\'s own real examples', () => {
    it('NILM with reactive/reparative changes vs. NILM without changes is Minor', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'nilm' }, { primaryInterpretationId: 'nilm-reactive' }, CATEGORIES);
      expect(result.level).toBe('minor_discrepancy');
    });

    it('ASC-US vs. LSIL is Minor', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'ascus' }, { primaryInterpretationId: 'lsil' }, CATEGORIES);
      expect(result.level).toBe('minor_discrepancy');
    });

    it('a Minor discrepancy never carries a majorSubtype', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'ascus' }, { primaryInterpretationId: 'lsil' }, CATEGORIES);
      expect(result.majorSubtype).toBeUndefined();
    });
  });

  describe('3. Major Discrepancy — false negative, false positive, high-grade skip', () => {
    it('False Negative: initial NILM, follow-up finds HSIL', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'nilm' }, { primaryInterpretationId: 'hsil' }, CATEGORIES);
      expect(result.level).toBe('major_discrepancy');
      expect(result.majorSubtype).toBe('false_negative');
    });

    it('False Negative: initial ASC-US, follow-up finds SCC', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'ascus' }, { primaryInterpretationId: 'scc' }, CATEGORIES);
      expect(result.level).toBe('major_discrepancy');
      expect(result.majorSubtype).toBe('false_negative');
    });

    it('False Negative: initial NILM, follow-up finds AGC (glandular track)', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'nilm' }, { primaryInterpretationId: 'agc-nos' }, CATEGORIES);
      expect(result.level).toBe('major_discrepancy');
      expect(result.majorSubtype).toBe('false_negative');
    });

    it('False Positive: initial HSIL, follow-up downgrades to NILM', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'hsil' }, { primaryInterpretationId: 'nilm' }, CATEGORIES);
      expect(result.level).toBe('major_discrepancy');
      expect(result.majorSubtype).toBe('false_positive');
    });

    it('High-grade skip crosses the real, critical low-grade/high-grade boundary even from LSIL (not just NILM)', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'lsil' }, { primaryInterpretationId: 'hsil' }, CATEGORIES);
      expect(result.level).toBe('major_discrepancy');
      expect(result.majorSubtype).toBe('false_negative');
    });

    it('an unresolvable category on either side is a safe-default Major, never silently Minor', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'nilm' }, { primaryInterpretationId: 'does-not-exist' }, CATEGORIES);
      expect(result.level).toBe('major_discrepancy');
    });
  });

  describe('4. Adequacy Discrepancy — real, separate, parallel metric', () => {
    it('a real adequacy discrepancy is flagged independently of the diagnostic agreement level', () => {
      const result = classifyCytologyAgreement(
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-satisfactory'] },
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-rejected'] },
        CATEGORIES,
      );
      expect(result.level).toBe('exact'); // diagnostic agreement unaffected
      expect(result.adequacyDiscrepancy).toBe(true); // but adequacy genuinely differs
    });

    it('the two real "unsatisfactory" reasons are never treated as a discrepancy against each other', () => {
      const result = classifyCytologyAgreement(
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-rejected'] },
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-insufficient'] },
        CATEGORIES,
      );
      expect(result.adequacyDiscrepancy).toBe(false);
    });

    it('no adequacyCategoryIds on either side is never a discrepancy', () => {
      const result = classifyCytologyAgreement({ primaryInterpretationId: 'nilm' }, { primaryInterpretationId: 'nilm' }, CATEGORIES);
      expect(result.adequacyDiscrepancy).toBe(false);
    });

    it('a genuine Major diagnostic discrepancy can still coexist with NO adequacy discrepancy', () => {
      const result = classifyCytologyAgreement(
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-satisfactory'] },
        { primaryInterpretationId: 'hsil', adequacyCategoryIds: ['adeq-satisfactory'] },
        CATEGORIES,
      );
      expect(result.level).toBe('major_discrepancy');
      expect(result.adequacyDiscrepancy).toBe(false);
    });

    it('a real, multi-select adequacy call is unsatisfactory if ANY one of the selections is — not only when every selection agrees', () => {
      const result = classifyCytologyAgreement(
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-satisfactory', 'adeq-rejected'] },
        { primaryInterpretationId: 'nilm', adequacyCategoryIds: ['adeq-satisfactory'] },
        CATEGORIES,
      );
      expect(result.adequacyDiscrepancy).toBe(true);
    });
  });
});

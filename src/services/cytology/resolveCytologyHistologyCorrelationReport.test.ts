// src/services/cytology/resolveCytologyHistologyCorrelationReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHistologyCorrelationReport } from './resolveCytologyHistologyCorrelationReport';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';

let seq = 0;
const record = (overrides: Partial<QaActivityRecord> & { fieldValues: QaActivityRecord['fieldValues'] }): QaActivityRecord => {
  seq++;
  return {
    id: 'qa-rec-' + seq, activityTypeId: 'qa-activity-cyto-histo', caseId: 'c' + seq, specimenId: 'sp' + seq,
    caseType: 'GYN Cytology', outcome: 'concordant', recordedBy: { userId: 'u1', userName: 'Test User' },
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as QaActivityRecord;
};

describe('resolveCytologyHistologyCorrelationReport — real, per direct guidance\'s own CYT-QA-04 specification', () => {
  it('a genuinely empty input produces zero rows and a real, honest zero-based rate, never a crash', () => {
    const report = resolveCytologyHistologyCorrelationReport([], {}, {});
    expect(report.totalCorrelated).toBe(0);
    expect(report.correlationRatePercent).toBe(0);
    expect(report.ppvHsilPercent).toBeUndefined();
  });

  it('a real, concordant record correctly resolves to the concordant category and contributes to a real, positive correlation rate', () => {
    const records = [record({ caseId: 'c1', outcome: 'concordant', fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN III', histologyCaseId: 'hist1' } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.rows[0].correlationCategory).toBe('concordant');
    expect(report.correlationRatePercent).toBe(100);
  });

  it('a real, discordant record with a real minor discrepancy magnitude resolves to the minor category, not lumped in with major', () => {
    const records = [record({ outcome: 'discordant', fieldValues: { cytologyDx: 'ASC-US', histologyDx: 'CIN II', discrepancyMagnitude: 'minor_discrepancy' } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.rows[0].correlationCategory).toBe('minor_discrepancy');
  });

  it('a real, discordant record with a real major discrepancy magnitude resolves to the major category', () => {
    const records = [record({ outcome: 'discordant', fieldValues: { cytologyDx: 'NILM', histologyDx: 'CIN III', discrepancyMagnitude: 'major_discrepancy' } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.rows[0].correlationCategory).toBe('major_discrepancy');
  });

  it('a real, manually-entered discordant record with no recorded magnitude honestly resolves to "discordant_unspecified", never a fabricated minor/major guess', () => {
    const records = [record({ outcome: 'discordant', fieldValues: { cytologyDx: 'HSIL', histologyDx: 'Benign (manual entry)' } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.rows[0].correlationCategory).toBe('discordant_unspecified');
  });

  it('real, case-level patient/accession/date info is correctly joined onto each row from the given lookups', () => {
    const records = [record({ caseId: 'c1', fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN III', histologyCaseId: 'hist1' } })];
    const cytoInfo = { c1: { patientMrn: 'MRN-001', accessionNumber: 'S26-1001', specimenDate: '2026-01-01T00:00:00.000Z' } };
    const histInfo = { hist1: { accessionNumber: 'S26-2001', specimenDate: '2026-01-15T00:00:00.000Z' } };
    const report = resolveCytologyHistologyCorrelationReport(records, cytoInfo, histInfo);
    expect(report.rows[0].patientMrn).toBe('MRN-001');
    expect(report.rows[0].cytoAccessionId).toBe('S26-1001');
    expect(report.rows[0].histAccessionId).toBe('S26-2001');
    expect(report.rows[0].daysToBiopsy).toBe(14);
  });

  it('a real row with no resolvable date on either side gets an honest undefined daysToBiopsy, never a fabricated number', () => {
    const records = [record({ caseId: 'c1', fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN III' } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.rows[0].daysToBiopsy).toBeUndefined();
  });

  it('PPV_HSIL is honestly undefined when no real record has both a resolved cytologyRank and histologyRank', () => {
    const records = [record({ fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN III (manual entry)' } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.ppvHsilPercent).toBeUndefined();
  });

  it('PPV_HSIL correctly excludes a real, resolved record whose cytologyRank is below the real HSIL threshold', () => {
    const records = [record({ fieldValues: { cytologyDx: 'LSIL', histologyDx: 'CIN III', cytologyRank: 2, histologyRank: 4 } })];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.ppvHsilPercent).toBeUndefined();
  });

  it('PPV_HSIL correctly computes the real percentage of HSIL-tier cytology cases whose histology was CIN2+', () => {
    const records = [
      record({ fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN III', cytologyRank: 4, histologyRank: 4 } }), // CIN2+
      record({ fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN I', cytologyRank: 4, histologyRank: 1 } }),   // not CIN2+
      record({ fieldValues: { cytologyDx: 'HSIL', histologyDx: 'CIN II', cytologyRank: 4, histologyRank: 2 } }), // CIN2+ (boundary)
    ];
    const report = resolveCytologyHistologyCorrelationReport(records, {}, {});
    expect(report.ppvHsilPercent).toBeCloseTo(66.67, 1);
  });
});

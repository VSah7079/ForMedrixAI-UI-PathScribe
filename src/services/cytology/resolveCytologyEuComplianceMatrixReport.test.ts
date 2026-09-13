// src/services/cytology/resolveCytologyEuComplianceMatrixReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyEuComplianceMatrixReport } from './resolveCytologyEuComplianceMatrixReport';

describe('resolveCytologyEuComplianceMatrixReport — real, per direct guidance\'s own EU-QA-01 specification', () => {
  it('a genuinely empty input produces zero rows, never a crash', () => {
    expect(resolveCytologyEuComplianceMatrixReport([], {})).toHaveLength(0);
  });

  it('real specimens correctly group by real country code, never mixing two different real countries into one row', () => {
    const rows = resolveCytologyEuComplianceMatrixReport(
      [{ countryCode: 'NL', hpvStatus: 'primary' }, { countryCode: 'FR', hpvStatus: 'co_test' }], {},
    );
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.countryCode).sort()).toEqual(['FR', 'NL']);
  });

  it('real primary vs. co-test HPV counts are correctly, independently tallied per country', () => {
    const [row] = resolveCytologyEuComplianceMatrixReport(
      [
        { countryCode: 'NL', hpvStatus: 'primary' },
        { countryCode: 'NL', hpvStatus: 'primary' },
        { countryCode: 'NL', hpvStatus: 'co_test' },
        { countryCode: 'NL', hpvStatus: 'not_applicable' },
      ], {},
    );
    expect(row.totalCases).toBe(4);
    expect(row.hpvPrimaryCount).toBe(2);
    expect(row.hpvCoTestCount).toBe(1);
  });

  it('a real non-conformity count is correctly joined from the given lookup, per real country', () => {
    const rows = resolveCytologyEuComplianceMatrixReport(
      [{ countryCode: 'DE', hpvStatus: 'primary' }],
      { DE: 3 },
    );
    expect(rows[0].internalAuditNonConformityCount).toBe(3);
  });

  it('a real country with no entry in the given non-conformity lookup gets an honest 0, not undefined or a crash', () => {
    const rows = resolveCytologyEuComplianceMatrixReport([{ countryCode: 'IE', hpvStatus: 'primary' }], {});
    expect(rows[0].internalAuditNonConformityCount).toBe(0);
  });
});

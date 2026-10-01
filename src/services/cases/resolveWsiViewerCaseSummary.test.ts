import { describe, it, expect } from 'vitest';
import { resolveWsiViewerCaseSummary } from './resolveWsiViewerCaseSummary';
import type { Case } from '@/types/case/Case';

function buildCase(overrides: Record<string, unknown>): Case {
  return overrides as any as Case;
}

describe('resolveWsiViewerCaseSummary', () => {
  it('an undefined case (not yet looked up, or not found) honestly resolves to all-null, never a guess', () => {
    expect(resolveWsiViewerCaseSummary(undefined)).toEqual({
      accessionNumber: null,
      patientName: null,
      specimenLabel: null,
    });
  });

  it('resolves the real accession number, patient display name, and first specimen label', () => {
    const caseData = buildCase({
      accession: { fullAccession: 'MFT-2026-000029' },
      patient: { firstName: 'David', lastName: 'Martinez' },
      specimens: [{ label: 'A1' }, { label: 'A2' }],
    });
    expect(resolveWsiViewerCaseSummary(caseData)).toEqual({
      accessionNumber: 'MFT-2026-000029',
      patientName: 'Martinez, David',
      specimenLabel: 'A1',
    });
  });

  it('an unresolvable field (no fullAccession, no patient, no specimens) honestly resolves to null, not a fabricated value', () => {
    const caseData = buildCase({ accession: {}, specimens: [] });
    expect(resolveWsiViewerCaseSummary(caseData)).toEqual({
      accessionNumber: null,
      patientName: null,
      specimenLabel: null,
    });
  });
});

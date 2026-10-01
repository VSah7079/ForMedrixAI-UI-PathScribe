import { describe, it, expect } from 'vitest';
import { resolvePatientCytoHistoHistory } from './resolvePatientCytoHistoHistory';
import type { Case } from '@/types/case/Case';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

const cat = (id: string, label: string, diagnosticRank?: number): CytologyCategoryEntry => ({
  id, section: 'interpretation_result', nomenclatureSystem: 'bethesda', label, requiresPathologistReview: false,
  active: true, isSystem: true, sortOrder: 1, diagnosticRank,
});
const CATEGORIES = [cat('nilm', 'NILM', 0), cat('hsil', 'HSIL', 4)];

const cytoCase = (id: string, createdAt: string, finalDxCategoryId?: string): Case => ({
  id, createdAt, accession: { accessionNumber: id },
  specimens: [{ id: `${id}-sp1`, cytologyScreening: finalDxCategoryId ? { finalDiagnosis: { reviewRecordId: 'r1', primaryInterpretationId: finalDxCategoryId } } : {} }],
} as any);

const surgicalCase = (id: string, createdAt: string, description?: string): Case => ({
  id, createdAt, accession: { accessionNumber: id },
  specimens: [{ id: `${id}-sp1`, description }],
} as any);

describe('resolvePatientCytoHistoHistory', () => {
  it('the current case is never included in its own real history', () => {
    const current = cytoCase('current', '2026-01-01');
    const result = resolvePatientCytoHistoHistory([current], 'current', CATEGORIES);
    expect(result.priorCytologyResults).toHaveLength(0);
  });

  it('a real prior cytology case with a real, recorded final diagnosis resolves a real, human-readable label', () => {
    const prior = cytoCase('prior-1', '2024-06-01', 'hsil');
    const result = resolvePatientCytoHistoHistory([prior], 'current', CATEGORIES);
    expect(result.priorCytologyResults[0].resultLabel).toBe('HSIL');
  });

  it('a real prior cytology case with no real final diagnosis selection yet gets an honest undefined, never a fabricated label', () => {
    const prior = cytoCase('prior-1', '2024-06-01');
    const result = resolvePatientCytoHistoHistory([prior], 'current', CATEGORIES);
    expect(result.priorCytologyResults[0].resultLabel).toBeUndefined();
  });

  it('prior cytology results are genuinely sorted most-recent first', () => {
    const older = cytoCase('older', '2022-01-01', 'nilm');
    const newer = cytoCase('newer', '2025-01-01', 'nilm');
    const result = resolvePatientCytoHistoHistory([older, newer], 'current', CATEGORIES);
    expect(result.priorCytologyResults.map(r => r.caseId)).toEqual(['newer', 'older']);
  });

  it('a real prior surgical case is correctly separated from cytology results, with real metadata but honestly no fabricated diagnosis text', () => {
    const bx = surgicalCase('bx-1', '2023-03-01', 'Cervical biopsy, LEEP');
    const result = resolvePatientCytoHistoHistory([bx], 'current', CATEGORIES);
    expect(result.priorCytologyResults).toHaveLength(0);
    expect(result.priorSurgicalBiopsies[0]).toEqual({ caseId: 'bx-1', accessionNumber: 'bx-1', date: '2023-03-01', specimenDescription: 'Cervical biopsy, LEEP' });
  });

  it('a real mixed patient history correctly splits cytology and surgical cases into their own real lists', () => {
    const pap = cytoCase('pap-1', '2024-01-01', 'nilm');
    const bx = surgicalCase('bx-1', '2023-06-01', 'Cervical biopsy');
    const result = resolvePatientCytoHistoHistory([pap, bx], 'current', CATEGORIES);
    expect(result.priorCytologyResults).toHaveLength(1);
    expect(result.priorSurgicalBiopsies).toHaveLength(1);
  });

  it('a real prior cytology result exposes its own real reviewRecordId, specimenId, and diagnosticRank \u2014 ready to feed resolveCytologyFiveYearRetrospectiveLookback.ts directly', () => {
    const prior = cytoCase('prior-1', '2024-06-01', 'nilm');
    const result = resolvePatientCytoHistoHistory([prior], 'current', CATEGORIES);
    expect(result.priorCytologyResults[0]).toEqual(expect.objectContaining({
      reviewRecordId: 'r1', specimenId: 'prior-1-sp1', diagnosticRank: 0,
    }));
  });
});

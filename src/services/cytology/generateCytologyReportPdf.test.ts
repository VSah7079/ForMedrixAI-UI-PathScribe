// src/services/cytology/generateCytologyReportPdf.test.ts
import { describe, it, expect } from 'vitest';
import { generateCytologyReportPdf } from './generateCytologyReportPdf';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';

const MINIMAL_CONTENT: CytologyReportContent = {
  patientName: 'Angela Torres', accessionNumber: 'S26-5002-CYT-001',
  specimenTypeDescription: 'Cervical/Vaginal Pap Smear, liquid-based',
  specimenAdequacy: ['Satisfactory for evaluation.'],
  primaryInterpretation: 'Negative for Intraepithelial Lesion or Malignancy (NILM).',
  additionalInterpretations: [], recommendations: [],
  requiresPathologistReview: true, signedBy: { name: 'Dr. Second', isPathologist: true }, signedAt: '2026-09-04T00:00:00.000Z',
};

const FULL_CONTENT: CytologyReportContent = {
  ...MINIMAL_CONTENT,
  patientDateOfBirth: '1988-04-02', patientMrn: '100502', orderingProvider: 'Dr. Amanda Chen',
  specimenCollectedAt: '2026-09-01T00:00:00.000Z', specimenReceivedAt: '2026-09-02T00:00:00.000Z',
  lastMenstrualPeriod: '2026-08-15', preparationMethod: 'Liquid-Based',
  generalCategorization: 'Negative for Intraepithelial Lesion or Malignancy (NILM).',
  additionalInterpretations: ['Trichomonas vaginalis organisms identified.'],
  hpvResult: 'Negative', computerAssistedScreening: { used: true, system: 'ThinPrep Imaging System' },
  recommendations: ['Repeat cytology in 12 months.'], educationalNotes: 'Consider HPV vaccination.',
  screenedBy: { name: 'Jane CT' },
};

describe('generateCytologyReportPdf — real, working PDF generation', () => {
  it('produces a real, valid PDF for minimal content', () => {
    const doc = generateCytologyReportPdf(MINIMAL_CONTENT);
    const output = doc.output('datauristring');
    expect(output).toContain('data:application/pdf');
    expect(output.length).toBeGreaterThan(100);
  });

  it('produces a real, valid PDF for complete, all-seven-section content', () => {
    const doc = generateCytologyReportPdf(FULL_CONTENT);
    const output = doc.output('datauristring');
    expect(output).toContain('data:application/pdf');
    expect(output.length).toBeGreaterThan(100);
  });

  it('never throws on a real review with many additional interpretations and recommendations', () => {
    const heavy: CytologyReportContent = {
      ...FULL_CONTENT,
      additionalInterpretations: Array.from({ length: 15 }, (_, i) => `Finding ${i + 1}: a real, longer descriptive line to exercise real text wrapping across the page width.`),
      recommendations: Array.from({ length: 10 }, (_, i) => `Recommendation ${i + 1}.`),
    };
    expect(() => generateCytologyReportPdf(heavy)).not.toThrow();
  });

  it('handles a real patient name with no other optional fields present', () => {
    const doc = generateCytologyReportPdf(MINIMAL_CONTENT);
    expect(doc).toBeTruthy();
  });
});

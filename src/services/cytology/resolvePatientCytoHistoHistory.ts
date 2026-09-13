// src/services/cytology/resolvePatientCytoHistoHistory.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own explicit spec: "Place a new card
// right under HPV Co-Testing displaying prior Pap smear dates/results
// and any surgical pathology biopsies (e.g., prior cervical
// biopsy/LEEP diagnoses)."
//
// Real, honest scope, given what's actually reliably available:
// - Prior cytology results resolve a real, final diagnosis via
//   CytologyScreeningRecord.finalDiagnosis.primaryInterpretationId
//   (the one, real, explicit "this review is authoritative" field —
//   see that field's own doc comment), looked up against the real
//   category dictionary for a human-readable label.
// - Prior surgical biopsies do NOT get a fabricated diagnosis summary
//   here — Case.primaryDiagnosis/DiagnosticMetadata exists in the
//   type system but is never actually populated by either Surgical
//   Pathology's own save flow or Cytology's, confirmed by checking
//   both real call sites before relying on it. Rather than guess at
//   a diagnosis this app has no reliable way to produce, prior
//   surgical cases surface real, available metadata (date, accession,
//   specimen description) with no diagnosis text — a real "View Case"
//   link is the honest way to see the actual, real diagnosis.
// - A case counts as "cytology" when any of its real specimens
//   carries a real cytologyScreening record — the same real signal
//   CytologyWorklistPage.tsx already uses elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

export interface PriorCytologyResult {
  caseId: string;
  accessionNumber: string;
  date: string;
  /** Real, resolved final-diagnosis label, or undefined when this
   *  prior case genuinely has no real, explicit final diagnosis
   *  selection recorded yet — never a fabricated placeholder. */
  resultLabel?: string;
  /** Real, per the same finalDiagnosis selection above — the real
   *  reviewRecordId/specimenId it references, and this app's own
   *  established diagnosticRank severity axis (undefined when the
   *  resolved category carries none). Exposed so a real caller (the
   *  5-Year Lookback banner) can feed this directly into
   *  resolveCytologyFiveYearRetrospectiveLookback.ts without a
   *  second, duplicate fetch of the same real cases. */
  reviewRecordId?: string;
  specimenId?: string;
  diagnosticRank?: number;
}

export interface PriorSurgicalBiopsy {
  caseId: string;
  accessionNumber: string;
  date: string;
  specimenDescription?: string;
}

export interface PatientCytoHistoHistory {
  priorCytologyResults: PriorCytologyResult[];
  priorSurgicalBiopsies: PriorSurgicalBiopsy[];
}

function isCytologyCase(c: Case): boolean {
  return (c.specimens ?? []).some((sp: any) => !!sp.cytologyScreening);
}

function resolveCaseDate(c: Case): string {
  return c.createdAt;
}

export function resolvePatientCytoHistoHistory(
  allPatientCases: Case[],
  currentCaseId: string,
  categories: CytologyCategoryEntry[],
): PatientCytoHistoHistory {
  const otherCases = allPatientCases.filter(c => c.id !== currentCaseId);

  const priorCytologyResults: PriorCytologyResult[] = otherCases
    .filter(isCytologyCase)
    .map((c): PriorCytologyResult => {
      const specimenWithFinalDx = (c.specimens ?? []).find((sp: any) => !!sp.cytologyScreening?.finalDiagnosis) as any;
      const finalDx = specimenWithFinalDx?.cytologyScreening?.finalDiagnosis;
      const resolvedCategory = finalDx ? categories.find(cat => cat.id === finalDx.primaryInterpretationId) : undefined;
      return {
        caseId: c.id,
        accessionNumber: c.accession?.accessionNumber ?? c.id,
        date: resolveCaseDate(c),
        resultLabel: resolvedCategory?.label,
        reviewRecordId: finalDx?.reviewRecordId,
        specimenId: specimenWithFinalDx?.id,
        diagnosticRank: resolvedCategory?.diagnosticRank,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const priorSurgicalBiopsies: PriorSurgicalBiopsy[] = otherCases
    .filter(c => !isCytologyCase(c))
    .map((c): PriorSurgicalBiopsy => ({
      caseId: c.id,
      accessionNumber: c.accession?.accessionNumber ?? c.id,
      date: resolveCaseDate(c),
      specimenDescription: c.specimens?.[0]?.description,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { priorCytologyResults, priorSurgicalBiopsies };
}

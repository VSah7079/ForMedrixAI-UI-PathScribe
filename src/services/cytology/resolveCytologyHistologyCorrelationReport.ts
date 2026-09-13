// src/services/cytology/resolveCytologyHistologyCorrelationReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied CYT-QA-04 specification —
// the actual report, built on top of every real piece from Phases
// 63-66: real QaActivityRecord entries under
// CYTO_HISTO_CORRELATION_ACTIVITY_TYPE_ID, each carrying the real
// histology case reference and (when resolvable) both real
// diagnosticRank values Phase 66's own recording flow now stores.
//
// Real, deliberate pure-function shape, matching every other report
// resolver in this module: the real caller supplies already-fetched
// case info (Patient_MRN, accession number, specimen date) keyed by
// caseId — this function only shapes and aggregates, never fetches.
//
// Real, honest PPV_HSIL scope: computed only from records where BOTH
// a real cytologyRank and a real histologyRank were resolved — a
// manually-entered record (no real SNOMED match found) has no real
// histologyRank and is correctly excluded from this specific
// calculation, never treated as a 0/negative result it was never
// actually shown to be. Returns undefined, never a fabricated
// percentage, when no real record qualifies for the calculation at
// all (e.g., no HSIL-tier cytology correlations recorded yet, or no
// admin-configured SNOMED mapping resolves any of them).
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';

const HSIL_CYTOLOGY_RANK_THRESHOLD = 4;
const CIN2_PLUS_HISTOLOGY_RANK_THRESHOLD = 2;

export interface CytologyHistologyCorrelationCaseInfo {
  patientMrn?: string;
  accessionNumber?: string;
  /** Real, per this report's own specification: the real collection
   *  date for the relevant specimen on this case. */
  specimenDate?: string;
}

export type CytologyHistologyCorrelationCategory = 'concordant' | 'minor_discrepancy' | 'major_discrepancy' | 'discordant_unspecified';

export interface CytologyHistologyCorrelationReportRow {
  patientMrn?: string;
  cytoAccessionId?: string;
  cytoDate?: string;
  cytoDiagnosis: string;
  histAccessionId?: string;
  histDate?: string;
  histDiagnosis: string;
  /** Real, honest undefined when either real date is unavailable —
   *  never a fabricated day count. */
  daysToBiopsy?: number;
  correlationCategory: CytologyHistologyCorrelationCategory;
  recordedAt: string;
}

export interface CytologyHistologyCorrelationReport {
  rows: CytologyHistologyCorrelationReportRow[];
  totalCorrelated: number;
  concordantCount: number;
  correlationRatePercent: number;
  /** Real, honest undefined when no real record qualifies for this
   *  specific calculation — see this file's own header. */
  ppvHsilPercent: number | undefined;
}

function resolveCorrelationCategory(outcome: QaActivityRecord['outcome'], discrepancyMagnitude: string | number | string[] | undefined): CytologyHistologyCorrelationCategory {
  if (outcome === 'concordant') return 'concordant';
  if (discrepancyMagnitude === 'minor_discrepancy') return 'minor_discrepancy';
  if (discrepancyMagnitude === 'major_discrepancy') return 'major_discrepancy';
  return 'discordant_unspecified';
}

export function resolveCytologyHistologyCorrelationReport(
  records: QaActivityRecord[],
  cytologyCaseInfoById: Record<string, CytologyHistologyCorrelationCaseInfo>,
  histologyCaseInfoById: Record<string, CytologyHistologyCorrelationCaseInfo>,
): CytologyHistologyCorrelationReport {
  const rows: CytologyHistologyCorrelationReportRow[] = records.map(r => {
    const histologyCaseId = r.fieldValues.histologyCaseId as string | undefined;
    const cytoInfo = cytologyCaseInfoById[r.caseId];
    const histInfo = histologyCaseId ? histologyCaseInfoById[histologyCaseId] : undefined;

    let daysToBiopsy: number | undefined;
    if (cytoInfo?.specimenDate && histInfo?.specimenDate) {
      const diffMs = new Date(histInfo.specimenDate).getTime() - new Date(cytoInfo.specimenDate).getTime();
      daysToBiopsy = Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    return {
      patientMrn: cytoInfo?.patientMrn,
      cytoAccessionId: cytoInfo?.accessionNumber,
      cytoDate: cytoInfo?.specimenDate,
      cytoDiagnosis: String(r.fieldValues.cytologyDx ?? 'Unknown'),
      histAccessionId: histInfo?.accessionNumber,
      histDate: histInfo?.specimenDate,
      histDiagnosis: String(r.fieldValues.histologyDx ?? 'Unknown'),
      daysToBiopsy,
      correlationCategory: resolveCorrelationCategory(r.outcome, r.fieldValues.discrepancyMagnitude),
      recordedAt: r.recordedAt,
    };
  });

  const totalCorrelated = rows.length;
  const concordantCount = rows.filter(r => r.correlationCategory === 'concordant').length;
  const correlationRatePercent = totalCorrelated === 0 ? 0 : (concordantCount / totalCorrelated) * 100;

  const recordsWithBothRanks = records.filter(
    r => typeof r.fieldValues.cytologyRank === 'number' && typeof r.fieldValues.histologyRank === 'number',
  );
  const hsilCytologyRecords = recordsWithBothRanks.filter(r => (r.fieldValues.cytologyRank as number) >= HSIL_CYTOLOGY_RANK_THRESHOLD);
  const ppvHsilPercent = hsilCytologyRecords.length === 0
    ? undefined
    : (hsilCytologyRecords.filter(r => (r.fieldValues.histologyRank as number) >= CIN2_PLUS_HISTOLOGY_RANK_THRESHOLD).length / hsilCytologyRecords.length) * 100;

  return { rows, totalCorrelated, concordantCount, correlationRatePercent, ppvHsilPercent };
}

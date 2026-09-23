// src/services/cases/resolveWsiViewerCaseSummary.ts
// ─────────────────────────────────────────────────────────────────────────────
// File-by-file cleanup sweep: pulls MockWsiViewerPage.tsx's own case→display
// derivation out of the page component into a plain, testable function — the
// page itself now only orchestrates the fetch and renders whatever this
// resolves, the same "resolver function does the real logic, the component
// just renders it" split already established elsewhere in this app (e.g.
// services/quality/resolveQaActivityDashboardReport.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { Case } from '@/types/case/Case';

export interface WsiViewerCaseSummary {
  accessionNumber: string | null;
  patientName: string | null;
  specimenLabel: string | null;
}

export const EMPTY_WSI_VIEWER_CASE_SUMMARY: WsiViewerCaseSummary = {
  accessionNumber: null,
  patientName: null,
  specimenLabel: null,
};

/** Real, per the viewer's own honest-placeholder scope: shows the real,
 *  actual case/specimen identity for whatever case launched it, never a
 *  fabricated one — an undefined case (not found, or none looked up yet)
 *  honestly resolves to all-null rather than a guessed default. */
export function resolveWsiViewerCaseSummary(caseData: Case | undefined): WsiViewerCaseSummary {
  if (!caseData) return EMPTY_WSI_VIEWER_CASE_SUMMARY;
  return {
    accessionNumber: caseData.accession?.fullAccession ?? null,
    patientName: caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : null,
    specimenLabel: caseData.specimens?.[0]?.label ?? null,
  };
}

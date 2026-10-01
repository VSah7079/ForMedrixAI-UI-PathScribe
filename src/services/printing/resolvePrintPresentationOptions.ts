// src/services/printing/resolvePrintPresentationOptions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 §2.2.4 ("programmatic paper-source selection —
// Tray 1: Letterhead, Tray 2: Plain — and duplex/simplex mode, based
// on document type and client preference"). Pure, testable resolution
// — never fetches its own data, same real discipline every other
// resolveX function in this app follows.
//
// Real, deliberate default rationale, per report type (the source
// spec's own "document type"):
//   - FINAL / CORRECTED: the client-facing, definitive report — Tray 1
//     letterhead, duplex (the real, standard "this is the official
//     report" presentation this app's own paper-based clients expect).
//   - ADDENDUM: still letterhead (it's still an official, client-
//     facing record), but simplex — an addendum is real, typically a
//     short, one-or-two-page supplement, and duplexing a short
//     document risks a real, physically confusing half-blank verso
//     page landing in a client's paper file.
//   - PRELIMINARY: Tray 2 plain, simplex — a real, internal/interim
//     notification, never printed on letterhead stock per this app's
//     own established "letterhead is for a genuinely final record"
//     convention (mirrors PaperSize's own facility-vs-report-level
//     split — this is presentation, not physical dimensions).
// A real, per-client override (Facility.printPresentationPreference)
// always wins over these defaults for whichever field it actually
// sets — same real, independent per-field fallback convention
// resolveFacilityPrintBranding.ts already establishes for PS-277.
// ─────────────────────────────────────────────────────────────────────────────

import type { DuplexMode, PaperSourceTray, PrintJobReportType } from '@/types/printing/PrintJob';

export interface PrintPresentationOptions {
  paperSource: PaperSourceTray;
  duplexMode: DuplexMode;
}

export const REPORT_TYPE_DEFAULT_PRESENTATION: Record<PrintJobReportType, PrintPresentationOptions> = {
  FINAL:       { paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'DUPLEX' },
  CORRECTED:   { paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'DUPLEX' },
  ADDENDUM:    { paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'SIMPLEX' },
  PRELIMINARY: { paperSource: 'TRAY_2_PLAIN', duplexMode: 'SIMPLEX' },
};

export function resolvePrintPresentationOptions(
  reportType: PrintJobReportType,
  clientPreference?: Partial<PrintPresentationOptions>,
): PrintPresentationOptions {
  const defaults = REPORT_TYPE_DEFAULT_PRESENTATION[reportType];
  return {
    paperSource: clientPreference?.paperSource ?? defaults.paperSource,
    duplexMode: clientPreference?.duplexMode ?? defaults.duplexMode,
  };
}

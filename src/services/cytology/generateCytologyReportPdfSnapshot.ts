// src/services/cytology/generateCytologyReportPdfSnapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("build the pdf") — a thin adapter, not a
// second PDF generator. Checked the real, existing Cytology PDF
// mechanism directly before building anything (a real, honest mistake
// caught mid-build: an earlier attempt in this same turn assumed no
// Cytology PDF mechanism existed at all and started building a second,
// server-side one — generateCytologyReportPdf.ts/
// generateCytologyReportPdfWithAttachments.ts already exist, are real,
// working, and already tested). This file's only real job is
// converting that existing function's real Uint8Array output into the
// { pdfBase64?, generationError? } shape dispatchPrintJob.ts's own
// generatePdf parameter already expects — the same real shape
// SynopticReportPage.tsx's own generateReportPdfSnapshot already
// returns for Surg Path, so Component B needs no changes at all to
// accept this.
// ─────────────────────────────────────────────────────────────────────────────

import { generateCytologyReportPdfWithAttachments } from './generateCytologyReportPdf';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';

export async function generateCytologyReportPdfSnapshot(
  content: CytologyReportContent,
): Promise<{ pdfBase64?: string; generationError?: string }> {
  try {
    const bytes = await generateCytologyReportPdfWithAttachments(content);
    // Real, deliberate chunked conversion — a naive
    // String.fromCharCode(...bytes) can exceed the JS engine's own
    // real call-stack argument limit on a large, real, multi-page PDF
    // with embedded images; chunking avoids that without changing the
    // real, resulting base64 string at all.
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return { pdfBase64: btoa(binary) };
  } catch (e: any) {
    return { generationError: e?.message ?? 'Unknown error generating Cytology PDF snapshot.' };
  }
}

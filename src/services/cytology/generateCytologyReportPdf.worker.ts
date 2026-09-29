// src/services/cytology/generateCytologyReportPdf.worker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.4 gap-closing — the actual Web Worker entry
// point that runs generateCytologyReportPdfWithAttachments() off the
// main thread. Real, verified-safe to run in a worker before building
// this: this app's own usage of jsPDF here is pure vector/text/image
// drawing (addImage, addPage, text/barcode drawing) — it never calls
// jsPDF's own html()/canvas-based rendering path, the one real jsPDF
// feature that genuinely needs a DOM. pdf-lib (embedCytologyHeaderLogo.ts,
// embedImageAssociationsIntoPdf.ts) is itself fully environment-
// agnostic — Node, browser, and Worker are all real, documented,
// supported targets. fetch() (used by both pdf-lib embed helpers for
// header-logo/image-association bytes) is a real, standard Worker
// global too — nothing this pipeline touches is DOM-only.
//
// Real, deliberate scope: this file is the worker SIDE only — a
// one-shot script that generates exactly one real PDF per Worker
// instance, then that Worker is terminated by its caller
// (generateCytologyReportPdfInWorker.ts). Deliberately not a
// persistent worker pool — this app generates a cytology report PDF
// on sign-out/dispatch, a real, infrequent, one-at-a-time operation,
// not a high-throughput batch job that would justify pool/reuse
// complexity.
//
// Real, necessary `self` casts throughout: this project's tsconfig
// (shared by every file, this one included) sets `lib: ["DOM", ...]`,
// never `"webworker"` (the two are mutually exclusive — TS's own
// WorkerGlobalScope and Window globals genuinely conflict), so `self`
// types as `Window` here, not `DedicatedWorkerGlobalScope`. The real,
// runtime `self` this script actually executes against IS a real
// worker global when loaded as a Worker module (Vite's own `new
// Worker(new URL(...), { type: 'module' })` in
// generateCytologyReportPdfInWorker.ts) — only the compile-time TYPE
// is the (necessary, deliberate) mismatch being cast around here.
// ─────────────────────────────────────────────────────────────────────────────

import { generateCytologyReportPdfWithAttachments } from './generateCytologyReportPdf';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';

export interface CytologyPdfWorkerRequest {
  content: CytologyReportContent;
}

export type CytologyPdfWorkerResponse =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

const workerSelf = self as unknown as Worker;

workerSelf.onmessage = async (event: MessageEvent<CytologyPdfWorkerRequest>) => {
  try {
    const bytes = await generateCytologyReportPdfWithAttachments(event.data.content);
    const response: CytologyPdfWorkerResponse = { ok: true, bytes };
    // Real, deliberate Transferable — hands the underlying
    // ArrayBuffer to the main thread instead of structured-cloning
    // it, avoiding a real, unnecessary copy of a potentially
    // multi-page, multi-image PDF's own bytes.
    workerSelf.postMessage(response, [bytes.buffer]);
  } catch (e: unknown) {
    const response: CytologyPdfWorkerResponse = {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error generating Cytology PDF in worker.',
    };
    workerSelf.postMessage(response);
  }
};

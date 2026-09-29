// src/services/cytology/generateCytologyReportPdfInWorker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.4 gap-closing — offloads
// generateCytologyReportPdfWithAttachments()'s own real, CPU-bound
// jsPDF/pdf-lib work to a real Web Worker (generateCytologyReportPdf.worker.ts)
// when one is genuinely available, so a report with several large
// embedded images never blocks the main UI thread during sign-out/
// dispatch — the real, disclosed gap this closes
// (services/documentRendering/README.md).
//
// Real, honest fallback, never a silent failure or a thrown surprise:
// when Worker isn't a real, available global, or a real worker module
// genuinely can't be constructed in this environment (this app's own
// vitest suite among them — module Workers need a real bundler/browser
// runtime this test runner doesn't provide), this runs the exact same
// real generation on the main thread instead. Same real result either
// way — the offload is a real performance improvement, never a
// behavioral difference a caller needs to account for.
// ─────────────────────────────────────────────────────────────────────────────

import { generateCytologyReportPdfWithAttachments } from './generateCytologyReportPdf';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';
import type { CytologyPdfWorkerRequest, CytologyPdfWorkerResponse } from './generateCytologyReportPdf.worker';

export type WorkerFactory = () => Worker;

// Real, deliberate default — Vite's own documented worker-import
// convention (`new Worker(new URL(<module>, import.meta.url), {type:
// 'module'})`), the one real way to construct a module Worker that
// bundles its own real dependency graph (generateCytologyReportPdf.ts,
// jsPDF, pdf-lib) rather than assuming those are already available on
// some global the worker script could reach on its own.
const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL('./generateCytologyReportPdf.worker.ts', import.meta.url), { type: 'module' });

/**
 * Real, per PS-276 §1.1.4 — the one, real public entry point a caller
 * uses in place of calling generateCytologyReportPdfWithAttachments()
 * directly, when it wants the real Worker offload. `workerFactory` is
 * a real, deliberate injection point — defaults to the real, standard
 * Worker constructor above, but accepts an override so this function's
 * own real dispatch/fallback/error-handling logic can be tested
 * deterministically against a fake, in-memory Worker (see this file's
 * own test) without a real, separate worker thread actually having to
 * execute — this project has no Worker-execution test harness, and
 * building one just to cover this one function would be real,
 * disproportionate infrastructure for what's actually being verified
 * here (the message-passing contract, not jsPDF/pdf-lib's own
 * behavior, which generateCytologyReportPdf.test.ts already covers
 * directly).
 */
export async function generateCytologyReportPdfInWorker(
  content: CytologyReportContent,
  workerFactory: WorkerFactory = defaultWorkerFactory,
): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') {
    return generateCytologyReportPdfWithAttachments(content);
  }

  let worker: Worker;
  try {
    worker = workerFactory();
  } catch {
    // Real, honest fallback — some real embedding contexts declare a
    // global `Worker` symbol that then throws on actual construction
    // (no real module-worker support there). Never surfaced as an
    // error to this function's own caller — the real generation still
    // happens, just without the offload.
    return generateCytologyReportPdfWithAttachments(content);
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<CytologyPdfWorkerResponse>) => {
      worker.terminate();
      const response = event.data;
      // Real, established cast workaround — same real situation
      // dispatchPrintJob.ts/attemptPrintDelivery.ts/mockPrintQueueService.ts
      // already document: this project's tsconfig sets
      // strictNullChecks: false, which disables TypeScript's own
      // discriminated-union control-flow narrowing on an `ok: true |
      // false` literal discriminant — `response.ok` is checked at
      // runtime correctly either way; only the compile-time narrowing
      // needs the cast.
      if (response.ok) resolve(response.bytes);
      else reject(new Error((response as { ok: false; error: string }).error));
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(new Error(event.message || 'Unknown error generating Cytology PDF in worker.'));
    };
    const request: CytologyPdfWorkerRequest = { content };
    worker.postMessage(request);
  });
}

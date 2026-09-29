// src/services/cytology/generateCytologyReportPdfInWorker.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.4 gap-closing. This project has no real
// Worker-execution test harness (module Workers need a real bundler/
// browser runtime vitest doesn't provide), so this file tests the one
// thing that's actually this function's own logic: the real dispatch/
// message-passing/fallback/error-handling contract around a Worker,
// using a fake, in-memory Worker double that implements the same real
// onmessage/onerror/postMessage/terminate surface a real Worker does.
// generateCytologyReportPdf.test.ts already covers the real jsPDF/
// pdf-lib generation itself directly on the main thread — that's not
// re-tested here.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';
import type { CytologyPdfWorkerResponse } from './generateCytologyReportPdf.worker';

vi.mock('./generateCytologyReportPdf', () => ({
  generateCytologyReportPdfWithAttachments: vi.fn(),
}));

import { generateCytologyReportPdfWithAttachments } from './generateCytologyReportPdf';
import { generateCytologyReportPdfInWorker } from './generateCytologyReportPdfInWorker';

const content = {} as CytologyReportContent; // opaque here — this file never inspects it

/** Real, in-memory double for the real Worker interface — implements
 *  exactly the surface generateCytologyReportPdfInWorker.ts actually
 *  calls (postMessage/terminate/onmessage/onerror), and nothing else. */
class FakeWorker {
  onmessage: ((event: MessageEvent<CytologyPdfWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

let originalWorker: typeof Worker | undefined;
beforeEach(() => {
  originalWorker = (globalThis as { Worker?: typeof Worker }).Worker;
  vi.mocked(generateCytologyReportPdfWithAttachments).mockReset();
});
afterEach(() => {
  (globalThis as { Worker?: typeof Worker }).Worker = originalWorker;
});

describe('generateCytologyReportPdfInWorker — real, per PS-276 §1.1.4 gap-closing', () => {
  it('real, honest fallback — runs generation on the main thread directly when Worker is not a real, available global', async () => {
    delete (globalThis as { Worker?: typeof Worker }).Worker;
    const bytes = new Uint8Array([1, 2, 3]);
    vi.mocked(generateCytologyReportPdfWithAttachments).mockResolvedValue(bytes);

    const result = await generateCytologyReportPdfInWorker(content);
    expect(result).toBe(bytes);
    expect(generateCytologyReportPdfWithAttachments).toHaveBeenCalledWith(content);
  });

  it('a real, successful worker round trip resolves with the real bytes and terminates the worker', async () => {
    (globalThis as { Worker?: unknown }).Worker = function () {} as unknown as typeof Worker;
    const fake = new FakeWorker();
    const workerFactory = vi.fn(() => fake as unknown as Worker);

    const bytes = new Uint8Array([9, 8, 7]);
    const promise = generateCytologyReportPdfInWorker(content, workerFactory);

    expect(fake.postMessage).toHaveBeenCalledWith({ content });
    fake.onmessage?.({ data: { ok: true, bytes } } as MessageEvent<CytologyPdfWorkerResponse>);

    const result = await promise;
    expect(result).toBe(bytes);
    expect(fake.terminate).toHaveBeenCalledTimes(1);
    expect(generateCytologyReportPdfWithAttachments).not.toHaveBeenCalled();
  });

  it('a real, honest worker-reported error rejects with that real message and still terminates the worker', async () => {
    (globalThis as { Worker?: unknown }).Worker = function () {} as unknown as typeof Worker;
    const fake = new FakeWorker();
    const workerFactory = vi.fn(() => fake as unknown as Worker);

    const promise = generateCytologyReportPdfInWorker(content, workerFactory);
    fake.onmessage?.({ data: { ok: false, error: 'real rendering failure' } } as MessageEvent<CytologyPdfWorkerResponse>);

    await expect(promise).rejects.toThrow('real rendering failure');
    expect(fake.terminate).toHaveBeenCalledTimes(1);
  });

  it('a real worker-level error event (e.g. a script load failure) rejects and terminates the worker too', async () => {
    (globalThis as { Worker?: unknown }).Worker = function () {} as unknown as typeof Worker;
    const fake = new FakeWorker();
    const workerFactory = vi.fn(() => fake as unknown as Worker);

    const promise = generateCytologyReportPdfInWorker(content, workerFactory);
    fake.onerror?.({ message: 'worker script failed to load' } as ErrorEvent);

    await expect(promise).rejects.toThrow('worker script failed to load');
    expect(fake.terminate).toHaveBeenCalledTimes(1);
  });

  it('real, honest fallback — runs on the main thread when constructing the worker itself throws (e.g. no real module-worker support here)', async () => {
    (globalThis as { Worker?: unknown }).Worker = function () {} as unknown as typeof Worker;
    const workerFactory = vi.fn(() => { throw new Error('module workers unsupported here'); });
    const bytes = new Uint8Array([4, 5, 6]);
    vi.mocked(generateCytologyReportPdfWithAttachments).mockResolvedValue(bytes);

    const result = await generateCytologyReportPdfInWorker(content, workerFactory);
    expect(result).toBe(bytes);
  });
});

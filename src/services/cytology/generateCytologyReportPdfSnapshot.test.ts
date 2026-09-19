// src/services/cytology/generateCytologyReportPdfSnapshot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./generateCytologyReportPdf', () => ({
  generateCytologyReportPdfWithAttachments: vi.fn(),
}));

import { generateCytologyReportPdfWithAttachments } from './generateCytologyReportPdf';
import { generateCytologyReportPdfSnapshot } from './generateCytologyReportPdfSnapshot';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';

const content = {} as CytologyReportContent; // opaque to this adapter — never inspected here

beforeEach(() => {
  vi.mocked(generateCytologyReportPdfWithAttachments).mockReset();
});

describe('generateCytologyReportPdfSnapshot', () => {
  it('a real, successful generation returns a real, correct base64 encoding of the real bytes — round-trips exactly', async () => {
    const original = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // "%PDF-1.4"
    vi.mocked(generateCytologyReportPdfWithAttachments).mockResolvedValue(original);

    const result = await generateCytologyReportPdfSnapshot(content);
    expect(result.pdfBase64).toBeDefined();
    expect(result.generationError).toBeUndefined();

    const decoded = Uint8Array.from(atob(result.pdfBase64!), c => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('real, large data (bigger than the real chunk size) still round-trips exactly \u2014 the real reason for chunking in the first place', async () => {
    const large = new Uint8Array(200_000);
    for (let i = 0; i < large.length; i++) large[i] = i % 256;
    vi.mocked(generateCytologyReportPdfWithAttachments).mockResolvedValue(large);

    const result = await generateCytologyReportPdfSnapshot(content);
    const decoded = Uint8Array.from(atob(result.pdfBase64!), c => c.charCodeAt(0));
    expect(decoded.length).toBe(large.length);
    expect(Array.from(decoded)).toEqual(Array.from(large));
  });

  it('a real, thrown failure from the underlying generator returns a real, honest generationError, never throws itself', async () => {
    vi.mocked(generateCytologyReportPdfWithAttachments).mockRejectedValue(new Error('real rendering failure'));
    const result = await generateCytologyReportPdfSnapshot(content);
    expect(result.pdfBase64).toBeUndefined();
    expect(result.generationError).toBe('real rendering failure');
  });
});

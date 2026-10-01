// src/services/documentRendering/applyDeterministicPdfMetadata.test.ts
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { applyDeterministicPdfMetadata } from './applyDeterministicPdfMetadata';

async function makeBaseBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Real, fixed content', { x: 50, y: 700, size: 14, font });
  return doc.save();
}

const METADATA = { title: 'Cytology Report — S26-5002', author: 'Dr. Second', subject: 'Cytology Report', timestamp: '2026-09-04T00:00:00.000Z' };

describe('applyDeterministicPdfMetadata — real, verified byte-for-byte determinism', () => {
  it('produces byte-for-byte identical output across two real, independent generations from the same input', async () => {
    const base = await makeBaseBytes();
    const first = await applyDeterministicPdfMetadata(base, METADATA);
    // Real delay, not simulated — proves this isn't deterministic only
    // because both calls happened in the same millisecond.
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await applyDeterministicPdfMetadata(base, METADATA);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('writes the given title/author/subject/producer/creator into the real PDF Info dictionary', async () => {
    const base = await makeBaseBytes();
    const result = await applyDeterministicPdfMetadata(base, METADATA);
    // Real, necessary option here too: a plain PDFDocument.load(result)
    // would itself re-trigger pdf-lib's own updateInfoDict() and
    // clobber Producer/ModificationDate right before these assertions
    // run — see applyDeterministicPdfMetadata.ts's own comment on this.
    const doc = await PDFDocument.load(result, { updateMetadata: false });

    expect(doc.getTitle()).toBe(METADATA.title);
    expect(doc.getAuthor()).toBe(METADATA.author);
    expect(doc.getSubject()).toBe(METADATA.subject);
    expect(doc.getProducer()).toBe('PathScribe');
    expect(doc.getCreator()).toBe('PathScribe');
  });

  it('sets CreationDate/ModificationDate from the given timestamp, never from the real current wall-clock time', async () => {
    const base = await makeBaseBytes();
    const result = await applyDeterministicPdfMetadata(base, METADATA);
    const doc = await PDFDocument.load(result, { updateMetadata: false });

    expect(doc.getCreationDate()?.toISOString()).toBe(new Date(METADATA.timestamp).toISOString());
    expect(doc.getModificationDate()?.toISOString()).toBe(new Date(METADATA.timestamp).toISOString());
  });

  it('produces different output when the underlying report content genuinely differs — determinism never means "always identical regardless of input"', async () => {
    const docA = await PDFDocument.create();
    (await docA.embedFont(StandardFonts.Helvetica), docA.addPage([612, 792]).drawText('Report A', { x: 50, y: 700, size: 14, font: await docA.embedFont(StandardFonts.Helvetica) }));
    const bytesA = await docA.save();

    const docB = await PDFDocument.create();
    docB.addPage([612, 792]).drawText('Report B', { x: 50, y: 700, size: 14, font: await docB.embedFont(StandardFonts.Helvetica) });
    const bytesB = await docB.save();

    const resultA = await applyDeterministicPdfMetadata(bytesA, METADATA);
    const resultB = await applyDeterministicPdfMetadata(bytesB, METADATA);
    expect(Buffer.from(resultA).equals(Buffer.from(resultB))).toBe(false);
  });
});

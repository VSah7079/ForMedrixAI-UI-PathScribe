// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractWordBuildingBlocks } from './wordBuildingBlocksEngine';

// Real, per direct guidance: tests against an actual, valid OOXML
// glossary-document fixture (word/glossary/document.xml inside a real
// ZIP), not a mocked/stubbed parser — this exercises the real ZIP
// read (jszip) and the real XML parse (DOMParser) together, the same
// two real steps a genuine uploaded .dotx goes through.
function loadFixtureBuffer(): ArrayBuffer {
  const buf = readFileSync(join(__dirname, '__fixtures__/test-buildingblocks.dotx'));
  return new Uint8Array(buf).buffer;
}

describe('extractWordBuildingBlocks — real OOXML Building Blocks extraction', () => {
  it('extracts every real docPart, including its real name/gallery/category', async () => {
    const result = await extractWordBuildingBlocks(loadFixtureBuffer());
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Normal Colon');
    expect(result[0].gallery).toBe('autoText');
    expect(result[0].category).toBe('General');
  });

  it('extracts real plain text content, joining runs within a paragraph and paragraphs by newline', async () => {
    const result = await extractWordBuildingBlocks(loadFixtureBuffer());
    const normalColon = result.find(r => r.name === 'Normal Colon')!;
    // Real, deliberate check: the fixture's first paragraph is split
    // across two real <w:r> runs (simulating Word's own real run-
    // splitting behavior) — confirms runs are actually joined, not
    // just the first one read.
    expect(normalColon.content).toBe('Sections show colonic mucosa with normal crypt architecture.\nNo dysplasia identified.');
  });

  it('extracts a real, different gallery type correctly — not every entry is AutoText', async () => {
    const result = await extractWordBuildingBlocks(loadFixtureBuffer());
    const coverPage = result.find(r => r.name === 'Cover Page Sample')!;
    expect(coverPage.gallery).toBe('coverPg');
    expect(coverPage.category).toBe('Built-in');
  });

  it('throws a real, specific error for a file with no glossary part at all', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(extractWordBuildingBlocks(buf)).rejects.toThrow(/No AutoText or Building Blocks/);
  });

  it('throws a real, specific error for a file that isn\'t a valid ZIP at all', async () => {
    const notAZip = new TextEncoder().encode('this is definitely not a zip file').buffer;
    await expect(extractWordBuildingBlocks(notAZip)).rejects.toThrow(/could not be read/);
  });
});

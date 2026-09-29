// src/services/phi/phiTagging.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 363 (PS-72): every place the UI shows patient data (name, date of
// birth, MRN, NHS number, accession, contact, insurance) must be inside an
// element the support-ticket screenshot redacts (data-phi, a PHI class, a
// PhiToastMessage / phiToastContent toast, or a report-page toast marked
// containsPhi). The rules and their limits are in phiRenderAudit.ts.
//
// No exception list: the app passes with zero findings. If this fails, tag
// the element named in the message (usually `data-phi="<kind>"` on the
// element that shows it), rather than adding an exception.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPhiRendering } from './phiRenderAudit';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IGNORED = /(\.test\.|\.d\.ts$|__tests__|__mocks__|[\\/]mock[\\/]|\.stories\.)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(name) && !IGNORED.test(path) ? [path] : [];
  });
}

describe('PHI shown on screen is redacted in support-ticket screenshots (PS-72)', () => {
  const files = sourceFiles(SRC);

  it('scans the whole app', () => {
    expect(files.length).toBeGreaterThan(1000);
  });

  it('every rendered patient identifier sits inside a redacted element', () => {
    const findings = files.flatMap(file =>
      auditPhiRendering(file, readFileSync(file, 'utf8')).map(f =>
        `${relative(SRC, file)}:${f.line} ${f.kind} (${f.where}): ${f.snippet}`));
    expect(findings).toEqual([]);
  });

  it('would catch the worklist losing its tags (the check is live, not vacuous)', () => {
    const file = join(SRC, 'components/Worklist/WorklistTable.tsx');
    const untagged = readFileSync(file, 'utf8').replace(/\sdata-phi="[a-z]+"/g, '');
    const kinds = new Set(auditPhiRendering(file, untagged).map(f => f.kind));
    expect([...kinds].sort()).toEqual(expect.arrayContaining(['dob', 'mrn', 'name']));
  });
});

// src/services/styleRules/inlineCss.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 367 (PS-74): standing rule 1 across the whole app. No inline CSS:
// a `style` prop sets only custom properties, and colours are never built in
// JSX. The rules and their limits are in inlineStyleAudit.ts.
//
// No exception list: the app passes with zero findings. If this fails, move
// the property into a pathscribe.css class, passing any per-instance value
// as a custom property (`--ps-hue` for a colour, with color-mix() tints).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditInlineStyles } from './inlineStyleAudit';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IGNORED = /(\.test\.|\.d\.ts$|__tests__|__mocks__|\.stories\.)/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') && !IGNORED.test(path) ? [path] : [];
  });
}

describe('no inline CSS anywhere in the UI (standing rule 1, PS-74)', () => {
  const files = tsxFiles(SRC);

  it('scans the whole app', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('every style prop sets only custom properties, and no colour is built in JSX', () => {
    const findings = files.flatMap(file =>
      auditInlineStyles(file, readFileSync(file, 'utf8')).map(f => `${relative(SRC, file)}:${f.line} ${f.kind}: ${f.snippet}`));
    expect(findings).toEqual([]);
  });

  it('would catch an inline style coming back (the check is live, not vacuous)', () => {
    const file = join(SRC, 'components/Contribution/ProductivityTab.tsx');
    const reverted = readFileSync(file, 'utf8').replace('<div className="ps-prodtab-card">', '<div className="ps-prodtab-card" style={{ background: theme.colors.surfaceSubtle }}>');
    expect(auditInlineStyles(file, reverted).map(f => f.kind)).toEqual(['css-property']);
  });
});

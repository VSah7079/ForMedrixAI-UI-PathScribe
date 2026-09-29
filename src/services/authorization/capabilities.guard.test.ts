// src/services/authorization/capabilities.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): one catalog, no dead flags (Pete's principle 4).
//
//   • Every catalog capability is checked somewhere: an
//     authorizationService.enforce('<key>') call, or an export helper that
//     goes through enforce (exportQaReportRows / exportQaReport).
//   • Every capability key used in the app is in the catalog.
//   • A screen that offers a capability-gated button has a check behind it.
//   • Every capability has its name and description in the locale files,
//     and no locale text is left for a capability that no longer exists.
//
// If this fails because you added a capability: add its service check in
// the same change. If you removed one: remove its locale text too.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_CATALOG, CAPABILITY_GROUPS } from './capabilityCatalog';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IGNORED = /(\.test\.|\.d\.ts$|__tests__|__mocks__|\.stories\.)/;
const CATALOG_DIR = join(SRC, 'services/authorization');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !IGNORED.test(path) ? [path] : [];
  });
}

const KEY = `[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*`;
/** Calls that check a capability at the action. */
const ENFORCING = new RegExp(`\\b(?:enforce|exportQaReportRows|exportQaReport)\\(\\s*'(${KEY})'`, 'g');
/** Anywhere a capability key is named: checks, and gated buttons. */
const NAMED = new RegExp(`(?:\\b(?:enforce|evaluate|exportQaReportRows|exportQaReport|has)\\(\\s*'(${KEY})'|capability="(${KEY})")`, 'g');

const files = sourceFiles(SRC).filter(f => !f.startsWith(CATALOG_DIR));
const texts = files.map(f => ({ file: relative(SRC, f), text: readFileSync(f, 'utf8') }));
const matchesIn = (text: string, re: RegExp) => [...text.matchAll(re)].map(m => m[1] ?? m[2]);

describe('capabilities: one catalog, no dead flags (PS-355)', () => {
  const catalogKeys = CAPABILITY_CATALOG.map(c => c.key);

  it('every catalog capability is checked at an action', () => {
    const enforced = new Set(texts.flatMap(t => matchesIn(t.text, ENFORCING)));
    expect(catalogKeys.filter(k => !enforced.has(k))).toEqual([]);
  });

  it('every capability key named in the app is in the catalog', () => {
    const unknown = texts.flatMap(t => matchesIn(t.text, NAMED).filter(k => !catalogKeys.includes(k as never)).map(k => `${t.file}: ${k}`));
    expect(unknown).toEqual([]);
  });

  it('every file with a capability-gated button also checks that capability at the action', () => {
    const gatedOnly = texts.flatMap(t => {
      const buttons = matchesIn(t.text, /capability="([^"]+)"/g);
      const enforced = new Set(matchesIn(t.text, ENFORCING));
      // A button whose click is handed to a parent (ChangeHistoryModal's
      // onExport) is checked in the parent: allow it when some file enforces it.
      return buttons.filter(k => !enforced.has(k)).map(k => ({ file: t.file, key: k }));
    });
    const enforcedAnywhere = new Set(texts.flatMap(t => matchesIn(t.text, ENFORCING)));
    expect(gatedOnly.filter(g => !enforcedAnywhere.has(g.key)).map(g => `${g.file}: ${g.key}`)).toEqual([]);
  });

  it('the export helpers really go through the check', () => {
    const qaUtils = readFileSync(join(SRC, 'components/QualityAssurance/qaReportUtils.ts'), 'utf8');
    const qaExport = readFileSync(join(SRC, 'services/qualityAssurance/qaExport.ts'), 'utf8');
    const changeLog = readFileSync(join(SRC, 'services/reportChangeLog/exportChangeLog.ts'), 'utf8');
    expect(qaUtils).toMatch(/exportQaReport\(capability,/);
    expect(qaExport).toMatch(/await deps\.authorization\.enforce\(capability/);
    expect(qaExport).toMatch(/if \(!decision\.allowed\) return/);
    expect(changeLog).toMatch(/enforce\('report:change-history:export'/);
  });

  it('every capability and group has its text in the locale files, and nothing is left over', () => {
    const en = JSON.parse(readFileSync(join(SRC, 'i18n/locales/en.json'), 'utf8')) as { capabilities: { items: Record<string, { label?: string; description?: string }>; groups: Record<string, string> } };
    const labelIds: string[] = CAPABILITY_CATALOG.map(c => c.labelId);
    expect(labelIds.filter(id => !en.capabilities.items[id]?.label || !en.capabilities.items[id]?.description)).toEqual([]);
    expect(Object.keys(en.capabilities.items).filter(id => !labelIds.includes(id))).toEqual([]);
    expect(Object.keys(en.capabilities.groups).sort()).toEqual([...CAPABILITY_GROUPS].sort());
  });

  it('would catch a capability with no check (the scan is live, not vacuous)', () => {
    const withoutQa = texts.map(t => t.text.replace(/'qa:fppe-tracking:export'/g, "'x'")).flatMap(t => matchesIn(t, ENFORCING));
    expect(withoutQa).not.toContain('qa:fppe-tracking:export');
    expect(matchesIn("void exportQaReportRows('qa:fppe-tracking:export', rows, 'f.csv')", ENFORCING)).toEqual(['qa:fppe-tracking:export']);
  });
});

// src/services/deploymentReadiness/deploymentReadiness.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 330: keeps the UI deployment-neutral while the real backend is built,
// so PathScribe can go to public or private cloud (Pete, Sep 2026).
//
// In the UI layer (components/, pages/, hooks/, contexts/, and the top-level
// src/*.tsx files):
//   1. No direct import of a mock service (…/mockXxx). Use the services
//      index (`@/services`) or an injected dependency, so replacing mocks
//      with the real backend is one switch, not a change in every screen.
//   2. No direct localStorage/sessionStorage. Per-user display preferences
//      go through utils/uiPreferences.ts; anything that is data (drafts,
//      annotations, requests, settings) goes through a service.
//   3. No direct Firebase SDK import. The database is reached only through
//      services, so it can be replaced (e.g. by PostgreSQL for private
//      cloud).
//
// Files that already break a rule are listed in deploymentBaseline.ts. That
// list may only shrink: a listed file that has been cleaned up must be
// removed from it, and an unlisted file may not break the rule.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { MOCK_IMPORT_BASELINE, BROWSER_STORAGE_BASELINE, FIREBASE_IMPORT_BASELINE } from './deploymentBaseline';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Source with comments removed — the rules apply to code, not prose about it. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const isSource = (name: string) => /\.(tsx?|jsx?)$/.test(name) && !/\.test\.(tsx?|jsx?)$/.test(name) && !/\.d\.ts$/.test(name);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
    return isSource(name) ? [full] : [];
  });
}

const UI_FILES = [
  ...['components', 'pages', 'hooks', 'contexts'].flatMap(d => walk(resolve(SRC, d))),
  ...readdirSync(SRC).filter(isSource).map(n => resolve(SRC, n)),
].map(f => ({ rel: relative(SRC, f).split(sep).join('/'), text: code(readFileSync(f, 'utf8')) }));

const RULES = [
  {
    name: 'direct mock-service import',
    pattern: /(?:from\s+|import\s*\(\s*)['"][^'"]*\/mock[A-Z]\w*['"]/,
    baseline: MOCK_IMPORT_BASELINE,
    fix: "import it from '@/services' (or take it as a dependency) instead of the mock file",
  },
  {
    name: 'direct browser storage',
    pattern: /\b(?:localStorage|sessionStorage)\b/,
    baseline: BROWSER_STORAGE_BASELINE,
    fix: 'use utils/uiPreferences.ts for a display preference, or a service for data',
  },
  {
    name: 'direct Firebase SDK import',
    pattern: /(?:from\s+|import\s*\(\s*)['"]firebase\//,
    baseline: FIREBASE_IMPORT_BASELINE,
    fix: 'reach the database through a service',
  },
];

describe('deployment readiness: the UI stays deployment-neutral (Batch 330)', () => {
  it('scans the UI layer', () => {
    expect(UI_FILES.length).toBeGreaterThan(300);
  });

  for (const rule of RULES) {
    const offenders = UI_FILES.filter(f => rule.pattern.test(f.text)).map(f => f.rel);

    it(`no new UI file uses a ${rule.name}`, () => {
      const allowed = new Set(rule.baseline);
      const added = offenders.filter(f => !allowed.has(f));
      expect(added, `New ${rule.name} in: ${added.join(', ')}. Fix: ${rule.fix}.`).toEqual([]);
    });

    it(`the ${rule.name} baseline only lists files that still need it`, () => {
      const still = new Set(offenders);
      const cleaned = rule.baseline.filter(f => !still.has(f));
      expect(cleaned, `Cleaned up — remove from deploymentBaseline.ts: ${cleaned.join(', ')}`).toEqual([]);
    });
  }
});

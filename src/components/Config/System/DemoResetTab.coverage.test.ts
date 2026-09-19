// @vitest-environment node
//
// src/components/Config/System/DemoResetTab.coverage.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct request: "please review the whole system, you may
// likely find other gaps... build [a test for this]." A manual,
// one-time audit (the one that already found and fixed ~90 missing
// keys) only ever proves the reset was complete on the day it was
// run — every real feature added afterward risks the exact same
// "genuinely missed here until checked directly" failure this file's
// own comment history already describes multiple times. This test
// makes that check automatic and permanent instead of a recurring
// manual chore.
//
// What this actually does: scans every real .ts/.tsx file under
// src/services/, src/hooks/, and src/components/ for every real
// storage key literal used — both storageGet/storageSet calls (the
// mockStorage.ts wrapper) and raw localStorage.getItem/setItem calls
// (a few real files, e.g. PoolClaimModal.tsx, bypass the wrapper
// directly) — then asserts each one is genuinely covered by
// DemoResetTab.tsx's own reset lists (an exact list entry, one of its
// prefix sweeps) or is in this test's own explicit, documented
// EXCLUSIONS allowlist below.
//
// Real, deliberate scope limit: this cannot verify a key is placed in
// the *correct* list (SETTINGS_KEYS vs CASE_KEYS vs STATE_KEYS) —
// only that it's cleared by *some* real sweep. Getting a key into the
// wrong list only affects the "My data only" partial-reset path's own
// UX; Full Reset clears every list regardless. A human reviewing a
// new key's own real placement is still the right call at
// PR-review time — this test's real job is making sure no key is
// ever silently forgotten entirely, the actual failure mode every
// past incident in this file was about.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const RESET_TAB_PATH = path.join(SRC_DIR, 'components/Config/System/DemoResetTab.tsx');

/** Real, deliberate, and reviewed one at a time (see DemoResetTab.tsx's
 *  own comments for each) — keys that must NEVER be swept by a demo
 *  reset, for a real reason, not an oversight:
 *
 *  - Genuine, immutable audit/error trails: surviving a reset is the
 *    correct behavior for these, not a gap.
 *  - orSuiteTerminals: has no real seed-data fallback yet
 *    (storageGet(KEY, []), not a SEED_ constant) — clearing it would
 *    break the OR Suite Live Board (zero terminals to bind to) rather
 *    than restore it to a ready state. Add it here only once that
 *    service has real seed terminals, mirroring every sibling
 *    dictionary service's own SEED_ constant. */
const DELIBERATE_EXCLUSIONS = new Set([
  'pathscribe_audit_logs', 'pathscribe_error_logs', 'ps_ai_audit_log_v1',
  'orSuiteTerminals',
]);

function walk(dir: string, exts: string[]): string[] {
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      results = results.concat(walk(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext)) && !entry.name.includes('.test.')) {
      results.push(full);
    }
  }
  return results;
}

/** Real, per the same "found via a full, systematic audit" precedent
 *  already documented in DemoResetTab.tsx — strips // comments before
 *  matching quoted strings, since this file's own extensive prose
 *  comments contain real apostrophes ("wasn't", "doesn't") that a
 *  naive quote-matching regex mis-pairs with real code strings. */
function stripLineComments(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === "'") inString = !inString;
    if (!inString && line[i] === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function extractArrayContents(fileContent: string, arrayName: string): Set<string> {
  const m = fileContent.match(new RegExp(`const ${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!m) return new Set();
  const cleaned = m[1].split('\n').map(stripLineComments).join('\n');
  const found = new Set<string>();
  const re = /'([^']*)'/g;
  let match;
  while ((match = re.exec(cleaned)) !== null) found.add(match[1]);
  return found;
}

function findRealStorageKeysInSource(): Set<string> {
  const keys = new Set<string>();
  const files = [
    ...walk(path.join(SRC_DIR, 'services'), ['.ts', '.tsx']),
    ...walk(path.join(SRC_DIR, 'hooks'), ['.ts', '.tsx']),
    ...walk(path.join(SRC_DIR, 'components'), ['.ts', '.tsx']),
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (!content.includes('storageGet') && !content.includes('storageSet') && !content.includes('localStorage.')) continue;
    const cleanedLines = content.split('\n').map(stripLineComments);
    const cleaned = cleanedLines.join('\n');

    // const STORAGE_KEY = '...' / const KEY = '...'
    for (const m of cleaned.matchAll(/const (?:STORAGE_KEY|KEY)\s*=\s*'([^']+)'/g)) keys.add(m[1]);
    // storageGet<T>('...' or storageSet('...' — direct literal keys
    for (const m of cleaned.matchAll(/storage(?:Get|Set)(?:<[^>]*>)?\('([^']+)'/g)) keys.add(m[1]);
    // localStorage.getItem('...') / .setItem('...') — a few real
    // files bypass the mockStorage.ts wrapper entirely
    for (const m of cleaned.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)) keys.add(m[1]);
  }
  return keys;
}

describe('DemoResetTab — every real storage key used anywhere in the app is covered', () => {
  it('has no real storage key that silently survives a Full Reset', () => {
    const resetTabContent = fs.readFileSync(RESET_TAB_PATH, 'utf-8');
    const covered = new Set<string>([
      ...extractArrayContents(resetTabContent, 'VERSIONED_KEYS'),
      ...extractArrayContents(resetTabContent, 'SETTINGS_KEYS'),
      ...extractArrayContents(resetTabContent, 'CASE_KEYS'),
      ...extractArrayContents(resetTabContent, 'FLAG_KEYS'),
      ...extractArrayContents(resetTabContent, 'STATE_KEYS'),
      'pathscribe-user', // SESSION_KEY
    ]);
    const prefixes = ['pathscribe_mock_', 'pathscribe_active_session_', 'ps_rpart_', 'ps_orch_sections_'];

    const realKeys = findRealStorageKeysInSource();
    const uncovered = [...realKeys].filter(k =>
      !covered.has(k) && !prefixes.some(p => k.startsWith(p)) && !DELIBERATE_EXCLUSIONS.has(k)
    );

    if (uncovered.length > 0) {
      throw new Error(
        `${uncovered.length} real storage key(s) are used somewhere in the app but never cleared by ` +
        `DemoResetTab.tsx's Full Reset, and aren't in this test's own DELIBERATE_EXCLUSIONS allowlist:\n` +
        uncovered.map(k => `  - ${k}`).join('\n') +
        `\n\nEither add each one to the correct list in DemoResetTab.tsx (SETTINGS_KEYS for admin ` +
        `dictionaries/config, CASE_KEYS for per-case/transactional data), or — only if there's a real, ` +
        `deliberate reason it must survive a reset — add it to DELIBERATE_EXCLUSIONS above with a comment ` +
        `explaining why, the same way orSuiteTerminals and the audit-log keys are documented.`
      );
    }
    expect(uncovered).toEqual([]);
  });
});

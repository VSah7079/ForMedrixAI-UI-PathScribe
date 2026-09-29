// src/services/duplication/duplicatePolicy.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Source-level enforcement of the duplication policy (PS-73). See
// duplicatePolicy.ts for the framework and the per-screen decisions.
//
//   1. Screens marked "no Duplicate" render no Duplicate action.
//   2. Screens marked "Duplicate" render one.
//   3. Every component under src/ that renders a Duplicate action is in the
//      registry as allowed, so a new Duplicate button can't ship without a
//      recorded reason.
//   4. No source file stores a hard-coded English copy marker ("(Copy)",
//      "Copy of …"): copy names come from t('common.copyOfName').
//   5. The copy marker exists, non-empty and with its {{name}} placeholder,
//      in all five languages.
//   6. Standing rule "no inline CSS" for every screen in the registry and
//      the protocol files reworked with it: a style prop may set only CSS
//      custom properties (e.g. --ps-hue), never a real CSS property.
//
// A "Duplicate action" is any t('<key>') whose English value is exactly
// "Duplicate", so a screen can't dodge the check with its own label key.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { DUPLICATE_POLICY, ALLOWED_CATEGORIES } from './duplicatePolicy';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');
/** Source with comments removed — the rules apply to code, not prose about it. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

type Json = { [k: string]: string | Json };
const flatten = (o: Json, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flatten(v, `${p}${k}.`)));
const en = flatten(JSON.parse(read('i18n/locales/en.json')));

/** Every translation key whose English label is the Duplicate action. */
const DUPLICATE_KEYS = en.filter(([, v]) => v.trim() === 'Duplicate').map(([k]) => k);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DUPLICATE_ACTION = new RegExp(`\\bt\\(\\s*['"\`](${DUPLICATE_KEYS.map(escape).join('|')})['"\`]`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}
const SOURCE_FILES = walk(SRC).map(f => relative(SRC, f).split(sep).join('/'));

describe('duplication policy registry', () => {
  it('finds the Duplicate label keys it checks for (guards the guard)', () => {
    expect(DUPLICATE_KEYS).toContain('common.duplicate');
  });

  it('every entry points at a real file, and its verdict matches its category', () => {
    for (const [screen, entry] of Object.entries(DUPLICATE_POLICY)) {
      expect(SOURCE_FILES, screen).toContain(entry.file);
      expect(ALLOWED_CATEGORIES.includes(entry.category), `${screen}: ${entry.category}`).toBe(entry.duplicate);
      expect(entry.reason.trim().length, screen).toBeGreaterThan(0);
    }
  });

  for (const [screen, entry] of Object.entries(DUPLICATE_POLICY)) {
    if (entry.duplicate) {
      it(`${screen} (${entry.category}) offers Duplicate`, () => {
        expect(DUPLICATE_ACTION.test(code(read(entry.file)))).toBe(true);
      });
    } else {
      it(`${screen} (${entry.category}) offers no Duplicate`, () => {
        const src = code(read(entry.file));
        expect(DUPLICATE_ACTION.test(src)).toBe(false);
        expect(src).not.toMatch(/services\/duplication|prepareDuplicate|handleClone|handleDuplicate/);
      });
    }
  }

  it('every component that renders a Duplicate action is registered as allowed', () => {
    const allowed = new Set(Object.values(DUPLICATE_POLICY).filter(e => e.duplicate).map(e => e.file));
    const unregistered = SOURCE_FILES.filter(f => f.endsWith('.tsx') && DUPLICATE_ACTION.test(code(read(f))) && !allowed.has(f));
    expect(unregistered).toEqual([]);
  });
});

describe('copy names are localized, never hard-coded', () => {
  it('no source file writes an English copy marker', () => {
    const MARKER = /['"`][^'"`\n]*(\(Copy\)|\(copy\)|Copy of )[^'"`\n]*['"`]/;
    const offenders = SOURCE_FILES.filter(f => !f.startsWith('i18n/') && MARKER.test(code(read(f))));
    expect(offenders).toEqual([]);
  });

  it('common.copyOfName exists in every language with its {{name}} placeholder', () => {
    for (const l of ['en', 'fr', 'de', 'nl', 'ko']) {
      const value = new Map(flatten(JSON.parse(read(`i18n/locales/${l}.json`)))).get('common.copyOfName');
      expect(value, l).toMatch(/\{\{name\}\}/);
      expect(value!.replace('{{name}}', '').trim().length, l).toBeGreaterThan(0);
    }
  });
});

/** Every `style={…}` expression in a source file, brace-balanced. */
function styleExpressions(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('style={');
  while (i !== -1) {
    let depth = 0, j = i + 'style='.length;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    out.push(src.slice(i + 'style={'.length, j));
    i = src.indexOf('style={', j);
  }
  return out;
}

describe('standing rule: no inline CSS in the screens this policy covers', () => {
  const files = new Set([
    ...Object.values(DUPLICATE_POLICY).map(e => e.file),
    'components/Config/Protocols/protocolShared.tsx',
    'components/Config/Protocols/AllProtocolsSection.tsx',
    'components/Config/Protocols/ActiveProtocolsSection.tsx',
    'components/Config/Protocols/ReviewQueueSection.tsx',
    'components/Config/Protocols/SynopticEditor.tsx',
    'pages/system/FacilityDictionaryPage.tsx',
  ]);
  for (const file of files) {
    it(`${file} — style props set only CSS custom properties`, () => {
      const bad = styleExpressions(code(read(file))).filter(expr => {
        // Drop string/template literals (their contents are values, not keys),
        // then look for an unquoted object key: that is a real CSS property.
        const bare = expr.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, "''");
        return /[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(bare) || /\.style\./.test(expr);
      });
      expect(bad).toEqual([]);
    });
  }

  it('no component in these files mutates element styles imperatively', () => {
    const offenders = [...files].filter(f => /currentTarget\.style\.|target\.style\./.test(code(read(f))));
    expect(offenders).toEqual([]);
  });
});

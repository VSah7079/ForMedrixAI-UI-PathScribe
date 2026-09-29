// src/i18n/localeParity.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Project-wide enforcement of the i18n standing rule ("every real key
// added to every one of the five locale files — never just en.json with
// the others left to catch up later"). Before this existed nothing
// checked it, and 45 keys had drifted to en.json only (critical-alert
// pages, the audit log's Critical Alerts tab, the physician SMS-carrier
// fields) — non-English users silently got English for all of them.
// Those were translated in Batch 316 so this runs with NO exception list.
//
// Checks every key in every locale, not a sample:
//   1. Coverage   — every en key exists in fr/de/nl/ko; no locale has
//                   keys en lacks (except plural-form variants, which
//                   legitimately differ by language).
//   2. Non-empty  — no blank values, except a word-order pair: a
//                   `…Prefix`/`…Suffix` key may be empty when its partner
//                   carries the text (Korean puts the verb last, so
//                   "Click [+] to…" lives entirely in the suffix).
//   3. Placeholders — the same {{variables}} as English, so no language
//                   silently drops a value (a count, a name, a date).
//   4. Markup     — the same <tags> as English, so <Trans> components
//                   (e.g. <strong>) keep working in every language.
//   5. Ordering   — keys sorted at every level (this codebase's
//                   convention; keeps diffs reviewable).
//   6. Wiring     — SUPPORTED_LANGUAGES in config.ts matches the locale
//                   files that exist.
//   7. Regional variants (Batch 362: nl-BE; Batch 365: fr-BE) — the file
//                   holds only what the region words differently;
//                   everything else falls back to its language. So: no key
//                   English lacks, same placeholders/markup, each value
//                   actually differs from the language's, and every string
//                   in the language that uses a word the region doesn't
//                   (inloggen, soixante-dix) has a regional version.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALE_DIR = resolve(HERE, 'locales');
const OTHERS = ['fr', 'de', 'nl', 'ko'] as const;

type Json = { [k: string]: string | Json };
const load = (l: string): Json => JSON.parse(readFileSync(resolve(LOCALE_DIR, `${l}.json`), 'utf8'));
const flatten = (o: Json, p = ''): Map<string, string> =>
  new Map(Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : [...flatten(v, `${p}${k}.`)])));

const en = flatten(load('en'));
const locales = Object.fromEntries(OTHERS.map(l => [l, flatten(load(l))])) as Record<(typeof OTHERS)[number], Map<string, string>>;

const PLURAL = /_(zero|one|two|few|many|other)$/;
const baseOf = (k: string) => k.replace(PLURAL, '');
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map(m => m[1]).sort().join(',');
const tags = (s: string) => [...s.matchAll(/<\/?([a-zA-Z0-9]+)[^>]*>/g)].map(m => m[1]).sort().join(',');

/** The partner of a word-order key: fooPrefix ⇄ fooSuffix. */
const partner = (k: string) => (k.endsWith('Prefix') ? k.replace(/Prefix$/, 'Suffix') : k.endsWith('Suffix') ? k.replace(/Suffix$/, 'Prefix') : null);

describe('i18n locale parity — every locale file, every key', () => {
  it('has a meaningful number of keys to check (guards the guard)', () => {
    expect(en.size).toBeGreaterThan(5000);
  });

  it('English itself has no empty values (outside word-order pairs)', () => {
    const empty = [...en].filter(([k, v]) => !v.trim() && !(partner(k) && en.get(partner(k)!)?.trim()));
    expect(empty.map(([k]) => k)).toEqual([]);
  });

  for (const l of OTHERS) {
    describe(l, () => {
      const loc = locales[l];

      it('contains every English key', () => {
        expect([...en.keys()].filter(k => !loc.has(k))).toEqual([]);
      });

      it('has no keys English lacks (plural-form variants excepted)', () => {
        const extra = [...loc.keys()].filter(k => !en.has(k) && !(PLURAL.test(k) && [...en.keys()].some(e => baseOf(e) === baseOf(k))));
        expect(extra).toEqual([]);
      });

      it('has no empty values, except a word-order Prefix/Suffix pair whose partner carries the text', () => {
        const empty = [...loc].filter(([k, v]) => !v.trim() && !(partner(k) && loc.get(partner(k)!)?.trim()));
        expect(empty.map(([k]) => k)).toEqual([]);
      });

      it('keeps the same {{placeholders}} as English', () => {
        const bad = [...en].filter(([k, v]) => loc.has(k) && placeholders(v) !== placeholders(loc.get(k)!));
        expect(bad.map(([k]) => k)).toEqual([]);
      });

      it('keeps the same <markup> tags as English (Trans components)', () => {
        const bad = [...en].filter(([k, v]) => loc.has(k) && tags(v) !== tags(loc.get(k)!));
        expect(bad.map(([k]) => k)).toEqual([]);
      });
    });
  }

  // Regional variants: each file holds only what the region words
  // differently, and falls back to its language. `languageOnly` catches a
  // word the region doesn't use, so a new string in the language that uses
  // it gets a regional version.
  const REGIONAL = [
    // Belgian Dutch says aanmelden/afmelden, not inloggen/uitloggen, and
    // familienaam, not achternaam.
    { variant: 'nl-BE', base: 'nl', languageOnly: /inlog|uitlog|ingelogd|uitgelogd|achternaam|achternamen/i },
    // Belgian French writes septante and nonante (Batch 365, PS-347).
    { variant: 'fr-BE', base: 'fr', languageOnly: /soixante-dix|quatre-vingt-dix/i },
  ] as const;

  for (const { variant, base, languageOnly } of REGIONAL) {
    describe(`regional variant ${variant} (falls back to ${base})`, () => {
      const regional = flatten(load(variant));
      const language = locales[base];

      it('has entries, all of them keys English has', () => {
        expect(regional.size).toBeGreaterThan(0);
        expect([...regional.keys()].filter(k => !en.has(k))).toEqual([]);
      });

      it('has no empty values and keeps English placeholders and markup', () => {
        expect([...regional].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
        expect([...regional].filter(([k, v]) => placeholders(v) !== placeholders(en.get(k)!)).map(([k]) => k)).toEqual([]);
        expect([...regional].filter(([k, v]) => tags(v) !== tags(en.get(k)!)).map(([k]) => k)).toEqual([]);
      });

      it('only holds what the region words differently (no copies of the base text)', () => {
        expect([...regional].filter(([k, v]) => language.get(k) === v).map(([k]) => k)).toEqual([]);
      });

      it('every base string with a word the region does not use has a regional version', () => {
        expect([...language].filter(([k, v]) => languageOnly.test(v) && !regional.has(k)).map(([k]) => k)).toEqual([]);
      });

      it('the regional versions do not use those words', () => {
        expect([...regional].filter(([, v]) => languageOnly.test(v)).map(([k]) => k)).toEqual([]);
      });
    });
  }

  it('config.ts falls back from each regional variant to its language', () => {
    const config = readFileSync(resolve(HERE, 'config.ts'), 'utf8');
    for (const { variant, base } of REGIONAL) {
      expect(config).toContain(`'${variant}': '${base}'`);
      expect(config).toContain(`'${variant}': ['${base}', 'en']`);
    }
  });

  it('every locale file keeps keys sorted at every level', () => {
    const sorted = (o: Json): boolean => {
      const keys = Object.keys(o);
      return keys.every((k, i) => i === 0 || keys[i - 1] <= k) && Object.values(o).every(v => typeof v === 'string' || sorted(v));
    };
    for (const l of ['en', ...OTHERS, ...REGIONAL.map(r => r.variant)]) expect(sorted(load(l)), `${l}.json`).toBe(true);
  });

  it('SUPPORTED_LANGUAGES in config.ts matches the locale files that exist', () => {
    const config = readFileSync(resolve(HERE, 'config.ts'), 'utf8');
    const declared = config.match(/SUPPORTED_LANGUAGES\s*=\s*\[([^\]]*)\]/)![1].match(/'([\w-]+)'/g)!.map(s => s.replace(/'/g, '')).sort();
    const files = readdirSync(LOCALE_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();
    expect(declared).toEqual(files);
  });
});

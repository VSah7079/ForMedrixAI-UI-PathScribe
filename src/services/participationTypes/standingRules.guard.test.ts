// src/services/participationTypes/standingRules.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Durable enforcement of the three standing rules — no inline CSS, no
// business logic in components, international support — for the
// signing-authority UI surfaces (Batches 313–315). Source-level checks,
// so a future edit that reintroduces a raw style declaration, re-inlines
// resolution/audit logic into a component, or adds an untranslated key
// fails CI instead of relying on review to catch it.
//
// Deliberately scoped to the files this work owns. A codebase-wide
// version would fail today on pre-existing debt that hasn't been audited
// (e.g. other screens still render the English-only JURISDICTION_LABELS
// constant) — that's disclosed follow-up, not something to paper over by
// weakening these checks.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JURISDICTION_LABELS } from '../../types/systemConfig';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');
/** Source with // and /* *\/ comments removed — rules apply to code, not prose about it. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

const COMPONENTS = [
  'components/Config/System/TypeModal.tsx',
  'components/Config/System/ParticipationTypesSection.tsx',
  'pages/SynopticReportPage/modals/CaseTeamModal.tsx',
  // Batch 335 (PS-341): the platform-level country-profile editor.
  'components/Config/System/CountrySigningRulesSection.tsx',
];
const LOCALES = ['en', 'de', 'fr', 'nl', 'ko'] as const;
const locale = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(read(`i18n/locales/${l}.json`))])) as Record<string, unknown>;

const lookupExact = (obj: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
/** A plural key (t(key, { count })) is stored as key_one / key_other;
 *  both must exist, and key_other stands for the key. */
const lookup = (obj: unknown, key: string): unknown => {
  const exact = lookupExact(obj, key);
  if (exact !== undefined) return exact;
  const one = lookupExact(obj, `${key}_one`);
  const other = lookupExact(obj, `${key}_other`);
  return typeof one === 'string' && one.trim() ? other : undefined;
};

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

describe('standing rule: no inline CSS', () => {
  for (const file of COMPONENTS) {
    it(`${file} — every style prop sets only CSS custom properties`, () => {
      for (const expr of styleExpressions(code(file))) {
        // Allowed: a helper that returns only custom properties (CaseTeamModal's colorVars),
        // undefined, or an object literal whose every key is a quoted `--custom-property`.
        if (/^\s*colorVars\(/.test(expr) || /\?\s*colorVars\(.*:\s*undefined\s*$/.test(expr)) continue;
        const keys = [...expr.matchAll(/(['"]?)([\w-]+)\1\s*:/g)].map(m => m[2]).filter(k => !/^(undefined|as)$/.test(k));
        expect(keys.length, `unexpected style expression: ${expr}`).toBeGreaterThan(0);
        for (const k of keys) expect(k.startsWith('--'), `raw CSS property "${k}" in style={${expr}}`).toBe(true);
      }
    });
  }
});

describe('standing rule: no business logic in components', () => {
  // Resolution, seeding, provenance stamping, and audit construction must
  // be reached only through the service facades (facilityAuthorityEditor.ts,
  // saveParticipationType.ts, resolveCaseTeamParticipationTypes()).
  const LOGIC_PRIMITIVES = [
    'resolveParticipationTypeAuthority', 'resolveParticipationTypeLabel', 'isParticipationTypeOfferedIn',
    'resolveAuthorityWithSource', 'resolveInheritedAuthority',
    'stampFacilityOverrideChanges', 'buildFacilityOverrideAuditEntry',
    'planCountryProfileSave', 'buildCountryProfileAuditEntry',
  ];
  for (const file of COMPONENTS) {
    it(`${file} — never calls signing-authority logic primitives directly`, () => {
      const src = code(file);
      for (const fn of LOGIC_PRIMITIVES) expect(src.includes(`${fn}(`), `${file} calls ${fn}() directly`).toBe(false);
    });
  }
});

describe('standing rule: international support', () => {
  const keysIn = (src: string) => new Set([
    ...[...src.matchAll(/\bt\(\s*'([\w.]+)'/g)].map(m => m[1]),
    ...[...src.matchAll(/'(participationTypesSection\.[\w.]+)'/g)].map(m => m[1]),
  ]);
  const ADMIN_UI = [COMPONENTS[0], COMPONENTS[1], COMPONENTS[3]];
  const usedKeys = new Set(ADMIN_UI.flatMap(f => [...keysIn(read(f))]));
  // TypeModal builds jurisdictionNames.<code> dynamically — every code must exist.
  for (const j of Object.keys(JURISDICTION_LABELS)) usedKeys.add(`jurisdictionNames.${j}`);

  it('finds the keys it is meant to check (guards the guard)', () => {
    expect(usedKeys.has('participationTypesSection.modal.authority.sourceJurisdiction')).toBe(true);
    expect(usedKeys.has('jurisdictionNames.GB_EW')).toBe(true);
    expect(usedKeys.has('countrySigningRules.platformNotice')).toBe(true);
  });

  for (const l of LOCALES) {
    it(`every key used by the signing-authority admin UI exists, non-empty, in ${l}.json`, () => {
      const missing = [...usedKeys].filter(k => { const v = lookup(locale[l], k); return typeof v !== 'string' || !v.trim(); });
      expect(missing).toEqual([]);
    });
  }

  it('every locale keeps the same {{interpolation}} placeholders as English', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort().join(',');
    for (const k of usedKeys) {
      const en = lookup(locale.en, k) as string;
      for (const l of LOCALES) expect(placeholders(lookup(locale[l], k) as string), `${l}:${k}`).toBe(placeholders(en));
    }
  });

  it('the admin UI never renders the English-only JURISDICTION_LABELS constant', () => {
    for (const f of ADMIN_UI) expect(code(f).includes('JURISDICTION_LABELS'), f).toBe(false);
  });
});

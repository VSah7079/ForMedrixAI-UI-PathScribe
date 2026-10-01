#!/usr/bin/env node
// scripts/spellcheck/build-spellcheck-assets.mjs
// ─────────────────────────────────────────────────────────────────────────────
// PS-342: builds the spell-check dictionaries the browser loads, into
// public/spellcheck/ (served by PathScribe itself, never a public CDN, so
// it works in a private cloud). Run: npm run spellcheck:build
//
// Inputs
//   • Base Hunspell dictionaries from the dictionary-* dev dependencies.
//   • spellcheck-data/en/pathology.dic.txt — PathScribe's English pathology
//     lexicon (entries shared by US and UK spelling).
//   • spellcheck-data/en/variants.tsv — US/UK pairs.
//   • spellcheck-data/ko/pathology.txt — Korean pathology terms.
//   • spellcheck-data/licenses/ — full licence texts (GPL-2.0/3.0 for German,
//     MPL-2.0 for French, MPL-1.1 for Korean) and the GPL source-offer contact.
//   • spellcheck-data/sources/de-DE/ — the German dictionary's upstream source
//     (GPL), if present; otherwise NOTICE.txt carries a written offer.
//   • spellcheck-data/licensed/ (Batch 339, optional) — the licensed clinical
//     vocabularies, dropped in as downloaded; never shipped themselves:
//       specialist/  the SPECIALIST Lexicon (its LRAGR table)
//       snomed/      one or more SNOMED CT RF2 releases (International and
//                    national editions), anywhere inside
//       loinc/       Loinc.csv and the LinguisticVariants/ folder
//     Which hierarchies, classes and language reference sets are used is in
//     spellcheck-data/licensed-sources.json. Another folder can be given
//     with --licensed <dir>.
// Outputs
//   public/spellcheck/manifest.json, base/*.aff|dic, medical/*, clinical/*,
//   NOTICE.txt
//
// With no licensed folder the output is exactly what it was before Batch 339.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  conventionRules, readLoinc, readSnomed, readSpecialist, spellingPairs, toDic, wordsForLocale,
} from './licensedSources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let OUT = path.join(ROOT, 'public/spellcheck');
const DATA = path.join(ROOT, 'spellcheck-data');

export const BASE_PACKAGES = {
  'en-US': 'dictionary-en',
  'en-GB': 'dictionary-en-gb',
  'en-AU': 'dictionary-en-au',
  'en-CA': 'dictionary-en-ca',
  'fr-FR': 'dictionary-fr',
  'nl-NL': 'dictionary-nl',
  'ko-KR': 'dictionary-ko',
  'de-DE': 'dictionary-de',
};

/** Full licence texts shipped with copyleft dictionaries (spellcheck-data/licenses/). */
export const LICENCE_TEXTS = {
  'de-DE': ['GPL-2.0.txt', 'GPL-3.0.txt'],
  'fr-FR': ['MPL-2.0.txt'],
  'ko-KR': ['MPL-1.1.txt'],
};

/** Dictionaries distributed under the GPL: shipped byte-for-byte unmodified, with
 *  their source (spellcheck-data/sources/<locale>/) or a written offer for it. */
export const GPL_LOCALES = ['de-DE'];

const OFFER_PLACEHOLDER = /^ForMedrixAI LLC — add the address/;

/** Which column of variants.tsv each English locale uses. */
export const ENGLISH_CONVENTION = { 'en-US': 'US', 'en-GB': 'GB', 'en-AU': 'GB', 'en-CA': 'both' };

const lines = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l && !l.startsWith('#'));

/** Parses variants.tsv into { us, gb, flags } rows. */
export function readVariants(file) {
  return lines(file).map((l, i) => {
    const [us, gb, flags = ''] = l.split('\t');
    if (!us || !gb) throw new Error(`variants.tsv line ${i + 1}: expected "US<TAB>UK[<TAB>FLAGS]"`);
    return { us: us.trim(), gb: gb.trim(), flags: flags.trim() };
  });
}

const entry = (word, flags) => (flags ? `${word}/${flags}` : word);
const isSingleWord = w => !/[\s-]/.test(w);

/** The medical .dic text and the regional-variant map for one English locale.
 *  `extra` (Batch 339) adds plain words, e.g. from the SPECIALIST Lexicon. */
export function buildEnglishMedical(core, variants, convention, extra = []) {
  const words = [...core, ...extra];
  const map = {};
  for (const v of variants) {
    const own = convention === 'GB' ? v.gb : v.us;
    const other = convention === 'GB' ? v.us : v.gb;
    if (convention === 'both') {
      for (const w of [v.us, v.gb]) if (isSingleWord(w)) words.push(entry(w, v.flags));
      continue;
    }
    if (isSingleWord(own)) words.push(entry(own, v.flags));
    if (isSingleWord(other)) map[other.toLowerCase()] = own;
  }
  const unique = [...new Set(words)];
  return { dic: `${unique.length}\n${unique.join('\n')}\n`, variants: map };
}

/** GPL source: ship what's in spellcheck-data/sources/<locale>/, or a written offer. */
function gplSourceNotice(locale, pkg, version, warnings) {
  const srcDir = path.join(DATA, 'sources', locale);
  const files = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter(f => f !== 'README.md') : [];
  const lines = [
    `This dictionary is distributed UNMODIFIED, as a separate data file loaded at run time,`,
    `under the GNU General Public License version 2 or 3 (at the recipient's choice).`,
    `Upstream: https://www.j3e.de/ispell/igerman98/ ; packaging: https://github.com/wooorm/dictionaries (${pkg}@${version}).`,
  ];
  if (files.length) {
    fs.mkdirSync(path.join(OUT, 'source', locale), { recursive: true });
    for (const f of files) fs.copyFileSync(path.join(srcDir, f), path.join(OUT, 'source', locale, f));
    lines.push(`Complete corresponding source is provided alongside it: ${files.map(f => `source/${locale}/${f}`).join(', ')}.`);
    return lines;
  }
  const contact = fs.readFileSync(path.join(DATA, 'licenses', 'source-offer-contact.txt'), 'utf8').trim();
  if (OFFER_PLACEHOLDER.test(contact)) {
    warnings.push(`GPL source offer for ${locale}: set a contact in spellcheck-data/licenses/source-offer-contact.txt, or put the upstream source in spellcheck-data/sources/${locale}/, before release.`);
  }
  lines.push(
    'Written offer: for at least three years from the date you received this file, ForMedrixAI LLC will give any',
    'third party, for no more than the cost of physically performing the distribution, a complete machine-readable',
    `copy of the corresponding source code of this dictionary, under the same licence. Requests: ${OFFER_PLACEHOLDER.test(contact) ? 'contact ForMedrixAI LLC.' : contact}`,
  );
  return lines;
}

/** Attribution the licences require, printed in NOTICE.txt when a source is used. */
export const LICENSED_NOTICES = {
  specialist: 'SPECIALIST Lexicon: U.S. National Library of Medicine, Lister Hill National Center for Biomedical Communications (open-source terms: https://lhncbc.nlm.nih.gov/LSG/Projects/lexicon/current/web/).',
  snomed: 'This material includes SNOMED Clinical Terms® (SNOMED CT®), which is used by permission of SNOMED International. All rights reserved. SNOMED CT® was originally created by the College of American Pathologists. "SNOMED" and "SNOMED CT" are registered trademarks of SNOMED International. Use is subject to the SNOMED CT Affiliate Licence in the licensee\'s member territories.',
  loinc: 'This material contains content from LOINC® (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.',
};

const union = (...sets) => {
  const out = new Set();
  for (const s of sets) if (s) for (const w of s) out.add(w);
  return out;
};

/** Reads whatever licensed sources are present. */
async function readLicensed(dir, config) {
  const empty = { words: new Set(), byLocale: new Map(), files: [] };
  const specialist = fs.existsSync(path.join(dir, 'specialist')) ? await readSpecialist(path.join(dir, 'specialist')) : empty;
  const snomed = fs.existsSync(path.join(dir, 'snomed')) ? await readSnomed(path.join(dir, 'snomed'), config.snomed) : { ...empty, refsetsSeen: {} };
  const loinc = fs.existsSync(path.join(dir, 'loinc')) ? await readLoinc(path.join(dir, 'loinc'), config.loinc) : empty;
  return { specialist, snomed, loinc, any: specialist.files.length + snomed.files.length + loinc.files.length > 0 };
}

/**
 * Builds public/spellcheck/. Options (for tests): `out` (output folder),
 * `licensed` (licensed sources folder), `quiet`.
 */
export async function main(opts = {}) {
  if (opts.out) OUT = opts.out;
  const licensedDir = opts.licensed ?? path.join(DATA, 'licensed');
  const log = opts.quiet ? () => {} : console.log;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'base'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'medical'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'licenses'), { recursive: true });
  const warnings = [];

  const manifest = { format: 1, generatedAt: new Date().toISOString(), locales: {}, sources: [] };
  const notices = ['PathScribe spell-check dictionaries — sources and licences', '='.repeat(60), ''];

  for (const [locale, pkg] of Object.entries(BASE_PACKAGES)) {
    const dir = path.join(ROOT, 'node_modules', pkg);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    fs.copyFileSync(path.join(dir, 'index.aff'), path.join(OUT, 'base', `${locale}.aff`));
    fs.copyFileSync(path.join(dir, 'index.dic'), path.join(OUT, 'base', `${locale}.dic`));
    manifest.locales[locale] = { base: { aff: `base/${locale}.aff`, dic: `base/${locale}.dic` } };
    manifest.sources.push({ locale, tier: 'base', package: `${pkg}@${meta.version}`, license: meta.license });
    notices.push(`[${locale}] base dictionary: ${pkg}@${meta.version} (licence: ${meta.license})`, '');
    const licence = ['license', 'LICENSE', 'license.md'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    if (licence) notices.push(fs.readFileSync(licence, 'utf8').trim(), '');
    for (const text of LICENCE_TEXTS[locale] ?? []) {
      fs.copyFileSync(path.join(DATA, 'licenses', text), path.join(OUT, 'licenses', text));
      notices.push(`Full licence text: licenses/${text}`);
    }
    if (GPL_LOCALES.includes(locale)) notices.push('', ...gplSourceNotice(locale, pkg, meta.version, warnings));
    notices.push('', '-'.repeat(60), '');
  }

  // Licensed clinical vocabularies (Batch 339), when present.
  const config = JSON.parse(fs.readFileSync(path.join(DATA, 'licensed-sources.json'), 'utf8'));
  const licensed = await readLicensed(licensedDir, config);
  let bases = {};
  if (licensed.any) {
    const { loadModule } = await import('@farscrl/hunspell-wasm');
    const factory = await loadModule();
    for (const locale of Object.keys(BASE_PACKAGES)) {
      const aff = factory.mountBuffer(fs.readFileSync(path.join(OUT, 'base', `${locale}.aff`)), `${locale}-build.aff`);
      const dic = factory.mountBuffer(fs.readFileSync(path.join(OUT, 'base', `${locale}.dic`)), `${locale}-build.dic`);
      const h = factory.create(aff, dic);
      bases[locale] = { has: w => h.spell(w) };
    }
  }
  const englishSnomed = union(...Object.keys(ENGLISH_CONVENTION).map(l => licensed.snomed.byLocale.get(l)));
  const pairs = licensed.any ? spellingPairs(union(licensed.specialist.words, englishSnomed)) : [];
  const counts = {};

  const core = lines(path.join(DATA, 'en/pathology.dic.txt'));
  const variants = readVariants(path.join(DATA, 'en/variants.tsv'));
  for (const [locale, convention] of Object.entries(ENGLISH_CONVENTION)) {
    const own = buildEnglishMedical(core, variants, convention);
    let dic = own.dic;
    let map = own.variants;
    let clinical = [];
    if (licensed.any) {
      const rules = conventionRules(pairs, convention, bases[locale]);
      const drop = union(rules.drop, Object.keys(own.variants));
      const specialistWords = wordsForLocale(licensed.specialist.words, { base: bases[locale], drop });
      dic = buildEnglishMedical(core, variants, convention, specialistWords).dic;
      map = { ...rules.map, ...own.variants };
      const medicalWords = new Set(specialistWords);
      clinical = wordsForLocale(union(licensed.snomed.byLocale.get(locale), licensed.loinc.byLocale.get(locale)), { base: bases[locale], drop, exclude: medicalWords });
      counts[locale] = { specialist: specialistWords.length, clinical: clinical.length, variantPairs: Object.keys(rules.map).length };
    }
    fs.writeFileSync(path.join(OUT, 'medical', `${locale}.dic`), dic);
    manifest.locales[locale].medical = { dic: `medical/${locale}.dic` };
    if (Object.keys(map).length) {
      fs.writeFileSync(path.join(OUT, 'medical', `${locale}.variants.json`), JSON.stringify(map));
      manifest.locales[locale].variants = `medical/${locale}.variants.json`;
    }
    if (clinical.length) {
      fs.mkdirSync(path.join(OUT, 'clinical'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'clinical', `${locale}.dic`), toDic(clinical));
      manifest.locales[locale].clinical = { dic: `clinical/${locale}.dic` };
    }
  }
  fs.copyFileSync(path.join(DATA, 'ko/pathology.txt'), path.join(OUT, 'medical', 'ko-KR.txt'));
  manifest.locales['ko-KR'].medical = { words: 'medical/ko-KR.txt' };
  manifest.sources.push({ tier: 'medical', name: 'PathScribe pathology lexicon (en, ko)', license: 'Proprietary (ForMedrixAI LLC)' });
  notices.push('[en-*, ko-KR] medical tier: PathScribe pathology lexicon, authored by ForMedrixAI LLC (spellcheck-data/).', '');

  // Other languages: clinical tier only (their medical terms come from the
  // validated national sources, never machine translation).
  if (licensed.any) {
    for (const locale of Object.keys(BASE_PACKAGES).filter(l => !(l in ENGLISH_CONVENTION))) {
      const words = wordsForLocale(union(licensed.snomed.byLocale.get(locale), licensed.loinc.byLocale.get(locale)), { base: bases[locale] });
      counts[locale] = { clinical: words.length };
      if (!words.length) continue;
      fs.mkdirSync(path.join(OUT, 'clinical'), { recursive: true });
      if (locale === 'ko-KR') {
        // The Korean base dictionary stores words decomposed, so Korean uses a word list.
        fs.writeFileSync(path.join(OUT, 'clinical', 'ko-KR.txt'), words.join('\n') + '\n');
        manifest.locales[locale].clinical = { words: 'clinical/ko-KR.txt' };
      } else {
        fs.writeFileSync(path.join(OUT, 'clinical', `${locale}.dic`), toDic(words));
        manifest.locales[locale].clinical = { dic: `clinical/${locale}.dic` };
      }
    }
    const name = f => path.relative(licensedDir, f);
    const used = [
      ['specialist', 'SPECIALIST Lexicon', 'Open (NLM terms, attribution)', licensed.specialist.files, 'medical (English)'],
      ['snomed', 'SNOMED CT', 'SNOMED CT Affiliate Licence', licensed.snomed.files, 'clinical'],
      ['loinc', 'LOINC', 'LOINC License (Regenstrief)', licensed.loinc.files, 'clinical'],
    ].filter(([, , , files]) => files.length);
    for (const [key, label, license, files, tier] of used) {
      manifest.sources.push({ tier, name: label, license, files: files.map(name) });
      notices.push(`[${tier}] ${label}: words derived from ${files.map(name).join(', ')}.`, LICENSED_NOTICES[key], '');
    }
    const unmapped = Object.keys(licensed.snomed.refsetsSeen).filter(id => !config.snomed.dialectRefsets[id]);
    if (unmapped.length) {
      warnings.push(`SNOMED CT language reference sets in the release that licensed-sources.json doesn't map to a locale: ${unmapped.map(id => `${id} (${licensed.snomed.refsetsSeen[id]} rows)`).join(', ')}. Add any English dialect ones to snomed.dialectRefsets.`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'NOTICE.txt'), notices.join('\n') + '\n');
  if (!opts.quiet) for (const w of warnings) console.warn(`WARNING: ${w}`);
  log(`spellcheck assets written to ${path.relative(ROOT, OUT) || OUT}: ${Object.keys(manifest.locales).join(', ')}; English lexicon ${core.length} entries + ${variants.length} variant pairs`);
  if (licensed.any) {
    for (const [locale, c] of Object.entries(counts)) log(`  ${locale}: ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  } else {
    log(`  no licensed sources in ${path.relative(ROOT, licensedDir) || licensedDir} (SPECIALIST Lexicon, SNOMED CT, LOINC): clinical tier left empty`);
  }
  return { manifest, counts, warnings };
}

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const licensed = arg('--licensed');
  main(licensed ? { licensed: path.resolve(licensed) } : {}).catch(e => { console.error(e); process.exit(1); });
}

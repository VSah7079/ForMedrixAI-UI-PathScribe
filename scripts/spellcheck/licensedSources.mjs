// scripts/spellcheck/licensedSources.mjs
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 339): reads the licensed clinical vocabularies into word
// lists for the spell checker. Used by build-spellcheck-assets.mjs; the raw
// release files never ship, only the words derived from them.
//
//   SPECIALIST Lexicon (NLM)  LRAGR: every inflected form of every spelling
//                             variant ("EUI|STR|…", the word is field 2)
//   SNOMED CT (RF2 snapshot)  sct2_Concept_*, sct2_Description_*,
//                             der2_cRefset_*Language* — found anywhere under
//                             the folder, any number of editions
//   LOINC                     Loinc.csv, plus LinguisticVariants/*.csv
//
// Everything here reads columns by header name where the file has a header
// (RF2, LOINC), so column order changes between releases don't matter.
// Pure helpers are exported for tests; the readers stream the files, since
// a SNOMED release is hundreds of megabytes.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// ── Words from a term ───────────────────────────────────────────────────────

/** SNOMED CT case significance ids. */
export const CASE = {
  SENSITIVE: '900000000000017005',          // CS: keep every word's case
  INITIAL_INSENSITIVE: '900000000000020002', // cI: only the first letter may change
  INSENSITIVE: '900000000000448009',         // ci: whole term is case-insensitive
};

export const MIN_WORD = 3;
export const MAX_WORD = 40;

/**
 * The checkable words in a term, cased the way a dictionary should store
 * them. Hyphens and slashes split words (the checker checks parts); words
 * with digits, all-capital acronyms and very short words are dropped, just
 * as the checker never flags them.
 */
export function termWords(term, caseSignificance = CASE.INITIAL_INSENSITIVE) {
  const out = [];
  const raw = String(term).replace(/[’‘]/g, "'").split(/[^\p{L}\p{M}'\d]+/u).filter(Boolean);
  raw.forEach((w, i) => {
    let word = w.replace(/^'+|'+$/g, '').replace(/'s$/i, '');
    if (!word || /\d/.test(word)) return;
    const min = /\p{Script=Hangul}/u.test(word) ? 2 : MIN_WORD; // Korean nouns are often two syllables
    if ([...word].length < min || [...word].length > MAX_WORD) return;
    if (word === word.toUpperCase() && word !== word.toLowerCase()) return; // acronym
    if (caseSignificance === CASE.INSENSITIVE) word = word.toLowerCase();
    else if (caseSignificance === CASE.INITIAL_INSENSITIVE && i === 0) word = word[0].toLowerCase() + word.slice(1);
    out.push(word.normalize('NFC'));
  });
  return out;
}

/** The semantic tag of a SNOMED CT fully specified name: "Adenoma (morphologic abnormality)" → "morphologic abnormality". */
export function semanticTag(fsn) {
  const m = /\(([^()]+)\)\s*$/.exec(fsn);
  return m ? m[1].trim() : undefined;
}

// ── US / UK spelling ────────────────────────────────────────────────────────

/** UK → US spelling rewrites, applied in order. Only used to pair words that
 *  both occur in a source; a pair is kept only when a dictionary confirms it. */
const UK_TO_US = [
  [/ae/g, 'e'],                                   // haem- → hem-, anaemia, paediatric
  [/oe(?=[a-z])/g, 'e'],                          // oedema, oesophagus, foetal
  [/our(?=$|s$|ed$|ing$|ful|less|ite|ation|able)/g, 'or'], // tumour, colour, favourable
  [/isation/g, 'ization'],
  [/is(?=e$|es$|ed$|ing$|er$|ers$)/g, 'iz'],     // -ise, -ised, -ising
  [/ys(?=e$|es$|ed$|ing$)/g, 'yz'],               // analyse, dialysed
  [/tre(?=$|s$)/g, 'ter'],                        // centre, fibre, litre
  [/ll(?=ed$|ing$|er$|ers$)/g, 'l'],              // labelled, travelling
  [/ogue(?=$|s$)/g, 'og'],                        // catalogue
];

export function toUsSpelling(word) {
  let w = word.toLowerCase();
  for (const [re, to] of UK_TO_US) w = w.replace(re, to);
  return w;
}

/** Every UK/US pair where both spellings occur in `words`: [{ uk, us }]. */
export function spellingPairs(words) {
  const lower = new Set([...words].map(w => w.toLowerCase()));
  const pairs = [];
  for (const w of lower) {
    const us = toUsSpelling(w);
    if (us !== w && lower.has(us)) pairs.push({ uk: w, us });
  }
  return pairs;
}

/**
 * For one English convention: the regional-variant map entries (other → own)
 * and the words to leave out of its lists. A pair only counts when this
 * convention's general dictionary rejects the other spelling, so a word that
 * is right in both ("meter" the device, "program") is never flagged.
 */
export function conventionRules(pairs, convention, ownBase) {
  const map = {};
  const drop = new Set();
  if (convention === 'both') return { map, drop };
  for (const { uk, us } of pairs) {
    const [own, other] = convention === 'GB' ? [uk, us] : [us, uk];
    if (ownBase.has(other)) continue;
    map[other] = own;
    drop.add(other);
  }
  return { map, drop };
}

/**
 * The words worth shipping for one language: not already accepted by its
 * general dictionary, not the other convention's spelling, and unique.
 */
export function wordsForLocale(words, { base, drop = new Set(), exclude = new Set() }) {
  const out = new Set();
  for (const w of words) {
    if (drop.has(w.toLowerCase()) || exclude.has(w)) continue;
    if (base.has(w)) continue;
    out.add(w);
  }
  return [...out].sort();
}

/** Hunspell .dic text for plain words (no affix flags). */
export const toDic = words => `${words.length}\n${words.join('\n')}\n`;

// ── File helpers ────────────────────────────────────────────────────────────

/** Every file under `dir` whose name matches `re`. */
export function findFiles(dir, re) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(p, re));
    else if (re.test(entry.name)) out.push(p);
  }
  return out.sort();
}

async function* lines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

/** Rows of a tab-separated file with a header row, as objects keyed by header. */
export async function* tsvRows(file) {
  let header;
  for await (const line of lines(file)) {
    if (!line) continue;
    const cells = line.split('\t');
    if (!header) { header = cells.map(h => h.replace(/^﻿/, '').trim()); continue; }
    yield Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  }
}

/** Parses CSV text (RFC 4180: quoted fields, doubled quotes, newlines inside quotes). */
export function* parseCsv(text) {
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') yield row;
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); yield row; }
}

/** Rows of a CSV file with a header row, as objects keyed by header. */
export function* csvRows(file) {
  let header;
  for (const cells of parseCsv(fs.readFileSync(file, 'utf8'))) {
    if (!header) { header = cells.map(h => h.replace(/^﻿/, '').trim()); continue; }
    yield Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  }
}

// ── SPECIALIST Lexicon ──────────────────────────────────────────────────────

/** Words from the SPECIALIST Lexicon's LRAGR table (every inflected form of
 *  every spelling variant). Returns { words, files }. */
export async function readSpecialist(dir) {
  const files = findFiles(dir, /^LRAGR(\.txt)?$/i);
  const words = new Set();
  for (const file of files) {
    for await (const line of lines(file)) {
      const str = line.split('|')[1];
      if (str) for (const w of termWords(str, CASE.SENSITIVE)) words.add(w);
    }
  }
  return { words, files };
}

// ── SNOMED CT ───────────────────────────────────────────────────────────────

export const FSN = '900000000000003001';

/**
 * Words from SNOMED CT RF2 snapshots, per spelling language.
 *   • Only active descriptions of active concepts whose semantic tag is in
 *     `semanticTags` (pathology-relevant hierarchies).
 *   • English descriptions go to the English locales whose dialect language
 *     reference set marks them preferred or acceptable (`dialectRefsets`);
 *     a locale with no refset in the release borrows from `englishFallback`.
 *   • Other languages go to `languages[languageCode]` (a national edition
 *     only carries its own translations).
 * Returns { byLocale: Map<locale, Set<word>>, files, refsetsSeen }.
 */
export async function readSnomed(dir, config) {
  const conceptFiles = findFiles(dir, /^sct2_Concept_.*Snapshot.*\.txt$/i);
  const descriptionFiles = findFiles(dir, /^sct2_Description_.*Snapshot.*\.txt$/i);
  const languageFiles = findFiles(dir, /^der2_cRefset_.*Language.*Snapshot.*\.txt$/i);
  const tags = new Set(config.semanticTags);
  const byLocale = new Map();
  const add = (locale, words) => {
    if (!byLocale.has(locale)) byLocale.set(locale, new Set());
    const set = byLocale.get(locale);
    for (const w of words) set.add(w);
  };

  // Concepts: the latest row per id decides whether it's active.
  const concepts = new Map();
  for (const f of conceptFiles) {
    for await (const r of tsvRows(f)) {
      const prev = concepts.get(r.id);
      if (!prev || r.effectiveTime >= prev.t) concepts.set(r.id, { t: r.effectiveTime, active: r.active === '1' });
    }
  }
  const conceptActive = id => (concepts.size ? concepts.get(id)?.active === true : true);

  // Pass 1: each concept's semantic tag, from its (English) FSN.
  const tagOf = new Map();
  for (const f of descriptionFiles) {
    for await (const r of tsvRows(f)) {
      if (r.typeId === FSN && r.active === '1' && r.languageCode === 'en') tagOf.set(r.conceptId, semanticTag(r.term));
    }
  }

  // Pass 2: descriptions of relevant concepts. The latest row per id wins.
  const english = new Map();
  const other = new Map();
  for (const f of descriptionFiles) {
    for await (const r of tsvRows(f)) {
      if (r.typeId === FSN) continue; // FSNs carry the tag, not report wording
      const tag = tagOf.get(r.conceptId);
      if (!tag || !tags.has(tag) || !conceptActive(r.conceptId)) continue;
      const target = r.languageCode === 'en' ? english : other;
      const prev = target.get(r.id);
      if (prev && prev.t > r.effectiveTime) continue;
      target.set(r.id, { t: r.effectiveTime, active: r.active === '1', lang: r.languageCode, term: r.term, cs: r.caseSignificanceId });
    }
  }
  for (const d of other.values()) {
    const locale = config.languages[d.lang];
    if (d.active && locale) add(locale, termWords(d.term, d.cs));
  }
  other.clear();

  // Pass 3: English dialects from the language reference sets.
  const refsetsSeen = {};
  const accepted = new Set(config.acceptability);
  for (const f of languageFiles) {
    for await (const r of tsvRows(f)) {
      if (r.active !== '1') continue;
      const d = english.get(r.referencedComponentId);
      if (!d) continue;
      refsetsSeen[r.refsetId] = (refsetsSeen[r.refsetId] ?? 0) + 1;
      const locale = config.dialectRefsets[r.refsetId];
      if (locale && d.active && accepted.has(r.acceptabilityId)) add(locale, termWords(d.term, d.cs));
    }
  }
  for (const [locale, from] of Object.entries(config.englishFallback ?? {})) {
    if (byLocale.has(locale)) continue;
    const sources = from.filter(l => byLocale.has(l));
    if (sources.length) add(locale, sources.flatMap(l => [...byLocale.get(l)]));
  }
  return { byLocale, files: [...conceptFiles, ...descriptionFiles, ...languageFiles], refsetsSeen };
}

// ── LOINC ───────────────────────────────────────────────────────────────────

/**
 * Words from LOINC names for the classes in `classPrefixes`, skipping
 * deprecated codes. English names (US spelling) go to `englishLocales`;
 * a linguistic variant file (e.g. deDE15LinguisticVariant.csv) goes to the
 * locale for its language. Returns { byLocale, files }.
 */
export async function readLoinc(dir, config) {
  const byLocale = new Map();
  const add = (locale, words) => {
    if (!byLocale.has(locale)) byLocale.set(locale, new Set());
    for (const w of words) byLocale.get(locale).add(w);
  };
  const main = findFiles(dir, /^Loinc\.csv$/i);
  const variants = findFiles(dir, /^[a-z]{2}[A-Z]{2}\d*LinguisticVariant\.csv$/);
  const relevant = new Set();
  const inClass = cls => config.classPrefixes.some(p => cls === p || cls.startsWith(`${p}.`) || cls.startsWith(`${p}/`));

  for (const f of main) {
    for (const r of csvRows(f)) {
      if (!inClass(r.CLASS ?? '') || r.STATUS === 'DEPRECATED') continue;
      relevant.add(r.LOINC_NUM);
      const words = config.fields.flatMap(field => termWords(r[field] ?? '', CASE.INITIAL_INSENSITIVE).map(w => w.toLowerCase()));
      for (const locale of config.englishLocales) add(locale, words);
    }
  }
  for (const f of variants) {
    const lang = path.basename(f).slice(0, 2);
    const locale = config.languages[lang];
    if (!locale) continue;
    // German capitalises nouns, so its names keep their case; elsewhere the
    // first word is capitalised only because it starts the name.
    const caseSignificance = lang === 'de' ? CASE.SENSITIVE : CASE.INITIAL_INSENSITIVE;
    for (const r of csvRows(f)) {
      if (!relevant.has(r.LOINC_NUM)) continue;
      add(locale, config.variantFields.flatMap(field => termWords(r[field] ?? '', caseSignificance)));
    }
  }
  return { byLocale, files: [...main, ...variants] };
}

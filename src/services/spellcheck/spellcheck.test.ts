// src/services/spellcheck/spellcheck.test.ts — PS-342 (Batch 336).
// Runs the real Hunspell (WASM) against the real dictionaries in public/spellcheck/.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from '@farscrl/hunspell-wasm';
import { loadSpellEngine, type SpellManifest, type LoadedSpellEngine, type HunspellFactoryLike } from './spellEngine';
import { checkText, checkWord, editDistance, suggestWord } from './spellCascade';
import { tokenizeForSpelling, koreanLookupForms } from './tokenizeForSpelling';
import { resolveSpellingLocale } from './resolveSpellingLocale';
import { JURISDICTION_SPELLING_LOCALE, SPELLING_LOCALES } from './spellingLocales';
import { JURISDICTION_LABELS } from '@/types/systemConfig';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/spellcheck');
const readFile = async (p: string) => new Uint8Array(readFileSync(resolve(PUBLIC, p)));
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.json'), 'utf8')) as SpellManifest;

let factory: HunspellFactoryLike;
const engines: Record<string, LoadedSpellEngine> = {};
const engine = async (locale: keyof typeof SPELLING_LOCALES) =>
  (engines[locale] ??= await loadSpellEngine(locale, { factory, manifest, readFile }));

beforeAll(async () => { factory = await loadModule() as unknown as HunspellFactoryLike; }, 30_000);

describe('tokenizeForSpelling — code pass-through (AC3)', () => {
  it('never offers codes, markers, measurements or short acronyms for checking', () => {
    const text = 'SNOMED 254837009, LOINC 2160-0, ICD-10 C50.9, ICD-O 8140/3, pT3N1a, CK7 and CD20 positive, Ki-67 30%, HER2 3+, Gleason 3+4=7, 2.5 cm, ER/PR, DCIS, e.g. S26-00123.';
    expect(tokenizeForSpelling(text).map(t => t.text)).toEqual(['and', 'positive', 'Gleason', 'cm']);
  });

  it('checks hyphenated and slashed words part by part, with exact offsets', () => {
    const text = 'well-differentiatted adenocarcinoma, HER2-positve';
    const tokens = tokenizeForSpelling(text);
    expect(tokens.map(t => [t.text, text.slice(t.from, t.to)])).toEqual([
      ['well', 'well'], ['differentiatted', 'differentiatted'], ['adenocarcinoma', 'adenocarcinoma'], ['positve', 'positve'],
    ]);
  });

  it('keeps apostrophes inside words and drops sentence-final dots; still checks long all-capital words', () => {
    expect(tokenizeForSpelling("The patient’s mucosa. MALIGANCY").map(t => t.text)).toEqual(['The', "patient's", 'mucosa', 'MALIGANCY']);
  });

  it('strips Korean particles for lookup', () => {
    expect(koreanLookupForms('검체를')).toContain('검체');
    expect(koreanLookupForms('조직에서')).toContain('조직');
  });
});

describe('resolveSpellingLocale (Pete, Sep 26)', () => {
  it('case override, then the assigned pathologist, then the facility, then en-US', () => {
    expect(resolveSpellingLocale({ caseOverride: 'en-US', pathologistPreference: 'en-GB', facilityJurisdiction: 'AU' })).toEqual({ locale: 'en-US', source: 'case' });
    expect(resolveSpellingLocale({ pathologistPreference: 'en-GB', facilityJurisdiction: 'US' })).toEqual({ locale: 'en-GB', source: 'pathologist' });
    expect(resolveSpellingLocale({ facilityJurisdiction: 'NZ' })).toEqual({ locale: 'en-AU', source: 'facility' });
    expect(resolveSpellingLocale({})).toEqual({ locale: 'en-US', source: 'platform' });
  });

  it('uses German for a German facility, and would skip a language with no dictionary rather than leave the report unchecked', () => {
    expect(resolveSpellingLocale({ facilityJurisdiction: 'DE' })).toEqual({ locale: 'de-DE', source: 'facility' });
    const withoutGerman = { ...SPELLING_LOCALES, 'de-DE': { ...SPELLING_LOCALES['de-DE'], available: false } };
    expect(resolveSpellingLocale({ caseOverride: 'de-DE', facilityJurisdiction: 'FR' }, withoutGerman)).toEqual({ locale: 'fr-FR', source: 'facility', unavailableChoice: 'de-DE' });
    expect(resolveSpellingLocale({ facilityJurisdiction: 'DE' }, withoutGerman)).toEqual({ locale: 'en-US', source: 'platform', unavailableChoice: 'de-DE' });
  });

  it('every jurisdiction has a default', () => {
    expect(Object.keys(JURISDICTION_SPELLING_LOCALE).sort()).toEqual(Object.keys(JURISDICTION_LABELS).sort());
  });
});

describe('cascade with real dictionaries', { timeout: 30_000 }, () => {
  it('accepts pathology vocabulary the base dictionaries reject, including inflections (AC1)', async () => {
    const e = await engine('en-US');
    for (const w of ['dysplasia', 'lymphovascular', 'tubulovillous', 'cribriform', 'adenomas', 'urothelial', 'perineural', 'hemicolectomy', 'Gleason', 'immunohistochemistry', 'microcalcifications']) {
      expect(checkWord(w, 'latin', e.tiers), w).toMatchObject({ ok: true });
    }
    expect(checkWord('dysplasia', 'latin', e.tiers)).toEqual({ ok: true, tier: 'medical' });
    expect(checkWord('the', 'latin', e.tiers)).toEqual({ ok: true, tier: 'base' });
  });

  it('no false positives on regional spelling, and the other convention is flagged with this one (AC2)', async () => {
    const us = await engine('en-US');
    const gb = await engine('en-GB');
    expect(checkText('Haematology review of oesophageal mucosa with haemosiderin and oedema; tumour colour grey.', gb.tiers)).toEqual([]);
    expect(checkText('Hematology review of esophageal mucosa with hemosiderin and edema; tumor color gray.', us.tiers)).toEqual([]);
    expect(checkText('Hematology: esophageal oedema.', gb.tiers).map(i => [i.word, i.reason, i.preferred])).toEqual([
      ['Hematology', 'regionalVariant', 'Haematology'], ['esophageal', 'regionalVariant', 'oesophageal'],
    ]);
    expect(checkText('haemangioma, colour', us.tiers).map(i => [i.word, i.reason, i.preferred])).toEqual([
      ['haemangioma', 'regionalVariant', 'hemangioma'], ['colour', 'regionalVariant', 'color'],
    ]);
    const au = await engine('en-AU');
    expect(checkText('Haematoxylin and eosin; keratinising squamous cell carcinoma.', au.tiers)).toEqual([]);
    const ca = await engine('en-CA');
    expect(checkText('hemorrhage and haemorrhage; esophagus and oesophagus', ca.tiers)).toEqual([]);
  });

  it('flags real misspellings and suggests the medical word first', async () => {
    const e = await engine('en-GB');
    expect(checkText('High-grade dysplsia in tubulovilous adenoma.', e.tiers).map(i => i.word)).toEqual(['dysplsia', 'tubulovilous']);
    expect(suggestWord('dysplsia', 'latin', e.tiers)[0]).toBe('dysplasia');
    expect(suggestWord('hematology', 'latin', e.tiers)[0]).toBe('haematology');
  });

  it('ranks the closest word first across the medical and everyday dictionaries (Batch 338)', async () => {
    // Found in the browser check: the medical list used to crowd out the
    // everyday word ("specimin" → "spermatic" before "specimen").
    for (const locale of ['en-US', 'en-GB'] as const) {
      const e = await engine(locale);
      expect(suggestWord('specimin', 'latin', e.tiers)[0], locale).toBe('specimen');
      expect(suggestWord('recieved', 'latin', e.tiers)[0], locale).toBe('received');
      expect(suggestWord('adenocarcnoma', 'latin', e.tiers)[0], locale).toBe('adenocarcinoma');
    }
  });

  it('editDistance counts a swap of neighbouring letters as one edit', () => {
    expect(editDistance('recieve', 'receive')).toBe(1);
    expect(editDistance('specimin', 'specimen')).toBe(1);
    expect(editDistance('specimin', 'spermatic')).toBeGreaterThan(2);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('personal and facility words are accepted first (AC1)', async () => {
    const e = await loadSpellEngine('en-US', { factory, manifest, readFile }, { personal: ['pHx'], facility: ['Fenwick', 'megablock'] });
    expect(checkText('Fenwick megablock with pHx and zzqx', e.tiers).map(i => i.word)).toEqual(['zzqx']);
    expect(checkWord('megablock', 'latin', e.tiers)).toEqual({ ok: true, tier: 'facility' });
    e.setCustomWords({ personal: ['zzqx'], facility: [] });
    expect(checkText('Fenwick zzqx', e.tiers).map(i => i.word)).toEqual(['Fenwick']);
  });

  it('Korean: particles, medical terms, and English words inside a Korean report', async () => {
    const e = await engine('ko-KR');
    expect(checkText('검체를 생검으로 확인하였으며 adenocarcinoma 소견', e.tiers)).toEqual([]);
    expect(checkText('adenocarcnoma 소견', e.tiers).map(i => i.word)).toEqual(['adenocarcnoma']);
  }, 30_000);

  it('German (GPL) ships byte-for-byte unmodified, with the full licence texts', () => {
    const pkg = resolve(PUBLIC, '../../node_modules/dictionary-de');
    for (const ext of ['aff', 'dic']) {
      expect(readFileSync(resolve(PUBLIC, `base/de-DE.${ext}`)).equals(readFileSync(resolve(pkg, `index.${ext}`))), ext).toBe(true);
    }
    for (const text of ['GPL-2.0.txt', 'GPL-3.0.txt']) expect(readFileSync(resolve(PUBLIC, 'licenses', text), 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(readFileSync(resolve(PUBLIC, 'NOTICE.txt'), 'utf8')).toMatch(/distributed UNMODIFIED[\s\S]*(Written offer|corresponding source is provided)/);
  });

  it('German (GPL, shipped unmodified) loads and checks, with codes still passed through', async () => {
    const de = await engine('de-DE');
    expect(checkText('Das Präparat zeigt Lymphknoten; pT2 N1 G2, Ki-67 30 %. Präparatt', de.tiers).map(i => i.word)).toEqual(['Präparatt']);
    expect(suggestWord('Präparatt', 'latin', de.tiers)).toContain('Präparat');
    // Known gap: German has no medical tier yet, and the general dictionary lacks core terms.
    expect(checkText('Karzinom Adenokarzinom', de.tiers).map(i => i.word)).toEqual(['Karzinom', 'Adenokarzinom']);
  }, 30_000);

  it('French and Dutch base dictionaries load and check', async () => {
    const fr = await engine('fr-FR');
    expect(checkText('Adénocarcinome sur biopsie; prélevement', fr.tiers).map(i => i.word)).toEqual(['prélevement']);
    expect(suggestWord('prélevement', 'latin', fr.tiers)).toContain('prélèvement');
    const nl = await engine('nl-NL');
    expect(checkText('Biopsie van weefsel met carcinoom', nl.tiers)).toEqual([]);
  }, 30_000);

  it('checks a 5,000-word report quickly, looking each distinct word up only once (AC4)', async () => {
    const e = await engine('en-GB');
    const para = 'The specimen shows a moderately differentiated adenocarcinoma with lymphovascular and perineural invasion, focal high-grade dysplasia, and haemosiderin-laden macrophages in oedematous stroma. ';
    const text = para.repeat(250);
    expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(5000);
    const cache = new Map();
    const t0 = performance.now();
    expect(checkText(text, e.tiers, cache)).toEqual([]);
    const t1 = performance.now();
    checkText(text, e.tiers, cache);
    const t2 = performance.now();
    // Generous limits: the full suite runs many files in parallel. The AC4 evidence is the
    // browser measurement (about 25 ms for 5,000 words in the Web Worker; see README).
    expect(t1 - t0).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(3000);
    // Memoised per distinct word: 5,000+ words, only the paragraph's distinct words looked up.
    expect(cache.size).toBeLessThan(40);
  });
});

// scripts/spellcheck/licensedSources.test.mjs — PS-342 (Batch 339).
// The licensed-source importers, on the synthetic samples in fixtures/licensed/
// (real formats, hand-written rows), then the whole build end to end with the
// real Hunspell checking the result the way the Web Worker does.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from '@farscrl/hunspell-wasm';
import {
  CASE, conventionRules, parseCsv, readLoinc, readSnomed, readSpecialist, semanticTag,
  spellingPairs, termWords, toUsSpelling, wordsForLocale,
} from './licensedSources.mjs';
import { main } from './build-spellcheck-assets.mjs';
import { loadSpellEngine } from '../../src/services/spellcheck/spellEngine';
import { checkWord, suggestWord } from '../../src/services/spellcheck/spellCascade';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures/licensed');
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, '../../spellcheck-data/licensed-sources.json'), 'utf8'));
const set = words => ({ has: w => words.includes(w) });

describe('words from terms', () => {
  it('keeps checkable words, drops codes, acronyms and short words, and splits hyphens', () => {
    expect(termWords('Adenocarcinoma of colon, HER2-positive (pT3N1)')).toEqual(['adenocarcinoma', 'colon', 'positive']);
    expect(termWords("Hodgkin's lymphoma, CD20 negative", CASE.SENSITIVE)).toEqual(['Hodgkin', 'lymphoma', 'negative']);
  });

  it('follows SNOMED CT case significance', () => {
    expect(termWords('Kaposi sarcoma', CASE.INITIAL_INSENSITIVE)).toEqual(['kaposi', 'sarcoma']);
    expect(termWords('Glomangioma of Masson', CASE.INITIAL_INSENSITIVE)).toEqual(['glomangioma', 'Masson']);
    expect(termWords('Angiomyxoma, Kaposiform', CASE.SENSITIVE)).toEqual(['Angiomyxoma', 'Kaposiform']);
    expect(termWords('Tumour Of Skin', CASE.INSENSITIVE)).toEqual(['tumour', 'skin']);
  });

  it('keeps two-syllable Korean words', () => {
    expect(termWords('담관암종 아형')).toEqual(['담관암종', '아형']);
  });

  it('reads the semantic tag from a fully specified name', () => {
    expect(semanticTag('Adenoma (morphologic abnormality)')).toBe('morphologic abnormality');
    expect(semanticTag('No tag here')).toBeUndefined();
  });
});

describe('US / UK spelling pairs', () => {
  it('rewrites UK spelling to US', () => {
    expect(['haemorrhage', 'oesophagus', 'tumours', 'colourless', 'anaesthetised', 'analysed', 'centre', 'labelled', 'catalogue'].map(toUsSpelling))
      .toEqual(['hemorrhage', 'esophagus', 'tumors', 'colorless', 'anesthetized', 'analyzed', 'center', 'labeled', 'catalog']);
  });

  it('pairs only words that both occur', () => {
    expect(spellingPairs(['haematoma', 'hematoma', 'oedema', 'fibre'])).toEqual([{ uk: 'haematoma', us: 'hematoma' }]);
  });

  it('keeps a pair only where this convention rejects the other spelling', () => {
    const pairs = [{ uk: 'haematoma', us: 'hematoma' }, { uk: 'metre', us: 'meter' }];
    const gb = conventionRules(pairs, 'GB', set(['metre', 'meter'])); // UK English accepts "meter" (the device)
    expect(gb.map).toEqual({ hematoma: 'haematoma' });
    expect([...gb.drop]).toEqual(['hematoma']);
    expect(conventionRules(pairs, 'US', set(['meter'])).map).toEqual({ haematoma: 'hematoma', metre: 'meter' });
    expect(conventionRules(pairs, 'both', set([])).map).toEqual({});
  });

  it('ships only words the general dictionary lacks, never the other spelling', () => {
    expect(wordsForLocale(['colon', 'hematoma', 'glomangioma', 'glomangioma'], { base: set(['colon']), drop: new Set(['hematoma']) }))
      .toEqual(['glomangioma']);
  });
});

describe('CSV', () => {
  it('handles quotes, doubled quotes and line breaks inside quotes', () => {
    expect([...parseCsv('"a","b ""c"", d","e\nf"\r\n1,2,3\n')]).toEqual([['a', 'b "c", d', 'e\nf'], ['1', '2', '3']]);
  });
});

describe('readers on the sample releases', () => {
  it('SPECIALIST Lexicon: every inflected form of every spelling', async () => {
    const { words, files } = await readSpecialist(path.join(FIXTURES, 'specialist'));
    expect(files).toHaveLength(1);
    expect([...words]).toEqual(expect.arrayContaining(['haematocolpos', 'hematocolpos', 'leiomyomatoses', 'Hodgkin', 'squamous']));
    expect(words.has('CD20')).toBe(false);
  });

  it('SNOMED CT: relevant hierarchies, active content, English dialects and national translations', async () => {
    const { byLocale, refsetsSeen } = await readSnomed(path.join(FIXTURES, 'snomed'), CONFIG.snomed);
    const us = byLocale.get('en-US');
    const gb = byLocale.get('en-GB');
    expect(us.has('chondroblastoma') && gb.has('chondroblastoma')).toBe(true);
    expect(us.has('hemosiderotic') && !us.has('haemosiderotic')).toBe(true);   // US refset only
    expect(gb.has('haemosiderotic') && !gb.has('hemosiderotic')).toBe(true);   // GB refset only
    for (const words of [us, gb]) {
      expect(words.has('glomangiomma')).toBe(false);   // inactive description
      expect(words.has('erronneoma')).toBe(false);     // inactive concept
      expect(words.has('microtomeblade')).toBe(false); // physical object: not a relevant hierarchy
    }
    expect([...byLocale.get('en-AU')]).toEqual([...gb]); // no Australian refset in the sample: UK English
    expect(byLocale.get('de-DE')).toEqual(new Set(['Chondroblastom', 'Hämosiderotische', 'Synovitis', 'Plattenepithelkarzinom', 'Präparat']));
    expect(refsetsSeen['999999999999999999']).toBe(1); // reported so it can be mapped
  });

  it('LOINC: pathology classes only, no deprecated codes, English to US and Canadian English, translations by language', async () => {
    const { byLocale } = await readLoinc(path.join(FIXTURES, 'loinc'), CONFIG.loinc);
    const en = byLocale.get('en-US');
    expect(en.has('cholangiocarcinoma') && en.has('paragangliomatous') && en.has('neuroendocrine')).toBe(true);
    expect(en.has('thrombocytopoietin')).toBe(false); // CHEM class
    expect(en.has('pseudomyxomatous')).toBe(false);   // deprecated
    expect(byLocale.has('en-GB')).toBe(false);        // LOINC is US English
    expect(byLocale.get('de-DE')).toEqual(new Set(['Cholangiokarzinom', 'Subtyp', 'Gewebe']));
    expect(byLocale.get('ko-KR')).toEqual(new Set(['담관암종', '아형']));
  });
});

describe('the build, end to end on the sample releases', { timeout: 120_000 }, () => {
  let out;
  let result;
  let factory;
  const engines = {};
  const engine = async locale => {
    if (!engines[locale]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
      const readFile = async p => new Uint8Array(fs.readFileSync(path.join(out, p)));
      engines[locale] = await loadSpellEngine(locale, { factory, manifest, readFile });
    }
    return engines[locale].tiers;
  };
  const verdict = async (locale, word) => checkWord(word, /\p{Script=Hangul}/u.test(word) ? 'hangul' : 'latin', await engine(locale));

  beforeAll(async () => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-spell-339-'));
    result = await main({ out, licensed: FIXTURES, quiet: true });
    factory = await loadModule();
  }, 120_000);

  it('writes clinical tiers and credits every source', () => {
    const { manifest } = result;
    expect(manifest.locales['en-GB'].clinical).toEqual({ dic: 'clinical/en-GB.dic' });
    expect(manifest.locales['de-DE'].clinical).toEqual({ dic: 'clinical/de-DE.dic' });
    expect(manifest.locales['ko-KR'].clinical).toEqual({ words: 'clinical/ko-KR.txt' });
    expect(manifest.locales['fr-FR'].clinical).toBeUndefined(); // nothing French in the samples
    expect(manifest.sources.map(s => s.name)).toEqual(expect.arrayContaining(['SPECIALIST Lexicon', 'SNOMED CT', 'LOINC']));
    const notice = fs.readFileSync(path.join(out, 'NOTICE.txt'), 'utf8');
    expect(notice).toContain('SNOMED Clinical Terms');
    expect(notice).toContain('Regenstrief Institute');
    expect(notice).toContain('National Library of Medicine');
    expect(result.warnings.some(w => w.includes('999999999999999999'))).toBe(true);
  });

  it('never copies the release files themselves', () => {
    const shipped = fs.readdirSync(out, { recursive: true }).map(String);
    expect(shipped.some(f => /sct2_|der2_|Loinc\.csv|LRAGR|LinguisticVariant/i.test(f))).toBe(false);
  });

  it('UK English: SNOMED words accepted and suggested; US forms flagged as regional variants', async () => {
    expect(await verdict('en-GB', 'chondroblastoma')).toEqual({ ok: true, tier: 'clinical' });
    expect(await verdict('en-GB', 'haemosiderotic')).toMatchObject({ ok: true });
    expect(await verdict('en-GB', 'hemosiderotic')).toEqual({ ok: false, reason: 'regionalVariant', preferred: 'haemosiderotic' });
    expect(await verdict('en-GB', 'hematocolpos')).toEqual({ ok: false, reason: 'regionalVariant', preferred: 'haematocolpos' });
    expect(await verdict('en-GB', 'meter')).toMatchObject({ ok: true }); // right in UK English too
    expect(await verdict('en-GB', 'glomangiomma')).toMatchObject({ ok: false, reason: 'misspelled' });
    expect(suggestWord('chondroblastomma', 'latin', await engine('en-GB'))[0]).toBe('chondroblastoma');
  });

  it('US English: SPECIALIST inflections and LOINC words accepted; UK forms flagged', async () => {
    expect(await verdict('en-US', 'leiomyomatoses')).toEqual({ ok: true, tier: 'medical' });
    expect(await verdict('en-US', 'paragangliomatous')).toEqual({ ok: true, tier: 'clinical' });
    expect(await verdict('en-US', 'haematocolpos')).toEqual({ ok: false, reason: 'regionalVariant', preferred: 'hematocolpos' });
    expect(await verdict('en-US', 'metre')).toEqual({ ok: false, reason: 'regionalVariant', preferred: 'meter' });
    expect(await verdict('en-US', 'Kaposiform')).toMatchObject({ ok: true });   // case-sensitive term
    expect(await verdict('en-US', 'kaposiform')).toMatchObject({ ok: false });
  });

  it('Canadian English accepts both spellings', async () => {
    for (const w of ['hemosiderotic', 'haemosiderotic', 'hematocolpos', 'haematocolpos']) expect(await verdict('en-CA', w)).toMatchObject({ ok: true });
  });

  it('German: medical terms from the national edition and LOINC close the base dictionary gap', async () => {
    expect(await verdict('de-DE', 'Plattenepithelkarzinom')).toEqual({ ok: true, tier: 'clinical' });
    expect(await verdict('de-DE', 'Cholangiokarzinom')).toEqual({ ok: true, tier: 'clinical' });
    expect(suggestWord('Plattenepitelkarzinom', 'latin', await engine('de-DE'))).toContain('Plattenepithelkarzinom');
  });

  it('Korean: LOINC translations accepted, with particles', async () => {
    expect(await verdict('ko-KR', '담관암종')).toEqual({ ok: true, tier: 'clinical' });
    expect(await verdict('ko-KR', '담관암종이')).toEqual({ ok: true, tier: 'clinical' });
  });
});

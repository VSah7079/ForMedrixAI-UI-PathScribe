// src/services/spellcheck/spellEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): builds the cascade tiers (spellCascade.ts) for one
// spelling language from the dictionary files in public/spellcheck/
// (scripts/spellcheck/build-spellcheck-assets.mjs), using real Hunspell
// compiled to WebAssembly (@farscrl/hunspell-wasm; Hunspell 1.7, MPL-1.1).
//
//   base tier     — Hunspell over the base .aff + .dic
//   medical tier  — a second Hunspell over the same .aff + the medical .dic,
//                   so medical words get plurals/possessives and appear in
//                   suggestions; Korean uses a word list instead
//   clinical tier — SNOMED CT / LOINC words from the dictionary build
//                   (Batch 339): a third Hunspell over the base .aff, so
//                   they appear in suggestions (Korean: a word list); empty
//                   until the licensed sources are built in
//   personal / facility — word lists passed in by the caller
//
// Runs in the spell-check Web Worker (spellcheck.worker.ts) and in tests.
// File loading is injected (`readFile`) so the same code works with fetch
// in the browser and the filesystem in Node.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPTY_LOOKUP, wordSetLookup, type SpellTiers, type WordLookup } from './spellCascade';
import { SPELLING_LOCALES, type SpellingLocale } from './spellingLocales';

/** The subset of @farscrl/hunspell-wasm's factory this uses. */
export interface HunspellFactoryLike {
  mountBuffer(buffer: Uint8Array, fileName: string): string;
  create(affPath: string, dicPath: string): { spell(word: string): boolean; suggest(word: string): string[]; dispose(): void };
}

export interface SpellManifest {
  format: number;
  generatedAt: string;
  locales: Partial<Record<SpellingLocale, {
    base: { aff: string; dic: string };
    medical?: { dic?: string; words?: string };
    variants?: string;
    clinical?: { dic?: string; words?: string };
  }>>;
}

export type ReadFile = (relativePath: string) => Promise<Uint8Array>;

export interface CustomWords { personal: readonly string[]; facility: readonly string[] }

const decoder = new TextDecoder();
const wordLines = (bytes: Uint8Array) => decoder.decode(bytes).split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

let mountCounter = 0;
const hunspellLookup = (factory: HunspellFactoryLike, aff: Uint8Array, dic: Uint8Array, tag: string): WordLookup => {
  const id = `${tag}-${++mountCounter}`;
  const h = factory.create(factory.mountBuffer(aff, `${id}.aff`), factory.mountBuffer(dic, `${id}.dic`));
  return { has: w => h.spell(w), suggest: w => h.suggest(w) };
};

/** The other English convention's base locale (for regional-variant reporting). */
export function otherConventionLocale(locale: SpellingLocale): SpellingLocale | undefined {
  const c = SPELLING_LOCALES[locale].convention;
  return c === 'US' ? 'en-GB' : c === 'GB' ? 'en-US' : undefined;
}

export interface LoadedSpellEngine {
  locale: SpellingLocale;
  tiers: SpellTiers;
  /** Replaces the personal and facility word lists (the other tiers stay loaded). */
  setCustomWords(words: CustomWords): void;
}

/**
 * Loads one language. `depth` stops recursion: the Latin fallback and the
 * other-convention base are loaded without their own fallbacks.
 */
export async function loadSpellEngine(
  locale: SpellingLocale,
  deps: { factory: HunspellFactoryLike; manifest: SpellManifest; readFile: ReadFile },
  custom: CustomWords = { personal: [], facility: [] },
  depth = 0,
): Promise<LoadedSpellEngine> {
  const info = SPELLING_LOCALES[locale];
  const files = deps.manifest.locales[locale];
  if (!info.available || !files) throw new Error(`No spell-check dictionary for ${locale}`);

  const aff = await deps.readFile(files.base.aff);
  const base = hunspellLookup(deps.factory, aff, await deps.readFile(files.base.dic), `${locale}-base`);

  let medical: WordLookup = EMPTY_LOOKUP;
  if (files.medical?.dic) medical = hunspellLookup(deps.factory, aff, await deps.readFile(files.medical.dic), `${locale}-medical`);
  else if (files.medical?.words) medical = wordSetLookup(wordLines(await deps.readFile(files.medical.words)));

  let clinical: WordLookup = EMPTY_LOOKUP;
  if (files.clinical?.dic) clinical = hunspellLookup(deps.factory, aff, await deps.readFile(files.clinical.dic), `${locale}-clinical`);
  else if (files.clinical?.words) clinical = wordSetLookup(wordLines(await deps.readFile(files.clinical.words)));

  const otherConvention = files.variants
    ? new Map(Object.entries(JSON.parse(decoder.decode(await deps.readFile(files.variants))) as Record<string, string>))
    : undefined;

  let otherConventionBase: WordLookup | undefined;
  const other = otherConventionLocale(locale);
  const otherFiles = other ? deps.manifest.locales[other] : undefined;
  if (depth === 0 && otherFiles) {
    otherConventionBase = hunspellLookup(deps.factory, await deps.readFile(otherFiles.base.aff), await deps.readFile(otherFiles.base.dic), `${other}-other`);
  }

  const latinFallback = depth === 0 && info.latinFallback
    ? (await loadSpellEngine(info.latinFallback, deps, custom, depth + 1)).tiers
    : undefined;

  const tiers: SpellTiers = {
    script: info.script,
    personal: wordSetLookup(custom.personal),
    facility: wordSetLookup(custom.facility),
    medical,
    clinical,
    base,
    ...(otherConvention ? { otherConvention } : {}),
    ...(otherConventionBase ? { otherConventionBase } : {}),
    ...(latinFallback ? { latinFallback } : {}),
  };

  return {
    locale,
    tiers,
    setCustomWords(words) {
      tiers.personal = wordSetLookup(words.personal);
      tiers.facility = wordSetLookup(words.facility);
      if (tiers.latinFallback) {
        tiers.latinFallback.personal = tiers.personal;
        tiers.latinFallback.facility = tiers.facility;
      }
    },
  };
}

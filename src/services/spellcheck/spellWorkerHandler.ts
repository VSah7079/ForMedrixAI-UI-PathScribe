// src/services/spellcheck/spellWorkerHandler.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): the message protocol of the spell-check Web Worker
// (§2.3, AC4). Kept separate from the worker entry file so it runs and is
// tested in Node with the same code.
//
// The worker keeps one engine per spelling language (loaded on first use)
// and a verdict cache per language, cleared when the custom word lists
// change. The editor sends paragraphs ("blocks"); only blocks whose text
// changed need re-checking, and the client (SpellCheckClient.ts) skips
// unchanged ones before they reach the worker.
// ─────────────────────────────────────────────────────────────────────────────

import { checkText, suggestWord, type SpellIssue, type SpellVerdict } from './spellCascade';
import { loadSpellEngine, type CustomWords, type HunspellFactoryLike, type LoadedSpellEngine, type ReadFile, type SpellManifest } from './spellEngine';
import type { SpellingLocale } from './spellingLocales';
import type { SpellToken } from './tokenizeForSpelling';

export interface SpellBlock { key: string; text: string }

export type SpellRequest =
  | { id: number; type: 'init'; locale: SpellingLocale; custom?: CustomWords }
  | { id: number; type: 'setCustomWords'; custom: CustomWords }
  | { id: number; type: 'check'; locale: SpellingLocale; blocks: SpellBlock[] }
  | { id: number; type: 'suggest'; locale: SpellingLocale; word: string; script?: SpellToken['script'] };

export type SpellResponse =
  | { id: number; type: 'ready'; locale: SpellingLocale }
  | { id: number; type: 'checked'; results: { key: string; issues: SpellIssue[] }[] }
  | { id: number; type: 'suggestions'; suggestions: string[] }
  | { id: number; type: 'ok' }
  | { id: number; type: 'error'; message: string };

export function createSpellWorkerHandler(deps: {
  loadFactory: () => Promise<HunspellFactoryLike>;
  readFile: ReadFile;
}) {
  let factoryPromise: Promise<HunspellFactoryLike> | undefined;
  let manifestPromise: Promise<SpellManifest> | undefined;
  const engines = new Map<SpellingLocale, Promise<LoadedSpellEngine>>();
  const caches = new Map<SpellingLocale, Map<string, SpellVerdict>>();
  let custom: CustomWords = { personal: [], facility: [] };

  const manifest = () => (manifestPromise ??= deps.readFile('manifest.json').then(b => JSON.parse(new TextDecoder().decode(b)) as SpellManifest));
  const factory = () => (factoryPromise ??= deps.loadFactory());

  const engineFor = (locale: SpellingLocale) => {
    let e = engines.get(locale);
    if (!e) {
      e = Promise.all([factory(), manifest()]).then(([f, m]) => loadSpellEngine(locale, { factory: f, manifest: m, readFile: deps.readFile }, custom));
      e.catch(() => engines.delete(locale));
      engines.set(locale, e);
    }
    return e;
  };

  const cacheFor = (locale: SpellingLocale) => {
    let c = caches.get(locale);
    if (!c) { c = new Map(); caches.set(locale, c); }
    return c;
  };

  return async function handle(req: SpellRequest): Promise<SpellResponse> {
    try {
      switch (req.type) {
        case 'init':
          if (req.custom) custom = req.custom;
          await engineFor(req.locale);
          return { id: req.id, type: 'ready', locale: req.locale };
        case 'setCustomWords': {
          custom = req.custom;
          for (const e of engines.values()) (await e).setCustomWords(custom);
          caches.clear();
          return { id: req.id, type: 'ok' };
        }
        case 'check': {
          const engine = await engineFor(req.locale);
          const cache = cacheFor(req.locale);
          return { id: req.id, type: 'checked', results: req.blocks.map(b => ({ key: b.key, issues: checkText(b.text, engine.tiers, cache) })) };
        }
        case 'suggest': {
          const engine = await engineFor(req.locale);
          return { id: req.id, type: 'suggestions', suggestions: suggestWord(req.word, req.script ?? 'latin', engine.tiers) };
        }
      }
    } catch (e) {
      return { id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  };
}

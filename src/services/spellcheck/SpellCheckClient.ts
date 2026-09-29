// src/services/spellcheck/SpellCheckClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): the main-thread side of the spell checker. Talks to
// the Web Worker (spellcheck.worker.ts) with promises, so the editor never
// does dictionary work on the UI thread (AC4).
//
// Incremental: results are remembered per (language, paragraph text); only
// paragraphs the worker hasn't seen are sent. One shared client per page
// (getSpellCheckClient); the worker factory is injectable for tests.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpellIssue } from './spellCascade';
import type { CustomWords } from './spellEngine';
import type { SpellingLocale } from './spellingLocales';
import type { SpellBlock, SpellRequest, SpellResponse } from './spellWorkerHandler';
import type { SpellToken } from './tokenizeForSpelling';

export interface WorkerLike {
  postMessage(message: SpellRequest): void;
  onmessage: ((event: { data: SpellResponse }) => void) | null;
  terminate?(): void;
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/** How many distinct paragraphs to remember per language. */
export const RESULT_CACHE_LIMIT = 2000;

export class SpellCheckClient {
  private nextId = 1;
  private pending = new Map<number, (r: SpellResponse) => void>();
  private results = new Map<SpellingLocale, Map<string, SpellIssue[]>>();
  private worker: WorkerLike;

  constructor(createWorker: () => WorkerLike) {
    this.worker = createWorker();
    this.worker.onmessage = ({ data }) => {
      const resolve = this.pending.get(data.id);
      if (resolve) { this.pending.delete(data.id); resolve(data); }
    };
  }

  private send(req: DistributiveOmit<SpellRequest, 'id'>): Promise<SpellResponse> {
    const id = this.nextId++;
    return new Promise(resolve => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...req, id } as SpellRequest);
    });
  }

  private static fail(r: SpellResponse): never {
    throw new Error(r.type === 'error' ? r.message : `Unexpected spell-check response: ${r.type}`);
  }

  /** Loads a language (and the custom words) ahead of the first check. */
  async prepare(locale: SpellingLocale, custom?: CustomWords): Promise<void> {
    const r = await this.send({ type: 'init', locale, ...(custom ? { custom } : {}) });
    if (r.type !== 'ready') SpellCheckClient.fail(r);
  }

  async setCustomWords(custom: CustomWords): Promise<void> {
    const r = await this.send({ type: 'setCustomWords', custom });
    if (r.type !== 'ok') SpellCheckClient.fail(r);
    this.results.clear();
  }

  /** Issues per block; unchanged paragraphs are answered from memory. */
  async check(locale: SpellingLocale, blocks: SpellBlock[]): Promise<Map<string, SpellIssue[]>> {
    let known = this.results.get(locale);
    if (!known) { known = new Map(); this.results.set(locale, known); }
    const out = new Map<string, SpellIssue[]>();
    const toSend: SpellBlock[] = [];
    for (const b of blocks) {
      const hit = known.get(b.text);
      if (hit) out.set(b.key, hit); else toSend.push(b);
    }
    if (toSend.length) {
      const r = await this.send({ type: 'check', locale, blocks: toSend });
      if (r.type !== 'checked') SpellCheckClient.fail(r);
      const byKey = new Map(toSend.map(b => [b.key, b.text]));
      for (const { key, issues } of r.results) {
        out.set(key, issues);
        const text = byKey.get(key);
        if (text !== undefined) {
          if (known.size >= RESULT_CACHE_LIMIT) known.delete(known.keys().next().value as string);
          known.set(text, issues);
        }
      }
    }
    return out;
  }

  async suggest(locale: SpellingLocale, word: string, script: SpellToken['script'] = 'latin'): Promise<string[]> {
    const r = await this.send({ type: 'suggest', locale, word, script });
    if (r.type !== 'suggestions') SpellCheckClient.fail(r);
    return r.suggestions;
  }

  dispose(): void {
    this.worker.terminate?.();
    this.pending.clear();
  }
}

let shared: SpellCheckClient | undefined;

/** The page's shared client, backed by the real Web Worker. */
export function getSpellCheckClient(): SpellCheckClient {
  return (shared ??= new SpellCheckClient(
    () => new Worker(new URL('./spellcheck.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  ));
}

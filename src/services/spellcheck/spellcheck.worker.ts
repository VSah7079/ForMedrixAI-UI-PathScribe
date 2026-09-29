// src/services/spellcheck/spellcheck.worker.ts
// PS-342 (Batch 336): the spell-check Web Worker entry (§2.3). Dictionaries
// are fetched from PathScribe's own static files (public/spellcheck/), so no
// outside host is involved (private-cloud safe).
import { loadModule } from '@farscrl/hunspell-wasm';
import { createSpellWorkerHandler, type SpellRequest } from './spellWorkerHandler';
import type { HunspellFactoryLike } from './spellEngine';

const base = `${import.meta.env.BASE_URL ?? '/'}spellcheck/`;

const handle = createSpellWorkerHandler({
  loadFactory: async () => (await loadModule()) as unknown as HunspellFactoryLike,
  readFile: async path => {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`Spell-check dictionary file not found: ${path}`);
    return new Uint8Array(await res.arrayBuffer());
  },
});

self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  (self as unknown as Worker).postMessage(await handle(event.data));
};

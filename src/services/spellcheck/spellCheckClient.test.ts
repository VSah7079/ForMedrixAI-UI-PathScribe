// src/services/spellcheck/spellCheckClient.test.ts — PS-342 (Batch 336): client ↔ worker protocol.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from '@farscrl/hunspell-wasm';
import { SpellCheckClient, type WorkerLike } from './SpellCheckClient';
import { createSpellWorkerHandler, type SpellRequest } from './spellWorkerHandler';
import type { HunspellFactoryLike } from './spellEngine';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/spellcheck');

function inProcessWorker(withoutLocale?: string): WorkerLike & { sent: SpellRequest[] } {
  const handle = createSpellWorkerHandler({
    loadFactory: async () => (await loadModule()) as unknown as HunspellFactoryLike,
    readFile: async p => {
      const bytes = readFileSync(resolve(PUBLIC, p));
      if (p !== 'manifest.json' || !withoutLocale) return new Uint8Array(bytes);
      const m = JSON.parse(bytes.toString('utf8'));
      delete m.locales[withoutLocale];
      return new TextEncoder().encode(JSON.stringify(m));
    },
  });
  const w: WorkerLike & { sent: SpellRequest[] } = {
    sent: [],
    onmessage: null,
    postMessage(req) { w.sent.push(req); handle(req).then(res => w.onmessage?.({ data: res })); },
  };
  return w;
}

describe('SpellCheckClient', { timeout: 30_000 }, () => {
  it('checks paragraphs in the worker, answers unchanged ones from memory, and suggests', async () => {
    const worker = inProcessWorker();
    const client = new SpellCheckClient(() => worker);
    await client.prepare('en-GB', { personal: [], facility: ['megablock'] });
    const first = await client.check('en-GB', [
      { key: 'p1', text: 'Oesophageal mucosa with dysplsia.' },
      { key: 'p2', text: 'Hematology megablock.' },
    ]);
    expect(first.get('p1')!.map(i => i.word)).toEqual(['dysplsia']);
    expect(first.get('p2')!.map(i => [i.word, i.reason])).toEqual([['Hematology', 'regionalVariant']]);
    const sentBefore = worker.sent.length;
    const second = await client.check('en-GB', [{ key: 'p1', text: 'Oesophageal mucosa with dysplsia.' }, { key: 'p3', text: 'Clean text.' }]);
    expect(worker.sent.length).toBe(sentBefore + 1);
    expect((worker.sent[worker.sent.length - 1] as Extract<SpellRequest, { type: 'check' }>).blocks.map(b => b.key)).toEqual(['p3']);
    expect(second.get('p1')!.map(i => i.word)).toEqual(['dysplsia']);
    expect(await client.suggest('en-GB', 'dysplsia')).toContain('dysplasia');
    await client.setCustomWords({ personal: ['dysplsia'], facility: [] });
    expect((await client.check('en-GB', [{ key: 'p1', text: 'Oesophageal mucosa with dysplsia.' }])).get('p1')).toEqual([]);
  });

  it('reports a language whose dictionary is missing from the build as an error', async () => {
    const client = new SpellCheckClient(() => inProcessWorker('nl-NL'));
    await expect(client.prepare('nl-NL')).rejects.toThrow('No spell-check dictionary for nl-NL');
  });
});

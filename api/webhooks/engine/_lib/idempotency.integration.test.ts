// api/webhooks/engine/_lib/idempotency.integration.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Firestore emulator integration test — see
// applyEngineCaseUpdate.integration.test.ts's own header for full
// setup instructions.
//
// Real, worth naming directly: the "Idempotency Collision" scenario
// (duplicate messageId in processed_messages) exercises
// claimMessageId() in THIS file, not upsertEngraverStatus.ts —
// upsertEngraverStatus.ts has no idea what a messageId even is; that
// check happens once, at the top of every endpoint handler, before
// any endpoint-specific logic (mutation or upsert) ever runs. Filed
// here so the test lives next to the real function it's proving,
// not the nearest endpoint that happens to call it.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import { claimMessageId } from './idempotency';

const EMULATOR_RUNNING = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR_RUNNING)('claimMessageId — real Firestore emulator integration', () => {
  // Same real "lazy init in beforeAll, never at describe-body level"
  // fix as applyEngineCaseUpdate.integration.test.ts's own header
  // explains in full — confirmed necessary by hitting the real
  // failure directly before this fix existed.
  let db: Firestore;
  beforeAll(() => { db = getAdminFirestore(); });
  const runId = Date.now();
  const messageId = (suffix: string) => `INTEGRATION-TEST-MSG-${runId}-${suffix}`;
  const createdIds: string[] = [];

  afterAll(async () => {
    await Promise.all(createdIds.map(id => db.collection('processed_messages').doc(id).delete()));
  });

  it('a real, duplicate messageId fails the second create() and is reported as already processed', async () => {
    const id = messageId('duplicate');
    createdIds.push(id);

    const first = await claimMessageId(id, 'integration-test');
    expect(first.alreadyProcessed).toBe(false);

    const second = await claimMessageId(id, 'integration-test');
    expect(second.alreadyProcessed).toBe(true);

    // Real, the actual point of this test - exactly ONE document
    // exists for this messageId, never two, regardless of how many
    // times claimMessageId was called for it.
    const snap = await db.collection('processed_messages').doc(id).get();
    expect(snap.exists).toBe(true);
  });

  it('two genuinely concurrent claims for the same messageId — only one ever reports alreadyProcessed: false', async () => {
    const id = messageId('concurrent-claim');
    createdIds.push(id);

    // Real, genuinely concurrent - both calls race against the same
    // real Firestore create(); exactly one must win.
    const [a, b] = await Promise.all([
      claimMessageId(id, 'integration-test'),
      claimMessageId(id, 'integration-test'),
    ]);

    const alreadyProcessedCount = [a, b].filter(r => r.alreadyProcessed).length;
    const freshCount = [a, b].filter(r => !r.alreadyProcessed).length;
    expect(freshCount).toBe(1);
    expect(alreadyProcessedCount).toBe(1);
  });

  it('two different, real messageIds never collide with each other', async () => {
    const idA = messageId('distinct-a');
    const idB = messageId('distinct-b');
    createdIds.push(idA, idB);

    const resultA = await claimMessageId(idA, 'integration-test');
    const resultB = await claimMessageId(idB, 'integration-test');

    expect(resultA.alreadyProcessed).toBe(false);
    expect(resultB.alreadyProcessed).toBe(false);
  });
});

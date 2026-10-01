// api/webhooks/engine/_lib/applyEngineCaseUpdate.integration.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real integration tests against a real, local Firestore emulator —
// deliberately NOT run as part of the normal unit test suite
// (block-exception.test.ts etc. mock this function entirely). These
// exercise applyEngineCaseUpdate.ts's own real runTransaction() call
// against real Firestore transaction semantics, which no mock can
// genuinely stand in for — concurrent-write conflict retry and the
// real version-increment guarantee specifically.
//
// ── Setup (once, on your own machine — this file cannot run this
// itself, and does not run in a normal `npm test`) ──
//   npm install -g firebase-tools
//   firebase emulators:start --only firestore
// Then, in a separate terminal, with the emulator still running:
//   $env:FIRESTORE_EMULATOR_HOST = "localhost:8080"
//   $env:GCLOUD_PROJECT = "pathscribe-emulator-test"
//   npx vitest run api/webhooks/engine/_lib/applyEngineCaseUpdate.integration.test.ts
//
// Or, single command, using firebase-tools' own start-run-teardown
// wrapper (recommended — see package.json's own "test:integration"
// script):
//   firebase emulators:exec --only firestore "npx vitest run **/*.integration.test.ts"
//
// This file's own describe block is deliberately skipped (not failed)
// when FIRESTORE_EMULATOR_HOST isn't set, so a normal `npm test` run
// on a machine without the emulator running stays green and simply
// doesn't execute these — see the skipIf below.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import { applyEngineCaseUpdate } from './applyEngineCaseUpdate';

const EMULATOR_RUNNING = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR_RUNNING)('applyEngineCaseUpdate — real Firestore emulator integration', () => {
  // Real, deliberate lazy init inside beforeAll, NOT a top-level
  // `const db = getAdminFirestore()` in the describe body — a
  // describe() callback body runs eagerly to register child tests
  // EVEN WHEN skipIf is true (that's how the test runner discovers
  // what to skip); only hook/it bodies actually respect the skip.
  // Calling getAdminFirestore() directly here would throw on every
  // normal `npm test` run with no emulator configured, failing this
  // whole file instead of cleanly skipping it — confirmed directly by
  // hitting exactly that failure before this fix.
  let db: Firestore;
  beforeAll(() => { db = getAdminFirestore(); });

  // Real, unique-per-run case IDs so repeated local runs never collide
  // with leftover state from a prior run that wasn't cleaned up —
  // simpler and safer than relying on a full emulator data wipe
  // between every single test.
  const runId = Date.now();
  const caseId = (suffix: string) => `INTEGRATION-TEST-${runId}-${suffix}`;

  afterAll(async () => {
    // Real, best-effort cleanup — deletes only the specific documents
    // this file itself created, never a blanket emulator wipe (which
    // would also nuke any other suite's data if run concurrently).
    const snap = await db.collection('cases').where('__testRunId', '==', runId).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
  });

  it('concurrent mutations against the same case both apply, with a real, deterministic version increment', async () => {
    const id = caseId('concurrent');
    await db.collection('cases').doc(id).set({
      __testRunId: runId,
      version: 0,
      specimens: [
        {
          id: 'SP-1', label: 'A', description: 'Test',
          blocks: [
            { id: 'BLK-1', label: '1', status: 'Grossed' },
            { id: 'BLK-2', label: '2', status: 'Grossed' },
          ],
        },
      ],
    });

    // Real, genuinely concurrent — both transactions start against
    // version 0; Firestore's own real transaction retry logic (not
    // anything this app implements) is what has to make both of these
    // land without one silently overwriting the other.
    const [resultA, resultB] = await Promise.all([
      applyEngineCaseUpdate(id, (specimens) => ({
        field: 'specimens',
        specimens: specimens.map((sp: any) => ({
          ...sp,
          blocks: sp.blocks.map((b: any) => b.id === 'BLK-1' ? { ...b, status: 'Lost' } : b),
        })),
      })),
      applyEngineCaseUpdate(id, (specimens) => ({
        field: 'specimens',
        specimens: specimens.map((sp: any) => ({
          ...sp,
          blocks: sp.blocks.map((b: any) => b.id === 'BLK-2' ? { ...b, status: 'Damaged' } : b),
        })),
      })),
    ]);

    expect(resultA.outcome).toBe('applied');
    expect(resultB.outcome).toBe('applied');

    const finalDoc = await db.collection('cases').doc(id).get();
    const finalData = finalDoc.data()!;

    // Real, deterministic — two real, sequential transactions against
    // the same document means version 0 -> 1 -> 2, never landing on 1
    // twice and never skipping to a number that implies a lost write.
    expect(finalData.version).toBe(2);

    // Real, the actual point of this test — BOTH real mutations must
    // be present in the final state. A real lost-update bug (the
    // second transaction reading stale, pre-BLK-1-change data and
    // blindly overwriting it) would show BLK-1 back at 'Grossed' here.
    const finalSpecimen = finalData.specimens[0];
    const block1 = finalSpecimen.blocks.find((b: any) => b.id === 'BLK-1');
    const block2 = finalSpecimen.blocks.find((b: any) => b.id === 'BLK-2');
    expect(block1.status).toBe('Lost');
    expect(block2.status).toBe('Damaged');
  });

  it('returns case-not-found for a real, non-existent case, and writes nothing', async () => {
    const id = caseId('nonexistent');
    // Deliberately never created — this id has never had a
    // db.collection('cases').doc(id).set(...) call made against it.

    const result = await applyEngineCaseUpdate(id, (specimens) => ({ field: 'specimens', specimens }));

    expect(result.outcome).toBe('case-not-found');

    const doc = await db.collection('cases').doc(id).get();
    expect(doc.exists).toBe(false);
  });

  it('returns target-not-found and writes nothing when the mutate callback finds no real match', async () => {
    const id = caseId('no-target');
    await db.collection('cases').doc(id).set({
      __testRunId: runId, version: 0,
      specimens: [{ id: 'SP-1', label: 'A', blocks: [] }],
    });

    const result = await applyEngineCaseUpdate(id, () => null);

    expect(result.outcome).toBe('target-not-found');

    const doc = await db.collection('cases').doc(id).get();
    // Real, deliberate check: version must remain 0 — a
    // target-not-found outcome must never still bump the version or
    // touch updatedAt, since nothing real was actually applied.
    expect(doc.data()!.version).toBe(0);
  });
});

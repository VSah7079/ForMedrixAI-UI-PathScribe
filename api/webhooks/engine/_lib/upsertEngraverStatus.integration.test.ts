// api/webhooks/engine/_lib/upsertEngraverStatus.integration.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Firestore emulator integration tests — see
// applyEngineCaseUpdate.integration.test.ts's own header for full
// setup instructions; identical here. This file specifically proves
// the real staleness guard (unit-tested against a mocked transaction
// in upsertEngraverStatus.test.ts) actually holds against real
// Firestore read-then-compare-then-write semantics, not just the
// mock's own simulated tx.get()/tx.set().
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import { upsertEngraverStatus } from './upsertEngraverStatus';

const EMULATOR_RUNNING = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR_RUNNING)('upsertEngraverStatus — real Firestore emulator integration', () => {
  // Same real "lazy init in beforeAll, never at describe-body level"
  // fix as applyEngineCaseUpdate.integration.test.ts's own header
  // explains in full — confirmed necessary by hitting the real
  // failure directly before this fix existed.
  let db: Firestore;
  beforeAll(() => { db = getAdminFirestore(); });
  const runId = Date.now();
  const deviceId = (suffix: string) => `INTEGRATION-TEST-ENGRAVER-${runId}-${suffix}`;
  const createdDeviceIds: string[] = [];

  afterAll(async () => {
    await Promise.all(createdDeviceIds.map(id => db.collection('engraver_devices').doc(id).delete()));
  });

  const baseInput = (id: string, timestamp: string) => {
    createdDeviceIds.push(id);
    return {
      deviceId: id, organisationId: 'ORG-TEST', status: 'warning' as const,
      sourceSystem: 'INTEGRATION_TEST', timestamp,
    };
  };

  it('out-of-order watermarking: a delayed, older-timestamped event never overwrites a real, newer one', async () => {
    const id = deviceId('watermark');
    const tNow = '2026-08-27T12:00:00.000Z';
    const tPast = '2026-08-27T11:00:00.000Z'; // genuinely earlier - simulates a delayed retry

    const firstOutcome = await upsertEngraverStatus({ ...baseInput(id, tNow), warnings: ['Cover Open'] });
    expect(firstOutcome).toBe('applied');

    // Real, delayed delivery - this arrives SECOND in wall-clock time,
    // but describes something that happened BEFORE the first event.
    const secondOutcome = await upsertEngraverStatus({ ...baseInput(id, tPast), warnings: ['Should never appear'] });
    expect(secondOutcome).toBe('stale-ignored');

    const finalDoc = await db.collection('engraver_devices').doc(id).get();
    const finalData = finalDoc.data()!;

    // Real, the actual point of this test - the NEWER event's own
    // data must still be what's stored, not the stale one that
    // arrived later.
    expect(finalData.lastReportedAt).toBe(tNow);
    expect(finalData.warnings).toEqual(['Cover Open']);
  });

  it('a genuinely newer event after an older one is real, and does apply', async () => {
    const id = deviceId('newer-wins');
    const tEarlier = '2026-08-27T09:00:00.000Z';
    const tLater = '2026-08-27T10:00:00.000Z';

    await upsertEngraverStatus(baseInput(id, tEarlier));
    const outcome = await upsertEngraverStatus({ ...baseInput(id, tLater), status: 'fault' });
    expect(outcome).toBe('applied');

    const finalDoc = await db.collection('engraver_devices').doc(id).get();
    expect(finalDoc.data()!.status).toBe('fault');
    expect(finalDoc.data()!.lastReportedAt).toBe(tLater);
  });

  it('the very first real report for a device is always applied, regardless of timestamp', async () => {
    const id = deviceId('first-ever');
    const outcome = await upsertEngraverStatus(baseInput(id, '2020-01-01T00:00:00.000Z'));
    expect(outcome).toBe('applied');
  });
});

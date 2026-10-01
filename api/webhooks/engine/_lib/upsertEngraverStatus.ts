// api/webhooks/engine/_lib/upsertEngraverStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, deliberately different shape from applyEngineCaseUpdate.ts:
// engraver status is CURRENT STATE (one real, live document per real
// device, upserted), not an append-only event log the way a case
// mutation or a pending notification is. A real Engine may report
// status on a fast interval or a real change-triggered basis — this
// function's own job is making sure a real, out-of-order redelivery
// (a delayed retry arriving after a newer, real status already
// landed) can never silently overwrite newer state with older state.
//
// Real, deliberate choice: staleness is judged by the EVENT's own
// timestamp field, not by write-arrival order (Firestore's own
// timestamp), since a real Engine's retries can arrive in any order
// relative to a newer, real status change that happened to send
// cleanly on the first try.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from './firebaseAdmin';
import type { EngraverStatus, SupplyWarning } from '../../../../src/types/events/EngraverStatusEventPayload';

const COLLECTION_NAME = 'engraver_devices';

export interface UpsertEngraverStatusInput {
  deviceId: string;
  deviceName?: string;
  locationLabel?: string;
  organisationId: string;
  siteId?: string;
  status: EngraverStatus;
  supplyWarnings?: SupplyWarning[];
  warnings?: string[];
  diagnosticsUrl?: string;
  sourceSystem: string;
  timestamp: string;
}

export type UpsertEngraverStatusOutcome = 'applied' | 'stale-ignored';

export async function upsertEngraverStatus(input: UpsertEngraverStatusInput): Promise<UpsertEngraverStatusOutcome> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION_NAME).doc(input.deviceId);

  return db.runTransaction(async (tx): Promise<UpsertEngraverStatusOutcome> => {
    const snap = await tx.get(ref);
    const currentTimestamp: string | undefined = snap.exists ? snap.data()?.lastReportedAt : undefined;

    // Real, deliberate staleness guard — an older, real event arriving
    // after a newer one already landed is dropped, not applied. A
    // genuinely equal timestamp (a real, exact redelivery) is treated
    // as stale too — nothing new to apply either way.
    if (currentTimestamp && input.timestamp <= currentTimestamp) {
      return 'stale-ignored';
    }

    tx.set(ref, {
      deviceId: input.deviceId,
      deviceName: input.deviceName ?? null,
      locationLabel: input.locationLabel ?? null,
      organisationId: input.organisationId,
      siteId: input.siteId ?? null,
      status: input.status,
      supplyWarnings: input.supplyWarnings ?? [],
      warnings: input.warnings ?? [],
      diagnosticsUrl: input.diagnosticsUrl ?? null,
      sourceSystem: input.sourceSystem,
      lastReportedAt: input.timestamp,
    }, { merge: true });

    return 'applied';
  });
}

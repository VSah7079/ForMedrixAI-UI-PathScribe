// src/services/engravers/fetchEngraverDevices.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, read-only fetch of current engraver device status — the
// Engraver Monitor's own data source (Batch Management), fed entirely
// by api/webhooks/engine/engraver-status.ts's own real upserts into
// the engraver_devices collection. This file never writes anything;
// PathScribe's own confirmed role here is read-only display, per the
// Engraver Monitor's own architectural verdict.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import type { EngraverStatus, SupplyWarning } from '@/types/events/EngraverStatusEventPayload';

export interface EngraverDevice {
  deviceId: string;
  deviceName: string | null;
  locationLabel: string | null;
  organisationId: string;
  siteId: string | null;
  status: EngraverStatus;
  supplyWarnings: SupplyWarning[];
  warnings: string[];
  diagnosticsUrl: string | null;
  sourceSystem: string;
  lastReportedAt: string;
}

const COLLECTION_NAME = 'engraver_devices';

export async function fetchEngraverDevices(): Promise<EngraverDevice[]> {
  const snap = await getDocs(collection(db, COLLECTION_NAME));
  return snap.docs.map(d => d.data() as EngraverDevice);
}

// src/services/molecular/dispatchMolecularWorklist.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Implement the real interface-engine
// connection" — now built against the real, settled architecture
// documented in PS-239 (the Interface Engine Integration epic), not
// the earlier honest stub this file used to be.
//
// Real, per the architecture PS-239 settled directly: PathScribe's own
// browser code never talks to a lab's interface engine directly — for
// real, non-negotiable reasons (credentials never belong in client
// code; hospital networks rarely let a browser reach an engine's own
// port; CORS on a legacy/third-party engine is real deployment
// friction no lab should have to solve). This file's own real job is
// therefore exactly one thing: a real, working HTTP client that POSTs
// PathScribe's own domain JSON to PathScribe's own backend API. What
// happens after that — auth injection, mTLS, the actual server-to-
// server call to the real Interface Engine (OIE) — is real, separate
// backend work this file cannot see or perform, the same real
// boundary dispatchNetworkPrintJob.ts's own header already draws for
// the print-dispatch case.
//
// Real, per direct guidance: the real routing metadata
// (FacilityLisRouting — sendingFacilityId/receivingFacilityId) is
// resolved from the real, current session's own facility and sent
// alongside the payload, the same real "both ids in every real
// payload" requirement FacilityLisRouting's own doc comment states —
// this app's own backend needs it to route the message once it
// reaches a real Interface Engine, even though this file itself never
// touches FacilityInterfaceEngineConnection (the engine's own
// endpoint/credentials) at all — that field is real, Enterprise-level
// backend configuration, not something the browser ever needs to see.
//
// Real, per the given specification's own §3.4: still gated on scan
// verification (resolveMolecularScanVerification.ts) — a real caller
// must have already confirmed the plate and deck location barcodes
// match before this function will actually dispatch anything. That
// real requirement is unchanged by this file's own real network
// upgrade.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveMolecularWorklistPayload } from './resolveMolecularWorklistPayload';
import { resolveMolecularScanVerification } from './resolveMolecularScanVerification';
import { mockEquipmentService } from '../equipment/mockEquipmentService';
import { checkEquipmentStation } from '../equipment/equipmentRules';
import { mockMolecularBatchService } from './mockMolecularBatchService';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { resolveTenantFacility } from '../auth/resolveTenantFacility';
import { resolveLisRoutingForFacility } from '../facilities/IFacilityService';
import type { MolecularBatch } from './IMolecularBatchService';
import type { MolecularWorklistPayload } from '@/types/events/MolecularWorklistPayload';
import type { SessionUser } from '../auth/caseAccessControl';

export interface DispatchMolecularWorklistResult {
  dispatched: true;
  payload: MolecularWorklistPayload;
}
export interface DispatchMolecularWorklistError {
  dispatched: false;
  reason: string;
  /** Batch 356: which scan checks failed, so the screen can say so in the
   *  user's language (reason stays English, for logs). */
  verificationFailures?: Array<'plate' | 'deck' | 'station'>;
}

// Real, per this file's own header — matches the given specification's
// own "/api/v1/events/{event-name}" convention (PS-239's own worked
// example, "POST /api/v1/events/pathology-result").
const MOLECULAR_WORKLIST_ENDPOINT = '/api/v1/events/molecular-worklist';

/**
 * Real, per this file's own header — requires a real, passed scan
 * verification of both the plate barcode and the deck location before
 * dispatching anything (§3.4). A real failure here is a real refusal,
 * never a silent partial dispatch. On a real pass, POSTs the real
 * worklist payload — plus real routing metadata resolved from the
 * current real session's own facility — to PathScribe's own backend
 * API. A real network failure or a real non-2xx response is an
 * honest, specific error, never a silently-assumed success.
 */
export async function dispatchMolecularWorklist(
  batch: MolecularBatch,
  scannedPlateBarcode: string | undefined,
  scannedDeckLocationLabel: string | undefined,
  session: SessionUser | null,
  /** Batch 356 (PS-326): this device's scan station, checked against the
   *  target instrument's station when both are known. */
  currentStationId?: string | null,
): Promise<DispatchMolecularWorklistResult | DispatchMolecularWorklistError> {
  const instrumentRes = await mockEquipmentService.getByCode(batch.targetInstrumentId);
  const stationVerified = checkEquipmentStation(instrumentRes.ok ? instrumentRes.data : undefined, currentStationId);
  const verification = resolveMolecularScanVerification(batch, scannedPlateBarcode, scannedDeckLocationLabel, stationVerified);
  if (!verification.fullyVerified) {
    const failures: string[] = [];
    const codes: Array<'plate' | 'deck' | 'station'> = [];
    if (!verification.plateVerified) { failures.push('plate barcode did not match'); codes.push('plate'); }
    if (!verification.deckLocationVerified) { failures.push('deck location did not match'); codes.push('deck'); }
    if (verification.stationVerified === false) { failures.push("this workstation is not the instrument's scan station"); codes.push('station'); }
    return { dispatched: false, reason: `Scan verification failed — ${failures.join('; ')}.`, verificationFailures: codes };
  }

  const payload = resolveMolecularWorklistPayload(batch);

  // Real, per this file's own header — resolved from the real,
  // current session; genuinely absent (undefined) when no real
  // facility resolves, rather than a fabricated placeholder.
  const facilitiesRes = await mockFacilityService.getAll();
  const enterpriseFacilities = facilitiesRes.ok ? facilitiesRes.data : [];
  const facility = resolveTenantFacility(session?.organisationId, enterpriseFacilities);
  const routing = facility ? resolveLisRoutingForFacility(facility, enterpriseFacilities) : undefined;

  let response: Response;
  try {
    response = await fetch(MOLECULAR_WORKLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, routing }),
    });
  } catch (networkError) {
    // Real, honest failure — a genuine network-level error (host
    // unreachable, DNS failure, offline), never silently treated as a
    // successful dispatch.
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    return { dispatched: false, reason: `Could not reach PathScribe's own backend to dispatch this worklist: ${message}` };
  }

  if (!response.ok) {
    return { dispatched: false, reason: `PathScribe's own backend rejected this worklist dispatch — HTTP ${response.status}.` };
  }

  await mockMolecularBatchService.updateByUuid(batch.batchUuid, { worklistDispatchedAt: new Date().toISOString() });

  return { dispatched: true, payload };
}

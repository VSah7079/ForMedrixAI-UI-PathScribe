// src/services/patientHistory/IPatientHistoryLisService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "The API approach probably makes sense
// for PathScribe in assist mode since we are already querying the
// case data from the LIS." Confirmed directly first:
// services/cases/FHIRCaseService.ts is exactly that real, existing
// mechanism — a real (currently stubbed, pre-go-live) FHIR R4 client
// for Assist-mode case queries. This interface is the same real
// query pattern, extended to a patient's PRIOR reports (FHIR's own
// DiagnosticReport, filtered by patient reference, sorted by date) —
// never a second, parallel LIS connection.
//
// Real, per direct guidance's own hard requirement: "It has to be
// safe though. TLS all the way including testing." Mirrors
// FHIRCaseService.ts's own already-documented compliance posture
// exactly (TLS 1.2+, enforced by HTTPS in the endpoint URL) — see
// this file's own resolveIsSecureLisEndpoint.ts for the one real,
// enforceable piece of that a frontend type/interface can actually
// guarantee: refusing to even attempt a fetch against a
// non-HTTPS-configured endpoint. The real TLS handshake itself, real
// certificate validation, and real penetration/config testing are
// real backend/infra work no frontend mock can perform or verify —
// tracked honestly, not silently assumed done, on the Backend Needs
// Log (see this folder's own README).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { PatientHistoryReport } from '@/types/patientHistory/PatientHistoryCacheEntry';

export interface IPatientHistoryLisService {
  /** Real, per FHIRCaseService.ts's own existing patient-lookup
   *  convention — keyed on MRN (the real, stable cross-system
   *  identifier), not PathScribe's own internal patientId, since the
   *  real LIS this queries has no knowledge of PathScribe's own ids. */
  fetchPatientHistory(mrn: string): Promise<ServiceResult<PatientHistoryReport[]>>;
}

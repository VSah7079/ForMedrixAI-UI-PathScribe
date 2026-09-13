// src/services/cases/IOnDemandCaseFetchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own full "On-Demand Fetch & Fallback"
// design: local cache miss on a scanned/typed/spoken accession number
// falls back to a real, live LIS fetch. Confirmed directly: Option A
// (REST/FHIR API) — "a client sophisticated enough to want a
// synoptic tool" can provide one — over Option B (direct read-only DB
// query, a real customer security/access concern beyond PathScribe's
// own code) or Option C (HL7 QRY^R02/QBP^Q21, a genuinely different,
// synchronous request-response integration shape than anything else
// in this app's own event-driven HL7 handling).
//
// Real, deliberate reuse: this is the exact same real query pattern
// FHIRCaseService.ts already establishes for Assist-mode case data —
// never a second, parallel LIS connection. Same real TLS posture as
// services/patientHistory/ — see resolveIsSecureLisEndpoint.ts there,
// reused directly, not reinvented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { ServiceResult } from '../types';

export type OnDemandCaseFetchOutcome =
  | { outcome: 'found'; caseData: Case }
  | { outcome: 'not_found' }
  | { outcome: 'refused_insecure_endpoint' };

export interface IOnDemandCaseFetchService {
  /** Real, per direct guidance's own Step 3 — "targeted / lightweight
   *  fetch... essential case metadata, current report status, and
   *  previous synoptic data... rather than pulling heavy, full
   *  historical logs." Never fetches this patient's separate,
   *  cross-accession history — that's services/patientHistory/'s own,
   *  genuinely different real job. */
  fetchCaseByAccession(accessionNumber: string): Promise<ServiceResult<OnDemandCaseFetchOutcome>>;
}

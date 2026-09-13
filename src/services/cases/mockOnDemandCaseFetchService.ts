// src/services/cases/mockOnDemandCaseFetchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IOnDemandCaseFetchService. Real, deliberately
// slower delay than most mocks in this app — per direct guidance's own
// "I have seen this be a slow process" — so the real loading-state UI
// this design calls for ("Fetching Accession [ID] from LIS...") has
// something real to actually show, not an instant flash.
// ─────────────────────────────────────────────────────────────────────────────

import type { IOnDemandCaseFetchService, OnDemandCaseFetchOutcome } from './IOnDemandCaseFetchService';
import type { ServiceResult } from '../types';
import { resolveIsSecureLisEndpoint } from '../patientHistory/resolveIsSecureLisEndpoint';

// Real, per FHIRCaseService.ts's own established TODO-before-go-live
// pattern — a real placeholder, HTTPS by construction.
const LIS_CASE_FETCH_ENDPOINT = 'https://your-trust-fhir-server.nhs.uk/fhir/R4/DiagnosticReport';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(res => setTimeout(res, 1200)); // real, deliberately slow — see header comment

// Real, demo-only: an accession the LIS "has" but PathScribe's own
// local mockCaseService seed data deliberately does not, so the
// on-demand fallback path is genuinely demoable — typing this exact
// accession is the one real way to trigger a demo "cache miss".
const DEMO_REMOTE_ONLY_ACCESSION = 'S26-9077-SP-1';

export const mockOnDemandCaseFetchService: IOnDemandCaseFetchService = {
  async fetchCaseByAccession(accessionNumber: string): Promise<ServiceResult<OnDemandCaseFetchOutcome>> {
    if (!resolveIsSecureLisEndpoint(LIS_CASE_FETCH_ENDPOINT)) {
      return ok({ outcome: 'refused_insecure_endpoint' });
    }
    await delay();

    if (accessionNumber !== DEMO_REMOTE_ONLY_ACCESSION) {
      return ok({ outcome: 'not_found' });
    }

    return ok({
      outcome: 'found',
      caseData: {
        id: DEMO_REMOTE_ONLY_ACCESSION,
        reportingMode: 'assist',
        status: 'in-progress',
        accession: { fullAccession: DEMO_REMOTE_ONLY_ACCESSION },
        patient: { id: 'demo-remote-patient-1', mrn: 'DEMO-90077', firstName: 'Robert', lastName: 'Nguyen' },
        order: { requestingProvider: 'Dr. Alvarez', priority: 'Routine' },
        specimens: [{ id: DEMO_REMOTE_ONLY_ACCESSION + '-A', label: 'A', description: 'Skin, left forearm, shave biopsy' } as any],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
    });
  },
};

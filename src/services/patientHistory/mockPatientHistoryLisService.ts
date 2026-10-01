// src/services/patientHistory/mockPatientHistoryLisService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IPatientHistoryLisService. Same real
// BASE_URL-must-be-HTTPS posture as FHIRCaseService.ts, enforced here
// via resolveIsSecureLisEndpoint.ts even though this mock never makes
// a real network call — so a real implementation swapped in later
// inherits the same real, tested gate, never a check added only to
// the real version and skipped here.
// ─────────────────────────────────────────────────────────────────────────────

import type { IPatientHistoryLisService } from './IPatientHistoryLisService';
import type { ServiceResult } from '../types';
import type { PatientHistoryReport } from '@/types/patientHistory/PatientHistoryCacheEntry';
import { resolveIsSecureLisEndpoint } from './resolveIsSecureLisEndpoint';

// Real, per FHIRCaseService.ts's own established TODO-before-go-live
// pattern — a real placeholder, HTTPS by construction, never a real
// customer's own endpoint this app has no right to assume.
const LIS_HISTORY_ENDPOINT = 'https://your-trust-fhir-server.nhs.uk/fhir/R4/DiagnosticReport';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 200)); // real, deliberately slower than most mocks — per direct guidance's own "I have seen this be a slow process"

// Real, demo-only seed data keyed on real, already-existing seed
// patient MRNs (services/cases/mockCaseService.ts) — so the demo
// panel/UI shows something real and traceable rather than an
// arbitrary MRN nobody could cross-check.
const DEMO_HISTORY: Record<string, PatientHistoryReport[]> = {
  '100503': [ // Linda Chen, S26-5003-CYT-001's own real seed patient
    { sourceAccessionNumber: 'LEGACY-2023-88214', reportDate: '2023-06-14', specimenDescription: 'Cervical/vaginal Pap smear, liquid-based', diagnosisSummary: 'NILM (negative for intraepithelial lesion or malignancy).', sourceSystemName: 'Legacy LIS (Metro General)' },
    { sourceAccessionNumber: 'LEGACY-2021-71190', reportDate: '2021-05-02', specimenDescription: 'Cervical/vaginal Pap smear, liquid-based', diagnosisSummary: 'NILM (negative for intraepithelial lesion or malignancy).', sourceSystemName: 'Legacy LIS (Metro General)' },
  ],
};

export const mockPatientHistoryLisService: IPatientHistoryLisService = {
  async fetchPatientHistory(mrn: string): Promise<ServiceResult<PatientHistoryReport[]>> {
    if (!resolveIsSecureLisEndpoint(LIS_HISTORY_ENDPOINT)) {
      return err('Refusing to fetch patient history: the configured LIS endpoint is not HTTPS.');
    }
    await delay();
    return ok(DEMO_HISTORY[mrn] ?? []);
  },
};

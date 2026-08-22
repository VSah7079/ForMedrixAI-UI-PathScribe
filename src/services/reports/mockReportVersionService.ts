// src/services/reports/mockReportVersionService.ts
// CORRECTED — back to the real, original two-method implementation.
// My earlier draft added getLatestForCase/createCaseVersion/
// getInstanceVersionHistory and a case-wide `instances[]` concept that
// doesn't match how this service is actually used elsewhere in the
// app. No new methods needed — instanceId is just a field now, and the
// banner can filter getByCaseId()'s results client-side.
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ReportVersionRecord } from '@/types/reports/ReportVersionRecord';
import type { PatientEncounterSnapshot } from '@/types/reports/PatientEncounterSnapshot';
import type { IReportVersionService } from './IReportVersionService';
import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockEncounterService } from '../encounters/mockEncounterService';
import { getEffectiveScanStationId } from '@/utils/effectiveScanStation';

const STORAGE_KEY = 'report_version_records';

const load    = (): ReportVersionRecord[] => storageGet<ReportVersionRecord[]>(STORAGE_KEY, []);
const persist = (data: ReportVersionRecord[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

/** Real fix, Phase 5: captures the real, immutable patient/encounter
 *  snapshot at the exact moment a version is created. Deliberately,
 *  fully defensive - a real sign-out is a high-stakes, time-sensitive
 *  clinical action that must never be blocked or failed by a
 *  secondary, ancillary lookup. Any failure here (case not found, no
 *  real patientId on the case, patient/encounter lookup error) simply
 *  results in a genuinely absent snapshot, never a thrown error. */
async function captureSnapshot(caseId: string): Promise<PatientEncounterSnapshot | undefined> {
  try {
    const caseData = await caseRouter.getCase(caseId);
    const patientId = (caseData as any)?.patient?.id;
    if (!patientId) return undefined;

    const patient = await mockPatientIndexService.getById(patientId);
    if (!patient) return undefined;

    const snapshot: PatientEncounterSnapshot = {
      patientId: patient.id,
      mrn: patient.mrn,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      capturedAt: new Date().toISOString(),
    };

    const encounterId = (caseData as any)?.encounterId;
    if (encounterId) {
      const encounterResult = await mockEncounterService.getById(encounterId);
      if (encounterResult.ok && encounterResult.data) {
        const e = encounterResult.data;
        snapshot.encounterId = e.id;
        snapshot.encounterNumber = e.encounterNumber;
        snapshot.encounterClass = e.encounterClass;
        snapshot.encounterStatus = e.status;
        snapshot.facility = e.facility;
        snapshot.ward = e.ward;
        snapshot.room = e.room;
        snapshot.bed = e.bed;
        snapshot.attendingProvider = e.attendingProvider;
      }
    }

    return snapshot;
  } catch {
    return undefined;
  }
}

export const mockReportVersionService: IReportVersionService = {
  async getByCaseId(caseId) {
    return ok(load().filter(r => r.caseId === caseId).sort((a, b) => a.versionNumber - b.versionNumber));
  },

  async create(record) {
    const existing = load().filter(r => r.caseId === record.caseId);
    const patientEncounterSnapshot = await captureSnapshot(record.caseId);
    const newRecord: ReportVersionRecord = {
      ...record,
      id: `ver-${Date.now().toString(36)}`,
      versionNumber: existing.length + 1,
      createdAt: new Date().toISOString(),
      patientEncounterSnapshot,
      // Real feature, per direct follow-up: "Stamp every saved
      // draft... with... station_id captured at the exact moment of
      // saving." Same real capture-at-creation moment as
      // patientEncounterSnapshot immediately above.
      createdFromStation: getEffectiveScanStationId(),
    };
    persist([...load(), newRecord]);
    return ok(newRecord);
  },
};

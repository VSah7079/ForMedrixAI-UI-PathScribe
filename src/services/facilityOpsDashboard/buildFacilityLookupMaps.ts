// src/services/facilityOpsDashboard/buildFacilityLookupMaps.ts
// Real, shared helper — every one of PS-288's five summary functions
// needs the same two real join maps (case accession -> performing
// facility, scan station -> facility) to resolve a Batch's real
// facility (see resolveBatchFacilityId.ts's own header for why a
// Batch has no direct facilityId). Built once per real call here
// rather than five separate, independent case/station fetches.

import { caseRouter } from '@/services/cases/CaseRouter';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import type { PathologyCase } from '@/services/cases/ICaseService';

export interface FacilityLookupMaps {
  accessionToFacilityId: Map<string, string>;
  stationToFacilityId: Map<string, string>;
  /** Real, keyed by Case.id — the same case list every summary
   *  function that also needs case-level data (priority, specimens)
   *  reuses, rather than a second, separate fetch. */
  casesById: Map<string, PathologyCase>;
}

export async function buildFacilityLookupMaps(): Promise<FacilityLookupMaps> {
  const [casesRes, stationsRes] = await Promise.all([
    caseRouter.getAll(undefined, { bypassAccessControl: true, includeOrchestration: true }),
    mockScanStationService.getAll(),
  ]);

  const accessionToFacilityId = new Map<string, string>();
  const casesById = new Map<string, PathologyCase>();
  if (casesRes.ok) {
    for (const c of casesRes.data) {
      casesById.set(c.id, c);
      const fullAccession = c.accession?.fullAccession ?? c.id;
      if (c.originHospitalId) accessionToFacilityId.set(fullAccession, c.originHospitalId);
    }
  }

  const stationToFacilityId = new Map<string, string>();
  if (stationsRes.ok) {
    for (const s of stationsRes.data) stationToFacilityId.set(s.id, s.facilityId);
  }

  return { accessionToFacilityId, stationToFacilityId, casesById };
}

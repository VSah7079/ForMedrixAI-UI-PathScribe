// src/services/cytology/buildCytologyRegistryReportPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, generic centralized-registry report payload — the real
// counterpart to buildCytologyOruR01Payload.ts (EHR/LIS-directed
// results) for a genuinely different real destination and purpose:
// mandatory, population-level national screening surveillance. Per
// direct guidance's own South Korea information: "pathology
// laboratories are legally required to report all cervical screening
// results" — KNCSP/KCCR's own real, standard registry fields, and per
// direct guidance's own earlier notes, the same real shape UK/Ireland/
// Netherlands registries will need when those are actually built.
//
// Same real "PathScribe sends structured JSON, the interface engine
// handles the real, registry-specific formatting" principle as this
// app's own established outbound dispatch pattern
// (dispatchInterfaceMessage.ts) — this file assembles the real,
// structured content; it does not itself speak any registry's own
// wire format.
//
// Real, honest gap: South Korea's own KCCR links records via a real,
// national identification number, which this app does not capture
// anywhere yet (a real, separate, deliberately not-invented field —
// see this module's own README for the full reasoning). MRN is the
// best real, available patient identifier used here instead.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import type { CytologyRegistryId } from './ICytologyRegistrySettingsService';

export interface CytologyRegistryReportPayload {
  messageId: string;
  timestamp: string;
  registryId: CytologyRegistryId;

  facilityId: string;
  facilityName?: string;

  patient: {
    mrn?: string;
    name: string;
    dateOfBirth?: string;
  };

  accessionNumber: string;
  screeningDate?: string;

  specimenAdequacy: string[];
  generalCategorization?: string;
  primaryInterpretation: string;
  additionalInterpretations: string[];
  hpvResult?: string;
  recommendations: string[];
}

export function buildCytologyRegistryReportPayload(
  signOutRecord: CytologySignOutRecord,
  registryId: CytologyRegistryId,
  facilityId: string,
  facilityName: string | undefined,
): CytologyRegistryReportPayload {
  const content = signOutRecord.reportContent;
  return {
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    registryId,
    facilityId,
    facilityName,
    patient: { mrn: content.patientMrn, name: content.patientName, dateOfBirth: content.patientDateOfBirth },
    accessionNumber: content.accessionNumber,
    screeningDate: content.specimenCollectedAt,
    specimenAdequacy: content.specimenAdequacy,
    generalCategorization: content.generalCategorization,
    primaryInterpretation: content.primaryInterpretation,
    additionalInterpretations: content.additionalInterpretations,
    hpvResult: content.hpvResult,
    recommendations: content.recommendations,
  };
}

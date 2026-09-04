// src/services/cytology/ICytologyRegistrySettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: a real, generic centralized-registry-
// reporting foundation — the same real shape needed for South Korea's
// KNCSP/KCCR, and, per direct guidance's own earlier notes, still
// deferred for the UK (Call 18/Scottish Cervical Call), Ireland
// (CervicalCheck), and the Netherlands (BPM). Real, two-tier cascade,
// same shape as this module's own nomenclature/routing/screening-
// strategy settings — a facility's own registry obligation is a real,
// facility-level fact (which national jurisdiction it reports
// under), not a Staff-level one.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** Real, per direct guidance's own information: South Korea's
 *  National Cancer Screening Program is jointly maintained by the
 *  National Health Insurance Service (NHIS) and National Cancer
 *  Center (NCC), linked to the Korea Central Cancer Registry (KCCR)
 *  via national identification numbers. 'none' is the real, correct
 *  default for the many real facilities (most of the US, per direct
 *  guidance's own "decentralized via HL7 v2/FHIR" finding) that have
 *  no centralized registry obligation at all. */
export type CytologyRegistryId = 'none' | 'kncsp_kccr_korea';

export interface CytologyRegistrySettingsConfig {
  registryId: CytologyRegistryId;
}

export const DEFAULT_CYTOLOGY_REGISTRY_SETTINGS: CytologyRegistrySettingsConfig = {
  registryId: 'none',
};

export interface ICytologyRegistrySettingsService {
  get(): Promise<ServiceResult<CytologyRegistrySettingsConfig>>;
  update(patch: Partial<CytologyRegistrySettingsConfig>): Promise<ServiceResult<CytologyRegistrySettingsConfig>>;
  reset(): Promise<ServiceResult<CytologyRegistrySettingsConfig>>;
}

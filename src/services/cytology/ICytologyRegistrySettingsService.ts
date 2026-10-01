// src/services/cytology/ICytologyRegistrySettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: a real, generic centralized-registry-
// reporting foundation — the same real shape needed for South Korea's
// KNCSP/KCCR, and now England/Wales's own real system too. Real,
// two-tier cascade, same shape as this module's own nomenclature/
// routing/screening-strategy settings — a facility's own registry
// obligation is a real, facility-level fact (which national
// jurisdiction it reports under), not a Staff-level one.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** Real, per direct guidance's own information: South Korea's
 *  National Cancer Screening Program is jointly maintained by the
 *  National Health Insurance Service (NHIS) and National Cancer
 *  Center (NCC), linked to the Korea Central Cancer Registry (KCCR)
 *  via national identification numbers. 'none' is the real, correct
 *  default for the many real facilities (most of the US, per direct
 *  guidance's own "decentralized via HL7 v2/FHIR" finding) that have
 *  no centralized registry obligation at all.
 *
 *  Real, direct research correction: England's own real system is
 *  NOT named "Call 18" — that name refers to NHS Good Practice Guide
 *  No. 18, an administrative guidance document, not a registry.
 *  The real system laboratories report to is CSMS (Cervical Screening
 *  Management System), the national "call and recall" platform.
 *
 *  Real, per direct research: Ireland's own real registry is
 *  CervicalCheck itself — its own real national screening register,
 *  receiving daily electronic feeds of screening results from service
 *  providers. Real, direct confirmation via CervicalCheck's own
 *  official "Cytology Terminology Table" publication (CS-PUB-LAB-2):
 *  current, official terminology is real Bethesda — no separate
 *  nomenclature dictionary needed here, unlike England (BSCC/RCPath)
 *  or Germany (Münchner Nomenklatur III). An older (2009) CervicalCheck
 *  document described BSCC/CIN terminology as "most commonly used to
 *  date" — real, honest note that this reflects a real, historical
 *  state Ireland has since moved on from, not the current one.
 *
 *  Real, per direct research: the Netherlands' own real registry is
 *  PALGA itself — the same real national registry already identified
 *  in the CISOE-A work, not a separately-named "BPM" system. Real,
 *  genuinely distinct from the other three real registries here:
 *  PALGA is universal and mandatory for all 64 Dutch pathology labs
 *  (histology, cytology, autopsy, molecular — not screening-specific),
 *  and requires real, structured "Palga Thesaurus" diagnosis codes
 *  (linked to SNOMED CT), submitted daily. Real, direct confirmation
 *  this app's own established "structured data out, an external
 *  system translates it" principle already applies here too: real
 *  Dutch labs use a dedicated, separate application — the PALGA
 *  Protocol Module (PPM), linked to the LIS — to complete the actual
 *  Palga-coded submission; PathScribe's own real job is only ever to
 *  make sure the structured data (including the real, native
 *  CisoeAScore — see PalgaRegistryExtension) is genuinely present,
 *  never to build a Palga Thesaurus code lookup itself.
 *
 *  Real, per direct research: Australia's own real registry is the
 *  NCSR (National Cancer Screening Register) — its own real, official
 *  "Summary Guide for Pathology Laboratories" confirms a real, LOINC-
 *  coded squamous result scale (LOINC 19762-4), genuinely distinct
 *  numbering from CISOE-A's own S-axis despite surface resemblance —
 *  see resolveNcsrSquamousResultCode.ts's own real, confirmed mapping
 *  from Bethesda categories. */
export type CytologyRegistryId = 'none' | 'kncsp_kccr_korea' | 'csms_uk' | 'cervicalcheck_ireland' | 'palga_netherlands' | 'ncsr_australia';

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

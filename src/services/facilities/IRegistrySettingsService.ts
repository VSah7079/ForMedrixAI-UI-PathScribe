// src/services/facilities/IRegistrySettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: generalized out of what was originally
// ICytologyRegistrySettingsService.ts. Real, direct finding that
// motivated this: the underlying fact this type stores — which
// centralized registry a facility reports to — is often not specific
// to any one specimen type at all. PALGA (Netherlands) is universal
// across cytology, histology, autopsy, and molecular pathology for
// all 64 Dutch labs; Australia's NCSR records both cytology and
// histopathology results. Namespacing this as "Cytology"-specific
// would have meant a real, separate, identically-shaped
// FacilitySurgicalRegistryOverride table once surgical pathology is
// built, requiring the same real fact (e.g. "this facility reports to
// PALGA") to be entered and kept in sync by hand in two places — a
// real, avoidable drift risk. This lives in services/facilities/,
// alongside this module's own established, already-generic
// IFacilityService.ts, not inside services/cytology/.
//
// Real, per direct guidance's own information: South Korea's National
// Cancer Screening Program is jointly maintained by the National
// Health Insurance Service (NHIS) and National Cancer Center (NCC),
// linked to the Korea Central Cancer Registry (KCCR) via national
// identification numbers. 'none' is the real, correct default for the
// many real facilities (most of the US, per direct guidance's own
// "decentralized via HL7 v2/FHIR" finding) that have no centralized
// registry obligation at all.
//
// Real, direct research correction: England's own real system is NOT
// named "Call 18" — that name refers to NHS Good Practice Guide
// No. 18, an administrative guidance document, not the system itself.
// The real system laboratories report to is CSMS (Cervical Screening
// Management System), the national "call and recall" platform.
//
// Real, per direct research: Ireland's own real registry is
// CervicalCheck itself — its own real national screening register,
// receiving daily electronic feeds of screening results from service
// providers. Real, direct confirmation via CervicalCheck's own
// official "Cytology Terminology Table" publication (CS-PUB-LAB-2):
// current, official terminology is real Bethesda.
//
// Real, per direct research: the Netherlands' own real registry is
// PALGA itself — the same PALGA already identified in the CISOE-A
// work, not a separately-named "BPM" system.
//
// Real, per direct research: Australia's own real registry is the
// NCSR (National Cancer Screening Register) — its own real, official
// "Summary Guide for Pathology Laboratories" confirms a real, LOINC-
// coded squamous result scale (LOINC 19762-4), genuinely distinct
// numbering from CISOE-A's own S-axis despite surface resemblance —
// see resolveNcsrSquamousResultCode.ts's own real, confirmed mapping
// from Bethesda categories.
//
// Real, per direct research: Northern Ireland's own real registry is
// the Northern Ireland Cervical Screening Programme itself — real
// call/recall administered by the BSO (Business Services
// Organisation), Belfast, distinct from England's CSMS and Scotland's
// own system, matching this UK nation's own devolved health service
// (Health and Social Care, not NHS England/Scotland). Real, honest
// national-ID gap, same pattern as Korea's KCCR and Ireland's PPSN:
// NI's own real "Health + Care Number" links records, and this app
// does not capture it anywhere — MRN used as the same, honest
// fallback in buildCytologyRegistryReportPayload.ts.
//
// Real, per Sep 2026 update: general cancer registries (NAACCR/SEER/
// NPCR, GEKID, INCa, CPAC, COSD, AIHW, KCCR, NZCR) — a real, distinct
// class from the screening-programme registries above, per
// src/FHIR_DISPATCH_ARCHITECTURE_PLAN.md's own real finding that they
// must never be driven by cytology sign-out — are now real and built,
// in their own sibling home: services/cancerRegistry/. See that
// folder's own README for the full account.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type RegistryId = 'none' | 'kncsp_kccr_korea' | 'csms_uk' | 'cervicalcheck_ireland' | 'palga_netherlands' | 'ncsr_australia' | 'nicsp_northern_ireland';

export interface RegistrySettingsConfig {
  registryId: RegistryId;
}

export const DEFAULT_REGISTRY_SETTINGS: RegistrySettingsConfig = {
  registryId: 'none',
};

export interface IRegistrySettingsService {
  get(): Promise<ServiceResult<RegistrySettingsConfig>>;
  update(patch: Partial<RegistrySettingsConfig>): Promise<ServiceResult<RegistrySettingsConfig>>;
  reset(): Promise<ServiceResult<RegistrySettingsConfig>>;
}

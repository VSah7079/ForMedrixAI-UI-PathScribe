// src/services/cancerRegistry/ICancerRegistrySettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports
// gap — same real, established two-tier cascade shape as
// services/facilities/IRegistrySettingsService.ts (the screening-
// registry settings), genuinely a sibling, not an extension: that
// file's own header explicitly defers "general cancer registries
// (SEER/NPCR, NCRI, GEKID, INCa, BCR, NZCR) — a real, distinct class
// from the screening-programme registries above" — this is that real,
// distinct class, finally built. A facility's own registry
// obligation is a real, facility-level fact, same reasoning as the
// screening-registry settings.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** Real, named central cancer registries this gap asks for, per
 *  jurisdiction. 'none' is the real, correct default for a facility
 *  with no centralized cancer-registry reporting obligation captured
 *  here yet. */
export type CancerRegistryId =
  | 'none'
  | 'naaccr_us'
  | 'cpac_canada'
  | 'cosd_uk'
  | 'inca_france'
  | 'adt_gekid_germany'
  | 'aihw_australia'
  | 'nz_cancer_registry'
  | 'kccr_korea';

export interface CancerRegistrySettingsConfig {
  registryId: CancerRegistryId;
}

export const DEFAULT_CANCER_REGISTRY_SETTINGS: CancerRegistrySettingsConfig = {
  registryId: 'none',
};

export interface ICancerRegistrySettingsService {
  get(): Promise<ServiceResult<CancerRegistrySettingsConfig>>;
  update(patch: Partial<CancerRegistrySettingsConfig>): Promise<ServiceResult<CancerRegistrySettingsConfig>>;
  reset(): Promise<ServiceResult<CancerRegistrySettingsConfig>>;
}

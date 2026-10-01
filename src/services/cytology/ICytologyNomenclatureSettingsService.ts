// src/services/cytology/ICytologyNomenclatureSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own sequenced international roadmap and
// its stated Product Need: "Form fields and diagnostic drop-downs must
// dynamically swap nomenclature based on the lab's geographical
// profile." Real, two-tier cascade — Enterprise default + a real
// performing-Facility override — same real cascade shape as
// ICytologyRoutingSettingsService.ts (PS-158): a lab's own reporting
// nomenclature is a real, facility-level operational choice, the same
// real kind of decision that setting's own cascade already models,
// not something needing a third, Staff-level tier.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologyNomenclatureSystem } from './ICytologyCategoryService';

export interface CytologyNomenclatureSettingsConfig {
  nomenclatureSystem: CytologyNomenclatureSystem;
}

/** Real, per direct guidance: Bethesda remains this app's own real,
 *  original default (US, Canada, Australia, New Zealand, South Korea
 *  all use it) — never silently assumed to be the only correct choice
 *  for every real lab, but the right real default until a lab's own
 *  facility override says otherwise. */
export const DEFAULT_CYTOLOGY_NOMENCLATURE_SETTINGS: CytologyNomenclatureSettingsConfig = {
  nomenclatureSystem: 'bethesda',
};

export interface ICytologyNomenclatureSettingsService {
  get(): Promise<ServiceResult<CytologyNomenclatureSettingsConfig>>;
  update(patch: Partial<CytologyNomenclatureSettingsConfig>): Promise<ServiceResult<CytologyNomenclatureSettingsConfig>>;
  reset(): Promise<ServiceResult<CytologyNomenclatureSettingsConfig>>;
}

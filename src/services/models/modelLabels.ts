// src/services/models/modelLabels.ts
// ─────────────────────────────────────────────────────────────────────────────
// i18n key lookups for model enums and model-service error codes. The
// stored values (vendor, error code) are data; only their display goes
// through these keys.
// ─────────────────────────────────────────────────────────────────────────────

import type { ModelVendor } from './IModelService';

export const MODEL_VENDOR_LABEL_KEY: Record<ModelVendor, string> = {
  anthropic: 'navBar.systemInfo.anthropic',
  openai:    'modelsTab.vendor.openai',
  google:    'login.ssoGoogle',
  other:     'printerProfilesSection.vendorLabels.OTHER',
};

const STORE_ERROR_LABEL_KEY: Record<string, string> = {
  STORE_NOT_LICENSED: 'modelStoreModal.error.storeNotLicensed',
  NO_ORGANISATION:    'modelStoreModal.error.noOrganisation',
  NOT_IN_CATALOG:     'modelStoreModal.error.notInCatalog',
  ALREADY_ADOPTED:    'modelStoreModal.error.alreadyAdopted',
};

/** The translation key for an error returned by the store / model
 *  services; anything unrecognised gets the generic message. */
export function modelStoreErrorLabelKey(code: string): string {
  return STORE_ERROR_LABEL_KEY[code] ?? 'modelStoreModal.error.generic';
}

// src/services/models/mockModelStoreService.ts
// ─────────────────────────────────────────────────────────────────────────────
// The ForMedrixAI store: the customer-facing view of the global model
// catalog. ForMedrixAI tests a model internally and publishes it to the
// catalog; a customer admin browses what their organisation hasn't adopted
// yet and adopts one, then validates it on their own data.
//
// PS-58 (Option 2): the store no longer keeps a catalog of its own, and
// "download" no longer copies a model into an unscoped local list. The
// listings ARE the global catalog entries (modelCatalog.ts, storeListed:
// true) minus the ones this organisation has already adopted, and
// "download" creates an adoption record under the organisation in session
// (modelService.adopt). Adopting in one organisation changes nothing for
// any other.
//
// Still mock: the licence check below, and the absence of any call to a
// real ForMedrixAI API. See STORE_INTEGRATION_NOTES.md.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { AIModel, IModelService, ModelCatalogEntry } from './IModelService';
import { availableForAdoption } from './modelAdoption';
import { mockModelService } from './mockModelService';
import { mockModelCatalogService, type IModelCatalogService } from './modelCatalog';

/** A store listing is a global catalog entry offered for adoption. */
export type StoreListing = ModelCatalogEntry;

/** Error codes the store returns on top of ModelServiceError. */
export type ModelStoreError = 'STORE_NOT_LICENSED';

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

// ─────────────────────────────────────────────────────────────────────────────
// MOCK AUTHORIZATION — replace when the real store exists.
//
// Stands in for: does THIS ORGANISATION (organisationId, the tenant boundary)
// hold an active ForMedrixAI store licence. Different from the isAdmin gate
// on the Validation Studies tab, which is about the user's role. A real
// implementation calls an authenticated ForMedrixAI API and may narrow the
// listings by subscription tier.
//
// Defaults to authorised so the demo works; flip to false to see the locked
// state.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_ORG_HAS_STORE_LICENSE = true;

export interface IModelStoreService {
  checkAuthorization(): Promise<ServiceResult<true>>;
  getAvailable(): Promise<ServiceResult<StoreListing[]>>;
  /** Adopts a listing into the current organisation. Kept under its
   *  original name because that is the action's name on screen. */
  download(modelId: ID): Promise<ServiceResult<AIModel>>;
}

export function createModelStoreService(deps: {
  catalog: IModelCatalogService;
  models: IModelService;
  hasLicense: () => boolean;
  delay?: () => Promise<void>;
}): IModelStoreService {
  const wait = deps.delay ?? (() => Promise.resolve());
  const checkAuthorization = async (): Promise<ServiceResult<true>> => {
    await wait();
    return deps.hasLicense() ? ok(true as const) : err<true>('STORE_NOT_LICENSED' satisfies ModelStoreError);
  };

  return {
    checkAuthorization,

    async getAvailable() {
      const auth = await checkAuthorization();
      if (auth.ok === false) return err(auth.error);
      const [catalogRes, adoptedRes] = await Promise.all([deps.catalog.getAll(), deps.models.getAll()]);
      if (catalogRes.ok === false) return err(catalogRes.error);
      // getAll() is already scoped to the organisation in session; the
      // joined AIModel ids are catalog ids.
      const adopted = adoptedRes.ok ? adoptedRes.data : [];
      return ok(availableForAdoption(catalogRes.data, adopted.map(m => m.id)));
    },

    async download(modelId) {
      const auth = await checkAuthorization();
      if (auth.ok === false) return err(auth.error);
      return deps.models.adopt(modelId);
    },
  };
}

export const mockModelStoreService: IModelStoreService = createModelStoreService({
  catalog: mockModelCatalogService,
  models: mockModelService,
  hasLicense: () => MOCK_ORG_HAS_STORE_LICENSE,
  delay: () => new Promise(r => setTimeout(r, 120)),
});

// src/services/models/mockModelService.ts
// ─────────────────────────────────────────────────────────────────────────────
// The current organisation's adopted AI models (PS-58, Option 2).
//
// Reads join the global catalog (modelCatalog.ts) with this organisation's
// adoption records; writes only ever touch adoption records, and only the
// ones under the organisation in session. The mock stores adoptions in
// localStorage grouped by organisationId (`pathscribe_model_adoptions`), the
// stand-in for Firestore's /organisations/{orgId}/adoptedModels/{modelId}.
//
// No organisationId in session means fail closed: reads return nothing,
// writes return NO_ORGANISATION. Callers that resolve an AI model
// (resolveClientAiModel.ts, resolveVoiceAiModel.ts) already fall back to the
// deployment default when no model resolves.
//
// Decisions (defaults, adoption, which fields a tenant may change, the
// legacy migration) are in modelAdoption.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { IModelService, AIModel, ModelCatalogEntry, ModelServiceError } from './IModelService';
import type { ServiceResult } from '../types';
import { storageGet, storageSet, storageClear } from '../mockStorage';
import { getSessionUser } from '../auth/caseAccessControl';
import { GLOBAL_MODEL_CATALOG } from './modelCatalog';
import {
  type AdoptionStore,
  joinAdoptedModels, joinModel, findAdoption, adoptModel, applyDefault,
  applyModelChanges, isVoiceModel, starterAdoptions, migrateLegacyModels,
} from './modelAdoption';

export const ADOPTIONS_STORAGE_KEY = 'pathscribe_model_adoptions';
/** The pre-PS-58 unscoped list. Read once, migrated, then removed. */
export const LEGACY_MODELS_STORAGE_KEY = 'pathscribe_models';

/** The organisations the demo seeds (organisationService.ts's
 *  MOCK_ORGANISATIONS; a test keeps the two lists in step). Each starts with
 *  its own copy of the starter adoptions. Any other organisation starts with
 *  nothing adopted, which is what a new tenant should see. */
export const DEMO_ORGANISATION_IDS = ['ORG-DVMC', 'ORG-MFT', 'ORG-MPA', 'ORG-HFHS'] as const;

export interface ModelServiceDeps {
  catalog: readonly ModelCatalogEntry[];
  getOrganisationId: () => string | null | undefined;
  getUserId?: () => string | null | undefined;
  loadStore: () => AdoptionStore;
  saveStore: (store: AdoptionStore) => void;
  today: () => string;
  delay?: () => Promise<void>;
}

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: ModelServiceError): ServiceResult<T> => ({ ok: false, error });

export function createModelService(deps: ModelServiceDeps): IModelService {
  const wait = deps.delay ?? (() => Promise.resolve());
  const orgId = () => deps.getOrganisationId() || null;

  const orgAdoptions = (org: string) => deps.loadStore()[org] ?? [];
  const saveOrg = (org: string, adoptions: AdoptionStore[string]) => {
    const store = deps.loadStore();
    deps.saveStore({ ...store, [org]: adoptions });
  };
  const joined = (org: string) => joinAdoptedModels(deps.catalog, orgAdoptions(org));
  const joinedById = (org: string, id: string): AIModel | null => {
    const a = findAdoption(orgAdoptions(org), id);
    const e = a && deps.catalog.find(x => x.id === a.modelId);
    return a && e ? joinModel(e, a) : null;
  };

  const service: IModelService = {
    async getAll() {
      await wait();
      const org = orgId();
      return ok(org ? joined(org) : []);
    },

    async getById(id) {
      await wait();
      const org = orgId();
      const m = org ? joinedById(org, id) : null;
      return m ? ok(m) : err('MODEL_NOT_FOUND');
    },

    async getActive() {
      await wait();
      const org = orgId();
      return ok(org ? joined(org).filter(m => m.status === 'Active' || m.status === 'Beta') : []);
    },

    // Report-generation default only; voice has its own slot below.
    async getDefault() {
      await wait();
      const org = orgId();
      return ok(org ? (joined(org).find(m => m.isDefault && !isVoiceModel(m)) ?? null) : null);
    },

    async getDefaultVoiceModel() {
      await wait();
      const org = orgId();
      return ok(org ? (joined(org).find(m => m.isDefault && isVoiceModel(m)) ?? null) : null);
    },

    async setDefault(id) {
      await wait();
      const org = orgId();
      if (!org) return err('NO_ORGANISATION');
      const res = applyDefault(deps.catalog, orgAdoptions(org), id);
      if (res.ok === false) return err(res.error);
      saveOrg(org, res.data);
      return ok(joinedById(org, id)!);
    },

    async update(id, changes) {
      await wait();
      const org = orgId();
      if (!org) return err('NO_ORGANISATION');
      const adoptions = orgAdoptions(org);
      const current = findAdoption(adoptions, id);
      const entry = current && deps.catalog.find(e => e.id === current.modelId);
      if (!current || !entry) return err('MODEL_NOT_FOUND');
      const res = applyModelChanges(entry, current, changes);
      if (res.ok === false) return err(res.error);
      saveOrg(org, adoptions.map(a => (a === current ? res.data : a)));
      return ok(joinModel(entry, res.data));
    },

    async retire(id) {
      await wait();
      const org = orgId();
      if (!org) return err('NO_ORGANISATION');
      const current = joinedById(org, id);
      if (!current) return err('MODEL_NOT_FOUND');
      if (current.isDefault) return err('CANNOT_RETIRE_DEFAULT');
      return service.update(id, { status: 'Retired', retiredDate: deps.today() });
    },

    async adopt(modelId) {
      await wait();
      const org = orgId();
      if (!org) return err('NO_ORGANISATION');
      const res = adoptModel(deps.catalog, orgAdoptions(org), modelId, org, {
        today: deps.today(),
        adoptedBy: deps.getUserId?.() ?? undefined,
      });
      if (res.ok === false) return err(res.error);
      saveOrg(org, res.data.adoptions);
      return ok(joinedById(org, modelId)!);
    },
  };
  return service;
}

// ─── The app's instance ─────────────────────────────────────────────────────

/** Loads the adoption store, creating it on first run: from the legacy
 *  unscoped list when one exists (then removing it), otherwise from the
 *  starter adoptions. */
export function loadOrInitAdoptionStore(): AdoptionStore {
  const existing = storageGet<AdoptionStore | null>(ADOPTIONS_STORAGE_KEY, null);
  if (existing) return existing;
  const legacy = storageGet<AIModel[] | null>(LEGACY_MODELS_STORAGE_KEY, null);
  const store: AdoptionStore = legacy
    ? migrateLegacyModels(legacy, GLOBAL_MODEL_CATALOG, DEMO_ORGANISATION_IDS).store
    : Object.fromEntries(DEMO_ORGANISATION_IDS.map(id => [id, starterAdoptions(id)]));
  storageSet(ADOPTIONS_STORAGE_KEY, store);
  if (legacy) storageClear(LEGACY_MODELS_STORAGE_KEY);
  return store;
}

export const mockModelService: IModelService = createModelService({
  catalog: GLOBAL_MODEL_CATALOG,
  getOrganisationId: () => getSessionUser()?.organisationId,
  getUserId: () => getSessionUser()?.id,
  loadStore: loadOrInitAdoptionStore,
  saveStore: store => storageSet(ADOPTIONS_STORAGE_KEY, store),
  today: () => new Date().toISOString().slice(0, 10),
  delay: () => new Promise(r => setTimeout(r, 80)),
});

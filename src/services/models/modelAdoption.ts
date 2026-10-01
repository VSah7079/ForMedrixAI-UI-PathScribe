// src/services/models/modelAdoption.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-58 (Option 2): the pure rules for per-tenant model adoption. No
// storage, no session: mockModelService.ts supplies the organisation and
// the stored records, and every decision about them is made here so it can
// be tested directly.
//
// Shapes (IModelService.ts):
//   ModelCatalogEntry  global, platform-owned (/modelCatalog/{modelId})
//   ModelAdoption      tenant-owned (/organisations/{orgId}/adoptedModels/{modelId})
//   AIModel            the joined view every consumer reads
// ─────────────────────────────────────────────────────────────────────────────

import type { AIModel, ModelAdoption, ModelCatalogEntry, ModelServiceError } from './IModelService';

/** The mock's stand-in for /organisations/{orgId}/adoptedModels:
 *  adoption records grouped by organisationId. */
export type AdoptionStore = Record<string, ModelAdoption[]>;

type Result<T> = { ok: true; data: T } | { ok: false; error: ModelServiceError };

/** Voice dictation and report generation keep independent defaults. */
export const isVoiceModel = (m: { type: string }): boolean => m.type === 'Voice Dictation';

/** Joins one adoption to its catalog entry. Tenant fields win for
 *  everything the tenant owns; catalog fields come from the catalog. */
export function joinModel(entry: ModelCatalogEntry, adoption: ModelAdoption): AIModel {
  return {
    id:              entry.id,
    name:            entry.name,
    version:         entry.version,
    type:            entry.type,
    vendor:          entry.vendor,
    requestFormat:   entry.requestFormat,
    apiModelId:      entry.apiModelId,
    releaseDate:     entry.releaseDate,
    subspecialtyIds: [...entry.subspecialtyIds],
    accuracy:        adoption.accuracy,
    casesProcessed:  adoption.casesProcessed,
    status:          adoption.status,
    isDefault:       adoption.isDefault,
    notes:           adoption.notes || entry.releaseNotes,
    ...(adoption.retiredDate ? { retiredDate: adoption.retiredDate } : {}),
  };
}

/** This organisation's adopted models, joined, in catalog order. An
 *  adoption whose catalog entry has gone is skipped rather than guessed at. */
export function joinAdoptedModels(catalog: readonly ModelCatalogEntry[], adoptions: readonly ModelAdoption[]): AIModel[] {
  return catalog.flatMap(entry => {
    const a = adoptions.find(x => x.modelId === entry.id);
    return a ? [joinModel(entry, a)] : [];
  });
}

/** Finds an adoption by its catalog id or by a pre-PS-58 id it carried. */
export function findAdoption(adoptions: readonly ModelAdoption[], id: string): ModelAdoption | undefined {
  return adoptions.find(a => a.modelId === id) ?? adoptions.find(a => a.legacyModelIds?.includes(id));
}

/** Catalog models this organisation could adopt: listed in the store and
 *  not already adopted. Identity is the catalog id, which is unique per
 *  (vendor, apiModelId). */
export function availableForAdoption(catalog: readonly ModelCatalogEntry[], adoptedModelIds: Iterable<string>): ModelCatalogEntry[] {
  const adopted = new Set(adoptedModelIds);
  return catalog.filter(e => e.storeListed && !adopted.has(e.id));
}

/** A new adoption: always Beta, never the default, zero cases, with the
 *  catalog benchmark as a labelled starting point only. */
export function buildAdoption(
  entry: ModelCatalogEntry,
  organisationId: string,
  opts: { today: string; adoptedBy?: string },
): ModelAdoption {
  return {
    organisationId,
    modelId:        entry.id,
    status:         'Beta',
    isDefault:      false,
    accuracy:       entry.benchmarkAccuracy,
    casesProcessed: 0,
    notes:          '',
    adoptedAt:      opts.today,
    ...(opts.adoptedBy ? { adoptedBy: opts.adoptedBy } : {}),
  };
}

/** Adds an adoption, refusing unknown catalog ids and repeats. */
export function adoptModel(
  catalog: readonly ModelCatalogEntry[],
  adoptions: readonly ModelAdoption[],
  modelId: string,
  organisationId: string,
  opts: { today: string; adoptedBy?: string },
): Result<{ adoptions: ModelAdoption[]; adoption: ModelAdoption }> {
  const entry = catalog.find(e => e.id === modelId);
  if (!entry) return { ok: false, error: 'NOT_IN_CATALOG' };
  if (adoptions.some(a => a.modelId === modelId)) return { ok: false, error: 'ALREADY_ADOPTED' };
  const adoption = buildAdoption(entry, organisationId, opts);
  return { ok: true, data: { adoptions: [...adoptions, adoption], adoption } };
}

/** Makes one adopted model the default within its group (voice vs
 *  report generation), clearing only that group's other defaults. */
export function applyDefault(
  catalog: readonly ModelCatalogEntry[],
  adoptions: readonly ModelAdoption[],
  id: string,
): Result<ModelAdoption[]> {
  const target = findAdoption(adoptions, id);
  const entry = target && catalog.find(e => e.id === target.modelId);
  if (!target || !entry) return { ok: false, error: 'MODEL_NOT_FOUND' };
  if (target.status === 'Retired') return { ok: false, error: 'CANNOT_DEFAULT_RETIRED' };
  const voice = isVoiceModel(entry);
  return {
    ok: true,
    data: adoptions.map(a => {
      const e = catalog.find(x => x.id === a.modelId);
      if (!e || isVoiceModel(e) !== voice) return a;
      return { ...a, isDefault: a.modelId === target.modelId };
    }),
  };
}

/** Fields of the joined AIModel that belong to the tenant's adoption. */
const ADOPTION_FIELDS = ['status', 'isDefault', 'accuracy', 'casesProcessed', 'notes', 'retiredDate'] as const;
type AdoptionField = typeof ADOPTION_FIELDS[number];

/** Applies AIModel-shaped changes to an adoption. Changing any catalog
 *  field (name, vendor, apiModelId, …) is refused: those are platform data.
 *  A catalog field passed with its current value is not a change. */
export function applyModelChanges(
  entry: ModelCatalogEntry,
  adoption: ModelAdoption,
  changes: Partial<Omit<AIModel, 'id'>>,
): Result<ModelAdoption> {
  const current = joinModel(entry, adoption) as unknown as Record<string, unknown>;
  const next: ModelAdoption = { ...adoption };
  for (const [key, value] of Object.entries(changes)) {
    if ((ADOPTION_FIELDS as readonly string[]).includes(key)) {
      (next as unknown as Record<string, unknown>)[key as AdoptionField] = value;
    } else if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      return { ok: false, error: 'CATALOG_FIELDS_READ_ONLY' };
    }
  }
  return { ok: true, data: next };
}

/** Facilities pinned to a model through their own internalAiModelId
 *  override: the Models tab's "Facilities Approved" column. */
export function facilitiesPinnedToModel<F extends { internalAiModelId?: string | null }>(facilities: readonly F[], modelId: string): F[] {
  return facilities.filter(f => f.internalAiModelId === modelId);
}

// ─── Starter adoptions and legacy migration ─────────────────────────────────

/** The adoption state each seeded demo organisation starts with: exactly
 *  what the single unscoped list showed before PS-58, now held once per
 *  organisation so each can diverge independently. */
export function starterAdoptions(organisationId: string): ModelAdoption[] {
  const base = (modelId: string, rest: Omit<ModelAdoption, 'organisationId' | 'modelId' | 'adoptedAt'> & { adoptedAt?: string }): ModelAdoption =>
    ({ organisationId, modelId, adoptedAt: rest.adoptedAt ?? '2024-04-01', ...rest });
  return [
    base('psv32', { status: 'Active', isDefault: true, accuracy: 94.2, casesProcessed: 12487, notes: 'Current production model.', adoptedAt: '2025-06-01' }),
    base('psv33', { status: 'Beta', isDefault: false, accuracy: 96.1, casesProcessed: 842, notes: 'Beta: enhanced microscopic suggestion accuracy. Enrolling pilot labs.', adoptedAt: '2026-01-15' }),
    base('psv31', { status: 'Retired', isDefault: false, accuracy: 91.8, casesProcessed: 45210, notes: 'Retired on v3.2 release. Gross-only model.', adoptedAt: '2024-11-01', retiredDate: '2025-06-01' }),
    base('psv30', { status: 'Retired', isDefault: false, accuracy: 88.4, casesProcessed: 98341, notes: 'First production release.', retiredDate: '2024-11-01' }),
    base('psv-alt-gemini', { status: 'Beta', isDefault: false, accuracy: 93.5, casesProcessed: 0, notes: 'Candidate cross-vendor evaluation: not yet enrolled with any client, no cases processed.', adoptedAt: '2026-06-01' }),
    base('psv-voice-gemini-flash-lite', { status: 'Active', isDefault: true, accuracy: 92.0, casesProcessed: 0, notes: 'Current production voice-dictation refinement model.', adoptedAt: '2026-01-01' }),
  ];
}

export interface LegacyMigration {
  store: AdoptionStore;
  /** Legacy records with no catalog match (by vendor + apiModelId). */
  unmatched: string[];
}

/** Converts the pre-PS-58 unscoped `pathscribe_models` list into adoption
 *  records. That list was shared by every organisation, so each listed
 *  organisation gets its own copy of it: nobody's view changes on the day
 *  of the migration, and from then on they diverge independently.
 *  Records are matched to the catalog by (vendor, apiModelId), the real
 *  identity of a model; a record whose id differs from the catalog id
 *  (a store download's random `psv-store-…` id) keeps that id in
 *  legacyModelIds so lookups by it still resolve. */
export function migrateLegacyModels(
  legacy: readonly AIModel[],
  catalog: readonly ModelCatalogEntry[],
  organisationIds: readonly string[],
): LegacyMigration {
  const unmatched: string[] = [];
  const perOrg: Omit<ModelAdoption, 'organisationId'>[] = [];
  for (const m of legacy) {
    const entry = catalog.find(e => e.vendor === m.vendor && e.apiModelId === m.apiModelId);
    if (!entry) { unmatched.push(m.id); continue; }
    const existing = perOrg.find(a => a.modelId === entry.id);
    if (existing) {
      // Two legacy records for one real model: keep the first, but let a
      // default flag survive, and remember the other id.
      if (m.id !== entry.id) existing.legacyModelIds = [...(existing.legacyModelIds ?? []), m.id];
      existing.isDefault = existing.isDefault || m.isDefault;
      continue;
    }
    perOrg.push({
      modelId:        entry.id,
      status:         m.status,
      isDefault:      m.isDefault,
      accuracy:       m.accuracy,
      casesProcessed: m.casesProcessed,
      notes:          m.notes,
      adoptedAt:      m.releaseDate,
      ...(m.retiredDate ? { retiredDate: m.retiredDate } : {}),
      ...(m.id !== entry.id ? { legacyModelIds: [m.id] } : {}),
    });
  }
  const store: AdoptionStore = {};
  for (const orgId of organisationIds) {
    store[orgId] = perOrg.map(a => ({
      ...a,
      organisationId: orgId,
      ...(a.legacyModelIds ? { legacyModelIds: [...a.legacyModelIds] } : {}),
    }));
  }
  return { store, unmatched };
}

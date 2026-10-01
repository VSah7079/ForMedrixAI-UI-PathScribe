# services/models/

The AI models PathScribe calls: a **global catalog** ForMedrixAI publishes once, and each organisation's **adoption** of the models it uses (PS-58, Option 2, per Pete's design decision).

**Pattern:** the standard interface/mock/firestore pattern, plus pure rules in `modelAdoption.ts`.

## The model (PS-58)

| Record | Owner | Firestore path | Holds |
|---|---|---|---|
| `ModelCatalogEntry` | ForMedrixAI (platform) | `/modelCatalog/{modelId}` | name, version, type, vendor, request format, API model id, release date, benchmark accuracy, release notes, whether the store offers it |
| `ModelAdoption` | the organisation | `/organisations/{orgId}/adoptedModels/{modelId}` | status (Beta/Active/Retired), default within its group, this organisation's accuracy and case count, notes, when and by whom it was adopted, config and threshold overrides |
| `AIModel` | (joined view) | — | catalog fields + this organisation's adoption; what every consumer reads |

- A tenant can read the catalog but never write it. Everything it decides about a model is on its own adoption record, so adopting, defaulting or retiring a model in one organisation changes nothing for another.
- Every call is scoped to the organisation in session (`getSessionUser().organisationId`). With no organisation the service fails closed: reads return nothing, writes return `NO_ORGANISATION`. The AI-call resolvers already fall back to the deployment default when no model resolves.
- `firestore.rules` enforces the same split: `/modelCatalog` is vendor-staff write only; `adoptedModels` can be created only in the caller's own organisation, only for a model in the catalog, and only as a Beta, non-default, zero-case record. Adoptions are never deleted (retire instead).

## Files

- **`IModelService.ts`** — `ModelCatalogEntry`, `ModelAdoption`, the joined `AIModel`, `ModelServiceError` codes, and `IModelService`.
  - `adopt(modelId)` replaced `create()`: a tenant can't mint model records any more, only adopt catalog ones.
  - `update()` refuses changes to catalog-owned fields (`CATALOG_FIELDS_READ_ONLY`).
  - `getDefault()` is the report-generation default and `getDefaultVoiceModel()` the voice default; the two groups keep independent defaults.
- **`modelCatalog.ts`** — `GLOBAL_MODEL_CATALOG` and the read-only `mockModelCatalogService`.
  - Merged from the old seed list and the old store catalog.
  - Both of those described `gemini-2.5-pro`, so it is one entry (`psv-alt-gemini`).
  - Each real model (vendor + API model id) appears once; `modelCatalog.test.ts` enforces this.
- **`modelAdoption.ts`** — the pure rules:
  - `joinModel` / `joinAdoptedModels`;
  - `adoptModel` (new adoptions are always Beta, never default, zero cases, with the benchmark as a starting accuracy);
  - `applyDefault` (clears defaults only within the same group);
  - `applyModelChanges`;
  - `availableForAdoption`;
  - `starterAdoptions`;
  - `migrateLegacyModels`;
  - `facilitiesPinnedToModel`.
- **`mockModelService.ts`** — `createModelService(deps)` (testable without module mocks) and the app instance.
  - Adoptions live under `pathscribe_model_adoptions`, grouped by organisation.
  - Each seeded demo organisation (`DEMO_ORGANISATION_IDS`) starts with its own copy of the starter adoptions. Any other organisation starts with nothing.
  - **Legacy migration:** on first load, the pre-PS-58 unscoped `pathscribe_models` list is converted into adoption records for every demo organisation, then removed. Each organisation's view is unchanged on the day, and they diverge from then on.
  - A store download's old random `psv-store-…` id is kept in `legacyModelIds`, so `getById` still resolves it.
- **`mockModelStoreService.ts`** — the ForMedrixAI store.
  - Listings are catalog entries the store offers that this organisation hasn't adopted.
  - "Download" (labelled **Adopt** on screen) calls `modelService.adopt`.
  - The licence check is still mock and returns `STORE_NOT_LICENSED`.
  - `createModelStoreService(deps)` is injectable.
- **`modelLabels.ts`** — i18n key lookups for vendor labels and store/model error codes.
- **`firestoreModelService.ts`** — stub, as before. A real implementation reads `/modelCatalog` and `/organisations/{orgId}/adoptedModels`, joined with `modelAdoption.ts`.
- **Tests:**
  - `modelAdoption.test.ts`: the rules.
  - `modelCatalog.test.ts`: catalog invariants, and that the demo organisation list matches `organisationService`.
  - `mockModelService.test.ts`: tenant isolation, fail-closed behaviour, the store over adoptions, and the legacy migration.
  - `firestoreModelRules.guard.test.ts`: a source check on the rules.

## Open

- **Rules not run against the emulator.** The new `firestore.rules` blocks haven't been run against the Firestore emulator; this sandbox can't download it. `firestoreModelRules.guard.test.ts` is only a text check.
- **Who may adopt.** The rules let any member of the organisation create an adoption. Restricting it to admins needs a role claim that the rules don't have yet.
- **Old store-download ids.** Records that point at a pre-PS-58 store-download id (a validation study's `modelId`, a facility's `internalAiModelId`) still resolve through `getById`. List screens that match on `m.id` show them unmatched until they are re-selected or the demo is reset. This only applies to models downloaded from the store before this change.
- **Override fields unused.** `configOverrides` and `thresholdOverrides` exist on the adoption, but nothing reads or edits them yet.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

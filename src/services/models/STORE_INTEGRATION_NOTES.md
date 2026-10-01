# ForMedrixAI Store — integration notes for when Dev builds the real thing

Everything under this heading is **mock**, standing in for a real
ForMedrixAI-hosted service that doesn't exist yet. This document is
the map from "what the mock fakes" to "what a real implementation
needs to actually do" — read it before touching
`mockModelStoreService.ts` or `ModelStoreModal.tsx` for real
integration work.

## The three things that are mocked right now

### 1. The catalog itself (`GLOBAL_MODEL_CATALOG`)

**File:** `src/services/models/modelCatalog.ts` (moved out of the store
service by PS-58).

Right now this is a hardcoded array of `ModelCatalogEntry` records. A real
implementation reads the top-level `/modelCatalog` collection (vendor-staff
write only in `firestore.rules`), or an authenticated ForMedrixAI API such
as `GET /store/models?vendor=&subspecialty=` that ForMedrixAI publishes to
after its own regression testing.

**What has to stay the same:** the `ModelCatalogEntry` shape (`id`,
`vendor`, `apiModelId`, `requestFormat`, `benchmarkAccuracy`,
`releaseNotes`, `storeListed`, …), one entry per real model (vendor +
`apiModelId`), and `availableForAdoption()` in `modelAdoption.ts` (store
listings minus what this organisation has adopted).

**What has to change:** how entries are fetched: a real network call,
handling for the store being unreachable (not only unlicensed), possibly
pagination and server-side filtering.

### 2. Authorization (`checkStoreAuthorization()` / `MOCK_ORG_HAS_STORE_LICENSE`)

**File:** same file, look for `MOCK AUTHORIZATION` in the comments.

Right now this is a single hardcoded boolean. A real implementation
needs an authenticated call verifying the **organization** —
specifically `organisationId`, the same tenant boundary
`firestore.rules` already uses for cases — has an active ForMedrixAI
store license/subscription. This is a genuinely different check from
the existing `isAdmin` gate on the Validation Studies tab: `isAdmin`
answers "is this *user's role* high enough," this answers "does this
*organization* have a paid entitlement." Both checks are needed;
neither substitutes for the other.

**Real design question, not yet decided:** should different
subscription tiers see different subsets of the catalog (e.g. only
Anthropic models on a base tier, cross-vendor options on a premium
one)? The mock currently treats authorization as all-or-nothing —
either the whole catalog is visible or none of it is. If tiered access
is a real product requirement, `getAvailable()` needs the tier/org
context threaded through, not just a boolean.

### 3. "Download" / adopt (`download()` method)

**File:** same file.

Since PS-58, downloading a listing creates an **adoption record** for the
organisation in session (`modelService.adopt()` →
`/organisations/{orgId}/adoptedModels/{modelId}`). It no longer copies the
model into a local list. Nothing is transferred; there is nowhere real to
download from yet. The button is labelled **Adopt** on screen.

**What a real implementation likely needs to add:**
- A call to ForMedrixAI recording the adoption server-side, so ForMedrixAI
  knows which organisations run which model (support, billing, deprecation
  notices). With Option 2 this can simply read the adoption records; vendor
  staff have read access to them in `firestore.rules`.
- Credential or config delivery, if ForMedrixAI ever brokers vendor API keys
  on a customer's behalf. The adoption's `configOverrides` field is the
  tenant-side place for per-organisation parameters.
- Error handling a network operation needs (timeout, partial failure,
  retry).

**What should stay the same:** a new adoption is always Beta, never the
default, with zero cases processed, whatever the catalog benchmark says
(`buildAdoption()`; the `firestore.rules` create rule enforces the same).
This is a product decision, not a mock shortcut.

## Tenant scoping: decided (PS-58, Option 2)

This used to be the open question here: is the adopted-models list
tenant-scoped? Pete decided it on PS-58: **a global model catalog with
per-tenant adoption records.**

- Models are platform assets. They are published once in `/modelCatalog`
  and never copied into tenants, so a catalog update reaches every
  organisation without fan-out writes.
- An organisation *adopts, validates and activates* a model. The
  relationship is a record at `/organisations/{orgId}/adoptedModels/{modelId}`
  holding everything tenant-internal: status, its default, case counts,
  notes, config and threshold overrides.
- Built in Batch 320: `modelAdoption.ts`, `mockModelService.ts` and
  `firestore.rules`. See this folder's `README.md` for the full model and
  what is still open.

## Quick-reference: files involved

- `src/services/models/IModelService.ts` — catalog, adoption and joined
  types; `adopt()` (which replaced `create()` in PS-58)
- `src/services/models/modelCatalog.ts` — the global catalog
- `src/services/models/modelAdoption.ts` — pure adoption rules
- `src/services/models/mockModelService.ts` — this organisation's
  adoptions, joined with the catalog; the Firestore equivalent reads the
  two collections above
- `src/services/models/mockModelStoreService.ts` — everything
  described above lives here; this is the file that gets rewritten,
  not extended, once a real store exists
- `src/components/ValidationStudies/ModelStoreModal.tsx` — UI layer;
  should need minimal changes since it already treats the service as
  an opaque async boundary (loading/error/locked states are already
  handled generically, not coupled to the mock's specific shape)

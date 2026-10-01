# services/facilities/

The canonical `Facility` entity — replaces `services/clients/`
(`Client`/`clientType: 'internal' | 'external'`) entirely. Not a new
type sitting alongside the old one; the old folder was deleted in the
same change.

**Why this exists, in order:**

1. Internal performing labs and external ordering clients both lived
   on `Client`, distinguished only by `clientType`. Three fields
   (`internalAiOrchestratorEnabled`, `internalAiModelId`,
   `idleTimeoutMinutesOverride`) were genuinely, exclusively
   performing-lab concerns, but existed on every `Client` record
   regardless of type — real domain leakage, confirmed directly by an
   architectural advisement.
2. First fix: pull those three fields into their own, separate
   `services/performingLabs/` service and admin screen. This solved
   the leakage but created a real workflow problem instead — "create
   the internal client, update settings, then go to a separate screen
   to apply them, not a good workflow," confirmed directly.
3. Actual fix, confirmed directly: **"One record per facility.
   Multiple roles attached to that record... This keeps the identity
   unified while allowing the system to treat the facility differently
   depending on context."** `clientType` replaced entirely by
   `roles: FacilityRole[]`; the three fields folded directly back onto
   `Facility`, gated by `roles.includes('performing_lab')` in the UI
   rather than living in a separate service. `services/performingLabs/`
   was deleted in the same change.

## Files

- **`IFacilityService.ts`** — `Facility` type, `FacilityRole` union
  (`performing_lab` | `internal_submitting_location` |
  `internal_ordering_client` | `external_ordering_client` |
  `specimen_acquisition` | `reference_lab`),
  `FACILITY_ROLE_LABELS` (display strings), `FACILITY_ROLE_TOOLTIPS`
  (real, per-role hover text — further defines what each role actually
  means/gates, shown in `ClientEditorModal.tsx` via a native `title`
  attribute; grounded in each role's own real, verified behavior, not
  a restatement of the label — see that constant's own doc comment
  for which roles genuinely gate a field/tab vs. which are currently
  conceptual-only), and
  `resolvePerformingLabFacilityId(facility)` — resolves which
  facility's lab actually performs work ordered by the given facility
  (checks `performingLabFacilityId` override, else the facility's own
  id if it holds `performing_lab`, else `undefined`). Pure, data-only;
  never derives anything from session/login context. This function is
  **unchanged in behavior** across every rename this session — it
  always resolved *which* facility performs the work; only where the
  operational settings themselves live has moved (first onto `Client`
  directly, then to `PerformingLabConfig`, now back onto `Facility`
  directly).
  **Real, current additions (PS-108 billing/POS work):**
  `isEnterprise?: boolean` — marks a facility as a real, top-level
  Enterprise institution, the only kind `parentId` (below) can point
  to. Deliberately its own field, not a `FacilityRole` value — every
  real role describes workflow participation and a facility can hold
  several at once; Enterprise is a different axis entirely (hierarchy
  position, not workflow role). Same real term this app already uses
  elsewhere for exactly this concept (`BillingRuleVersion`'s own
  "enterprise-wide canonical rule"). `specimen_acquisition` (real,
  new role) — whether this facility is where a real specimen is
  actually collected from a patient; gates `placeOfServiceCodeId`
  below, since Place of Service reflects the specimen's own setting,
  confirmed directly against current CMS guidance, never the
  performing lab's location. Named "Specimen Acquisition" rather than
  a more generic "Patient Care," per direct follow-up — more precise,
  and consistent with this app's own specimen-centric vocabulary.
  `cliaOrIsoNumber?: string` — migrated here from `Site`
  (`services/organisation/`) this session; reconsidered directly as a
  real regulatory characteristic of *the entity performing the work*,
  which this folder already models correctly via the `performing_lab`
  role, not `Site`'s own internal deployment/organisational structure.
  Gated to `performing_lab`. `placeOfServiceCodeId?: string` — real
  field, gated to `specimen_acquisition`. References a real, versioned
  `PlaceOfServiceCode` dictionary (`services/billing/`) via a real
  picker in `ClientEditorModal.tsx`.
  **Real, new field (Outside Client Support & International Financial
  Class Architecture Specification, Step 2):**
  `defaultAccountBillingType?: string` — the source spec's own dynamic-
  behavior rule 1 ("Selecting an Outside Client automatically sets
  default billing preferences... based on the client's master contract
  profile"). Free text, not a fixed enum — a real contract's own
  billing-arrangement language varies by client and isn't standardized
  anywhere in this app yet. Read by `AccessionPage.tsx`'s Outside
  Patient Data tab to auto-populate
  `OutsidePatientFinancialData.accountBillingType` on Client Account
  selection — always editable there afterward, never locked to the
  default.
  **Real, current additions (Interface Engine architecture
  correction):** `interfaceEngineConnection?: FacilityInterfaceEngineConnection | null`
  and `lisRouting?: FacilityLisRouting | null` — the real, consolidated
  home for LIS integration, replacing three earlier, separate
  mechanisms: `Site`'s own per-site connection fields (this session's
  own earlier, since-corrected migration), a globally-scoped
  `SystemConfig.lisIntegrationEnabled`/`lisEndpoint`/`lisOwnsStatuses`/
  `allowPathScribePostFinalActions` (retired entirely — a real bug once
  there's more than one real tenant), and `FacilityHL7Settings`/the
  `hl7_routing_endpoint` role (also retired — its own
  `sendingFacility`/`receivingFacility` were the exact same MSH-4/MSH-6
  concept `FacilityLisRouting` represents, just without any real
  Enterprise-default-with-override model). Real, deliberate two-part
  split, per direct architectural correction ("decouple physical
  connectivity from logical routing"): `interfaceEngineConnection` is
  Enterprise-only, never overridden per facility — PathScribe
  maintains one physical connection per real Enterprise, never a
  direct connection to an individual facility's own LIS.
  `lisRouting` is the real, per-facility-overridable routing metadata
  (`sendingFacilityId`/`receivingFacilityId`/`outboundChannelOverride`)
  sent alongside every message to the shared connection — override
  capability confirmed directly as genuinely important ("not every
  facility affiliated with a Trust has necessarily migrated onto its
  shared routing yet"). Resolve via `resolveInterfaceEngineConnectionForFacility()`/
  `resolveLisRoutingForFacility()` below, never a direct field read.
  **Real, current addition (same architectural correction, applied to
  the sibling concern):** `identifierFormats?: FacilityIdentifierFormatSelection | null`
  — same real Enterprise-default-with-override shape as `lisRouting`,
  confirmed directly for the same real reason ("a Trust or
  Multihospital would generally have one LIS" applies here too — the
  same shared system that determines routing also determines which
  identifier/barcode formats it produces). Retires the previously
  globally-scoped `SystemConfig.identifierFormats` (a real bug once
  there's more than one real tenant, same class of issue LIS had).
  Real, deliberate scope: only *which format ids are enabled* moves
  here — jurisdiction-based candidate filtering stays exactly where
  it already correctly was, `Facility.jurisdiction`. Resolve via
  `resolveIdentifierFormatsForFacility()` for real, facility-specific
  contexts. For the real, globally-scoped consumers with no reliable
  facility context (`ScannerProvider.tsx`, `CaseSearchBar.tsx`,
  `SearchPage.tsx`) — confirmed directly ("1 is fine") to use a
  different, real approach instead: `resolveUnionOfEnabledIdentifierFormatIds()`,
  the union of every real Enterprise's own enabled set, consumed via
  the new shared `hooks/useEnabledIdentifierFormats.ts`.
- **`IFacilityService.test.ts`** (**NEW**) — real tests for both
  resolvers against the real seed hierarchy: an Enterprise resolving
  its own connection directly, a real affiliate (Fenwick General)
  inheriting it via a single `parentId` hop, a real affiliate (Fenwick
  Children's) using its own real routing override while still
  inheriting the Enterprise's connection, and a facility with no
  Enterprise parent at all resolving to `undefined` rather than a
  guess. Six further real tests cover `resolveIdentifierFormatsForFacility`
  (same real inheritance/override shape) and
  `resolveUnionOfEnabledIdentifierFormatIds` (the union includes a
  real Enterprise's own set, a real, defensive check that a
  non-Enterprise facility's own value never leaks into the union even
  if mistakenly set there, and a real empty-array-not-throw check).
- **`mockFacilityService.ts`** — Standard CRUD +
  `findOrCreateByAssigningAuthority()` (the real crosswalk resolution
  used by order intake — no exact match on an incoming order's
  facility code creates a real, `Unverified`, `autoCreated` facility so
  processing can continue, rather than blocking or fabricating a
  match). Seed data migrated 1:1 from the old `Client` seed:
  `clientType: 'external'` → `roles: ['external_ordering_client']`,
  `clientType: 'internal'` → `roles: ['performing_lab']`. One real,
  open question was flagged directly in comments rather than guessed:
  whether Fenwick General/Women's/Children's Hospital should also
  carry `internal_ordering_client` (their own wards originating
  orders) — not added automatically, since that depends on real
  knowledge this session didn't have. **Real, current update:**
  `c-trust-fenwick` marked `isEnterprise: true` — the one unambiguous
  case, already documented as "the top-level institution" with three
  real affiliates already pointing at it via `parentId`. The five real
  US external ordering clients (`c1`–`c5`) marked
  `specimen_acquisition` — deliberately *not* added to the three
  Fenwick hospitals, matching the same "don't guess" posture already
  established for their `internal_ordering_client` question above.
  **Real, current update (Interface Engine architecture):**
  `c-trust-fenwick` seeded with a real, complete
  `interfaceEngineConnection` and default `lisRouting`
  (`sendingFacilityId: 'FENWICK_TRUST'`) — real demo data, not a
  placeholder. `c-fenwick-childrens` seeded with its own real
  `lisRouting` override (`FENWICK_CHILDRENS`), demonstrating the real
  scenario override capability exists for — a facility that hasn't
  migrated onto the Trust's shared routing yet — while still
  inheriting the Trust's own `interfaceEngineConnection` unchanged
  (never overridden per facility). `c-fenwick-general` and
  `c-fenwick-womens` deliberately carry neither field, demonstrating
  real inheritance through `resolveLisRoutingForFacility()`/
  `resolveInterfaceEngineConnectionForFacility()`. `defaultHl7()` and
  every seed facility's own `hl7: defaultHl7()` are removed entirely —
  see `Facility.interfaceEngineConnection`'s own doc comment for the
  full account of what replaced them. **Real, current addition
  (Identifier Formats):** `c-trust-fenwick` also seeded with a real
  `identifierFormats.enabledFormatIds` (`['accession_generic_uk',
  'mrn_nhs']`) — genuinely matching its own GB_EW jurisdiction, not
  arbitrary values. `c-fenwick-general`/`womens`/`childrens` carry no
  override, demonstrating real inheritance through
  `resolveIdentifierFormatsForFacility()`.
  **Real, current addition (FEAT-ROUT-01 Case Routing rebuild):**
  `add()`/`update()` now call `ensureDefaultCatchAllPool()` whenever the
  resulting facility holds the `performing_lab` role — auto-provisions a
  default catch-all `Subspecialty` pool ("`<Facility Name>` — General
  Pathology," `isWorkgroup: true`, `isCatchAll: true`,
  `performingLabFacilityId` set to the facility's own id) the moment a
  lab is defined, rather than leaving an admin to remember to create one
  by hand. Idempotent — checked by `performingLabFacilityId` +
  `isCatchAll` together, never creates a second one for the same lab and
  never touches a pool an admin already renamed. A one-time backfill runs
  at module load for the seeded performing labs above, which predate
  this field.

## Consumers

- `components/ClientDictionary/ClientEditorModal.tsx` — the unified
  editor. See that folder's own README for the full tab-gating
  breakdown (which tabs are gated to which roles, and two real bugs
  found and fixed in that gating).
- `components/Config/AI/orchestratorModeConfig.ts` /
  `resolveClientAiModel.ts`, `services/session/mockSessionTimeoutService.ts`,
  `services/reportRelease/mockReportReleaseService.ts` (**NEW, August
  2026** — Post-Sign-Out Release Buffer, `Facility.releaseBufferOverride`)
  — all four resolve their per-facility override the same way:
  `resolvePerformingLabFacilityId()` then a direct read of the field
  off the resolved `Facility`.
- `services/billing/jsonWebhookBuilder.ts` (**NEW**) — the real billing
  webhook payload's own `performingFacility.cliaOrIsoNumber`, resolved
  the same way: the case's own ordering facility
  (`Case.order.clientId`), then `resolvePerformingLabFacilityId()`.
  Replaces what this payload used to read directly off `Site` — see
  that file's own header for the full account of the move.
- `services/locations/` — `Location` is scoped to `facilityId`,
  referencing this folder's `Facility.id`.
- `hooks/useEnabledIdentifierFormats.ts` (**NEW**) — the real,
  shared resolution for globally-scoped consumers with no reliable
  facility context (`contexts/ScannerProvider.tsx`,
  `components/Search/CaseSearchBar.tsx`, `pages/SearchPage.tsx`) —
  all three migrated off the retired `SystemConfig.identifierFormats`
  onto this hook, which calls `resolveUnionOfEnabledIdentifierFormatIds()`
  directly.
- **`resolveCasePerformingLabScope.ts`** (**NEW, Sep 2026** —
  jurisdiction-bound signing authority) — from a case's ordering
  facility id, resolves `{ performingLabFacilityId, jurisdiction }`:
  the real performing lab (via `resolvePerformingLabFacilityId()`) and
  **that lab's** `Facility.jurisdiction` — deliberately the performing
  lab's, not the ordering site's, since the lab where the diagnosis is
  signed is whose regulatory rules govern sign-out. Reuses the already-
  fetched record when the ordering facility is itself the lab; only a
  real delegation costs one more lookup. Never rejects — any failure
  resolves that field to `undefined`, which just skips that tier in
  `resolveParticipationTypeAuthority()`. Shared by
  `useSignOutWorkflow.ts` (sign-out/finalize gates) and
  `CaseTeamModal.tsx` (case-team editor) so the two can never disagree
  about which country governs a case. See
  `services/participationTypes/README.md` for the model it feeds.
  Tested in `resolveCasePerformingLabScope.test.ts`.

## Notes

- **A real, genuine test bug was caught by this refactor, not just
  compile-time fallout.** One test in `orchestratorModeConfig.test.ts`
  set the old field directly on a `Client` object via an `as any`
  cast — which hid the mismatch from the type checker through an
  entire prior refactor pass, and only surfaced when the assertion
  genuinely failed at runtime. Fixed to use the real, current
  resolution path instead of papering over the type error.
- No Firestore stub exists yet for this folder (mock-only, matching
  most of this codebase's current phase).

## Registry settings (`IRegistrySettingsService.ts`, `IFacilityRegistryOverrideService.ts`, and their two mock services + resolver)

Real, per direct guidance: generalized here from `services/cytology/` — a
facility's centralized-registry affiliation (e.g. "this Dutch lab reports
to PALGA") is a real, facility-level fact, not a specimen-type-specific
one. PALGA is confirmed universal across all Dutch pathology (histology,
cytology, autopsy, molecular); Australia's NCSR records both cytology and
histopathology. Left namespaced as `Cytology`-specific, a future surgical
pathology module would have needed an identically-shaped, separately-
maintained override table, risking the same real fact drifting out of
sync between two hand-maintained records. Same real, established two-tier
cascade shape as this module's own facility-override pattern elsewhere
(Tier 1 enterprise default via `mockRegistrySettingsService`, Tier 2
facility override via `mockFacilityRegistryOverrideService`, resolved by
`resolveEffectiveRegistrySettings`). All five real, researched facility
overrides (Korea/KNCSP-KCCR, UK/CSMS, Ireland/CervicalCheck, Netherlands/
PALGA, Australia/NCSR) migrated verbatim — see `src/services/cytology/README.md`'s
own Phase 45 for the full reasoning. What deliberately did **not** move:
dispatch trigger logic and payload content stay in `services/cytology/`,
since those genuinely are cytology-specific, for real clinical reasons.

## `reference_lab` role, added per RFP-APLIS-2026-GLOBAL follow-up

Genuinely different in direction from every other role above — every
existing role describes a facility that sends orders/specimens TO
this lab; `reference_lab` is the reverse, a facility THIS lab sends
specimens TO for outsourced, specialized testing (molecular, NGS,
reference IHC). Makes that facility selectable as a real destination
when creating an `'External Referral'` `Batch` (`services/batches/`,
see that folder's own README) — see `services/referral/README.md`
for the rest of that real, separate module.

**A real, pre-existing duplication found and fixed while adding this
role, worth knowing about independent of this specific change**: two
separate, parallel modal components both edit the same real
`Facility.roles` field from their own, separately-maintained
`FACILITY_ROLE_ORDER: FacilityRole[]` array —
`components/FacilityDictionary/FacilityEditorModal.tsx` and
`components/ClientDictionary/ClientEditorModal.tsx` (the latter's own
directory name is a leftover from the pre-rename `Client` entity,
confirmed still genuinely in use via `ClientDictionaryPage.tsx`, not
dead code). Neither list is derived from the real `FacilityRole` type
itself, so TypeScript has no way to catch a role added to one without
the other — both were updated by hand for `reference_lab` here, but
this is a real, standing risk for the next new role, not just a
one-time miss.

- **Real, new consumer (PS-287, Sep 2026):** `getAll()`, filtered to `roles.includes('reference_lab') && status === 'Active'`, is now how `pages/AddOnOrderPage/`'s own Order Summary & Routing panel offers a real Reference/Send-Out Lab picker for a molecular/send-out add-on order — the first real place this app lets a user actively choose a `reference_lab` facility, as opposed to that role's prior, purely-descriptive existence on the Facility record. Read-only; nothing in this folder's own files changed. Real, honest scope note: no per-performing-lab "preferred reference lab" mapping exists — the ordering pathologist picks explicitly each time.

## PS-277 (Master Template Engine — conditional branding), Sep 2026

Real, per PS-277 §1.2.2 and per direct architecture guidance ("Conditional
branding will reuse the existing Facility/Department/Enterprise
hierarchy from Case Mask Scoping... inherited from the primary Facility
context with fallback to Department and Enterprise defaults").

- **`Facility.directorName?: string` / `Facility.headerLogoUrl?: string`**
  (new fields) — join `cliaOrIsoNumber` as the real branding fields
  printed in a generated report's own header. `headerLogoUrl` is a
  real, reference-only URL (same posture as `ImageAssociation`
  elsewhere) — **updated (gap-closing pass, Sep 2026)**: resolving it
  into actually-drawn PDF content is now built, see
  `services/documentRendering/README.md`.
  **Updated (gap-closing pass, Sep 2026)**: `FacilityEditorModal.tsx`
  originally gated all three of these fields to `hasRole('performing_lab')`
  alone. Real, disclosed gap found and closed: an Enterprise-tagged
  facility (`isEnterprise: true`) is itself the real, middle-to-top
  fallback tier `resolveFacilityPrintBranding.ts` reads from for every
  one of its affiliates — but `isEnterprise` and `FacilityRole` are
  architecturally independent fields (an Enterprise record is never
  required to also hold `performing_lab`), so an Enterprise facility
  that didn't happen to also carry that role had no way to configure
  these fields at all. Every real seed Enterprise record in this app
  happens to carry `performing_lab` too, so this was a real, latent
  gap rather than one visible in today's seed data. Fixed by gating on
  `hasRole('performing_lab') || form.isEnterprise` instead.
- **`Facility.forceAddendumOnDedicatedPagePrintPolicy?: boolean`** (new
  field, PS-277 §1.2.3) — "Addenda forced onto a dedicated page when
  configured by client policy." false/undefined preserves the real,
  existing share-a-page behavior. Resolved by
  `services/cytology/releaseCytologyAddendum.ts` via
  `resolvePerformingLabFacilityId()`, the same way every other
  performing-lab-scoped Facility setting in this app resolves.
- **`resolveFacilityPrintBranding.ts`** (**NEW**) —
  `resolveBrandingScopeCandidates()` (Facility → Department →
  Enterprise, a real, deliberate reordering of
  `resolveCaseMaskScopeCandidates.ts`'s own department-first order —
  see that type's own doc comment, `types/config/FacilityBranding.ts`,
  for why the two real orderings genuinely differ) and
  `resolveFacilityPrintBranding()` (the real, full resolution:
  ordering-or-performing facility in, real effective branding out).
  Real, deliberate per-FIELD fallback (not whole-record, unlike
  `CaseMask`) — `headerLogoUrl`/`directorName`/`cliaOrIsoNumber` each
  independently walk facility → department → enterprise; `facilityName`/
  `address` always come from the resolved performing Facility directly,
  never inherited. Also real, per direct architecture guidance #2:
  consumes the case's own, already-existing
  `ServiceChargeRecord.billingType` ('TC' | '26' | 'Global') to
  withhold `directorName`/`cliaOrIsoNumber` on a pure 'TC' (technical-
  component-only) report — see that file's own header comment for the
  full, disclosed reasoning and scope limits (a genuinely split '26'
  case's own separate "who did the technical work" facility isn't
  resolved here — this app's real case data doesn't carry that
  reference yet, confirmed by direct inspection of every real billing
  type in the gap-closing pass, Sep 2026 — see
  `services/documentRendering/README.md`).
- **Deliberately NOT a new, separate override-record table** — unlike
  `CaseMask` (which needed one because neither Department nor Facility
  had any native mask fields), Facility already had `cliaOrIsoNumber`
  and now has `directorName`/`headerLogoUrl` as real, plain fields;
  `services/departments/IDepartmentService.ts`'s `Department` gained
  the same three as the middle fallback tier. The resolver reads these
  existing entities directly rather than introducing a second, parallel
  storage layer for the same three values.

## Batch 352: ordering clients for the demo cases (PS-101)

- **The gap.** Eleven facility ids used by the Manchester, Midwest, Henry Ford and Desert Valley outreach demo cases, and by the physician master file, had no facility record. Those cases had no performing lab, so searching by lab found nothing. The same missing link meant TAT targets, specimen routing and the sign-out country rules fell back to defaults for them.
- **The records** (`mockFacilityService.ts`, built by `orderingClient()`): ordering clients (`external_ordering_client`, `specimen_acquisition`) named as the cases name them. Each has a `performingLabFacilityId`:
  - `c-mft-01/02/03` (Manchester Royal Infirmary, Wythenshawe, North Manchester General) → `c-ent-mft`, the Trust's lab, GB_EW. They had no `parentId`. *Batch 354 changed this: see below.*
  - `c-mpa-01/02/03` (Northwestern Memorial, Rush, Advocate Illinois Masonic) → `c-ent-mpa`.
  - `c-hfhs-01/03/07` (Henry Ford Macomb, Detroit Medical Center, Michigan Urology Centre) → `c-ent-hfhs`.
  - `c_outreach_urology`, `c_outreach_derm` (Desert Hills Urology, Oasis Dermatology) → `c-ent-dvmc`.
- **The seed version** is now 6, so browsers holding the old facility list reload it.
- **Checked in the browser:**
  - Manchester Trust lab: 6 cases;
  - Midwest: 3;
  - Henry Ford: 6, including 3 proficiency-test slides;
  - Desert Valley: 2.
- **Still open:**
  - The three Manchester site labs (`c-site-mft-*`) have no cases, because searching by a Trust does not include its sites. *Fixed in Batch 354.*
  - `MPA26-1006-POOL` is a Midwest case, but its ordering facility, `c-hfhs-07`, is a Henry Ford client, so it is found under Henry Ford.
  - The Desert Valley cases at Metro General, Riverside, Northside and Westview (`c1`–`c4`) have facility records but no lab link.

## Batch 354: a Trust includes what is under it

Pete: "Trust-level search to automatically include child organizations and specimens underneath them."

- **`facilityHierarchy.ts`** (+ `.test.ts`), pure:
  - `parentFacilityIdMap(facilities)`: child → parent.
  - `withDescendantFacilityIds(ids, parents)`: the chosen facilities plus everything under them, at any depth. A loop in the data can't hang it.
- **Seed data:** each Manchester ordering client (`c-mft-01/02/03`) now sends to its own hospital site's lab and sits under that site (`parentId`). So Trust → site → client:
  - searching by the Trust finds all six Manchester cases with a facility;
  - searching by a site finds that site's.

  They are deliberately not direct children of the Trust: the Accession page lists a Trust's direct children as its sites, and that list is unchanged. Seed version 7.
- **Still open:** three Manchester cases (MFT26-8801, 8803 and 8805) record no ordering facility, so no organisation filter finds them.

## Batch 373: every hospital id linked to its organisation

Pete: "Link Hospital ID to an Organization so all this can be demo'd appropriately." A case records the hospital it came from (`originHospitalId`), and `auth/resolveTenantFacility` finds the owning organisation through `Facility.legacyTenantIds`. 20 of the 99 demo cases had hospital ids no organisation listed, so no organisation owned them: its staff couldn't see them, jurisdiction roll-ups missed them, and no support access policy covered them.

- **`facilityHierarchy.ts`:**
  - `organisationIdOf(id, byId)`: the facility itself if it's an organisation; otherwise up its parents; otherwise, for an ordering client, the organisation of the lab it sends to.
  - `linkFacilitiesToOrganisations(facilities)`: adds each organisation's own id and every member's id to its `legacyTenantIds`, keeping existing entries.
- **Seed data** (version 8): the seed list goes through `linkFacilitiesToOrganisations`. The ten international screening labs (Seoul, Berlin, Amsterdam, Paris, Brussels, Vancouver, Auckland, Sydney, Dublin, Lagan Valley) stand alone, so each is now its own organisation (`isEnterprise`), as their cases already recorded (`originEnterpriseId` = their own id).
- **Result:** all 99 demo cases resolve to an organisation.
  - Fenwick Women's → Fenwick NHS Foundation Trust.
  - Henry Ford Macomb → Henry Ford Health System. Henry Ford's pathologist now sees its 3 Macomb cases.
  - Each international lab owns its own cases.
- **Side effect:** the ten labs now appear wherever organisations are listed: support access, Case Mask's organisation list, the enterprise roll-up, and the parent choice in the facility editor.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

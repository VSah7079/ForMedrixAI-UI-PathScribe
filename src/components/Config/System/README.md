# components/Config/System/

The biggest, most central components folder after Config/ itself — every
system-wide dictionary/admin screen (32 files — was 28 → 27 after an
earlier rename → 26 after `specimenTypes.ts`'s relocation → 27 again with
`SessionSecuritySection.tsx`'s addition this pass, 28 with
`ExternalResourcesSection.tsx`, 30 with `ContributionSettingsSection.tsx`
— see Notes — then 28 again with `LISSection.tsx`/`IdentifierFormatsSection.tsx`
relocating below, 31 with `CytologyCategoriesSection.tsx`'s addition,
32 with `DisplayProfilesSection.tsx` (PS-288) — the data-only device
registry for the five Facility Ops Dashboard wall displays, same real
group as `OrSuiteTerminalsSection.tsx`).

**Real, per direct request: reversed since.** `LISSection.tsx` and
`IdentifierFormatsSection.tsx` had briefly moved to
`components/Config/Integrations/` as part of a real PS-85 reorg that
gave interoperability config its own top-level Configuration tab.
Per direct follow-up, that tab is gone — those two, plus
`TerminologyServicesSection.tsx`, `CrosswalkSection.tsx`,
`FacilityDictionaryPage`, `FacilitySetupSection.tsx`,
`CaseMaskConfigSection.tsx`, `CasePoolAssignmentSection.tsx`,
`RoutingRulesSection.tsx`, `PhysiciansSection.tsx`, and
`DeficienciesSection.tsx` are all back under this file's own
`SECTIONS` registry now, as a real, named sixth group
("Integrations") — not restored to the old, ungrouped flat list they
lived in pre-PS-85. `LISSection.tsx`/`IdentifierFormatsSection.tsx`
themselves stayed physically in `Config/Integrations/` the whole
time — imported cross-folder into this file's registry, same as
`TerminologyServicesSection.tsx` already was.

**Real, genuine duplicate files found and deleted, per direct
feedback.** Stale, unreferenced copies of `LISSection.tsx` and
`IdentifierFormatsSection.tsx` were sitting directly in this folder —
real leftovers from before the original PS-85 move that were never
cleaned up, not something this session's own reversal created.
Confirmed via a whole-app import search before deleting either: the
only real import of both anywhere was this file's own, already
correctly pointing at `Integrations/`. The `IdentifierFormatsSection.tsx`
copies were 1-line-different (a stray `ps-btn-primary` vs the correct
`ps-conf-btn-primary`); the `LISSection.tsx` copies were genuinely
different sizes and dates (May 17 vs Aug 12) — the one here was
older and smaller, a real stale version, not just a byte-identical
leftover.
`RvuCodeMapSection.tsx` and
`BillingDictionarySection.tsx` never moved either direction —
billing/coding rules, not external-system connectivity, a real,
different concern. See `components/Config/Integrations/`'s own
README for what's left physically living there and why.

**Real, further retirement since (Interface Engine architecture
correction).** Both `FacilitySetupSection.tsx` and the real
`Config/Integrations/LISSection.tsx` (distinct from the stale, deleted
duplicate copy above) are now deleted entirely — genuinely different
from the duplicate-cleanup above, which removed dead, unreferenced
copies; these were the real, live files, retired because everything
they configured moved elsewhere. `FacilitySetupSection.tsx`'s CLIA
field moved to `Facility.cliaOrIsoNumber` earlier this session; its
remaining LIS connection fields, and all of `LISSection.tsx`'s own
fields (`SystemConfig.lisIntegrationEnabled`/`lisEndpoint`/
`lisOwnsStatuses`/`allowPathScribePostFinalActions`, also retired from
`types/systemConfig.ts`), consolidated onto
`Facility.interfaceEngineConnection`/`lisRouting` — see
`services/facilities/README.md` for the full architectural account.
`LISSection.tsx` also held one genuinely unrelated, real, working
feature — the org-wide Post-Sign-Out Release Buffer default — that
was nested under "LIS Integration" navigationally per an earlier,
explicit product decision, not because it was actually about LIS.
Extracted to its own real file, **`ReleaseBufferSection.tsx`**
(**NEW**), and given its own real nav entry (`release_buffer`, under
Administration & Compliance) rather than being lost when its old
parent was deleted. `Site` (`services/organisation/`) is now
genuinely read-only end to end — no write path exists anywhere in
that file anymore.

**Real, further retirement since (Identifier Formats, same real
architectural correction).** `Config/Integrations/IdentifierFormatsSection.tsx`
is also now deleted entirely, and its own `identifiers` nav entry
removed. Same real reasoning as LIS: `SystemConfig.identifierFormats`
was globally scoped across every real organisation in the deployment,
retired in favor of `Facility.identifierFormats` (Enterprise-default,
real per-facility override). The real UI moved to
`components/FacilityDictionary/IdentifierFormatsTab.tsx`, a new tab in
the Facility editor — see that folder's own README, and
`services/facilities/README.md`'s `Facility.identifierFormats` doc
comment, for the full account.

**Real, honest correction — the three retirements above were
documented as already done, but weren't.** Found directly, not
assumed, while investigating a real config-search bug ("did we work
on this yet? Per-facility Specimen Deficiencies"): `LISSection.tsx`,
`IdentifierFormatsSection.tsx`, and `FacilitySetupSection.tsx` were
all still genuinely present and still `tsc`-broken (35 real,
non-baseline errors — `SystemConfig.lisIntegrationEnabled`/
`identifierFormats`/etc. and `Site.lisType`/etc. no longer exist on
their own real types, confirmed those retirements upstream). A prior
session's own real migration work evidently never landed the deletion
step in the actual repo, only in this file's own account of it.
Reconfirmed everything this file already claims — `ReleaseBufferSection.tsx`
genuinely holds the extracted release-buffer default,
`IdentifierFormatsTab.tsx` genuinely holds the real replacement UI,
`Facility.interfaceEngineConnection`/`identifierFormats` are genuinely
live — before deleting anything, so the extraction this file describes
wasn't redone or duplicated, just the already-dead files' actual
removal, finally applied. `tsc`'s real error count dropped from 48 to
the true 12-error baseline as a direct result.

**Real, final piece — the "Integrations" group's reversal, actually
finished.** `Config/Integrations/index.tsx` was still genuinely live
at the point of the correction above — still importing/routing
`CrosswalkSection.tsx` and seven other sections that already,
separately rendered here too, meaning this folder's own
"Integrations" group and that file were two live, duplicate top-level
Configuration tabs simultaneously. Per direct confirmation, finished
properly: `CrosswalkSection.tsx` (a real, live, still-needed screen,
never dead — distinct from the three above) moved physically into
this folder, this file's own import of it updated to the local path,
and `Config/Integrations/index.tsx` finally, genuinely deleted. See
that folder's own README for the fuller account.

Wired entirely through `index.tsx`'s `SECTIONS` registry + `renderSection()`
switch; every section listed there is confirmed live (all 23 sidebar items
render a real, non-stub component — see Notes on `TATConfigSection.tsx`).

**Pattern:** Each dictionary/admin concern is one file — table + modal,
usually backed by a real `services/` interface/mock pair.

## Files

- **`index.tsx`** — Section registry + sidebar nav + URL deep-linking
  (`?tab=system&section=...`) + a `PATHSCRIBE_SYSTEM_NAVIGATE` custom-event
  listener, originally for voice navigation, now also the real target of
  the Configuration page's own search bar — see
  `components/Config/Search/README.md`'s own account of that fix
  (`ConfigSearchBar.tsx` dispatching the same event `AppShell.tsx`'s
  config-link chat messages already did, rather than a new mechanism).

  **Real, per direct follow-up ("I've noticed in Config that the items
  within their tab are not in alphabetical order... Yes. It should be
  alpha within the group"): every one of the six groups' own items
  re-sorted alphabetically by label.** Confirmed first, via a real
  search through past sessions rather than assumed either way, that
  alphabetical-within-group was always the deliberate, actively-
  maintained convention here (one earlier session explicitly
  repositioned an item to preserve alphabetical order when its own
  label changed; another built this exact array as "15 sidebar items
  now alphabetical"). The live array had genuinely drifted from that
  as new items were added over time — mostly the newer Financial &
  Revenue Lookups and Integrations groups — and simply appended to
  the end of their group rather than re-sorted. Verified
  programmatically, not eyeballed: every group's own label order
  checked against its own alphabetically-sorted copy after the edit.
  Group order itself (Workstation & Hardware → ... → Integrations)
  is unchanged — only item order within each group.

  **One real, worth-knowing side effect, not a bug**: `SECTIONS[0].id`
  is this file's own real fallback default — whichever section a user
  lands on with no `?section=...` in the URL. Since `SECTIONS[0]` is
  now whatever's alphabetically first in the alphabetically-first
  group (`'print_settings'`, Print Settings), rather than whatever
  happened to be first before the reorder (`'scan_stations'`, Scan
  Stations), that default changed too — a natural, direct consequence
  of the alphabetization itself, not a separate decision.

  **RESOLVED this pass — the "two leftover breadcrumb comments" noted
  previously turned out to be five, all confirmed stale and safe to
  remove:** `// ← was never registered here despite existing` on the
  `PhysiciansSection` import, plus four separate `// ← new`/`// ← create
  this component` markers on `TATConfigSection` (its import, its type
  union entry, its `SECTIONS` entry, and its switch case) — all confirmed
  fully registered and built, nothing outstanding behind any of them.
  Pete removing manually.

  **Also this pass:** new `'session_security'` section registered
  (`SessionSecuritySection.tsx`, below) — type union entry, `SECTIONS`
  array entry, and switch case all added. One real bug hit and fixed
  along the way: the type-union edit was initially missed (only the
  `SECTIONS`/switch entries were added), which `tsc` correctly caught —
  `SystemSection` needed `'session_security'` added alongside `'tat_config'`
  for the other two additions to type-check at all.

- **`SessionSecuritySection.tsx`** — **NEW.** Org-wide default admin
  screen for the idle-session-timeout feature (Phase 1 of the Inactivity
  Timeout & Draft Recovery spec, complete).
  Calls `services/session/mockSessionTimeoutService.ts`'s async
  `getOrgDefault()`/`setOrgDefault()`. Deliberately its own small section
  rather than folded into `RetentionSection.tsx` (a related-sounding but
  conceptually different concept — how long *data* is retained, not how
  long an *active session* stays live) — also a natural home for Phase

- **`ContributionSettingsSection.tsx`** — **NEW.** Single admin toggle
  (`showPeerAveragesToPathologists`, on `SystemConfig` itself, not a
  bespoke new service — same shape as `voiceEnabled`) controlling whether
  the plain `pathologist` role sees peer-average/top-performer comparisons
  on their own My Contribution dashboard. Admin/pathologist-admin/
  superadmin roles always see it regardless — real, tested gating logic
  lives in `components/Contribution/productivityCalculations.ts`
  (`canSeePeerComparison`), not duplicated here. Phase 1 of the
  Orchestration Intelligent Charge Capture & Workload Analytics spec's
  `System_Configuration` toggle infrastructure — deliberately scoped to
  just this one flag; the spec's actual AI charge-capture/billing logic
  (Phase 2/3) is not built, pending legal/compliance review.
  2/3's related settings (draft retention days, encryption toggle) once
  those are built, rather than needing a second new section added later.
  Per-performing-lab overrides are set separately, on Facility
  Configuration's edit modal (`Facility.idleTimeoutMinutesOverride`) — this
  screen only controls the org-wide fallback.
  **Corrected mid-session:** this originally called a single
  non-conforming file (`sessionTimeoutConfig.ts`) with bare sync
  functions — restructured into the proper interface/mock/firestore
  pattern once caught (see `services/session/README.md`), which is why
  this screen now loads its initial value via a real `useEffect` rather
  than a synchronous `useState` initializer.

- **`QAConfigurationCenterSection.tsx`** — **New (PS-115).** The real
  admin UI for the two QA activity archetypes PS-113/PS-114 already
  define — nothing could create, edit, or duplicate one before this
  existed. Standard/Custom tabs spanning both archetypes in one
  combined table (`QaActivityType` + `QaSupervisionAssignmentType`,
  tagged by `kind`), jurisdiction-filtered Standard tab with no
  disable control rendered anywhere in that tab at all — not hidden,
  not disabled, simply never rendered in that branch, per direct
  guidance's own compliance-safety design. Duplicate is the real
  creation mechanism (mirrors `SynopticEditor.tsx`'s own real
  `{...t, id: uid(), name: '${t.name} (Copy)'}` pattern), always
  landing in Custom with a fresh id and `duplicatedFromId` set — a real
  bug was caught and fixed here before it shipped: the first draft of
  `handleDuplicate` never assigned the clone a fresh id, which would
  have made the save logic silently overwrite the *original* entry
  (including a curated Standard one) instead of creating a new Custom
  record. Sampling percentage and CAPA-trigger config (severity
  multi-select + real `DeficiencyType` dropdown, wired to the existing
  Deficiency/CAPA foundation) are editable on every activity regardless
  of tab — the Standard tab's own "no disable control" restriction is
  specifically about disabling, not about all editing. **Real,
  deliberate scope boundary, tracked separately (PS-125):** a
  `QaActivityType`'s own `fields[]` review-capture schema is shown
  read-only in the Custom-tab edit modal — Duplicate still clones it
  correctly, but a full add/remove/reorder field-schema editor is real,
  separate work. Wired into the sidebar under Administration &
  Compliance. Zero dedicated test file, matching this app's own
  consistent convention — no Config/System section anywhere has one;
  the real business logic lives in the already-tested services this
  screen orchestrates.

- **`ExternalResourcesSection.tsx`** — **NEW.** Real admin management for
  the reference links shown in the Worklist's Resources panel — CAP
  protocols, WHO classification, internal lab systems. Replaces a
  hardcoded object that used to live directly in
  `pages/WorklistPage/WorklistPage.tsx`, found broken when its CAP URL
  404'd (CAP restructured their site) and there was no way for anyone to
  fix it without a code change. Named "External Resources" to match the
  existing label already used in `components/NavBar/NavBar.tsx`'s own
  eyebrow text for this feature, not a new name invented for this
  screen. Same org-default + per-client-override shape as Session
  Security above: enterprise-wide resources visible to everyone,
  lab-scoped ones layered on top for a specific performing lab. Full
  CRUD (add/edit/delete), URL validation on save. See
  `services/externalResources/README.md` for the real viewer-facing
  relevance filtering this admin screen's data feeds into — a direct
  requirement, not an afterthought: a viewer only ever sees their own
  organisation's resources, never a flat global list. Its own
  "fetch active performing labs" query was the one confirmed and
  extracted into the shared `utils/performingLabs.ts` (see
  `utils/README.md`) once `ContainerTypesSection.tsx` needed the exact
  same thing — this file refactored to use that shared version too,
  not left on its own, now-redundant copy.

- **`CaseMaskConfigSection.tsx`** — Real admin UI for the accession-number
  mask engine (`services/caseRegistry/`). **Redesigned into a real
  hierarchy, per direct guidance:** the Site Prefix Overrides block grew
  an "Independent Sequence" checkbox per site plus a real inheritance
  badge (INHERITS ORG DEFAULT / CUSTOM PREFIX / OWN SEQUENCE); the token
  legend gained `{CAT}`/`{DEPT}`; the Live Preview gained a Specimen
  Category dropdown alongside Site, so an admin can exercise a real
  facility+category combination (not just facility alone) before saving.
- **`CrosswalkSection.tsx`** — Real admin UI for `services/orderIntake/`'s
  Specimen Code Crosswalk. Shows both admin-entered mappings and the
  real, system-learned "pending" entries `resolveOrder()` already
  creates on an unrecognized inbound order code (distinguished by
  `createdBy`), and lets an admin add a known mapping ahead of time so
  a client's code never has to self-learn at all. Real `clientId` +
  `externalCode` uniqueness validation on save (`utils/validateUnique.ts`).
  Has a real, prominent Unmapped Stubs banner — a live count of pending
  `unmapped_order_code` `InterfaceException`s, deep-linking directly
  into the Interface Log tab (`/audit?tab=interfaces&search=unmapped_order_code`)
  — see `services/interfaceExceptions/README.md`'s own Map & Link
  section for the full account of what that deep-link opens onto.
  CSV/spreadsheet import (Export/Import Spreadsheet buttons, same
  preview-then-apply shape as Stain/Specimen Dictionary; Facility and
  specimen type matched by name, a matched existing
  `[clientId, externalCode]` pair updates via `updateCrosswalkEntry()`
  rather than duplicating or erroring). Physically moved here from
  `Config/Integrations/` per the "Integrations" group's reversal
  finally being finished — see this file's own header for the account.
- **`CasePoolAssignmentSection.tsx`** — **RENAMED this pass** (was
  `CaseRoutingSection.tsx`). Fixed a real naming collision: the component
  name collided with `services/cases/CaseRouter.ts` even though it
  actually corresponds to `services/cases/casePoolAssignmentService.ts`
  (already renamed in the services/ pass). File + component + the one
  import site (`index.tsx`) all updated; confirmed zero dangling
  references to the old name anywhere in `src/`. **Full rewrite, per
  FEAT-ROUT-01** (see `services/cases/README.md`): the previous version
  only ever exposed `RoutingConfig` settings — the keyword `RoutingRule[]`
  that actually drives matching had no admin UI at all, despite the
  service's own comment describing "custom rules added by admins."
  Rebuilt as a real table+modal (Edit/Duplicate/Deactivate, matching
  `ContainerTypesSection.tsx`'s proven shape — no Delete, same as every
  built-in-rule dictionary here), with a Performing Lab column/filter, a
  real multi-select against the Specimen Dictionary for
  `mappedSpecimenTypeIds` (keywords relabeled as the explicit fallback),
  a Global-plus-per-lab-override fallback pool table, and a lab-aware
  test-routing preview.
- **`RoutingRulesSection.tsx`** — Real keyword-based specimen→pool routing
  rule editor. Built-in rules toggle-only, custom rules full CRUD,
  priority-ordered. No issues.
- **`RuleModal.tsx`** — Extracted from `RoutingRulesSection.tsx` for a real,
  specific reason stated in its own header: an OXC/rolldown build-tool
  parse issue with chevron SVG template literals in co-located component
  functions. Not a stylistic split — don't re-inline it.
- **`TATConfigSection.tsx`** (833 lines, the largest file here) — **STATUS
  UPDATE:** earlier planning notes described this as a stub pending a full
  build. It is NOT a stub — full `TATEntry` data model, the 5-dimension
  uniqueness guard, and the complete 7-level most-specific-wins resolution
  hierarchy (client+specimen+urgency down to system default) are all
  implemented, matching the original design doc exactly. **New real
  consumer:** `components/Contribution/QualityTab.tsx`'s `TOTAL_CASE` TAT-
  outlier calculation, via a genuinely new resolver
  (`qualityCalculations.ts`'s `resolveTatTargetHours`) — this file's own
  `specificityScore()` was only ever a display-sort helper for the admin
  UI, not a callable "resolve the real target for a case" function, which
  didn't exist anywhere until now. `SYSTEM_DEFAULTS` (previously private)
  is now exported so the same real 24h-routine/4h-STAT fallback applies
  in both places. Real bug caught while wiring this: the consumer's first
  draft read entries via `storageGet()` (this app's usual localStorage
  helper), but this file actually writes/reads via raw
  `localStorage.getItem`/`setItem` directly, not `storageGet`/`storageSet`
  — using the wrong helper would have silently never found real admin-
  configured entries at all. **Real widening (PS-116):** `TATEntry.type`
  was a closed `TATType` union (8 fixed clinical-workflow values) —
  widened to `string` so it can also hold a real `QaActivityType.id`,
  confirmed safe since `resolveTatTargetHours`'s own
  `TatEntryForResolution.type` was already plain `string` — zero change
  to existing clinical-workflow resolution behavior. The rule-creation
  dropdown, conflict-detection message, entries table, filter buttons,
  and Resolution Simulator all now resolve either a fixed type or a
  real, active QA Activity Type's own name via new `getTatTypeLabel`/
  `getTatTypeDescription` helpers — deliberately excludes
  `QaSupervisionAssignmentType` (FPPE and its siblings): an ongoing
  supervision period has no discrete "completed in N hours" event to
  measure a turnaround against, confirmed directly against that
  archetype's own real shape.
  **Real addition ("a TAT time could have two components... the
  Performing lab and the other is the Ordering Client"), per direct
  guidance:** every `TATEntry` now carries a real, separate Performing
  Lab dimension alongside its existing Client (relabeled "Ordering
  Facility" throughout this screen) — genuinely independent, not one
  replacing the other; see `components/Contribution/README.md`'s own
  `qualityCalculations.ts` entry for the full resolution-logic account.
  The create/edit form and Resolution Simulator both gained a matching
  second selector. The entries list is now grouped, not flat: an
  Enterprise section (neither dimension set) at the top, then one
  section per real Performing Lab with at least one matching entry,
  each internally sorted by its own entries' real Ordering Facility.
  Two independent filter dropdowns (Performing Lab, Ordering Facility)
  sit above the list — an entry with no value set for a given dimension
  always stays visible under that dimension's own filter, since it
  applies everywhere along that axis by definition. Real, separate
  duplicate-logic cleanup done in the same pass: this file's own local
  `specificityScore()` was a byte-for-byte duplicate of
  `qualityCalculations.ts`'s own copy — confirmed directly, now a single
  shared, exported implementation. The Resolution Simulator's own
  "which rule wins" logic was a **third**, independent, hand-maintained
  7-case priority list, already stale relative to the real resolver
  before this pass — replaced with a direct call to the real resolver
  (`resolveTatEntry()`, newly extracted), so the simulator can never
  show anything other than what the real, live pipeline would compute.
- **`ProtocolDictionarySection.tsx`** — Real, substantial (~870 lines).
  Second-pass rebuild of its own editor (own header documents why: a flat
  pill grid for stain selection didn't scale to a real customer's Stain
  Dictionary). Real 2-column layout + search+multiselect. Per PS-73: had
  Duplicate (`handleClone`) but no uniqueness check behind it — an admin
  could rename a clone (or any edit) onto an existing protocol's name and
  it would silently save as a same-named sibling. Added real, confirmed
  justification: this same file's own spreadsheet round-trip
  (`handleApplyProtocolImport`) already treats `name` as a de facto
  unique key when matching import rows back to existing protocols, and
  `utils/validateUnique.ts`'s own header comment already named this
  dictionary as one of its real, confirmed uses. Now uses the same
  `findDuplicate()`/inline-error convention as every other dictionary's
  editor (`existingEntries` prop passed down from the section's own
  `protocols` state). No inline styles in this file either before or
  after. **Per PS-75, added after direct pushback on an initial "doesn't
  need it" call** — see `services/protocols/README.md` for the full
  reasoning: real multi-site labs genuinely vary processing protocols by
  performing lab, same as every other dictionary this scoping already
  covers. Gained `performingLabFacilityId` (Performing Lab picker in the
  editor, defaulting to "All Labs"; a list column; a lab filter,
  matching `ContainerTypesSection.tsx`'s own), and uniqueness widened to
  the compound `(performingLabFacilityId, name)` key so the same name can
  exist once globally and once more per lab. The spreadsheet round-trip
  (no Performing Lab column) is scoped to only ever match/update global
  entries, so a re-import can't silently collide with a lab-specific
  protocol.
- **`SubspecialtiesSection.tsx`** — Real, substantial (635 lines). No
  issues found in this pass. **Per FEAT-ROUT-01:** gained a Performing
  Lab selector (shown only when a subspecialty is a real pool) and an
  `isCatchAll` toggle ("Default / Catch-All Pool for `<lab>`"), enforcing
  at most one catch-all per lab scope (or Global) on save — setting it on
  one pool clears it from whichever pool held it before.
- **`StainDictionarySection.tsx`** — Three related, tabbed dictionaries
  (Stain Type / Sectioning Protocol / Order Macro) — deliberately
  orthogonal, per `IStainService.ts`'s own design reasoning (see
  services/ review). Real fix since: the Duplicate button (Stain
  Types only, originally) used to call `.add()` immediately and reload
  the list, leaving the user to find and edit the silent copy
  afterward — rewritten to match `ProtocolDictionarySection.tsx`'s own,
  confirmed-working pattern (opens the Add modal pre-filled, real save
  only on explicit Save), and extended to Sectioning Protocols and
  Macros, which never had Duplicate at all. All three sub-tabs also
  gained real name-uniqueness validation on save (`utils/validateUnique.ts`),
  per direct request. Verified live, not just in code. One remaining,
  pre-existing inline style (`ps-conf-section-subtitle`'s top margin)
  converted to a real class in the same pass.
- **`SpecimenDictionarySection.tsx`** — Its own header is genuinely useful
  history: explicitly documents replacing TWO earlier, real-but-wrongly-wired
  screens (one edited a disconnected model nothing downstream read; one was
  its own narrower toggle-only first pass). This is the one real screen now.
- **`FlagConfigPage.tsx`** — Real flag dictionary editor, wired to
  `flagService`. No issues.
- **`DelegationTypeSection.tsx`** — System types toggle-only, custom types
  full CRUD. Rewritten from a card-grid layout to the standard
  rows-and-columns table (matching `ContainerTypesSection.tsx`/
  `StainDictionarySection.tsx`), per direct request: "The UI is
  frankly off, just different cards." Real bug found and fixed in the
  same pass — see `services/delegationTypes/README.md` for the full
  account: the "ID" field's own value used to be silently discarded on
  save, so the on-screen "ID already exists" check was validating a
  value that never actually persisted. Added Duplicate, Performing Lab
  (field/dropdown/column/filter), and real uniqueness on both `label`
  and `id`, each independently compound-scoped by Performing Lab — same
  proven pattern as `ContainerTypesSection.tsx` (PS-75). All 13 inline
  styles converted to real classes; the two genuinely dynamic,
  per-instance cases (id badge color, swatch color) converted to the
  established CSS-custom-property convention (see
  `SynopticReportPage/modals/CaseTeamModal.tsx`'s own `colorVars()`)
  rather than left as raw inline styles. Verified live, not just
  compiled: table renders correctly, Duplicate opens pre-filled and
  doesn't silently save, the id-persistence fix confirmed by comparing
  the form's shown id against what's actually in the table after save,
  both uniqueness checks confirmed independently, and a duplicated
  system type confirmed to become a real, fully-editable custom type.
  Real, separate finding along the way, not fixed here: the
  `.ps-del-*` CSS class family was duplicated five times throughout
  `pathscribe.css` (~150 lines) — cleaned up the one copy actively
  touched, the other four tracked separately given the risk of a rushed
  de-duplication pass in a 23,000-line file.
- **`BillingDictionarySection.tsx`** — **NEW, missing from this file until now.** Real admin UI for the per-billingCode append-only versioned Billing Dictionary (`services/billing/`, `BillingRuleVersion`) — the model that supersedes `RvuTableVersion`'s whole-table snapshot specifically for Charge Capture, per direct, explicit guidance (see `services/billing/README.md` for the full versioning design). One row per billingCode (its current ACTIVE version) in the main table; full append-only version history behind "History"; "New Version"/"Duplicate" both open a real, tabbed modal ("Billing & RVU" / "Coding Rules," split exactly at the real explanatory-text boundary between core identity fields and the informational-only descriptive fields, per direct request to reduce vertical scrolling). CPT code entry is a real, single search field (`CptCodeSearchPicker`, adapted from `AccessionPage.tsx`'s own proven `Icd10Picker` pattern) tied to the RVU Code Map's own current, verified entries — selecting a match fills Description/RVU/HCPCS, every field stays editable after for a deliberate override; a genuinely new code not yet in the Code Map is still accepted, saved as typed. The main table shows a real, visible drift warning when a stored RVU value no longer matches the Code Map's current figure for the same CPT, and an honest "Unverified" label (not a bare blank) for any entry with no RVU at all — compared directly against the Code Map at the time this was built: all six real, shared codes agreed exactly, no active drift found. Country is a real, grouped dropdown (Operating Countries / European Union's real 27 member states / New Zealand), not free text, per direct request ("that should be cheap"). Several real, scoped CSS fixes landed here too, worth knowing about if this pattern resurfaces elsewhere: `ps-conf-form-row` is hardcoded to exactly 2 columns (a real, separate `ps-conf-form-row--3` exists for genuine 3-column rows — the original RVU Work/PE/Malpractice row had been silently using the wrong one, wrapping instead of aligning); `ps-ms-overlay`'s own `align-items: center` pushes a modal taller than the viewport off-screen at the top — this file's own two modals use a new, scoped `ps-ms-overlay--top-align` modifier rather than the shared class 28 other modals depend on; `ps-conf-btn-primary` has no `white-space: nowrap` of its own, so a longer button label can wrap unexpectedly tall — `ps-conf-btn-primary--nowrap` is the real, scoped fix, reused directly on `RvuCodeMapSection.tsx`'s own "+ Add Code" button once the same bug turned up there too.
- **`RvuCodeMapSection.tsx`** — Real admin UI for the versioned
  CPT-to-work-RVU table (`services/billing/`), built directly from a
  direct product question ("is there a UI to update the table?" / "these
  need to be versioned, correct?"). Active version shown prominently;
  older versions collapsed behind a single toggle by default per direct
  "make it easy to use" request — never deleted, but kept out of the way
  of the common case. Real spreadsheet upload (downloadable template,
  preview before commit) matching this folder's own established
  `SpecimenDictionarySection.tsx` pattern. **Grew real single-entry
  add/edit/duplicate later the same session** (see `services/billing/README.md`
  for the full account, including a real `createVersion` validation
  bug found and fixed along the way) — a real `EntryModal`, "+ Add
  Code" button, and per-row Edit/Duplicate actions, all routing
  through the same `createVersion`/`activateVersion` pair the upload
  flow already used. See `services/billing/README.md`
  for the full versioning design and a real, deep TypeScript
  (`strictNullChecks`) issue found and worked around while building this.
- **`PhysiciansSection.tsx`** — Completed CSS migration (off the deprecated
  `modalStyles.ts` inline-constant pattern, per that file's own header
  marking it deprecated). Later, PS-73/PS-75 rollout: added `physicianCode`
  (new field, required, globally unique, independent of NPI — NPI itself
  stays optional, per direct confirmation not every physician has one,
  e.g. UK physicians; uniqueness only checked when NPI is present). Added
  Duplicate — but NOT via the standard `prepareDuplicate()` every other
  dictionary here uses (which suffixes "(Copy)" onto a name field): a
  physician is a real person, not a reusable config entry, so cloning a
  real person's name/identity is the wrong behavior entirely. Built a new,
  separate `preparePersonDuplicate()` (`utils/duplicateEntry.ts`,
  own tests) that clears identity/direct-contact fields (name, NPI,
  physicianCode, phone/fax/email) while preserving organizational context
  (specialty, `clientIds`, `preferredContact`) as a real starting
  template — same "opens the Add modal pre-filled, real save only on
  explicit Save" pattern as every other Duplicate button in this folder,
  just with different field-clearing semantics underneath. Confirmed,
  not assumed, on PS-75: `clientIds[]` — this section's existing
  multi-facility affiliation model — is the right mechanism for
  physicians and does NOT get a separate `performingLabFacilityId` field
  like `ContainerTypesSection.tsx`/`DelegationTypeSection.tsx`; a
  physician can validly submit to several ordering/submitting facilities
  at once (`clientIds` is unfiltered by `FacilityRole`), a genuinely
  different cardinality than PS-75's single-lab dictionary-item scoping.
  See `services/physicians/README.md` for the full account.
  **CSV/spreadsheet import added, and Physician Master File sync
  wired to `services/physicians/applyPhysicianMasterFileUpdate.ts`**
  (see that folder's README for the full ingestion account) — the
  import path matches Physician Code first, else NPI; a row with
  neither gets a fresh sequential `PHY-####` code auto-assigned,
  flagged in the preview.
- **`DemoResetTab.tsx`** — Real two-level mock data reset (full vs.
  "my hospital's data only"), both paths gated behind confirmation.

  **Batch 320 (PS-58):** `pathscribe_model_adoptions` (per-organisation
  AI model adoptions) added to `SETTINGS_KEYS` beside the legacy
  `pathscribe_models`, which the model service now migrates and removes on
  first load.

  **FIXED, both passes:** the participation-types real storage key plus
  its orphaned predecessor were added to `SETTINGS_KEYS`. Separately, a
  **critical** fix: `CASE_KEYS` had referenced `'ps_cases'`, a key
  `mockCaseService.ts` never actually wrote to (its real key is `'cases'`)
  — meaning Demo Reset had likely never correctly cleared primary case
  data at all. Found via a full, unrestricted `storageGet`/`storageSet`
  audit across `services/` (not limited to the `pathscribe_` prefix, which
  is exactly how both this and 8 other missing keys — including
  `pathscribe_roles`/`pathscribe_users` — had gone undetected by an
  earlier, narrower audit pass). All now correctly categorized into
  `CASE_KEYS`/`SETTINGS_KEYS`/`STATE_KEYS`.

  **Another real bug found and fixed, a later pass** — per direct
  report: "reset the demo data, logged back in, got an 'Already signed
  in elsewhere' message." Root cause: `services/session/sessionSupersedeService.ts`'s
  active-session marker (`pathscribe_active_session_${userId}`)
  lives in its own key namespace — not under `MOCK_PREFIX`, not in
  `SESSION_KEY` — so neither existing cleanup path in either reset
  function ever touched it. A reset cleared the user's own login
  session but left the *stale* active-session marker from before the
  reset sitting in `localStorage`; the very next login found that
  stale marker and incorrectly concluded the account was already
  signed in elsewhere. `clearActiveSessionId()`'s own doc comment had
  already warned about exactly this failure mode — this reset flow
  was the gap it was warning about. Fixed both reset paths: full
  reset now sweeps every `pathscribe_active_session_*` key (any
  user's), matching the existing `MOCK_PREFIX` sweep pattern; the
  user-scoped reset clears only that specific user's own marker,
  since other testers' active sessions must survive a "my data only"
  reset. Verified live, end-to-end, reproducing the exact reported
  sequence: logged in (confirmed the marker gets created), performed
  a full reset (confirmed the marker was gone from `localStorage`
  immediately after), logged back in again (confirmed no false
  supersede dialog appeared).

- **`GoverningBodiesSection.tsx`** — Standard bodies (CAP/RCPath/ICCR/RCPA)
  toggle-only, custom bodies full CRUD with an ID-conflict guard. **See
  Notes — hardcoded `isSuperAdmin`.**
- **`ParticipationTypesSection.tsx`** — System-level master list; roles
  then select from it. Same pattern as Facility Configuration/Subspecialties.

  **CORRECTION — this file's "no issues" assessment was wrong.** It
  maintained its own separate local list (`BUILT_IN_PARTICIPATION_TYPES`
  + a localStorage key with no `_v2` suffix), completely disconnected from
  `services/participationTypes/mockParticipationTypeService.ts` — the
  real service `CaseTeamModal.tsx` actually uses. The two lists had
  drifted to **different type membership entirely** (this screen showed
  Second Opinion/Preliminary Report/Observer/Cytotechnologist/Tumour
  Board; the service had Attending/Transcriptionist/Clinician/External/
  Resident), and this screen's own "● System Live Sync" footer label was
  actively misleading — nothing was synced with the real feature at all.
  Found via a direct user report tracing a drag-and-drop bug in
  `CaseTeamModal` back through the data layer, not by inspection alone.

  **FIXED:** rewritten to read/write through `mockParticipationTypeService`
  directly (async, replacing the old synchronous local calls). The final
  canonical 8-type list was defined directly by Pete, reconciling both
  prior lists against real CLIA/CAP/ACGME clinical workflow requirements —
  see the service file's own header comment for the full list and an
  international-naming reference table (UK/Canada/ANZ/EU role-name
  equivalents) captured for future localization work. `ParticipationTypeRecord`
  (the real interface) extended with two fields this screen needed but the
  interface didn't have: `canBeAssignedTemplate`, `canViewWholeCase`.
  `TypeModal.tsx` (below) and `Staff/RoleDictionary.tsx` updated to match.

  **Signing-authority audit trail (Sep 2026, per Pete's human-in-the-loop
  direction):** `handleSave` now receives `(draft, justifications)` from
  `TypeModal.tsx` and runs `stampFacilityOverrideChanges()`
  (`services/participationTypes/authorityProvenance.ts`) before saving —
  every added/changed/reverted/re-justified facility override is stamped
  with the acting admin (`getSessionUser()`) and time. Once the save
  succeeds, one audit entry per change goes to the real `auditService`
  (who, flags from → to, facility, justification or "none given",
  `facilityId` set for filtering). A failed save writes nothing. Tested
  end-to-end in `ParticipationTypesSection.test.tsx` (new).

  **Standing-rules pass (Batch 315):** the save/stamp/audit logic moved
  out to `services/participationTypes/saveParticipationType.ts` — this
  screen now only supplies the session actor and facility names. The two
  remaining raw inline styles (the attribute chips and the abbreviation
  chip, which built hex-alpha strings in JSX) now pass only the base hue
  as `--ps-hue`; tints, borders, and the off state are real CSS rules
  using `color-mix()`, the pattern already used 34 times in
  `pathscribe.css`.

- **`FontsSection.tsx`** — Approved-fonts toggle list feeding
  `PathScribeEditor`'s toolbar via `SystemConfigContext`. Enforces at
  least one font stays enabled. No issues. **This is the real dictionary
  `Config/Macros/index.tsx` should be reading from instead of its
  hardcoded list — see `Config/Macros/README.md`.**
- **`DepartmentsSection.tsx`** — Migrated to `ps-conf-*`/`ps-ms-*`
  CSS classes (same pass as `PhysiciansSection.tsx`). Deliberately
  hardcodes the 3 current Grossing Templates rather than fetching them —
  documented as a pragmatic, revisit-later scope call, not an oversight.
  **Per FEAT-ROUT-01:** the `accessionPrefix`/`numberSeries` table cell
  now shows a real "OWN SEQUENCE · `<series>`" / "SHARES INSTITUTION
  SEQUENCE" badge instead of a bare string, matching the same
  inheritance-visibility treatment added to Case Mask's site rows.
- **`TypeModal.tsx`** — Rewritten from scratch specifically to avoid the
  same OXC/rolldown parse issue `RuleModal.tsx` was extracted to avoid.

  **CORRECTION — the earlier "purely cosmetic, comments only" assessment
  missed a real, separate bug.** The garbled box-drawing comment
  characters noted previously *were* cosmetic, as assessed. But a
  **different** instance of the same underlying problem — genuine
  double-encoding mojibake (a correct UTF-8 em-dash corrupted into a
  3-character garbled sequence at some point in this file's history) —
  existed in the actual modal title string (`'Edit — ' + type?.label`),
  rendering visibly wrong in the live UI across every admin screen that
  reuses this shared modal (confirmed affecting all 9 files using this
  pattern, not just this one). **FIXED**, traced through the raw bytes
  to confirm root cause rather than guessed at; a full-`src/` grep for
  the same corrupted byte sequence afterward came back clean — this was
  the only occurrence.

  Also updated as part of the participation-types consolidation above:
  imports `ParticipationTypeRecord` directly from
  `services/participationTypes/IParticipationTypeService.ts` instead of
  the now-removed local type re-export from `ParticipationTypesSection.tsx`;
  `Draft` type now aliased to the service's own `NewParticipationType`
  rather than redefining an equivalent (and, it turned out, slightly
  wrong — missing `requiresNote`) `Omit` locally; `isBuiltIn` prop now
  driven from the real interface's `isSystem` field (was `builtIn`,
  which doesn't exist on the real type).

  **Facility-Level Sign-Out Authority (Sep 2026)** — the per-lab section
  was rebuilt from a bare checkbox list into the transparent, break-glass
  control Pete specified. Per performing lab: the lab's jurisdiction; each
  flag's **active rule** plus its **source of truth** (jurisdiction default
  with its regulatory basis, platform default, or "Overridden at facility
  level by [admin] on [date]" — color-coded by tier); an "Override default
  for this facility" button that seeds from the facility's currently
  **inherited** values (fixing the old toggle, which seeded from raw
  platform defaults and so silently dropped a UK lab's RCPath profile the
  moment it was switched on); a justification field recorded in the audit
  log; and "Revert to inherited default" with an undo before save. A
  country-scoped type (e.g. UK-only Advanced Practitioner BMS) lists only
  its jurisdictions' labs, never hiding one that already has an override.
  See `services/participationTypes/README.md` for the model. The four
  `.ps-participationtypes__lab-*` CSS rules were replaced by `.ps-ptauth-*`
  (their only user was the old toggle). New i18n block
  `participationTypesSection.modal.authority.*` in all 5 locales; the
  section's `perLabLabel`/`perLabHint` rewritten to describe inheritance.
  First test file for this component: `TypeModal.test.tsx` (new, 8).

  **Standing-rules pass (Batch 315):** now render-and-dispatch only —
  row building, override seeding, and unsaved/pending-removal detection
  moved to `services/participationTypes/facilityAuthorityEditor.ts`.
  Jurisdiction names render via `t('jurisdictionNames.<code>')` instead
  of the English-only `JURISDICTION_LABELS`, and "Flag: Yes" goes
  through a `ruleWithValue` template (French needs `" : "`). The two
  colour-swatch inline styles now set only `--swatch-color` — the CSS
  rule for `.ps-type-color-swatch` already consumed that variable; this
  component had simply never been switched over. Enforced going forward
  by `services/participationTypes/standingRules.guard.test.ts`.

- **`GrossingRouteOverridesSection.tsx`** — Own header is an excellent,
  specific bug-history note: documents that it verified the real matching
  logic in `mockCaseService.ts` directly rather than assuming, and
  deliberately kept `specimenType` free-text (not a Category dropdown)
  because that's what the real Pass G0 matching code actually compares
  against — a dropdown would have looked more correct and silently matched
  nothing. Good example of the "read the actual code" discipline this
  whole review is built on.
- **`ContainerTypesSection.tsx`** — Full CRUD (deactivate, not delete) over
  the Container Type Dictionary, beyond the 9 seeded APLIS-standard
  defaults. Real fixes since: added Duplicate (matching the same,
  proven `duplicateEntry.ts`/`validateUnique.ts` pattern as
  `StainDictionarySection.tsx` — see `utils/README.md`), real
  uniqueness validation on both `name` and `aplisMapping`, and — per
  direct follow-up ("Each Performing Lab will want their own types.
  If Performing Lab not defined, it is available for everyone.") —
  a real `performingLabFacilityId` field (`services/containerTypes/README.md`
  has the full field-level account), a Performing Lab dropdown
  (using the shared `utils/performingLabs.ts`'s `getActivePerformingLabs()`
  — see `utils/README.md`), a Performing Lab table column, and a Performing Lab filter
  alongside the existing Status filter. Both uniqueness checks became
  compound (`performingLabFacilityId` + the field) rather than global,
  per direct confirmation that a different lab's own type may
  legitimately share a name/mapping — only a real collision within the
  same lab (including two global entries) is blocked. Verified live,
  every direction independently: same-lab collision blocked (both
  fields, tested separately), different-lab reuse allowed, global-vs-
  global collision blocked with the correct (non-lab-specific) message,
  and Duplicate correctly carries over a source entry's lab scope
  (including staying "All Labs" for a global source). This file already
  used real CSS classes throughout and the correct `{ mode, entry? }`
  modal-state shape before any of this — no cleanup needed here, unlike
  `CrosswalkSection.tsx`.
- **`RetentionSection.tsx`** — Data retention policy editor. Its own header
  flags its own tech debt honestly: persists directly to localStorage
  pending a `SystemConfigContext` retention-fields addition. Not urgent,
  self-documented.
- **`DeficienciesSection.tsx`** — Deficiency Types + Resolution Types as
  one tabbed section rather than two sidebar entries — own header
  correctly reasons why (Resolution Type has no independent use elsewhere,
  unlike e.g. Department). No issues. **Grew a Level field in a
  later session** (case/specimen/both — see `services/deficiencies/
  README.md`'s `IDeficiencyType.level` entry for the real gap this
  closes), scoped to the Deficiency Types tab only via a `showLevel`
  prop on the shared `TypeDictionaryTab` component underneath both
  tabs — Resolution Types has no equivalent concept, so it stays
  entirely absent from that tab's own table and form rather than
  showing an irrelevant field there. **Per-facility Specimen
  Deficiencies, per direct guidance:** the same shared `TypeDictionaryTab`
  grew a Performing Lab column/filter/selector and a name+lab
  uniqueness check (`findDuplicate`, same convention as
  `ContainerTypesSection.tsx`) — for both tabs, not just Deficiency
  Types, since a lab's own resolution vocabulary is just as real a need
  as its own deficiency vocabulary.
- **`VoiceSection.tsx`** — **NOT part of the System tab's own registry** —
  not in `index.tsx`'s `SECTIONS`/switch at all. Its real consumer is
  `components/Voice/VoiceSettings.tsx`. Live and correct, just worth
  knowing this one file's audience is outside this folder's own tab.
  **Correction to this file's own prior note:** previously described
  as referencing "a real, deliberate second AI integration
  (Gemini-backed voice dictation refinement) ... distinct from the
  main narrative-generation provider abstraction ... not a stale
  reference." That's no longer accurate — as of a later pass, voice
  dictation refinement resolves through the same `AIModel` catalog and
  `callAi()` path as the rest of the app's AI calls, governed by the
  same validation-study hard-block. See `components/Voice/README.md`
  and `services/models/README.md`.
- **`useSpecimenDictionary.tsx`** — Real hook, rewritten June 2026 off
  direct localStorage calls onto the standard
  interface/mock/firestore-shaped `specimenDictionaryService`. Own header
  explicitly confirms the public API was kept unchanged so all 6 real
  consumers needed zero changes. No issues.

## Cassette, print & scan-hardware admin (Aug 2026)

Same real table+modal pattern as `ScanStationsSection.tsx`/
`ContainerTypesSection.tsx` throughout this group — not a new pattern
invented per screen.

- **`CassetteColorsSection.tsx`** — real admin UI for the cassette
  color dictionary (`services/cassetteColors/`): color keys, display
  names, hex codes, and per-color fallback policy. Duplicate +
  uniqueness validation (PS-73, lab-scoped `key`/`displayName`) was
  already real and wired here from an earlier pass. **Real fix
  (PS-73 whole-file inline-CSS sweep, Sep 2026):** the one real
  inline style left in this file — the color swatch's
  `style={{ background: c.hexCode }}` — now goes through the same
  CSS-custom-property indirection its sibling dictionaries already
  use for the identical per-row-value need
  (`DelegationTypeSection.tsx`'s own `--swatch-color`/`--del-badge-*`
  vars): `style={{ '--swatch-color': c.hexCode }}`, consumed by
  `.ps-cassette-color-swatch { background: var(--swatch-color); }` in
  `pathscribe.css`. A per-row hex value is genuinely per-instance
  data, not something a static class can express, so this stays
  inline by design — not a leftover gap.
- **`CassetteRoutingRulesSection.tsx`** — real admin UI for the
  cassette routing rule dictionary (`services/cassetteRouting/`) — the
  "Cassette Colors Basic Routing Algorithm Flow" spec's own missing
  piece before this existed.
- **`ScanStationsSection.tsx`** — real admin screen for scan stations,
  per direct follow-up: "you said 'not yet' earlier — still true. Only
  the 8 seeded stations exist; nobody can rename or add one without
  editing source." See `services/scanStations/`. **Real fix
  (Workstation & Hardware redesign):** the Facility field was free
  text with a fabricated `'lab-main'` default, even though
  `ScanStation.facilityId` was always correctly typed as a real
  Facility reference — now a real dropdown, with real validation that
  never existed before. Also accepts an optional `selectedFacilityId`
  prop from the new group-level Facility Selector below.
- **`PrinterProfilesSection.tsx`** — real admin UI for the printer
  capability/profile registry (PS-51 spec Section 2), see
  `services/printerProfiles/`. **Real fix (Workstation & Hardware
  redesign):** `PrinterProfile` had zero facility association at
  all — a genuine gap, not a deliberate one. Now has a real Facility
  column/selector (Global option for a shared network-pool printer)
  and the same `selectedFacilityId` prop as `ScanStationsSection.tsx`.
  **Batch 346 (PS-52):** an optional **Agent Port** field, shown only
  when the Bridge Type is PathScribe Agent, with a hint and a range
  check (1024–65535). The save checks now come from
  `services/printerProfiles/validatePrinterProfileDraft.ts` instead
  of being repeated in the component. Still in the component: the
  facility filter for the list (`filteredProfiles`), untouched here.
- **`PrintSettingsSection.tsx`** — Tier 1 (system/facility-wide
  default) of the hierarchical print-settings architecture, per direct
  follow-up: "structure your print settings hierarchically so labs can
  enforce their own policies." See `services/printSettings/`. **Tier 2
  now real too (Workstation & Hardware redesign):** with a facility
  selected via the group-level selector and no override yet, the form
  shows the inherited values read-only with a real inheritance banner
  and a "+ Create Facility Override" action; once an override exists,
  the form edits that facility's own record, with a "Revert to System
  Default" action. See `services/printSettings/README.md` for the full
  account of the new `FacilityPrintSettings` type/service.
- **`LabelDesignerPage.tsx`** (registered here as the `'label_designer'`
  tab, real component actually lives at
  `pages/LabelDesignerPage/LabelDesignerPage.tsx`) — real, per direct
  follow-up (PS-245/251/252): a real, drag-and-drop layout designer
  spanning nine real label types. **Real, direct correction:** first
  built as its own real, standalone home-page tile/route
  (`/label-designer`); per direct follow-up ("Label Designer isn't a
  tile, its a tab in configuration"), moved here instead — the
  standalone route and home-page tile were both removed, this Config
  tab is now the one real, intended access point. See
  `services/labelDesigner/README.md` for the full architectural
  account (Enterprise/facility hierarchy, per-group lockdown policy,
  real field catalogs). **Real, honest, flagged gap, not yet fixed:**
  this component's own styling uses inline `style={{...}}` throughout
  (matching the convention this session's own molecular pages used),
  not this folder's own established "no inline CSS, named classes
  only" convention (see `PrintSettingsSection.tsx`'s own header) — a
  real inconsistency, found while adding this entry, not yet
  reconciled.
- **`index.tsx`** (this folder's own router/shell) — **Real addition
  (Workstation & Hardware redesign), per direct guidance:** a single
  facility selector (`workstationFacilityId`/`workstationLabs` state),
  rendered once above the sidebar+content shell and shown only for the
  Workstation & Hardware group — deliberately lives at this level, not
  inside any one section, specifically so the choice survives switching
  between Scan Stations/Printer Profiles/Print Settings, which each
  fully unmount/remount via `renderSection()`'s own switch. Passed down
  as `selectedFacilityId` to the three sections above. Session-scoped
  only — not persisted to the URL or storage, a real, deliberate
  convenience rather than a saved admin preference.
- **`FootPedalSection.tsx`** — real feature, per direct follow-up:
  "foot pedal support specifically (the one part confirmed to not
  exist at all)." Deliberately a per-workstation setting (see
  `useFootPedal.ts`'s own header), not a per-deployment admin toggle.
  **Real fix (Sep 2026):** the same 3 bindings configured here now
  drive `MicrotomyWorkstationPage.tsx` and `EmbeddingStationPage.tsx`
  as well as the original `SynopticReportPage.tsx` — this section's
  own labels/description text were regeneralized to name all three
  pages rather than dictation alone (action keys kept stable so
  already-saved bindings aren't broken; see
  `types/footPedal/FootPedalConfig.ts`'s `FOOT_PEDAL_ACTION_LABEL_KEYS`).
  **i18n sweep (batch 39):** this section's on-screen text now goes
  through a new `footPedalSection` i18n namespace — see
  `src/i18n/README.md`'s own batch-39 entry.

## Other new sections (Aug 2026)

- **`DocumentStyleSection.tsx`** (+ `documentStyleConfig.ts`) — real
  feature, per direct request: "is the system-wide font style defined
  in the CSS hardcoded, or does the client get to select this system
  default? ... yes, default to Arial." `documentStyleConfig.ts` is the
  real source of truth (confirmed by direct investigation of the
  report's actual rendered default font, `.rp-page`'s `font-family` in
  `pathscribe.css`, before building this); the section is the admin UI
  over it.
- **`FppeAssignmentsSection.tsx`** — real admin UI for FPPE/new-hire
  credentialing assignments (`types/case/FppeAssignment.ts`,
  `services/cases/`'s FPPE service), wired to `userService`/
  `subspecialtyService`. **Real, current status (PS-114, Stage 3):**
  `handleCreate`/`handleGraduate` now also shadow-write to the new,
  generic `qaSupervisionAssignmentService` (`services/quality/`) —
  fire-and-forget, using the old system's own real, just-generated id
  explicitly, so the same logical assignment shares one real id across
  both systems. This component's own real reads/writes to the old FPPE
  system are otherwise completely unchanged — it remains the actual
  creation/management UI. **Real addition (FPPE Facility organization),
  per direct guidance:** a real Performing Lab field on the create form
  (required — every provisional hire practices at one real, specific
  facility), a Facility column on both the Active and Completed tables,
  and a facility filter above both — narrowing to one lab shows that
  lab's own complete Active+Completed picture together, not just one
  half. `facilityId` is carried through the existing shadow-write
  unchanged, keeping the two systems in sync field-for-field.
- **`ResearchFeedSection.tsx`** — admin management for the PubMed
  literature feed shown on the Home dashboard. Built for the same real
  reason `ExternalResourcesSection.tsx` was.

## Real finding — confirmed-dead duplicate, removed

**`PatientMatchReviewSection.tsx`** used to still physically exist in
this folder (10,970 bytes, last modified Jul 31) alongside the real,
current, larger version (19,383 bytes, modified Aug 8) that now lives
in `components/QualityAssurance/`, per that folder's own README:
"First built in `Config/System/`, then moved here after a direct
question about whether it belonged in Configuration at all." Checked
directly, not assumed, before removing anything: this folder's own
`index.tsx` registry never imported it, and grepping the whole
codebase for any import of this specific path returned zero hits both
before and immediately before deletion. The "move" described in the
QualityAssurance README was actually a copy — the original was never
deleted, until now. Removed here, same reasoning as the
`ClaudeProvider.ts` finding in `services/ai/providers/README.md` —
verified zero consumers, then confirmed a clean `tsc --noEmit` and
full test suite run afterward before considering it done.

## Notes

- **Hardcoded `isSuperAdmin={true}`:** both `GoverningBodiesSection` and
  `TerminologyServicesSection` are only ever rendered from `index.tsx`
  with `isSuperAdmin` hardcoded to `true` — there is no real caller that
  passes `false`, and no visible connection to the actual logged-in user's
  role. Either super-admin gating for reaching this tab happens somewhere
  higher up the tree (outside this folder, not confirmed in this pass), or
  this prop isn't actually wired to a real permission check yet. Worth a
  targeted look before treating either section as genuinely
  access-controlled.
- **Fixes applied, earliest pass:** `CaseRoutingSection.tsx` →
  `CasePoolAssignmentSection.tsx` rename (file + component + import site);
  `specimenTypes.ts` comment cleanup; **`specimenTypes.ts` relocated to
  `services/specimenDictionary/specimenTypes.ts`** — Pete caught that a
  data-layer service (`ISpecimenDictionaryService.ts`) was importing its
  core `SpecimenEntry` type from inside `components/`, an inverted
  dependency every other dictionary in this codebase doesn't have. All 10
  real consumers updated; see `services/specimenDictionary/README.md`.
- **Fixes applied, second pass (same session as the CaseTeamModal
  drag-and-drop bug fix):** the participation-types consolidation
  (`ParticipationTypesSection.tsx` + `TypeModal.tsx`, both above), plus
  the `DemoResetTab.tsx` key additions/critical `'cases'` fix. All
  resulted from tracing one user-reported drag-and-drop bug in
  `pages/SynopticReportPage/`'s `CaseTeamModal.tsx` all the way back
  through the data layer — not found by inspection.
- **Fixes applied, third pass:** `SessionSecuritySection.tsx` added
  (Phase 1 of the Inactivity Timeout & Draft Recovery feature); five
  stale breadcrumb-style comments in `index.tsx` identified as fully
  addressed and confirmed safe to remove. This pass also removed two
  fabricated "session expired after 60 min inactivity" audit log entries
  from `services/auditlog/mockAuditService.ts` — found while investigating
  whether a real timeout mechanism existed (it didn't, until this pass);
  those entries falsely implied one had fired successfully in the past.

## Real, critical fix — membership enforcement was completely inaccessible from this UI

Found via a direct, real product decision: "in the field, they would
likely activate the Pool when they build the workgroup." Traced the
actual save logic in `SubspecialtiesSection.tsx` and confirmed
something more serious than a missing default — `isWorkgroupEnabled`
(the field `canUserClaimPoolCase` actually checks) was **hardcoded to
`false`** on create, and **omitted entirely** on update. There was no
UI control for it anywhere in this component. That meant real
membership enforcement could never be turned on through this admin
screen at all, regardless of what an admin did with the visible
"Create Workgroup" toggle (which only ever controlled the separate
`isWorkgroup` field).

Fixed to match the real request: `isWorkgroupEnabled` now mirrors
`isWorkgroup` directly on both the add and update paths, rather than
being a second, hidden, inaccessible flag. Building a workgroup and
having it actually enforced are now the same action, not two — which
is how an admin would reasonably expect this to work in the first
place. Verified through the real UI flow, not just a direct service
call: opened a subspecialty's edit modal, toggled "Create Workgroup"
on, saved, and confirmed both fields flipped to `true` together.

## New feature — real, visible entry for the automatic fallback pool

Direct follow-up to the enforcement-default fix above, per your own
product decision: "It is appropriate to show a read-only entry for the
General Pool describing its purpose." `casePoolAssignmentService.ts`
was already silently routing unmatched cases to a `'general'` /
`'General Pathology'` fallback pool with zero visible, admin-facing
record behind it — confirmed no Subspecialty record with that id
existed anywhere in the seed data.

Added a real, new seed record — `id: 'general'`, matching the routing
service's own `DEFAULT_ROUTING_CONFIG` exactly — plus a new
`isSystemManaged` field on the `Subspecialty` interface to mark it (and
only it) as not admin-editable. Deliberately left `isWorkgroupEnabled:
false` here specifically, unlike the four real pools fixed above: the
one pool that exists to catch cases nothing else matched shouldn't be
membership-restricted, or it would defeat its own purpose.

The list row now shows a real, gray "SYSTEM" badge and description
explaining its purpose, with "Read-only" replacing the Edit button
entirely — confirmed this is the only path to editing or deactivating
a subspecialty anywhere in this file, so removing it here genuinely
closes off modification, not just hides a button that's still
reachable another way.

## Real, final piece — orchestration pool cases connected to the new General Pathology entry

Direct follow-up, from a sharp catch on the delivered General Pathology
entry: the worklist's Outreach context showed a generic, unnamed
"POOL" divider — not tied to any real pool at all. Traced precisely:
six real Orchestration-mode seed cases (`O26-0012` through `O26-0017`)
had `status: 'pool'` with neither `poolId` nor `poolName` set,
falling through `buildPoolGroupRows`' own `'Pool'` fallback string —
exactly the same shape of gap as the four LIS-side pools fixed
earlier, just manifesting as "no name at all" instead of "a mismatched
name."

These cases are precisely what the General Pathology pool exists
for — real work that never matched a specific subspecialty. Tagged all
six with its real `poolId`/`poolName` rather than leaving them in an
unlabeled bucket. Verified live: the worklist's Outreach view now
shows a real "GENERAL PATHOLOGY — URGENT" divider (2 cases) and a
matching non-urgent one (4 cases), not a generic "POOL" label.

## Real, confirmed fix — subspecialty descriptions truncating with room to spare, no tooltip

Direct report: description text was cutting off ("Automatic fallback
for cases that don't match a...") despite visible empty space in the
row, and hovering revealed nothing. Traced precisely — two separate
problems stacked together. First, `.ps-sub-desc` had a hardcoded
`max-width: 240px`, unrelated to the column's real, much wider
available space. Second, and more fundamentally, the wrapping `<div>`
around the name/description had no flex-growth rule at all, so even
removing the hardcoded limit wouldn't have helped — as a
shrink-to-fit flex child it was never claiming the space the column
actually had to give it. Fixed both: the wrapper now has `flex: 1 1
auto; min-width: 0` so it genuinely fills the available width, and the
description's `max-width` follows that real width instead of a fixed
number. Also added a `title` attribute with the full description text,
so anything still long enough to truncate is available on hover.
Verified live: full descriptions now show for every subspecialty
except the genuinely longest one (General Pathology), which now has a
working tooltip.

## `MasterPaymentTypeDictionarySection.tsx` / `JurisdictionPaymentMappingSection.tsx` — real, per direct guidance ("Step 1 should be under System / Financial")

Two new admin CRUD screens for the two Financial Class reference dictionaries (`services/billing/README.md` has the full data-model account) — registered in the pre-existing `Financial & Revenue Lookups` sidebar group alongside Billing Dictionary/RVU Code Map/NCCI Edit Rules, not a new group invented for this feature. Both use the simple, direct CRUD pattern (no versioned/dual-control-approval workflow) — this is structural reference data an admin configures directly, not licensed content with a real regulatory reason to track who approved which version. `MasterPaymentTypeDictionarySection.tsx`'s own Category ID field locks on edit — real, deliberate: `JurisdictionPaymentMappingSection.tsx`'s own rows reference it by id directly, so renaming one in place would silently orphan every real mapping that points at it.

Explicitly the first step of a larger, staged rollout (see the source spec's own phased roadmap) — the Accessioning Screen redesign that actually consumes these two dictionaries (Client Account/Outside Client selection, Primary Jurisdiction, Payment Category → Primary Payer → Coverage, split-billing toggle) is real, separate, not-yet-built work.

## `OutboundMessagePreviewSection.tsx` — real, per direct guidance ("How do users test this... should be comprehensive tool so that formats can be verified")

A real, working preview/export tool for every outbound JSON payload this app now builds — ADT^A08/A40/A47 (`services/patients/buildPatientAdtPayload.ts`) and ORU^R01 (`services/reports/buildOruR01Payload.ts`). Same real posture as `DftExportPreviewSection.tsx`'s own header: PathScribe builds the JSON, the interface engine builds HL7 from it — this tool lets someone verify exactly what that JSON looks like, and download real example files for their own integration testing (`⬇ Download JSON`, a real `Blob`/`URL.createObjectURL` download, same established pattern as `utils/csvExport.ts`).

Deliberately its own new screen, not bolted onto `DftExportPreviewSection.tsx` — that one is scoped to billing (`Financial & Revenue Lookups`); these four transaction types are patient-identity and result events, a different real domain. Registered under the pre-existing `Integrations` sidebar group instead, alongside Terminology Services/Facility Configuration/Order Types & Inbound Rules — a real, established group for interface-facing tools, not a new one invented for this.

`organisationId` is deliberately never a field the tester has to know or type — for A08/A40/A47 it's resolved automatically from the real, looked-up `MasterPatientRecord` itself, the same real field every actual call site already reads it from.

Two real, honest caveats surfaced directly in the UI rather than silently glossed over:
- A40/A47 previews show `casesRepointed`/`encountersRepointed` as `0` — this tool builds a payload on demand without performing the real merge/rebind, so those real counts genuinely aren't available outside an actual operation. Every other field is accurate.
- ORU^R01 previews show `reportPdfBase64`/`reportNarrativeText` as absent — generating either requires the real report-rendering pipeline's own React-component closures (`SynopticReportPage.tsx`), which a standalone admin tool has no access to. `structuredDiagnosisAnswers` and the direct narrative fields (`clinicalHistory`/`grossDescription`/`microscopicDescription`/`diagnosisComment`) are all real and accurate.

No new component-level test file — matches the established, un-tested convention `DftExportPreviewSection.tsx` itself already has: a thin UI wrapper over already-tested service functions (`buildAdt08Payload`/`buildAdt40Payload`/`buildAdt47Payload` all covered by `services/patients/outboundPatientAdt.test.ts`'s own 9 real tests) doesn't need a second, duplicate layer of coverage for the same logic.

## `CytologyCategoriesSection.tsx` — new (Sep 2026), Phase 1 of the Cytology & Cervical Screening module

Real, per direct guidance: any configuration for the new Cytology module lives here, as a new subtab under System — same interface/mock pattern every other admin dictionary in this file already follows, not a new, separate configuration surface (registered under the existing `Clinical Lookups` group, alongside Protocol Dictionary/Subspecialties/Departments).

A real, standard 2014 Bethesda System category dictionary — three configurable components (Specimen Adequacy, General Categorization, Interpretation/Result), verified against IARC's own published Bethesda reference before building the seed data, not improvised. See `services/cytology/README.md` for the full account, including the real, forward-compatible link each interpretation/result category carries to this app's own existing `AbnormalSeverity` vocabulary — recorded now, not consumed anywhere yet.

This is deliberately Phase 1 only. The requirements doc this came from (General Cytology & GYN Features) describes a genuinely large, six-module effort — a cytologist-specific worklist, CT workload/QC tracking, HPV integration, multi-jurisdiction compliance, patient follow-up, and a full QA reporting suite are all real, separate, sequenced work, not built here. `services/cytology/README.md`'s own "Explicitly NOT in this phase" section is the authoritative list.

No dedicated modal component — this section's own field shape (section/group/abbreviation/requiresPathologistReview/suggestedAbnormalSeverity) doesn't fit the existing `TypeModal.tsx` (hard-coded to `ParticipationTypeRecord`), so it uses its own small, inline modal rather than force-fitting an incompatible generic one.

## `PrintRoutingRuleSection.tsx` — new, closes PS-278/279's own disclosed "no admin UI" gap

Real admin CRUD for `services/printRouting/`'s `PrintRoutingRule` records — until this existed, a rule could only be created programmatically or via seed data, exactly the same already-accepted gap this folder's own `DeliveryRulesSection.tsx` names for `DeliveryRule`. Registered under `'print_routing_rules'` in the Administration & Compliance group (alphabetically after Print Settings), so it sits with Delivery Rules rather than under Workstation & Hardware's print-hardware group above — this is routing/authoring policy, not a physical-device screen.

Follows `DeliveryRulesSection.tsx`'s own established three-part shape exactly, not a new pattern: a rule table, an Add/Edit modal, and a live Test panel that resolves a real destination by calling `resolvePrintDestination.ts` directly (never a second, parallel simulation of the resolver's own two-pass logic). The modal's scope-tier picker drives a conditional `scopeId` input — free text for `workstation`, a real `<select>` sourced from `mockLocationService`'s `pointsOfCare` for `location`, a real `<select>` sourced from `mockFacilityService`'s `facilities` for `clientAccount`/`facility` — plus the optional `specimenCaseType`/`eventTriggerType` selects and a full `PrintDestination` sub-form (protocol/ipAddress/port/queueName for LPR_LPD only/resourcePath for IPP only/displayName). Confirmed directly by grepping `pathscribe.css` before writing anything: every needed class (`.ps-rr-*`/`.ps-conf-*`/`.ps-modal-dark`/`.ps-overlay`) already exists generically from other dictionary screens in this folder — zero new CSS. `DemoResetTab.tsx`'s own `SETTINGS_KEYS` coverage was checked directly too: `print_routing_rules_v1` was already a pre-existing key there, so no change was needed on that front. Localized across all 5 locales under a new `printRoutingRulesSection` namespace (parity-checked programmatically, zero missing/extra keys in any locale).

## Duplicate, per the PS-73 duplication framework (Batch 317)

Which screens offer Duplicate is now a recorded decision: `services/duplication/duplicatePolicy.ts`, enforced by its guard test. Every screen below opens its ordinary Add form pre-filled from a copy built in `services/duplication/duplicateEntities.ts`. The copy's name is marked in the user's language (`t('common.copyOfName')`), and the save decides add-vs-update from the modal's `mode`.

**Removed** (not appropriate to copy):

- **PhysiciansSection:** a real person.
- **ContainerTypesSection, DelegationTypeSection, RvuCodeMapSection:** flat lookups.

`RvuCodeMapSection` also stopped hard-coding `en-US` for its dates (it uses `formatDateLong`). `DelegationTypeSection`'s id badge no longer builds colours in JSX (`color + '22'`); it passes `--ps-hue` and CSS derives the tints.

**Added:**

| Screen | What the copy clears or resets | Also fixed |
|---|---|---|
| SpecimenCategoriesSection | accession prefix/series, auto-create markers; Active | — |
| SpecimenDictionarySection | specimen code, synonyms (matching keys); version | **Data loss on every save.** The component rebuilt entries from a partial field list, so `protocolId` and `specimenCategory` were never saved, and six other fields were wiped on edit. Now `services/specimenDictionary/buildSpecimenEntry.ts`. |
| RoutingRulesSection (+ RuleModal) | always custom; next free priority | RuleModal's priority check excluded the passed-in rule in add mode too; now edit-only (`findRoutingRulePriorityConflict`). An add from a copy keeps lab scope and mapped specimen types. |
| CassetteRoutingRulesSection | starts **inactive**; conditions deep-copied | — |
| TATConfigSection | clears a system entry's note | **Add vs edit came from `!!entry`**, so a copy would have overwritten its source. Also **`roleId` was forced to null on every save**, widening per-role targets to all roles on edit. Logic moved to `services/tatConfig/`; types to `types/quality/TatConfigEntry.ts` (re-exported here). |
| AbnormalTriggerRulesSection | starts **Inactive**; field label kept (it's a matching key) | The form only pre-filled in edit mode, so a copy opened blank. An add from a copy keeps its synthetic coding. |
| PrinterProfilesSection | printer id and IP (the physical device) | — |
| WorkstationGroupsSection, ActionGroupsSection | — | — |
| ParticipationTypesSection (+ TypeModal) | abbreviation, facility authority overrides (audited decisions about one role), each country's regional title; never system | TypeModal's draft now carries `jurisdictionProfiles`, `scopedJurisdictions` and `icon`, so a copy keeps its country scope. Save passes `existing` only in edit mode. |

**Moved to the service and localized** (they used to store English `"(Copy)"` / `"Copy of"` as data):

- StainDictionarySection: a molecular target's gene **symbol** is now cleared rather than suffixed, and the header names the source.
- CasePoolAssignmentSection.
- ProtocolDictionarySection: the source's version **history** no longer leaks into the copy.
- QAConfigurationCenterSection.
- CytologyQcRulesSection.

## `AssistLisPollingSection.tsx` — Assist LIS Ingestion (Batches 322–323, PS-87)

Integrations group, shown as **Assist LIS Ingestion** since Batch 323. It covers the whole ingestion path for Assist mode:
- **Settings:** polling on/off, the interval, and the LIS status mapping (which LIS values mean Gross Complete or Microscopic/Diagnosis Complete).
- **Test an inbound message:** paste an HL7 v2 message or JSON webhook body (or load the example). It goes through the real adapter and staging queue and is handled straight away. Adapter errors are shown translated.
- **Staging queue:** counts, the 25 most recent events with source, state, result and attempts, and **Retry failed**.
- **Activity:** **Poll now**, the run log (polls, pushed messages, retries), and the latest run's results by case.

Render and dispatch only; the rules are in `services/lisIngestion/` and `services/assistPolling/`. Unsaved settings report to the Config dirty guard. `DemoResetTab.tsx` clears `pathscribe_assist_lis_polling` and `pathscribe_lis_staging_queue`.

## Template Review (Batch 328, PS-63)

**`TemplateGovernanceSection.tsx`** (Administration & Compliance → **Template Review**) holds the site's two template review settings:
- **Allow Template Self-Approval**, default off;
- **Required Reviewers**, 1–3, default 1.

Saving goes through `services/templates/templateGovernanceSettings.ts → saveTemplateGovernanceWithAudit`, which writes an audit entry for each real change. The screen reuses the shared `ps-rbuf-*` setting-row styles. `DemoResetTab.tsx` clears `pathscribe_template_governance`.

## Batch 333 (PS-89)

`DemoResetTab.tsx` keeps the new billing import-job ledger (`billing_code_import_jobs_v1`) out of Demo Reset, in `DELIBERATELY_NOT_RESET`. It has to stay in step with the billing rules it created, which are kept for the same reason.

## Country Signing Rules (Batch 335, PS-341)

**`CountrySigningRulesSection.tsx`** (new; Clinical Lookups → **Country Signing Rules**) is the platform-level editor for each participation type's national rules.
- **Layout:** pick a country, then see one card per participation type.
- **Each card has:**
  - the local title;
  - Can finalise / Requires countersign / Can view whole case, each set to the platform default (shown), Yes or No;
  - the regulatory basis;
  - who last changed it, when, and why.
- **Country-scoped roles:** roles such as the UK/EU Biomedical Scientist show whether they are offered in this country, with a button to offer or stop offering them there.
- **Who can edit:** only a platform administrator (`superadmin`). Everyone else sees the rules read-only, with a pointer to Participation Types → Edit for a single lab's exception.
- **Saving:**
  - a save needs a reason and writes one audit entry per changed type;
  - the country picker is locked while there are unsaved changes;
  - the sign-out check sees saved rules immediately, without a reload.
- **Where the logic lives:** `services/participationTypes/countryProfileEditor.ts` and `saveCountryProfiles.ts`. Styles: `.ps-csr-*` in `pathscribe.css`.
- **Guard:** covered by `services/participationTypes/standingRules.guard.test.ts`.

## Code Import (Batch 334, PS-89)

- **`CodeImportSection.tsx`** (new; Financial & Revenue Lookups → **Code Import (Bulk)**) imports billing codes from a CSV as one job for a second person to approve.
  - **Steps:** file and scope (coding standard, country, site, batch note) → match columns (suggested from the headers; billing code, CPT and effective date required, or one date for the whole file) → check file (refused rows listed with their reason; the admin can skip them) → import.
  - **Import history:** every job, newest first, with Roll back (reason required) on approved jobs.
  - **Rules** are in `services/billing/codeEngine/`; the service writes the audit entries. Styles: `.ps-code-import-*` in `pathscribe.css`.
- **`PendingApprovalSection.tsx`:**
  - **Import jobs:** a pending job appears once in the dictionary-updates table and is approved or rejected as a whole; the uploader sees it locked. Its versions no longer appear one by one in the billing-rule table.
  - **Deployment-neutral:** it now uses `@/services` instead of four mock-service imports, and is off the deployment baseline.
  - **Dates** are formatted in the user's language (`formatDate`), and the scope column's "Enterprise-Wide" is translated.
  - **Still in the component:** the audit text for single billing-rule and dictionary decisions (older code; import-job audit is in the service).

**Batch 345:** `DemoResetTab.tsx`'s Full Reset also clears the signature records (`pathscribe_signature_records`, in `CASE_KEYS`), since they belong to the cases being reset.

## Batch 353: TAT settings through a service

`TATConfigSection.tsx` reads and saves targets through `tatTargetService` (`services/tatConfig/`). It no longer keeps them in browser storage, and it is off both deployment baselines.
- **Add or update** comes from the editor's mode, so a duplicate is always an add.
- **System defaults:** the service refuses to delete one.
- **Moved out:** the built-in defaults (`SYSTEM_DEFAULTS`) and the storage key are no longer exported from here. They are `services/tatConfig/systemDefaultTatEntries.ts` and the demo service.
- **Other change:** facilities load through `facilityService`.

## Batch 356: Instruments (PS-326)

- **`InstrumentsSection.tsx`** (new), under Workstation & Hardware; it follows the shared facility selector.
  - It lists the lab's analytical instruments: name, code, model, performing lab, scan station and status.
  - Add, edit, deactivate and reactivate. The code can't be edited after creation.
  - The station list shows only the chosen lab's active stations.
  - Validation messages are translated (`instrumentsSection.errors.*`).
  - All rules are in `services/instruments/instrumentRules.ts`. The status toggle is a real button.
- **`index.tsx`:** registers the section.
- **`DemoResetTab.tsx`:** clears the `instruments` key.

## Batch 358: the Equipment register

- **`EquipmentSection.tsx`** replaces `InstrumentsSection.tsx`, still under Workstation & Hardware.
  - Every device has a code, name, kind, make, model, serial number, performing lab, scan station and status.
  - Filters: text, kind, status, and the shared facility selector.
  - The rules are in `services/equipment/equipmentRules.ts`.
- **`index.tsx`:** the section id is now `equipment`.
- **`DemoResetTab.tsx`:** clears `equipment`, plus the old `instruments` key it migrates from.
- **`duplicatePolicy.ts`:** records Equipment as no-Duplicate.

## Batch 359: Grossing Hardware, and device links

- **`GrossingHardwareSection.tsx`** (new): grossing cameras and scales.
  - Connection, Agent address, station, and the register device.
  - The rules are in `services/grossingHardware/grossingHardwareRules.ts`.
- **`PrinterProfilesSection.tsx`:**
  - A **Register Device** field and column (label printers from the register).
  - A save the service refuses now shows a message; before, every save closed the dialog.
  - The list filter and support label moved to `services/printerProfiles/printerProfileList.ts`.
- **`EquipmentSection.tsx`:** a **Settings** column shows which printer and grossing profiles point at each device.
- **`index.tsx`:** registers the new section.

## Batch 360: equipment service log

- **`EquipmentSection.tsx`:**
  - Maintenance and calibration schedule fields.
  - A **Service** column with a status badge and the next (or missed) due date on the facility's calendar.
  - A **Log** action.
- **`EquipmentLogModal.tsx`** (new):
  - Last done and due dates for maintenance and calibration, and an open-malfunction warning.
  - A form to record an entry, which can't be edited or deleted afterwards.
  - The history, newest first.
  - The rules are in `services/equipment/equipmentLogRules.ts`.
- **`DemoResetTab.tsx`:** clears `equipment_log`.

## Batch 361: devices shown in red

`EquipmentSection.tsx`: a row whose device has an open malfunction or is past due gets `ps-eqlog-row--alert` (red name, red left edge, faint red background). The decision is `isServiceAlert` in `services/equipment/equipmentLogRules.ts`.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

- `CasePoolAssignmentSection.tsx`: test-run results tag each case number. It now reads cases through `@/services` (`caseService`), so it came off the mock-import baseline.
- `OutboundMessagePreviewSection.tsx`: the case and patient id fields are tagged.
- `PatientMatchReviewSection.tsx`: the MRN/date-of-birth lines are tagged.


## Batch 364 (PS-349, PS-350): support references

`DemoResetTab.tsx`: clears `support_references`.

## Batch 367 (PS-74): no inline CSS

`CytologyCategoriesSection.tsx`, `DeliveryRulesSection.tsx`, `DocumentStyleSection.tsx`, `FontsSection.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368

`CytologyCategoriesSection.tsx` takes `cytologyCategoryService` from `@/services`. `DemoResetTab.tsx` clears the new `report_change_log` store.

## Batch 370 (PS-356)

`DemoResetTab.tsx` keeps only the screen. The reset logic and key lists moved to `services/demoReset/`, which takes it off the browser-storage baseline. The full reset (everyone's data) needs `config:demo-data:reset`: its button is a `CapabilityButton`, and the service checks again. Resetting your own hospital's data needs nothing. `DemoResetTab.auditTest.ts` and `DemoResetTab.coverage.test.ts` now read the lists from the service.

## Batch 371

- **`GoverningBodiesSection`:** editing now needs `platform:governing-bodies:manage` (Superadmin only; the service checks). It was `isSuperAdmin={true}` for everyone. It takes `governingBodyService` from `@/services` and is off the deployment baseline.
- **`TerminologyServicesSection`:** it shows its endpoint details to a superadmin session only. That was also hard-coded `true`.

## Batch 372

**`SupportAccessSection`** (Administration & Compliance → Support Access, section id `support_access`). For the hospital: the support access policy and access window, requests waiting for approval (Approve / Reject), active support access with time left (Revoke), and the support activity audit with its tamper check and CSV/JSON export. For ForMedrixAI support (superadmin sessions): request access to an organisation with a ticket and a reason, and see or end your own requests. Every decision is made in `services/supportAccess/`; the buttons are `CapabilityButton`s and the service checks again. Case ids in the audit table and the free-text reason are tagged `data-phi`.

**Correction (Demo Reset):** earlier entries here, including Batch 333's note on `billing_code_import_jobs_v1`, say the keys in `DELIBERATELY_NOT_RESET` survive a Full Reset. They didn't: the mock services store under `pathscribe_mock_`, which the reset swept regardless. They do now; see `services/demoReset/README.md`.

## Batch 376

**`FieldRequirementsSection`** (Administration & Compliance → Field Requirements, section id `field_requirements`, PS-359). You pick a page (Accession for now) and see its fields by group. Locked fields show "Always required" and why; the others have a Required switch, marked when changed from the default. Switching needs `config:field-requirements:manage`. Everything is decided in `services/fieldRequirements/`.

- **Batch 378, `FieldRequirementsSection`:** Grossing is a second page (groups Specimens, Blocks, Fixation; "Checked on every block" hint).

- **Batch 379, `FieldRequirementsSection`:** a field can carry a hint in place of "Checked on every specimen". Grossing's new "Grossing protocol attached" rule (required by default, switchable) says what happens when it's off, and "At least one block" is now switchable, with a hint saying which specimens it covers.

- **Batch 380, `FieldRequirementsSection`:** a third page, Case report, with the groups Add or edit specimen, Amendments and addenda, and Critical findings.

- **Batch 381, `FieldRequirementsSection`:** the Case report page's group 2: Holds, Comments, Delegation, Biopsy arrays, and Block cancellation and restains.

- **Batch 382, `FieldRequirementsSection`:** two more Case report groups: Frozen-final reconciliation, and Billing changes after sign-out (all locked).

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*

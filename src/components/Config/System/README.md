# components/Config/System/

The biggest, most central components folder after Config/ itself — every
system-wide dictionary/admin screen (30 files — was 28 → 27 after an
earlier rename → 26 after `specimenTypes.ts`'s relocation → 27 again with
`SessionSecuritySection.tsx`'s addition this pass, 28 with
`ExternalResourcesSection.tsx`, 30 with `ContributionSettingsSection.tsx`
— see Notes — then 28 again with `LISSection.tsx`/`IdentifierFormatsSection.tsx`
relocating below).

**Real, per direct request: `LISSection.tsx` and `IdentifierFormatsSection.tsx`
moved to `components/Config/Integrations/`**, alongside `TerminologyServicesSection.tsx`
(which already lived in its own folder) and the new `CrosswalkSection.tsx` —
consolidating the real interoperability-related config that was scattered in
this folder's own flat "Independent" sidebar group into its own major
configuration tab. `RvuCodeMapSection.tsx` and `BillingDictionarySection.tsx`
both deliberately stayed here — billing/coding rules, not external-system
connectivity, a real, different concern.
See `components/Config/Integrations/` for the new tab.

Wired entirely through `index.tsx`'s `SECTIONS` registry + `renderSection()`
switch; every section listed there is confirmed live (all 23 sidebar items
render a real, non-stub component — see Notes on `TATConfigSection.tsx`).

**Pattern:** Each dictionary/admin concern is one file — table + modal,
usually backed by a real `services/` interface/mock pair.

## Files

- **`index.tsx`** — Section registry + sidebar nav + URL deep-linking
  (`?tab=system&section=...`) + a `PATHSCRIBE_SYSTEM_NAVIGATE` custom-event
  listener for voice navigation.

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

- **`CasePoolAssignmentSection.tsx`** — **RENAMED this pass** (was
  `CaseRoutingSection.tsx`). Fixed a real naming collision: the component
  name collided with `services/cases/CaseRouter.ts` even though it
  actually corresponds to `services/cases/casePoolAssignmentService.ts`
  (already renamed in the services/ pass). File + component + the one
  import site (`index.tsx`) all updated; confirmed zero dangling
  references to the old name anywhere in `src/`.
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
  configured entries at all.
- **`ProtocolDictionarySection.tsx`** — Real, substantial (654 lines).
  Second-pass rebuild of its own editor (own header documents why: a flat
  pill grid for stain selection didn't scale to a real customer's Stain
  Dictionary). Real 2-column layout + search+multiselect. No issues.
- **`SubspecialtiesSection.tsx`** — Real, substantial (635 lines). No
  issues found in this pass.
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
- **`DemoResetTab.tsx`** — Real two-level mock data reset (full vs.
  "my hospital's data only"), both paths gated behind confirmation.

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

- **`FontsSection.tsx`** — Approved-fonts toggle list feeding
  `PathScribeEditor`'s toolbar via `SystemConfigContext`. Enforces at
  least one font stays enabled. No issues. **This is the real dictionary
  `Config/Macros/index.tsx` should be reading from instead of its
  hardcoded list — see `Config/Macros/README.md`.**
- **`SpecimenCategoriesSection.tsx`** — Migrated to `ps-conf-*`/`ps-ms-*`
  CSS classes (same pass as `PhysiciansSection.tsx`). Deliberately
  hardcodes the 3 current Grossing Templates rather than fetching them —
  documented as a pragmatic, revisit-later scope call, not an oversight.
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
  unlike e.g. Specimen Category). No issues. **Grew a Level field in a
  later session** (case/specimen/both — see `services/deficiencies/
  README.md`'s `IDeficiencyType.level` entry for the real gap this
  closes), scoped to the Deficiency Types tab only via a `showLevel`
  prop on the shared `TypeDictionaryTab` component underneath both
  tabs — Resolution Types has no equivalent concept, so it stays
  entirely absent from that tab's own table and form rather than
  showing an irrelevant field there.
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
  names, hex codes, and per-color fallback policy.
- **`CassetteRoutingRulesSection.tsx`** — real admin UI for the
  cassette routing rule dictionary (`services/cassetteRouting/`) — the
  "Cassette Colors Basic Routing Algorithm Flow" spec's own missing
  piece before this existed.
- **`ScanStationsSection.tsx`** — real admin screen for scan stations,
  per direct follow-up: "you said 'not yet' earlier — still true. Only
  the 8 seeded stations exist; nobody can rename or add one without
  editing source." See `services/scanStations/`.
- **`PrinterProfilesSection.tsx`** — real admin UI for the printer
  capability/profile registry (PS-51 spec Section 2), see
  `services/printerProfiles/`.
- **`PrintSettingsSection.tsx`** — Tier 1 (system/facility-wide
  default) of the hierarchical print-settings architecture, per direct
  follow-up: "structure your print settings hierarchically so labs can
  enforce their own policies." Mirrors `Config/AI/index.tsx`'s own
  established org-default/facility-override pattern. See
  `services/printSettings/`.
- **`FootPedalSection.tsx`** — real feature, per direct follow-up:
  "foot pedal support specifically (the one part confirmed to not
  exist at all)." Deliberately a per-workstation setting (see
  `useFootPedal.ts`'s own header), not a per-deployment admin toggle.

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
  `subspecialtyService`.
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

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*

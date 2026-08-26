# src/utils/

Pure, mostly-stateless helper functions — date/time formatting, name
formatting, accession normalization, specimen labeling, device
detection, and the embedded guide-PDF assets. This is one of the
cleanest folders in the whole codebase: most files here are genuinely
excellent, carefully-reasoned, well-tested pure functions with real
edge-case handling documented inline. A few real findings turned up
anyway.

## Real findings

**1.2MB+ of dead file bloat, removed:**
- `index.css` — a stale, orphaned duplicate of the real, actually-loaded
  `src/index.css` (imported in `main.tsx`). Confirmed nothing imports
  this copy anywhere, and confirmed by direct comparison that every
  class it defines already exists in the real file, more refined.
  Deleted.
- Three stale timestamped backups of `guideAssets.ts`
  (`.bak_20260605_094452`/`.bak_20260624_132635`/`.bak_20260626_134327`,
  ~1.2MB combined), left behind by `Update-GuideAssets.ps1` with no
  cleanup step. Also fixed *why* they kept accumulating: `.gitignore`
  already had a `*.bak` rule meant to catch exactly these, but the
  real filenames the script generates have a timestamp *after* `.bak`,
  which that glob never matched. Added `*.bak_*` alongside it.

**An incomplete prior consolidation, completed:** `caseUrgency.ts`'s
own header comment claims a past fix consolidated `WorklistTable.tsx`'s
and `WorklistPage.tsx`'s independently-diverging "is this case urgent"
logic into one shared function. Checking whether that actually held:
`WorklistPage.tsx` did correctly adopt it; `WorklistTable.tsx` never
did — it still had its own separate, locally-defined copy (a
`useCallback`) reachable from 12+ call sites, implementing identical
logic in parallel, including the same redundant `any` cast the shared
version also had. Harmless today since both computed the same thing,
but it defeated the entire point of the original fix — a plausible
future change (the comment itself anticipates a facility-configurable
STAT-vs-Rush distinction) would have silently applied to only one of
the two files. Migrated `WorklistTable.tsx` to the real shared
function, removed its local duplicate and the redundant cast. Full
writeup in `components/Worklist/README.md`.

**Minor, not acted on:** `synopticFieldLabels.ts` exports
`CAP_FIELD_LABELS` as an explicitly-labeled "legacy export — kept for
backwards compatibility." Confirmed zero consumers anywhere in the
codebase. Left it alone rather than removing it — unlike undocumented
dead code found elsewhere in this review, this one is a deliberate,
self-documented choice by whoever wrote it, and it's a zero-cost
re-export, not something adding real maintenance burden.

## Files (the rest — genuinely clean, no changes needed)

- **`formatDate.ts`** (`formatAuditTimestamp` — its own dedicated test file, `formatAuditTimestamp.test.ts`) — locale/jurisdiction-aware date, datetime, age,
  and relative-time formatting. Deliberately keeps `formatAuditTimestamp`
  UTC-and-locale-independent, distinct from the other, locale-dependent
  formatters — correct for compliance logs, with the reasoning stated
  inline.
- **`facilityTime.ts`** (+ `facilityTime.test.ts`) — the most carefully-verified file in this
  folder. Real, deliberate timezone-stable date bucketing (a stored
  case belongs to the facility's calendar day, not the viewing
  device's), with the DST-safe offset math and, notably, an inline
  comment documenting a sign-flip bug in an *earlier* version of this
  exact function that was caught via direct numeric verification and
  removed before shipping — not just fixed, verified.
- **`deviceDetection.ts`** (+ `deviceDetection.test.ts`) — real device-vs-resized-window detection
  for the Intraop mobile workflow (checks viewport width *and* pointer
  coarseness together, specifically because a narrow desktop window
  isn't the same thing as a real phone). Includes a real, working
  escape-hatch pair (`setDesktopViewOverride`/`clearDesktopViewOverride`)
  — the doc comment for the latter notes it was added specifically
  because the former originally shipped with no way to reverse it.
- **`barcodeFormatMapping.ts`** (+ `barcodeFormatMapping.test.ts`) — maps this app's `BarcodeType` union to
  ZXing's real `BarcodeFormat` enum, confirmed against the installed
  package's own type declarations rather than assumed from memory.
  Deliberately restricts scanning to only the 5 formats this app
  models, not ZXing's full format list, to avoid a scanner picking up
  an incidental product barcode in frame.
- **`normalizeAccession.ts`** — infers hyphen position in a typed/spoken
  accession number from the configured pattern, with real fallback
  behavior for anything that doesn't look like an accession (returned
  unchanged, never mangled).
- **`personName.ts`** — the Prefix/Given/Family/Preferred/Suffix name
  model, explicitly designed to handle cases rigid First/Middle/Last
  fields break on (Spanish double surnames, Hungarian name order, no
  middle name). Legacy `firstName`/`lastName` bridge kept for the ~15
  not-yet-migrated consumers.
- **`specimenLabeling.ts`** — the alpha/numeric specimen-vs-block
  labeling pair (CAP/NSH alternating convention) — structured so a
  component literally cannot pick alpha for both specimen and block
  independently, since block labeling is always derived as the
  opposite of whatever the specimen style is.
- **`flagAdapter.ts`**, **`formatLabel.ts`**, **`synopticFieldLabels.ts`**,
  **`caseRevisionDisplay.ts`** — small, clean, single-purpose. No
  issues.
- **`applyGrossingRefinement.ts`** (+ `applyGrossingRefinement.test.ts`) — new, per direct follow-up: "The AI
  call can happen in the background... not necessarily going to
  serialize the accession event with Grossing immediately," plus a
  same-session follow-up: "Do we capture failed template association?
  That might be a good quality measure." The pure half of
  `AccessionPage.tsx`'s background Grossing Template refinement — two
  real, separate concerns, both extracted specifically to be
  deterministically testable without depending on the real AI's own
  non-deterministic output: (1) safety — never silently swap a
  specimen's template out from under someone who's already started
  grossing it; (2) a new, permanent quality-outcome record
  (`ai`/`fallback`/`override`/`failed`) persisted for every specimen
  with a real AI result, independent of whether its template itself
  was safe to change. 16 tests. See that page's own README for the
  full feature.
- **`labels/printRequisitionAndContainerLabels.ts`** — new, per direct
  follow-up: "Label Reprint is a real thing too. Either a batch or
  single." Real problem this closes: the original requisition/container
  print action (`AccessionPage.tsx`) only ever existed transiently,
  right after accession — no standing way to reprint for an existing
  case once you navigated away. Extracted the real logic into
  `printRequisitionLabel`/`printContainerLabel`/`printAllContainerLabels`
  so both the original accession-time flow and a new, persistent
  reprint entry point (`MaterialTreePanel.tsx`) call the same real
  functions, not two copies that could drift. **Real bug found and
  fixed while extracting this**: the original inline code hardcoded
  `DEFAULT_CONTAINER_LABEL_PRESET_ID` rather than reading
  `printSettingsService`'s own, real `containerLabelPresetId` — an
  admin's real Config choice (Step 3) was silently never applied to an
  actual print job. Fixed here, with an honest fallback if a stored
  preset id is genuinely stale/unknown. 6 tests, including one that
  directly proves the fix (a real, non-default preset is honored).
- **`labels/getAllCassetteLabelRequests.ts`** — new, per direct
  research: "Batch Print Queue Interface... 'Print All Cassettes for
  Case.'" Pure function, a real `Case` in, the full, real list of
  cassette dispatch requests out (every block, every specimen) — 5
  tests.
- **`labels/`** — per direct follow-up on the requisition/container
  label-printing architecture scope. `buildRequisitionLabelData.ts`/
  `buildContainerLabelData.ts` — pure functions, real `Case`/`Specimen`
  in, real label content out, no I/O. Deliberately scoped to
  requisition and container labels only — cassette/slide labels are,
  per direct follow-up on Cerebro's own real capabilities (CEREBRO-ID/
  CEREBRO-ID+ drives that printing natively on named hardware), likely
  not something PathScribe needs to render at all; see
  `services/hl7/adapters/cerebroAdapter.ts`. Real, named physical label
  sizes (CLSI AUTO12 as the confirmed US standard, plus researched
  preset sizes) live in `types/labels/LabelSizePreset.ts` — canonical
  mm storage, inches as a display-only conversion, never a second
  parallel data model.
  **Step 2, same session:** `generateBarcodeSvg.ts` — real barcode
  rendering via `bwip-js` (installed; imports from the explicit
  `bwip-js/browser` subpath — the bare specifier didn't resolve under
  this project's `bundler` module resolution, a real, confirmed
  TypeScript/package-exports interaction, not a version problem).
  `buildLabelHtml.ts` — pure HTML-fragment builders,
  `printLabels.ts` — the print trigger, deliberately mirroring
  `CopilotReportViewModal.tsx`'s own hard-won `window.open()` mechanics
  exactly (same blank-print-issue avoidance), with one real difference:
  `@page { size: ...; margin: 0; }` instead of a margin-only rule, the
  actual CSS mechanism that gets a label's real physical dimensions to
  the printer. Wired into `AccessionPage.tsx` as a real, user-triggered
  "Print Labels" action, deliberately independent of the background
  Grossing Template refinement's own timing (new `justAccessionedCase`
  state, set immediately on real case creation — printing needs none
  of what that background AI call produces).
  **Two real bugs found only by testing this live, not by reasoning
  about the CSS:** the first layout (one fixed design, `justify-
  content: space-between`) looked fine on paper but failed in two
  opposite, real ways — stranded with a huge empty gap on the full-page
  requisition preset, and clipped the MRN row and the entire barcode
  via `overflow: hidden` on the real 2″×1″ (50.8×25.4mm) CLSI container
  preset, since the content genuinely didn't fit at those font sizes.
  Fixed with two real, distinct layout modes (`printLabels.ts`'s own
  CSS) picked by real physical area — compact/side-by-side at or below
  55×30mm, roomy/stacked above it — confirmed live: every field and a
  correctly-rendered DataMatrix barcode now visible on the small
  preset, and the full-page preset compact and top-aligned, no gap.
  104 tests across the whole `labels/` folder as of August 2026 (grown
  substantially since this section was first written — see
  `labels/README.md` for the current, full module breakdown).
- **`guideAssets.ts`** (5.3MB) — auto-generated by
  `Update-GuideAssets.ps1`, embeds the Admin/User Guide PDFs as base64
  for blob-URL opening (avoids React Router intercepting a direct PDF
  route). Confirmed it's exactly what its own header comment claims —
  nothing unexpected in it.

## Files added since the original review pass (Aug 2026)

Not part of the original review above — added later, documented here
rather than left uncovered. Grouped by real, related concern.

### Cassette color routing

- **`resolveBlockCassetteColor.ts`** (+ `resolveBlockCassetteColor.test.ts`) — real feature, per direct
  follow-up on the grossing-station workflow: "Context & Protocol
  Resolution... Required cassette media attributes (e.g., PINK for
  small biopsy, GREEN/MESH for cell block)." The async wrapper that
  fetches rules/colors/protocols (`fetchCassetteRoutingData.ts`) and
  calls the pure `evaluateCassetteRouting.ts` engine (tested in `utils/__tests__/`, alongside its sibling `evaluateMicroscopicFinalizeGate.ts` — the real microscopic-description finalize gate, same "pure logic, tested separately from the hook that calls it" discipline).
- **`resolveDecantCassetteColor.ts`** (+ `resolveDecantCassetteColor.test.ts`) — the decant-level
  sibling, per direct follow-up: "cell blocks frequently use distinct
  cassette colors... to signal fragile cytopreparations to
  histotechnologists."
- **`resolveProtocolIdForSpecimen.ts`** (+ `resolveProtocolIdForSpecimen.test.ts`) — small, shared helper
  extracted while wiring block-level color routing into
  `handleAddBlock` — a real cassette-routing rule can only match on
  `protocolId`, so this is the one, real place that resolution happens.
- **`fetchCassetteRoutingData.ts`** — the one, shared fetch both
  `resolveBlockCassetteColor.ts` and `resolveDecantCassetteColor.ts`
  need (rules, colors, protocols) — extracted specifically so there's
  one real fetch, not two independently-written copies.
- **`generateDefaultMaterial.ts`** (+ `generateDefaultMaterial.test.ts`) — real, architectural
  extraction out of `AccessionPage.tsx` (where it lived as
  `generateDefaultBlocks`), per the Hybrid Model's own principle:
  "ProtocolPathway drives execution: the pathway definition always
  dictates whether a block or decant entity is instantiated." Also
  where accession-time cassette color resolution now happens (moved
  earlier from grossing-scan hydration — see its own header for the
  full "block color only correct once scanned at grossing" fix this
  closed).
- **`hydrateGrossingBlocks.ts`** (+ `hydrateGrossingBlocks.test.ts`) — real feature, per direct
  follow-up describing the real grossing-station workflow: "scanning
  the container at grossing means resolving and releasing those
  pre-created default blocks into physical assets."
- **`sharedCassetteSiblings.ts`** — real fix, per direct follow-up:
  "when creating Biopsy Arrays, I'm not sure we are dealing with that
  very well... every associated specimen gets updated simultaneously
  since they are actually a multi-source cassette." Confirmed directly
  before building, not assumed.

### Scanning & material tracking

- **`parseScannedPayload.ts`** (+ `parseScannedPayload.test.ts`) — real, standalone, pure
  parser for the "Barcode Listener & Form Auto-Ingestion" spec's own
  "Parser Logic" piece. Deliberately kept out of `ScannerProvider.tsx`
  itself, whose own real job (global keystroke-burst detection) is a
  different concern.
- **`resolveMaterialFromScan.ts`** — real, shared extraction — this
  exact resolution logic used to live only inside
  `hooks/useGlobalMaterialScanTracking.ts`; pulled out, unchanged, so
  the Batch Management module can resolve a scan the same real way.
- **`dispatchMaterialScanEvent.ts`** — real, honest stand-in for
  actually transmitting a `MaterialScanEventPayload` to an external
  LIS/middleware engine — same discipline as
  `labels/dispatchCassetteLabel.ts`: no real transport exists yet
  anywhere in this app, so this is a real, correctly-shaped stub, not
  a silent no-op.
- **`playScanBeep.ts`** — real feature, per direct spec: "play an
  optional subtle auditory cue (a soft 'beep') so the technician knows
  the scan succeeded without having to look up at the monitor."
- **`effectiveScanStation.ts`** — real, pure (non-React) implementation
  of the same fallback-chain rule `hooks/useEffectiveScanStation.ts`
  already implements reactively — needed as a plain function since
  `audit/auditLogger.ts`'s `logEvent()` isn't a hook and can't call one.
- **`blockExceptionStates.ts`** — real feature, per direct follow-up
  building a full exception-states matrix for the grossing bench
  (STAT/urgent, 0 slides, Consumed/Entirely Submitted, Damaged, Lost)
  — one, single, shared source of truth for how each state is computed.

### Patient ID & search formatting

- **`patientIdStatus.ts`** (+ `patientIdStatus.test.ts`) — the real status-dot logic behind
  `components/Common/PatientIdStatusDot.tsx`, jurisdiction-aware (per
  direct correction: "Scotland's CHI system does not use the 2-digit
  Status Indicator Code... verification in LIMS...").
- **`ukPatientIdValidation.ts`** (+ `ukPatientIdValidation.test.ts`) — NHS Number (England &
  Wales), CHI Number (Scotland), and H&C Number (Northern Ireland)
  format and checksum validation — three genuinely different real
  schemes, not one generic UK validator.
- **`normalizeIdForSearch.ts`** (+ `normalizeIdForSearch.test.ts`) — real fix, per direct
  follow-up: "Scotland and Ireland have different formats for their
  NHS number, would we do the same approach there?" Deliberately not
  the same mechanism as `isoDateForSearch.ts` below — a genuinely
  different normalization problem.
- **`normalizeOrderCode.ts`** (+ `normalizeOrderCode.test.ts`) — **NEW.** Order-type-mapping
  work, extending the existing Specimen Code Crosswalk
  (`services/orderIntake`'s own `SpecimenCodeCrosswalkEntry`) with
  real multi-coding-system matching. Same safe-normalization posture
  as `normalizeIdForSearch.ts` just above (strips formatting noise
  only, never resolves genuine ambiguity) — trims, uppercases, strips
  punctuation, collapses whitespace, so cosmetically different
  transcriptions of the same real order code compare equal.
- **`isoDateForSearch.ts`** (+ `isoDateForSearch.test.ts`) — real fix: the Accession omnibox
  search used to hardcode US-style mm/dd/yyyy for DOB matching
  (`isoDateToMDY.ts`'s own header wrongly claimed "no locale awareness
  needed" — confirmed wrong, replaced by this file).
- **`inferLateralityFromText.ts`** (+ `inferLateralityFromText.test.ts`) — real fix, per direct
  report: a mock order description with clear implied laterality
  ("left forearm skin excision") wasn't being reflected in the
  laterality dropdown — any data available in the record should load
  into the form, not just the structured fields.
- **`isEncounterActive.ts`** (+ `isEncounterActive.test.ts`) — real feature, per direct,
  detailed "Encounter Selector & Auto-Fill" spec's own "Strict
  Matching & Active Status Constraints" safety safeguard — extracted
  from `AccessionPage.tsx` into its own dedicated, tested utility
  since getting this specific check right matters most.
- **`sourceTextMatching.ts`** (+ `sourceTextMatching.test.ts`) — shared source-text matching,
  extracted from `LeftReportPanel`'s inline `useMemo` so the exact
  same algorithm powers both the live per-field "source not found"
  indicator and a second, related consumer.

### Grossing, admin & misc

- **`classifyGrossingComplexity.ts`** (+ `classifyGrossingComplexity.test.ts`) — real feature, per
  direct follow-up on the Grossing spec's "Smart Auto-Switching
  (Context Awareness)" section — LIS specimen/CPT code as the primary
  trigger for Routine/Simple vs. more involved grossing template
  defaults.
- **`foreignIdCollision.ts`** (+ `foreignIdCollision.test.ts`) — real feature, per direct
  follow-up: "the lab will receive outside blocks or cytology fluids
  with existing ids that we need to map to the PathScribe unique id...
  it's safer not to have to relabel specimen containers if possible."
- **`computeDraftDiff.ts`** — real feature, per direct follow-up: "I
  thought we were displaying the changes that would be applied to the
  case." Closes a gap `DraftRecoveryModal.tsx`'s own header already
  documented as a known, deliberate Phase 1 simplification.
- **`materialDisplayId.ts`** — real feature, per direct follow-up on
  unique material identification: "every asset of the material
  (specimen, block, slide, decant, fluid, etc.) should be uniquely
  identified... the ID should at least be understandable to a human."
- **`clinicalAdmins.ts`** — real feature, per direct confirmation: "I
  would send the message to Admins, or create a new entity, like
  clinical admins as a subset." Investigated the real, existing
  `Admin` role before building rather than assuming a new one was
  needed.
- **`accessRequests.ts`** — shared admin-notification helper for any
  "request access" flow. Originally lived privately inside
  `WorklistTable.tsx` (built for Pediatric Access); extracted here so
  the genuinely separate Pool-membership access-request flow could
  reuse the same real notification logic rather than duplicating it.
- **`staffSubspecialties.ts`** — real fix, per direct confirmation:
  replaces the old free-text `StaffUser.department` field, genuinely
  redundant with the real Subspecialty dictionary
  (`services/subspecialties/`), which already existed but had no way
  to be assigned from the Staff editor until this.
- **`parsePubMedInput.ts`** (+ `parsePubMedInput.test.ts`) — real feature, per direct
  follow-up: "if they access the article and then search and find a
  different article, can we update the PubMed article link... so they
  don't have to search again." Powers the research ticker's
  "paste it here" field.

### Duplicate-and-edit + uniqueness validation

Both extracted specifically to be reusable across every config
dictionary, not just the two files that first needed them — per
direct request for "a general pattern across many dictionary types."

- **`duplicateEntry.ts`** (+ `.test.ts`) — `prepareDuplicate()`: given
  an existing entry, returns a copy with its display-name field
  suffixed `(Copy)`, ready to prefill an Add-mode modal. Real bug this
  was built to fix: `StainDictionarySection.tsx`'s own Duplicate button
  used to call `.add()` immediately and reload the list — the user had
  to find the silent copy afterward to edit it. Confirmed live (not
  just in code) that the fixed flow now opens the form pre-filled and
  only saves on a real, explicit Save. Also used by
  `ContainerTypesSection.tsx` and `DelegationTypeSection.tsx`.
- **`validateUnique.ts`** (+ `.test.ts`) — `findDuplicate()`: generic
  collision check across one or more keys, case-insensitive, with an
  optional id to exclude (so editing an entry unchanged never flags
  itself). Real, confirmed uses: dictionary name uniqueness (per
  direct request — "I need the Name to be Unique, or staff will get
  confused"); `CrosswalkSection.tsx`'s own `clientId` +
  `externalCode` combination — confirmed against
  `mockOrderIntakeService.ts`'s real `resolveOrder()` lookup, which
  does exactly this compound, case-insensitive match; two entries
  colliding on it would let `.find()` silently resolve a real incoming
  specimen to the wrong dictionary entry; `ContainerTypesSection.tsx`'s
  `performingLabFacilityId` + `name` and `performingLabFacilityId` +
  `aplisMapping`; and `DelegationTypeSection.tsx`'s
  `performingLabFacilityId` + `label` and `performingLabFacilityId` +
  `id` — each its own compound check — per direct follow-up
  ("Each Performing Lab will want their own types"), a collision is
  only real within the same lab's own scope (including "both
  undefined" as its own real, global scope), never against a
  different lab's own types. Verified live, every direction
  independently for every real use: a same-scope collision is
  blocked, a genuinely different scope is correctly allowed through.

### Performing Lab scoping

- **`performingLabs.ts`** (+ `.test.ts`) — `getActivePerformingLabs()`:
  real, shared "fetch all active performing labs" query. Extracted
  per direct follow-up ("Performing Lab is going to be a fixture" —
  enterprise customers need their own scoped dictionary items) after
  confirming the exact same query was already independently written,
  identically, in both `ExternalResourcesSection.tsx` and
  `ContainerTypesSection.tsx` — both since refactored to use this one,
  shared version. Also used by `DelegationTypeSection.tsx`, the third
  real consumer confirming this was worth extracting, not a one-off.
  Note on placement: kept in `utils/` rather than
  folded into `services/facilities/IFacilityService.ts` alongside its
  own, real, pure `resolvePerformingLabFacilityId()` — that one takes
  a `Facility` directly and makes no service call; this one does, and
  an interface module shouldn't depend on its own mock/firestore
  implementation. Testing this surfaced a real, useful environment
  gotcha, not a bug in the function itself: importing the full
  `services` barrel transitively loads every service, including one
  with real, top-level `localStorage` access (`mockUserService.ts`) —
  failed under plain Node until the test file got the same
  `// @vitest-environment happy-dom` directive already used elsewhere
  in this codebase for exactly this reason.

---
*Note on structure: earlier entries above this section predate the
convention of grouping by concern — they're the original, individual
per-file review. New entries since Aug 2026 are grouped, per the same
discipline `hooks/README.md` and `services/README.md` use for their
own later additions.*

### Configuration page scroll reset

- **`resetConfigScroll.ts`** (+ `.test.ts`) — real bug found and
  fixed, per direct report: "when changing across the different
  config/system settings, the page does[n't] begin at the top, so you
  have to scroll up to see the add button and column headers."
  `.ps-cfgpage-scroll` (confirmed via its own `overflow-y: auto`) is
  the real, single, shared scroll container for the whole
  Configuration page — but two of the three real state changes that
  can switch what's displayed (`Config/System/index.tsx` and
  `Config/Integrations/index.tsx`'s own internal `setActive`) happen
  two component levels below it, so a prop couldn't reach it without
  a larger refactor. Kept as a small, direct
  `document.querySelector('.ps-cfgpage-scroll')` lookup rather than
  that refactor — a real, singular, well-known container, not a
  fragile guess at an arbitrary selector. Wired into every real
  trigger path: `pages/ConfigurationPage.tsx`'s own top-level
  `handleTabChange`, both System's and Integrations' sidebar clicks,
  both tabs' URL-deep-link `useEffect`, and System's
  voice-navigation event listener — five call sites, not just the one
  originally noticed. Verified live, every path independently, with a
  forced-scrollable viewport and a confirmed non-zero scroll position
  before each switch (re-did two of these after a first attempt gave
  a false-looking "already zero" result that turned out to mean the
  content wasn't tall enough to scroll at all, not that the fix
  worked) — see `pages/README.md`'s own `ConfigurationPage.tsx` entry
  for the fuller account.

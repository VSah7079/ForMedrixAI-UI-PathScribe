# PathScribe Update 255 — PS-284: Microtomy Workstation

First of the confirmed PS-284 → 285 → 286 → 287 → 288 workstation-build
sequence. This update covers PS-284 only: a real-time on-demand and batch
slide printing/etching UI for the microtomy bench, plus the cytology
decant-prep support it shares a page with.

## What was built

### Types & data model
- `types/case/Specimen.ts` — `StainOrder` extended: `commentPrintsOnLabel`,
  `printStatus`/`printedAt`/`printedBy`/`printFailureReason`,
  `levelDepthMicrons`, `pairedControlSlideId`/`isControlSlide`,
  `preparationMethod`, `lastReprintReason`/`lastReprintOrderedBy`/
  `lastReprintOrderedAt`/`reprintCount`. `HistologyBlock` extended:
  `tinyTissue`, `fragile`.
- `types/case/Material.ts` — `Decant` extended: `totalVolumeMl`,
  `appearance`, `yieldPelletSize`.

### Print settings / label layout
- `services/printSettings/IPrintSettingsService.ts` — new
  `SlideLabelLayoutConfig` / `DEFAULT_SLIDE_LABEL_LAYOUT`, added to
  `PrintSettingsConfig`. **Honest gap**: not yet wired into
  `buildSlideZplTemplate.ts`'s actual ZPL dot coordinates (those remain
  hardcoded literals verified against Labelary at a fixed scale) — no admin
  editor UI for this field either. Documented in that service's README.
- `utils/labels/resolveSlideLabelFitWarnings.ts` (+ test) — mirrors the
  existing `resolveCassetteLabelFitWarning.ts` for slide labels.

### Cytology
- `services/cytology/computeCytologyPrepSuggestions.ts` (+ test) — pure
  dynamic-preparation-rule engine, tested against the ticket's own worked
  example (>20mL + high yield → 2 ThinPrep, 2 Cell Block, 1 Direct Smear)
  plus a strict `>20` boundary case.
- `services/stains/mockStainTypeService.ts` — added `Diff-Quik / Wright-
  Giemsa` (Cytology category), completing the ticket's three-item Stain
  Quick-Toggle (Pap Stain and H&E already existed).

### Pure business logic
- `utils/microtomyOperations.ts` (+ test) — `computeNextUnprintedStain`,
  `addMicrotomyStain`/`removeMicrotomyStain` (required cancel reason once
  printed), `markStainPrinting`/`markStainPrintResult`,
  `reprintMicrotomyStain` (required reason), `reorderBlockStains`,
  `updateStainComment`/`updateBlockComment`, `setBlockAlertFlags`,
  `updateDecantCytologyFields`, `applyCytologyPrepSuggestions`,
  `addDecantStain`/`removeDecantStain`.

### UI
- `pages/MicrotomyWorkstationPage/` — new folder: the page itself, five
  components (`SlideGridPanel`, `HardwarePrintPanel`, `CytologyPanel`,
  `CommentDrawer`, `BatchProgressModal`), and
  `hooks/useMicrotomyWorkstation.ts` (real persistence, scan resolution,
  and the real GS1/ZPL print-dispatch chain — mirrors the existing template
  in `useSpecimenBlockManagement.ts`'s `attemptPrintedLabel`).
- `pathscribe.css` — new `.ps-microtomy-*` class family, built to visually
  match `GrossingScreenPage.tsx`/`SynopticReportPage.tsx` (same header/
  back-button pattern, same `ps-overlay`/`ps-modal-dark` modal convention,
  same dark palette), per direct guidance ("use the same UI ... for
  consistency").
- `App.tsx` — new route `/workstations/microtomy`, in the same
  non-case-scoped, `ScannerProvider`-wrapped route group as
  `/batch-management/*` (deliberately not nested under the `:caseId`-scoped
  clinical route group — this is a bench-scoped workstation, not a
  per-case page).
- `Home.tsx` — new nav tile. This file had **zero** i18n before this
  change; only the new tile's two strings were converted (per the
  established "convert only what you touch" rule), the other 13 tiles
  remain as they were.

### The "Levels/Recuts" picker (per direct follow-up: "Or request Recuts
ect...")
The Add Stain quick-picker's "Levels/Recuts" category maps to ordering an
additional level/recut of an already-ordered stain, not a brand-new stain
type. Implemented as a one-click "+ Level" action per slide row
(`handleAddLevelOfExistingStain`), reusing the existing add-stain machinery
with `duplicateCount: 1`.

## i18n

Built with `useTranslation()`/`t()` from the start (new page). New
`microtomyWorkstation.*` namespace plus `home.microtomyTile.*`, across all
five locale files (en/fr/de/nl/ko). Verified programmatically — not by eye:

- All five locale files parse as valid JSON.
- All five have **identical key sets**: 627 leaf keys total per file, 95 of
  them under `microtomyWorkstation.*`/`home.microtomyTile.*` combined,
  matched exactly across every locale.

## READMEs updated in the same pass

- `pages/MicrotomyWorkstationPage/README.md` (new)
- `pages/README.md` (new subfolder-index row)
- `services/printSettings/README.md` (new `SlideLabelLayoutConfig`, honest
  gaps)
- `services/cytology/README.md` (new Phase 79 entry)
- `services/stains/README.md` (new catalog entry)
- `i18n/README.md` (new "Fourth real conversion" entry)

## Validation

- **`npx tsc --noEmit -p .`**: clean except one error, confirmed
  **pre-existing and unrelated**: `services/specimenDictionary/
  mockSpecimenDictionaryService.ts` imports
  `scripts/terminology-sources/specimens-starter.json`, and the `scripts/`
  directory does not exist at all in this working copy. That file was never
  touched by this update. (Two real compile errors were found and fixed in
  the new code itself during this pass: an unused `StainCategory` import in
  `SlideGridPanel.tsx`, and a discriminated-union narrowing failure in
  `markStainPrintResult` — see "Known project gotcha" below.)
- **`npx vitest run --exclude firestore.rules.test.ts`**: 3589 passed, 40
  skipped, 21 failed, 41 suites failed to load. Every single one of those
  failures traces to the exact same pre-existing, unrelated gap above (the
  missing `scripts/terminology-sources/specimens-starter.json`, imported
  transitively via `services/index.ts`) — confirmed by inspecting the
  actual error text of a representative sample (including
  `resolveStaffByQuickAuthPin.test.ts`, which has nothing to do with
  specimens, stains, or microtomy). None of this update's own new files
  appear anywhere in the failure list.
- **New tests, run in isolation**: `microtomyOperations.test.ts`,
  `computeCytologyPrepSuggestions.test.ts`,
  `resolveSlideLabelFitWarnings.test.ts` — **31/31 passed.**

### Known project gotcha (re-encountered, not new)

`markStainPrintResult`'s `result` parameter was first typed as a
discriminated union (`{ok: true} | {ok: false; message: string}`), which
failed to narrow under `if (result.ok)` — this project's `tsconfig.json`
has `strictNullChecks: false`, under which TypeScript's control-flow
narrowing on a boolean-literal discriminant doesn't reliably work. This
exact gotcha is already documented in `services/reports/README.md`. Fixed
the same way already established there: a single shape with an optional
field (`{ok: boolean; message?: string}`) instead of discrimination.

## Deliberate scope cuts (ticket is Autopsy-module-scale)

- No `MatrixBlock`/specimen-level scan resolution — block and decant scans
  only.
- No foot-pedal support.
- Label preview is a schematic illustration (deterministic pattern, not a
  real decodable barcode) — same honest posture as the rest of this app's
  label previews where noted.
- `buildSlideZplTemplate.ts` not rewired to the new `SlideLabelLayoutConfig`
  — would require re-verifying the ZPL template's real dot placement
  against Labelary, out of scope for this pass.
- No action-registry/voice wiring for this new bench.
- No admin editor UI for `SlideLabelLayoutConfig`.
- `processMicrotomyScan` (pre-existing, in `useGlobalMaterialScanTracking.ts`)
  still always dispatches through the honest stub `dispatchSlideLabel`
  regardless of a station's real `supportsPrinting` flag — deliberately
  NOT touched in this pass. This new page is the first real place the
  actual GS1/ZPL `printSlideLabel` path gets used. Reconciling the stub
  and the real path is a separate design question, not resolved here.
- Control-slide pairing (`pairedControlSlideId`/`isControlSlide`) is a
  deliberate, separate, same-block sibling-slide mechanism — genuinely
  different from the existing `shouldAutoAppendControl.ts` (a batch/QC-level
  synthetic-control-CASE mechanism). Not reconciled in this pass.

## Next

PS-285 (Embedding Station), then PS-286, PS-287 (narrowed scope), PS-288
(built in the same pass) — each following this same full workflow.

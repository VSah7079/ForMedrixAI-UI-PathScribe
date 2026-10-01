# pages/MicrotomyWorkstationPage/

**NEW (Sep 2026)** — PS-284, first of the PS-284→285→286→287→288 workstation-build sequence. A dedicated, bench-facing surface for the microtomy tech: scan a block or a cytology decant/fluid container, see every slide it needs cut and stained, and print/etch labels for them — either on-demand (one slide at a time, as the tech cuts) or as a batch (select several, print them together). Built to visually match `GrossingScreenPage.tsx`/`SynopticReportPage.tsx` (same header/back-button pattern, same `ps-overlay`/`ps-modal-dark` modal convention, same dark palette) per direct guidance, not a new visual language.

**Route**: `/workstations/microtomy` — deliberately NOT nested under the `:caseId`-scoped, `synopticLoader`-gated clinical route group. This is a bench-scoped workstation a tech opens once and scans multiple cases through, the same shape as `/batch-management/*`, so it lives in that same non-case-scoped, `ScannerProvider`-wrapped route group in `App.tsx`. Reachable from a new tile on `Home.tsx`.

## Files

- **`MicrotomyWorkstationPage.tsx`** — the page itself: a scan-to-begin entry state; once a block or decant resolves, a three-panel layout (Left: work-item context — accession/patient/block summary, alert-flag badges for Tiny Tissue/Fragile/Decal Required, prior slide history; Center: the interactive slide grid or, for a decant, the cytology panel; Right: hardware & print controls). Also owns the global `PATHSCRIBE_SCAN` listener (same `STATION:`-prefix-guarded convention as `useGlobalMaterialScanTracking.ts`/`useDefaultActionOnScan.ts`) so a tech can scan the next block without touching the mouse.
- **`components/SlideGridPanel.tsx`** — the center-panel slide table for a histology block (Level · Stain · Print Status · Actions), the per-row "+ Level" quick action for ordering an additional recut/level of an already-ordered stain, and a purpose-built Add Stain quick-picker (category search, duplicate count, level depth/microtome step, control-slide pairing checkbox). Deliberately does NOT reuse the existing `StainMultiSelect` component — its `onChange` contract has no way to carry duplicate-count/level-depth/control-pairing, and retrofitting those in risked regressing its existing callers; see the picker's own header comment for the full reasoning.
- **`components/CytologyPanel.tsx`** — the center-panel replacement for a decant work item: Total Volume (mL) / Appearance / Decant Yield fields, the dynamic preparation-method suggestion (`computeCytologyPrepSuggestions`) with an "Accept suggestion" action, per-slide preparation-method selector, and the Pap Stain / Diff-Quik / H&E quick-toggle.
- **`components/HardwarePrintPanel.tsx`** — the right-panel print mode toggle (On-Demand vs. Batch), next-unprinted-slide call to action, device status, and a 1:1 schematic label preview (a deterministic illustration, not a decodable barcode — see the file's own comment).
- **`components/CommentDrawer.tsx`** — the unified comment drawer (badge count), covering both block-level read/write notes (with high-contrast alert badges) and slide-level editable comments with the "prints on label vs. LIS-only" toggle.
- **`components/BatchProgressModal.tsx`** — progress modal for a batch print run (Pending/Printing/Printed/Failed per selected slide).
- **`hooks/useMicrotomyWorkstation.ts`** — wraps `utils/microtomyOperations.ts`'s pure functions with real persistence (`caseRouter.updateCase`, optimistic update, version-conflict handling — same shape as `useGrossingScreen.ts`), the scan-resolution flow (`resolveMaterialFromScan`), and the real print dispatch chain (station → `supportsPrinting` + printer profile → `printSettingsService.get()` → `printSlideLabel`), mirroring the existing template in `useSpecimenBlockManagement.ts`'s `attemptPrintedLabel`.

## Related files elsewhere

- **`utils/microtomyOperations.ts`** (+ `.test.ts`) — the pure, tested business logic: `computeNextUnprintedStain`, `addMicrotomyStain`/`removeMicrotomyStain` (with required cancel reason once printed — `MICROTOMY_CANCEL_REASONS`), `markStainPrinting`/`markStainPrintResult`, `reprintMicrotomyStain` (required reason — `MICROTOMY_REPRINT_REASONS`), `reorderBlockStains`, `updateStainComment`/`updateBlockComment`, `setBlockAlertFlags`, `updateDecantCytologyFields`, `applyCytologyPrepSuggestions`, `addDecantStain`/`removeDecantStain`.
- **`services/cytology/computeCytologyPrepSuggestions.ts`** (+ `.test.ts`) — the pure dynamic-preparation-rule engine (the spec's own worked example: >20mL + high yield → 2 ThinPrep, 2 Cell Block, 1 Direct Smear).
- **`utils/labels/resolveSlideLabelFitWarnings.ts`** (+ `.test.ts`) — mirrors the existing `resolveCassetteLabelFitWarning.ts` for the new `SlideLabelLayoutConfig`.
- **`services/printSettings/IPrintSettingsService.ts`** — `SlideLabelLayoutConfig` / `DEFAULT_SLIDE_LABEL_LAYOUT`, `PrintSettingsConfig.slideLabelLayout`. See that file's own README for the honest gap (not yet wired into `buildSlideZplTemplate.ts`'s actual ZPL dot coordinates).
- **`types/case/Specimen.ts`** — `StainOrder` extended with `commentPrintsOnLabel`, `printStatus`/`printedAt`/`printedBy`/`printFailureReason`, `levelDepthMicrons`, `pairedControlSlideId`/`isControlSlide`, `preparationMethod`, `lastReprintReason`/`lastReprintOrderedBy`/`lastReprintOrderedAt`/`reprintCount`. `HistologyBlock` extended with `tinyTissue`/`fragile`.
- **`types/case/Material.ts`** — `Decant` extended with `totalVolumeMl`/`appearance`/`yieldPelletSize`.

## Notes

- Built with `useTranslation()` from the start — every visible string goes through the `microtomyWorkstation.*` locale namespace, across all 5 languages (see `i18n/README.md`'s running log). `Home.tsx` did not have any i18n before this change; only the new tile's strings (`home.microtomyTile.*`) were converted — the rest of that file is untouched, same precedent as `GrossingScreenPage.tsx`'s nav button inside the not-yet-converted `SynopticReportPage.tsx`.
- Control-slide pairing (`pairedControlSlideId`/`isControlSlide`) is a deliberate, separate, same-block sibling-slide mechanism — genuinely different from the existing `shouldAutoAppendControl.ts` (a batch/QC-level synthetic-control-CASE mechanism). Reconciling the two is a future design question, not resolved here.
- `processMicrotomyScan` (pre-existing, in `useGlobalMaterialScanTracking.ts`) already auto-dispatches the honest stub `dispatchSlideLabel` for every Pending-Cut stain when a block is scanned at a "Microtomy / Sectioning" station, regardless of the station's real `supportsPrinting` flag. This page is deliberately the first real place the actual GS1/ZPL `printSlideLabel` path gets used — the two print paths were NOT reconciled in this pass; that stub keeps running exactly as before.
- Deliberate scope cuts for this pass (ticket is Autopsy-module-scale): no `MatrixBlock`/specimen-level scan resolution, schematic (non-decodable) label preview, no `buildSlideZplTemplate.ts` rewiring to the new layout config, no action-registry/voice wiring, no admin editor UI for `SlideLabelLayoutConfig`.
- **Real fix (foot-pedal follow-up, Sep 2026):** foot-pedal support was originally disclaimed here as out of browser reach — re-verified and found incorrect. `useFootPedal.ts` (Gamepad API + keyboard-emulation capture, already working for `SynopticReportPage.tsx`'s dictation controls) is now wired into this page: Pedal 2 fires the real `handlePrintNext()` — PS-284's own named "Print/Etch Next... physical foot pedal integration" trigger. Configured per-workstation at Config → System → Voice → Foot Pedal.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`MicrotomyWorkstationPage.tsx`: the patient name in the context bar is tagged. The page reads scan stations through `@/services`, so it came off the mock-import baseline.

## Batch 367 (PS-74): no inline CSS

`components/HardwarePrintPanel.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

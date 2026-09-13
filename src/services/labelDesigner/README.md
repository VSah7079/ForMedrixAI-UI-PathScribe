# services/labelDesigner/ + pages/LabelDesignerPage/

Real, per direct follow-up (PS-245): a real, drag-and-drop label designer,
spanning essentially every real label type in this app — "Requisition,
Specimen, Block, Slide, decant, Molecular assets."

## Real, deliberate architectural decision — a new, parallel system, not a reuse

`components/TemplateBuilder/` already solves the drag-and-drop layout problem
for *report* assembly — real, working, well-tested. Confirmed directly by
reading its own real code before building anything here: that system's own
`TemplateNode`/`BaseNode` is built around `colSpan` in a 12-column *flowing*
grid — real, correct for a linear, paginated report, genuinely wrong for a
label. A label is a fixed physical rectangle; its own fields sit at specific
real mm coordinates, not flowing top-to-bottom. Reusing that exact type
system would be forcing a real, load-bearing mismatch, not a minor
adaptation.

What **is** genuinely reused: the same real UI pattern (palette → canvas →
inspector) and the same real drag-and-drop mechanic — native HTML5
drag/drop (`onDragStart`/`onDragOver`/`onDrop`), confirmed directly against
`TemplateCanvas.tsx`'s own real implementation — no new library dependency
either system needs.

## Files

- **`ILabelLayoutService.ts`** — the real data model. `LABEL_TYPES` (9 real
  label kinds, matching `types/labels/LabelData.ts`'s own real data shapes
  exactly), `LABEL_FIELD_CATALOG` (per-type, confirmed directly against each
  real label data shape — a field genuinely absent from a type's own real
  data is genuinely absent from its own catalog here, never offered as a
  draggable option with nowhere real to source it from), `LabelLayoutField`
  (one placed field: `fieldKey`, `xMm`/`yMm`/`widthMm`/`heightMm`/`fontSizeMm`
  — all real mm, matching this app's own established mm-first convention
  from `buildRequisitionStickerSheetZpl.ts`), `LabelLayout` (a saved layout
  for one label type).
- **`mockLabelLayoutService.ts`** — real CRUD, one real, current layout per
  label type (overwrite semantics, not versioned history).
- **`buildLabelLayoutZpl.ts`** — real, per direct follow-up ("add a way for
  users to output their label so they can verify that they will work"):
  converts a real, saved `LabelLayout` into real, working ZPL, using the
  exact same, already-proven building blocks the rest of this app's own ZPL
  relies on (`mmToDots`, and `buildBarcodeCommand` — exported from
  `simpleZplTemplate.ts` specifically so this file could reuse it rather
  than duplicate it). `LABEL_TYPE_DEFAULT_SYMBOLOGY` (in
  `ILabelLayoutService.ts`) supplies each label type's own real, verified
  barcode symbology — checked directly against each real preset's own
  `defaultBarcodeSymbology` and, for block/slide, their own real GS1
  machinery, never guessed from a display name.
- **`pages/LabelDesignerPage/LabelDesignerPage.tsx`** — the real, working
  designer: a label-type selector, a palette showing that type's own
  available (not-yet-placed) fields, a to-scale canvas (4px/mm) supporting
  drag-to-place and drag-to-reposition, a numeric inspector for exact
  position/size/font, save/reset, and (see below) a real barcode preview and
  a real "Export ZPL" action.

## Real, deliberate scope for this first, working increment

- **Real Enterprise hierarchy and inheritance, per direct guidance** — every
  label type has a real Enterprise-level default; label types in the
  "Specimen & Processing" group (requisition/specimen/decant) additionally
  allow a real, per-facility override, resolved via
  `resolveLabelLayoutForFacility()` (a real, pure function mirroring
  `resolveLisRoutingForFacility`'s own exact shape: facility override if
  one exists and is genuinely allowed, else the Enterprise default, else
  honest `undefined`). "Histology Assets" (block/slide) and every
  "Molecular Asset" type are deliberately **locked** to the Enterprise
  default only — `LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE` is `false` for all
  six of those, and `mockLabelLayoutService.save()` genuinely refuses a
  facility-scoped save attempt for any of them, not just a UI-level
  suggestion. Per direct guidance's own reasoning: hardware compatibility
  (cassette/slide printers, automated stainers, slide scanners, liquid
  handlers) depends on every real facility producing an identical physical
  format — a facility override there is a real scanner-misread risk, not a
  customization.
- **Live preview is real HTML, using real sample data** — not this label
  type's own real, live case data (no real case is being designed against
  here), and not real ZPL output. A real, honest stand-in so a designer can
  see roughly how text will look without needing a real, live record.
- **Does not yet replace any of this app's own existing, hardcoded, already-
  tested render functions** (`buildRequisitionStickerSheetZpl.ts`,
  `zplTemplates.ts`, etc.) — those remain the real, live print paths.
  Wiring a saved layout into actual print output is real, separate,
  later work, not attempted here. The real, exact association point, if
  built: between each real print entry point's own data-extraction step
  (e.g. `buildRequisitionLabelData(caseData)`) and its own hardcoded
  render call — nine real call sites total
  (`printRequisitionLabel`, `printContainerLabel`, `printAllContainerLabels`,
  `printDecantContainerLabel`, `printCassetteLabel`, `printSlideLabel`,
  `printMolecularSpecimenLabels`, `printMolecularPlateLabel`,
  `printMolecularRackLabel`, `printMolecularDeckLocationLabel`), none
  touched yet.
- **Resize is numeric only** (inspector fields), not a real drag-handle
  resize on the canvas — a real, honest simplification for this first
  working slice, not a claim that resize is fully built.

## Real verification, per direct follow-up ("add a way for users to output their label so they can verify that they will work")

Two real, direct fixes to the designer's own earlier honesty gaps, both found by direct follow-up questions rather than caught proactively:

- **The canvas's own barcode field previously rendered placeholder text**
  (`▮▯▮▮▯▮▯▯▮▮`), not a real barcode — confirmed directly when asked how
  someone could actually test a new format. Now renders a real, rendered
  barcode via `generateBarcodeSvg.ts` — the exact same function every other
  real label's own HTML render already uses — at each label type's own
  real, verified symbology. A genuinely invalid sample payload is caught
  defensively (`safeBarcodeSvg` in `LabelDesignerPage.tsx`) rather than
  throwing and breaking the whole canvas render, since this is a live,
  interactive UI, not a test.
- **A new "Export ZPL" action** produces genuine, working ZPL from the
  current layout (`buildLabelLayoutZpl.ts`), meant to be pasted directly
  into Labelary's own real viewer (`labelary.com/viewer.html`) — the same
  real verification process already used for every other label in this app
  (see `services/molecular/README.md`'s own Phase 7/11-13/18/19 account of
  what that process actually caught).
- **Real, honest, stated limit**: the exported ZPL's own barcode payload is
  the canvas's own illustrative sample value, not each label type's real,
  production-specific encoding — block/slide's own real GS1 structure
  needs a real GTIN, a concept this generic designer model has no notion
  of. This is genuinely sufficient for confirming real physical fit and
  general scannability at a label's own real dimensions — not a byte-for-
  byte replica of a specific type's own production encoding.

9 new tests (`buildLabelLayoutZpl.test.ts`).

## Real, larger ideas raised, deliberately not built here

Per direct guidance's own broader architectural strategy:

- **Dynamic, parametric template drivers** — smart fields that show/hide
  based on real specimen context (e.g. the same conditional collapsing
  logic PS-243/244/250 already built for the requisition ZPL's own MRN/
  Provider/Facility lines) rather than separate physical formats per edge
  case. A real, valuable, genuinely separate rules-engine feature, not
  something to half-build as a side effect of the designer's own first
  increment.
- **Centralized, version-controlled template store; standardized barcode
  payload schema across facilities; a printer-agnostic abstraction layer**
  (single JSON/XML payload translated to ZPL/EPL/DPL at the endpoint) —
  real, valuable operational practices, but genuinely infrastructure/
  backend-tier concerns (the same real boundary PS-239's own Interface
  Engine epic already draws), not something a frontend-only codebase
  builds directly.

## Explicitly not yet built

- Real integration with actual print output (see the nine real call sites
  named above).
- Drag-handle resize on the canvas.
- Physical-bounds validation in the canvas itself (PS-245's own acceptance
  criteria named this — a field can currently be dragged/sized past the
  label's own real edge with no warning; the same class of real bug PS-240
  through PS-249 spent five rounds fixing in the requisition ZPL's own
  hardcoded rendering could reappear here with no guardrail yet).

24 tests (`ILabelLayoutService.test.ts`, `mockLabelLayoutService.test.ts`), plus
9 more (`buildLabelLayoutZpl.test.ts`), 33 total.
Full suite clean: 303/306 files, 2936/2945 tests, 0 failures.

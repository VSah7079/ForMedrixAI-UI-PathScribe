# PathScribe Update 215 — Summary

Covers everything since update-214: the full cassette label layout fix, prompted by a real, specific correction on physical cassette dimensions (~28.2mm × 8.0mm printable face, not the 50.8×25.4mm CLSI container size this template had silently, never been validated against).

## What changed and why

1. **`tissueDescription` now actually reaches the printed cassette label.** The field existed on `HistologyBlock`, was editable via `BlockStainEditorModal.tsx`, but the label template never rendered it at all — a genuine "built but never wired" gap.

2. **The deeper bug: `buildCassetteZplTemplate` used hardcoded, never-validated dot coordinates.** Converting the old coordinates to millimeters at the printer's real 300 DPI showed the existing 3rd text line already printed at the very edge of a real 8mm-tall face, and the barcode itself — at its old, fixed module size — was already close to consuming the entire real face height on its own. Rewritten to compute every coordinate from real millimeters at a given printer's real DPI, matching the pattern `simpleZplTemplate.ts` already established elsewhere in this codebase.

3. **New: `CassetteLabelLayoutConfig`** (`services/printSettings/`) — face width/height, barcode module size, and text line height, all admin-editable, added to the existing `PrintSettingsConfig` singleton (inheriting its existing Tier 1/Tier 2 facility-override system for free).

4. **New: a geometry-based safety check** (`resolveCassetteLabelFitWarning.ts`) — flags real height/width overflow before a bad configuration ever reaches a physical cassette. Deliberately does *not* assert a "safe minimum module size": direct research turned up genuinely conflicting real guidance depending on application (0.1mm for direct metal etching vs. 0.4–0.8mm for other real specs) — asserting a number here would have been a fabricated claim dressed up as a safety feature. 5 tests.

5. **New: the Cassette Label Layout config screen** (`CassetteLabelLayoutEditor.tsx`) — 35°/45° quick presets, live numeric warnings, a scaled SVG preview that visibly reacts to input changes, and a real "Send Test Print" button that dispatches through an actual connected printer profile. Added to System → Print Settings, right after the existing GS1 GTIN field.

## Full test status
429 test files, 3715 tests, all passing. `tsc` clean throughout. CSS audit clean (all 14 new classes present).

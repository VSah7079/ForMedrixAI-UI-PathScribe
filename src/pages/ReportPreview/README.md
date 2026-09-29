# pages/ReportPreview/

Renders Orchestration mode's `orchSections` as a formatted clinical report preview.

## Files

- **`ReportPreviewRenderer.tsx`** — template-driven: section headings, typography, and layout come from the resolved `ReportTemplate`, not hardcoded here. Deliberately a placeholder for a future real PDF render — when ReportLab (or equivalent) is wired in, this component is meant to be swapped for a real PDF iframe, not extended indefinitely.
- **`__tests__/ReportPreviewRenderer.sectionLabelConfig.test.tsx`** — tests the section-label configuration resolution specifically.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`ReportPreviewRenderer.tsx`: the date of birth is tagged (name and MRN already were). Column layout comes in as `--rp-cols` / `--rp-gap` custom properties; it was two inline style properties.

## Batch 367 (PS-74): no inline CSS

`ReportPreviewRenderer.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

`ReportPreviewRenderer.tsx`: `labelStyle()` is gone. A template's label formatting reaches the page, header, footer, section headings and field labels as `--rp-<part>-*` custom properties (`utils/labelStyleVars.ts`, now with a name prefix so a page's settings don't leak into its headings).

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

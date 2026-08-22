# pages/ReportPreview/

Renders Orchestration mode's `orchSections` as a formatted clinical report preview.

## Files

- **`ReportPreviewRenderer.tsx`** — template-driven: section headings, typography, and layout come from the resolved `ReportTemplate`, not hardcoded here. Deliberately a placeholder for a future real PDF render — when ReportLab (or equivalent) is wired in, this component is meant to be swapped for a real PDF iframe, not extended indefinitely.
- **`__tests__/ReportPreviewRenderer.sectionLabelConfig.test.tsx`** — tests the section-label configuration resolution specifically.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

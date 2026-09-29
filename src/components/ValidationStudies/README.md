# components/ValidationStudies/

## Files

- **`ValidationStudiesSection.tsx`** (917 lines, the largest single-file
  folder) — Parallel-run validation study management, 3 sub-tabs (Studies/
  Dashboard/Reports). Wired to real services throughout (validationStudy,
  narrativeSignal, client, physician, reportTemplate). Not read
  line-by-line at this size; no issues surfaced at the architecture/import
  level. The "AI Model Being Validated" field in `StudyFormModal` links out
  to `ModelStoreModal` (below) — "Don't see the model you need? Browse the
  ForMedrixAI store," shown only when creating a new study.
- **`ModelStoreModal.tsx`** — the ForMedrixAI store (see `services/models/mockModelStoreService.ts` and `STORE_INTEGRATION_NOTES.md`; the licence check and the catalog source are still mock).
  - **What it lists (Batch 320, PS-58):** global catalog models this organisation hasn't adopted yet.
  - **Adopt** (formerly "Download") creates an adoption record for the organisation in session, always Beta and never the default. It selects the model in the study form's dropdown and refreshes the parent's model list.
  - **Errors:** the service returns codes (`STORE_NOT_LICENSED`, `NO_ORGANISATION`, `NOT_IN_CATALOG`, `ALREADY_ADOPTED`), and the modal shows them translated.
  - **Localization:** vendor labels and the published date now follow the user's language.

## Batch 367 (PS-74): no inline CSS

`ValidationStudiesSection.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*

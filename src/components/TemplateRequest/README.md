# components/TemplateRequest/

## Files

- **`TemplateRequestModal.tsx`** — Pathologist-facing "request a new
  synoptic template" form, submits via `messageService` to the admin pool.
  Own header clearly documents both entry points (AddSynopticModal, Home
  page tile). Uses the shared `ps-modal-dark`/`ps-overlay` CSS pattern
  (not the inline-style duplication) — good. No issues.

## Batch 367 (PS-74): no inline CSS

`TemplateRequestModal.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*

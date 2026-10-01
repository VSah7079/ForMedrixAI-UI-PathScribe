# pages/Synoptic/Comments/

Case- and specimen-level comment modals, sharing one dialog-position-memory shell.

## Files

- **`CommentModalShell.tsx`** — shared shell for both Case and Specimen comment modals — one remembered dialog position for "the comment dialog" generally, not split per-context.
- **`CaseCommentModal.tsx`** — case-level comment thread (`types/case/CaseComment.ts`).
- **`ReportCommentModal.tsx`** — specimen/report-level comment, using `PathScribeEditor` for rich text.

## Batch 367 (PS-74): no inline CSS

`CommentModalShell.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368

`CommentModalShell.tsx` remembers the dialog position through `utils/uiPreferences.ts` (key `cmnt-modal-pos`) instead of raw localStorage, and is off the deployment baseline. A position saved under the old key isn't carried over; the dialog opens centred once.

## Batch 381 (PS-359)

`CaseCommentModal`, `ReportCommentModal`:
- Post checks `commentMissing` (Field Requirements, locked). An editor holding only an empty paragraph or spaces counts as empty.
- Voice: "post comment".
- Timestamps use the user's locale.

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

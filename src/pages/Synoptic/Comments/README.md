# pages/Synoptic/Comments/

Case- and specimen-level comment modals, sharing one dialog-position-memory shell.

## Files

- **`CommentModalShell.tsx`** — shared shell for both Case and Specimen comment modals — one remembered dialog position for "the comment dialog" generally, not split per-context.
- **`CaseCommentModal.tsx`** — case-level comment thread (`types/case/CaseComment.ts`).
- **`ReportCommentModal.tsx`** — specimen/report-level comment, using `PathScribeEditor` for rich text.

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

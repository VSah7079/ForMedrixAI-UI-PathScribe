# components/EnhancementRequest/

Product enhancement request / QA feedback submission — trigger button +
modal with PHI-redacted screenshot capture.

## Files

- **`EnhancementRequestButton.tsx`** — Two modes: `enhancement` (product
  team, lightbulb icon) and `qa` (QA team, bug icon, restricted category
  set, dev-only unless `showInProd`). No issues.
- **`EnhancementRequestModal.tsx`** — Receives a pre-captured, PHI-redacted
  screenshot from the button; user can approve/discard before submitting.
  Uses the inline-style modal-overlay pattern — logged as one of the ~14
  instances in the modal-consolidation opportunity, see `Common/README.md`.
  No other issues.

## Notes

- See `Common/README.md`'s modal-consolidation note — this folder's modal
  is one of the cited examples.


## Batch 364 (PS-349, PS-350): support references

`EnhancementRequestModal.tsx`:
- **System details:** they carry the page type and the case's support reference, never the address (`captureMetadata` is now async).
- **Identifier check:** before sending, the title and description are checked for case numbers, MRNs and other identifiers, using every format PathScribe knows. The user can replace case numbers with support references, edit the text, or send anyway.
- **Styling:** the submit button's inline opacity became a class.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

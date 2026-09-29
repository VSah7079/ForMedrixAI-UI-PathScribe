# pages/Synoptic/UI/

Small, generic UI primitives shared across the Synoptic page family — not page-specific enough to live in `SynopticReportPage/components/`.

## Files

- **`SaveToast.tsx`** — small, generic save-confirmation toast (message + visible props).

**Batch 349 (PS-100):** `SaveToast.tsx` shows the message's kind (✓, ℹ, ⚠, ✕; it used to show a green check for failures too), is an alert for warnings and errors, and closes on a click or its × (`saveToast.close`).


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`SaveToast.tsx`: a message marked `containsPhi` is tagged `data-phi` (see `../useSynopticToast.ts`).

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

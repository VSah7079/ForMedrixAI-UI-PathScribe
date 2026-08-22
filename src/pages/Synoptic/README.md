# pages/Synoptic/

Shared types and extracted hooks/modals originally split out of `SynopticReportPage.tsx` to keep that file to layout/wiring. Not to be confused with `SynopticReportPage/` itself — this folder holds smaller, more general-purpose pieces; the big, page-specific hooks/modals/components live in `SynopticReportPage/`.

## Files

- **`synopticTypes.ts`** — shared types for `SynopticReportPage` and its sub-components. Extracted from `SynopticReportPage.tsx` — the canonical source; do not re-define these types elsewhere.
- **`useSynopticFinalize.ts`** — small hook managing the remembered post-signout preference (`ps_post_signout_pref`).
- **`useSynopticFlags.ts`** — case/specimen flag state management for the synoptic page.
- **`useSynopticModals.ts`** — centralizes the many boolean modal-open states (Internal Notes, Similar Cases, and others) so they don't live as scattered `useState` calls directly in the page component.
- **`useSynopticToast.ts`** — small, local toast-message state hook.

## Subfolders

- **`Codes/`** — ICD/terminology code application UI.
- **`Comments/`** — case and specimen comment modals, sharing one dialog-position-memory shell.
- **`Delegate/`** — case delegation (drag staff onto delegation-type lanes).
- **`UI/`** — small, generic UI primitives (currently just the save toast).

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

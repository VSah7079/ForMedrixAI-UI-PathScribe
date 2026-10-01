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

**`useSynopticFinalize.ts` (Batch 344):**
- **Credential state removed:** the sign-out username/password/error and finalize password/error state is gone. It was never checked; the modals now confirm the signer through `useSignerConfirmation`.
- **Preference storage:** the post-sign-out preference reads through `utils/uiPreferences.ts`, so the file is off the browser-storage baseline.

**Batch 349 (PS-100):** `useSynopticToast.ts` gives each message a kind (`showToast(message, kind?)`) and follows `utils/toastPolicy.ts`: warnings, errors and long messages stay until dismissed (`dismissToast`), short confirmations fade after 4 to 9 seconds. Tested in `__tests__/synopticToast.test.tsx` (new, 5 tests, with `UI/SaveToast.tsx`).

## Batch 353

`Delegate/DelegateModal.tsx` delegates through `delegationService` and is off the mock-import baseline. See [Delegate/README.md](Delegate/README.md).


## Batch 363 (PS-72): patient data tagged for screenshot redaction

- `useSynopticToast.ts`: `showToast(message, kind, { containsPhi: true })` marks a message that names the case (a cassette or slide id, an accession).
- `UI/SaveToast.tsx`: such a message is tagged `data-phi`, so the screenshot redacts it; other messages are not.
- `__tests__/synopticToast.test.tsx` covers both.

## Batch 367 (PS-74): no inline CSS

Subfolders converted their last inline styles to `pathscribe.css` classes (see each folder's README). Standing rule 1 now holds app-wide, checked by `services/styleRules/inlineCss.guard.test.ts`.

## Batch 381

- **`Comments/`, `Delegate/`:** Field Requirements checks and voice commands (PS-359). Delegating needs `case:delegation:create`.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

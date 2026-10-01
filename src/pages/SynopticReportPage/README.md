# pages/SynopticReportPage/

The core clinical workflow page — a case's full report/material/sign-out experience, reached at `/case/:caseId/synoptic`.

## Files

- **`SynopticReportPage.tsx`** — layout and modal wiring only. Deliberately kept to that: business logic lives in `hooks/`, presentational pieces in `components/`, and every dialog in `modals/` — this file's own job is assembling those, not implementing them.

## Subfolders

- **`hooks/`** — ten domain hooks (LIS integration, specimen/block management, report generation, amendment workflow, grossing completion, orchestrator draft lifecycle, sign-out/finalize, microscopic entry, cassette scan verification, release-buffer countdown). See its own `README.md` for the full architecture and `hooks/__tests__/README.md` for the testing approach.
- **`components/`** — presentational pieces specific to this page (header, sidebar, material tree, banners, panels).
- **`modals/`** — every modal reachable from this page (23 files — sign-out, holds, specimen/block editors, amendment, team, printing, and more).

## Signing authority on this page (Sep 2026, PS-327 / PS-341)

Who may sign out, and whose sign-out is routed to a countersign
instead, is decided per case from its **performing lab and that lab's
jurisdiction**:

- **`hooks/useSignOutWorkflow.ts`** resolves the lab and jurisdiction
  once per attempt (via `services/facilities/resolveCasePerformingLabScope.ts`)
  and feeds both the countersign gate and the `canFinalizeCase()` write
  guard. This covers Orchestration sign-out and Assist-mode finalize.
  An admin-configured role marked "Requires Countersign" (e.g. the UK
  Biomedical Scientist) now really routes to countersign.
- **`modals/CaseTeamModal.tsx`** offers only the roles valid in that
  jurisdiction, with local titles (e.g. "Specialist Pathologist (FRCPA)"
  on an Australian case) and the same effective Countersign/Finalise
  badges the gate enforces.

The rules themselves live in `services/participationTypes/` (overview:
`services/README.md` → "Signing authority"). Neither file makes the
decision itself; `CaseTeamModal.tsx` is guarded by
`services/participationTypes/standingRules.guard.test.ts`.

## Batch 318 (PS-137)

Abnormal-detection agreement signals captured at sign-out now carry the covering Validation Study. The capture logic moved to `services/abnormalDetection/`; see `hooks/README.md`.

## Batch 327 (HTTPS)

- **Report renderer URL:** `REPORT_PDF` is resolved through `utils/serviceEndpoint.ts`. A production build needs `VITE_REPORT_PDF_ENDPOINT` set to an `https://` URL. If it isn't set, or isn't https, PDF printing falls back to printing from screen with the reason in the toast, and the PDF/text snapshots report it as their generation error. The `http://localhost:8080/` emulator default applies to development builds only.
- **Inline style removed:** the Dev Tools menu's position is now passed as the CSS variables `--devmenu-top` / `--devmenu-left`, read by `.ps-syn-devmenu--portaled`. Checked in the browser: the menu opens 4 px below its button.

## Batch 331 (PS-327)

- **Autopsy signing:** the Sign PAD / Sign FAD banners and toasts are translated (`autopsySignOut.*`), and the PAD date uses the user's locale. `signAutopsyReport` now checks signing authority and, for forensic cases, the signer's jurisdictional appointment; its error codes map to translated text here. See `services/autopsy/README.md`.
- **Not converted:** the adjacent "Ready for Body Release" banner is still English.

## Batch 332

The Autopsy "Ready for Body Release" banner is now translated (`autopsyBodyRelease.bannerTitle` / `bannerSummary`; the button reuses `autopsyBodyRelease.title`). This closes the English-only item noted in Batch 331.

## Batch 338 (PS-342): spell checking

- **`SynopticReportPage.tsx`** calls `useCaseSpellCheck` and wraps the page in `<SpellCheckProvider>`, so the report editor, the synoptic text fields and every report modal are checked in the case's spelling language. Changing the language for the case saves `Case.spellingLocaleOverride` with the page's usual version check (`saveSpellingLocaleOverride`).
- **`components/OrchestratorSectionEditor.tsx`:** the Accept-time AI spelling check is retired (Pete, Sep 26); Accept commits directly. The "British/American English" badge is replaced by the spelling language control. Two faults went with it: its prompt treated every language other than UK English as American English (so an Australian report was checked against US spelling), and the badge said "British English" for every non-US country.
- See `components/README.md` and `modals/README.md` for the text boxes that now use `SpellCheckedTextarea`.

## Signer confirmation (Batch 344, PS-60 follow-up)

- **Autopsy PAD/FAD:** the Sign PAD and Sign FAD buttons now open a `SignatureConfirmModal` (`components/Signing/`) first; `handleSignAutopsyReport` runs only after the signer is confirmed.
- **Sign-out and finalize modals:** they confirm the signer themselves; see `modals/README.md`.
- **Leftover state removed:** the unchecked credential state is gone from `../Synoptic/useSynopticFinalize.ts`.
- **Still on the baselines:** the page stays on the deployment baselines (mock imports, browser storage) for code this batch didn't touch.

**Batch 345:**
- **Autopsy PAD/FAD:** `handleSignAutopsyReport(tier, confirmation)` checks the signature through `signatureGate` before signing. It records it after the snapshot is saved (link: autopsy snapshot + tier), and drops it if signing is refused further on.


**Batch 348 (PS-67):** `hooks/useSignOutWorkflow.ts` reads the AI service results in the app's one `{ ok, data }` shape. No visible change.

**Batch 349 (PS-100):** warnings and failures on this page (75 calls here and in `hooks/`) pass `'warning'` to `showToast`, so they stay until the pathologist closes them. Nine English-only warnings were moved to `synopticReportPage.toast.*` in all five languages.

**Batch 350:** whether the case was opened from Search, and the return to Search, go through `utils/search/searchSession.ts` (was direct session storage). The header's status pill is translated (`components/HeaderBar.tsx`).

## Batch 353

`components/InformalReviewBanner.tsx` now uses `delegationService`. See [components/README.md](components/README.md).

## Batch 355

`components/InformalReviewBanner.tsx` was deleted (PS-346). This page stopped rendering it when informal reviews stopped being a delegation type.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`SynopticReportPage.tsx`: the report toast passes `containsPhi` through to `SaveToast`; the intraoperative-merge toast is translated (`synopticReportPage.toast.intraopMerged`) and marked; the case-not-found message tags the id.


## Batch 364 (PS-349, PS-350): support references

`components/HeaderBar.tsx` shows the case's support reference, in both compact and full header modes.

## Batch 367 (PS-74): no inline CSS

Subfolders converted their last inline styles to `pathscribe.css` classes (see each folder's README). Standing rule 1 now holds app-wide, checked by `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368 (PS-353): Change history

- **Header:** a "📝 N recorded saves" chip opens the new `modals/ChangeHistoryModal.tsx`.
- **The page** loads the case's change log and refreshes when an entry is recorded (`REPORT_CHANGE_LOGGED_EVENT`).
- **Export:** goes through `services/reportChangeLog/exportChangeLog.ts`, which checks the capability `report:change-history:export` (Batch 369, PS-355) and audits both the check and the export.

## Batch 369 (PS-355)

The Change history modal's Export button is a `CapabilityButton` for `report:change-history:export`. The page passes `authorizationService` to `exportChangeLog`, which checks and audits before building the CSV.

## Batch 370 (PS-356)

The change-history export passes the case's `order.facilityId` for facility scope, both to the modal's button and to `exportChangeLog`.

## Batch 380 (PS-359)

Field Requirements now cover the page's first three modals: Add/Edit specimen, amendments and addenda, and critical findings. Each has a voice command for its save button. Also fixed:
- minor amendments and addenda couldn't be saved from a new draft;
- a specimen's laterality was never saved.

See `modals/README.md` and `hooks/README.md`. `SynopticReportPage.tsx` itself wasn't changed.

## Batch 381 (PS-359)

- **Group 2 modals:** Field Requirements now cover the holds, comments, Delegate, biopsy arrays, and block cancellation and restains. See `modals/README.md` and `pages/Synoptic/`.
- **`SynopticReportPage.tsx`:**
  - After a hold is placed or released, or a case delegated, the page takes the case's new version. Before, its next save (a comment, a draft) was refused as someone else's change.
  - "Case delegated" is translated.
  - It came off both deployment baselines: services through `@/services`, display preferences through `utils/uiPreferences`.

## Batch 382 (PS-359)

- **Group 3, part 1:** Field Requirements now cover the frozen-versus-final reconciliation modal and the two billing modals (post-sign-out reason, applied-code correction). See `modals/README.md`.
- **`SynopticReportPage.tsx`:** correcting an applied billing code asks `billing:applied-code:correct` before it changes anything, and says so if refused (a translated toast).

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

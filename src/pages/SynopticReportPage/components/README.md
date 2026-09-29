# pages/SynopticReportPage/components/

Presentational and semi-presentational pieces specific to the case report page — real business logic lives in `../hooks/`, not here. 17 files.

## Layout & navigation

- **`HeaderBar.tsx`** — the rich case header: accession, patient info, progress steps.
- **`Sidebar.tsx`** — specimen list, case-level actions (Case Comment, Retention Hold, Case Hold), delegate/team/flags entry points.
- **`LeftReportPanel.tsx`** — left-hand report panel, wires in `InternalNotesDrawer`.
- **`RightSynopticPanel.tsx`** — the main synoptic-answering panel; required-field validation, AI suggestions, template resolution.
- **`OrchestratorSectionEditor.tsx`** — Orchestration mode's own right-hand narrative editor, deliberately mirroring `RightSynopticPanel`'s structure so a pathologist moving between modes doesn't need to relearn the UI. **Real addition ("Personal Quick Text" — Enterprise then Facility then Staff), per direct guidance:** a real "QT" button per unlocked section, using the existing `editorRefs`/`getEditor()` handle (no changes needed to `PathScribeEditor.tsx`/`PathScribeEditorRef.ts` — `getEditor()` already exposed the raw TipTap instance) to read the current selection via the standard `editor.state.selection`/`textBetween()` API. Identity (`getSessionUser()`) and facility (this case's own real performing lab, resolved via the same facility fetch already made for jurisdiction, plus `resolvePerformingLabFacilityId()`) are auto-attributed — the confirmation modal only ever asks for the voice trigger. Saves a real `VoiceMacro` (`types/voiceMacros.ts`) with `ownerUserId` set — the Personal tier of the same three-tier model `services/macros/IMacroService.ts`'s `isMacroVisibleTo()` already established for "My Macros." Real, deliberate accuracy fix caught while wiring this: the resolved performing lab can genuinely be a different facility than the case's own ordering client (`Facility.performingLabFacilityId`'s real override) — the confirmation modal fetches and shows that actual resolved facility's own name, not the ordering client's, so the auto-attribution shown is never wrong.
- **`BottomActionBar.tsx`** — Previous/Next, Save, Finalize, and the rest of the persistent bottom action row. **Real, per direct follow-up (retiring Finalize for Orchestration Mode — see `services/reportRelease/README.md`'s own full account of why): "🔒 Finalize"/"🔒 Finalize & Next" now only render for `reportingMode === 'assist'`.** Save Draft/Save & Next/Gen. Report are untouched — only the Finalize buttons themselves moved inside a mode check, matching this same file's own pre-existing `reportingMode !== 'assist'` pattern already used for "✍️ Sign Out Case." Presentational only, as this folder's own purpose requires — the real decision of what Finalize being retired actually means (compliance gates, buffer start, dispatch) lives entirely in `../hooks/useSignOutWorkflow.ts`, not here. **New (Sep 2026), PS-290:** a "🌐 Consult" action, alongside "🔍 Req. Review," opens `components/ExternalConsult/ExternalConsultAccessModal.tsx` — same `caseData`/`user` props already threaded through for the review modal, no new plumbing. NOT real token security — see that modal's own README.
- **`SequencerPanel.tsx`** — case sequencing/navigation panel.

## Material & specimens

- **`MaterialTreePanel.tsx`** — the Specimens/Blocks/Slides/Decants tree, including the Grossing Release panel and cassette color display.
- **`GrossingReleasePanel.tsx`** — real scan-triggered grossing release UI (grossing-scan → hydrate → release workflow).
- **`MicroscopicEntryPanel.tsx`** — simple microscopic-description entry step, filling a real gap in the Orchestration flow ("after gross complete, what's the next logical step?").
- **`BiopsyArrayDiagram.tsx`** — real, visual diagram for assigning each biopsy core to a specific section of a shared block, so a pathologist can always identify which section of the block a given core was embedded in. Real, per direct billing-expert guidance (PS-93): `columnsFor()` is now exported and `positionToCoreCoordinate()` (new) derives a real "A1"/"B2" core coordinate against that same layout, so `MatrixBlockEditorModal.tsx`'s Array Mapper tab always shows the same coordinate for the same cell this diagram renders — never a second, independently-computed layout that could disagree.
- **`BillingReviewPanel.tsx`** — AI Billing Code Review tab: left tree (specimens/blocks with pending/applied-count badges), right detail panel (pending suggestions, applied codes, manual add), matching the Code Manager's own left-tree/right-detail interaction pattern. Real, per direct billing-expert guidance (PS-93): a separate `MatrixArrayCoverageSection` below the tree, the real Evaluated Cores Checklist for Biopsy Array coverage — see `services/billing/README.md`'s own PS-93 entry for the full account.
- **`AddSynopticModal.tsx`** — two-panel Flag-Manager-style modal for adding synoptic reports to a case.

## Amendment, release & status banners

- **`AmendmentDraftBanner.tsx`** — persistent Amendment Summary Box plus a live Changed Items Summary while an amendment/addendum is being drafted.
- **`AmendmentStatusBanner.tsx`** — one N-column version matrix per synoptic instance with released amendments (a case can have multiple, independently-amended reports).
- **`ReleaseBufferBanner.tsx`** — shown while a case is `pending-release`: live countdown to automatic release, with a real recall option for the signing pathologist (Post-Sign-Out Release Buffer).
- **`RevisionFeedbackBanner.tsx`** — new, real, per direct follow-up ("Continue" — a real gap found while double-checking the just-built "Return to Trainee" feature, not asked for directly): shown while a case is `returned`, surfacing the attending's real rejection feedback to the resident. Closes a real, pre-existing gap that predates this session's own work — `countersignService.getForCase()` had never been called anywhere in the app, meaning `attendingFeedback` (real since the countersign workflow was first built) was never shown to a resident in context, for either the original `countersign()` (accept) path or this session's new `reject()` path; the only place it was ever displayed was `CountersignTurnaroundTab.tsx`, a QA/management dashboard a resident wouldn't naturally open while actively fixing their own case. `getForCase()` itself (`services/cases/README.md`) was extended to also match `'returned'`, not just `'pending'`, to make this possible.
- **`PendingReleaseWatermark.tsx`** — non-removable diagonal watermark on any PDF/browser/internal view of a case still in the release buffer window.

## Other

- **`MarkersPanel.tsx`** — resolved biomarker values grouped by marker (e.g. all ER-related fields — Status, % Positivity, Intensity — under one card).
- **`EMRSidecarDrawer.tsx`** — slide-in EMR sidecar drawer (replaces an earlier floating/draggable modal version, now matching the app's standard drawer convention).

## Batch 338 (PS-342): spell checking

- **`OrchestratorSectionEditor.tsx`:**
  - the AI spelling check (`SpellCheckPopover`, the review state, `handleAcceptWithSpellCheck`) is removed, and Accept commits directly;
  - the header shows `SpellingLanguageControl` instead of the jurisdiction badge;
  - specimen section titles take the template's label formatting as `--label-*` custom properties (`utils/labelStyleVars.ts`) instead of an inline style;
  - macros and voice macros now come from `@/services` (`macroService`, `voiceMacroService`), so the file is off the mock-import baseline.
- **`MicroscopicEntryPanel.tsx`:** shows the spelling language control above its editor.
- **`RightSynopticPanel.tsx`:** free-text synoptic fields use `SpellCheckedTextarea`; the progress bar's width is passed as `--syn-progress-pct`.

**Batch 349 (PS-100):** `ReleaseBufferBanner.tsx`'s `showToast` prop takes the optional toast kind.

**Batch 350:** `HeaderBar.tsx`'s status pill label is translated (`getCaseStatusLabel(status, revision, t)`, `caseStatusDisplay.*`); it was the English status code in Title Case.

## Batch 353

`InformalReviewBanner.tsx` reads and completes the informal review through `delegationService`. It used to call the demo case service, and it is now off the mock-import baseline. *Deleted in Batch 355; see below.*

## Batch 355 (PS-346)

- **Deleted:** `InformalReviewBanner.tsx`, along with its `.ps-informal-review-banner` CSS and its `informalReviewBanner.*` keys in all five languages. No page rendered it.
- **Comments updated:** `ReleaseBufferBanner.tsx` and `RevisionFeedbackBanner.tsx` no longer point to it.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

- `LeftReportPanel.tsx`: the case/MRN/patient/date-of-birth row tags each value with its kind (it was untagged). The pending-release watermark comes in as `--ps-watermark-image` with a CSS class; it was three inline style properties. The panel reads report release through `@/services`, so it came off the mock-import baseline.
- `MaterialTreePanel.tsx`: specimen, block and decant ids (they contain the accession) are tagged.


## Batch 364 (PS-349, PS-350): support references

`HeaderBar.tsx`: a "Support reference" chip (compact header) and field (full header). Clicking creates or reveals the case's reference and copies it.

## Batch 367 (PS-74): no inline CSS

`BottomActionBar.tsx`, `DispatchHistoryTimeline.tsx`, `SequencerPanel.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

`BottomActionBar.tsx`: the action buttons' look and hover live in `.ps-bab-action-btn`; only the colour is per button.

## Batch 368

- **`HeaderBar.tsx`:** optional `changeCount` / `onOpenChangeHistory` add the Change history chip beside the version chip.
- **`BottomActionBar.tsx`:** reads the release settings through `reportReleaseService` from `@/services`, and is off the deployment baseline.

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

# pages/SynopticReportPage/modals/

Every modal reachable from the case report page — 23 files, roughly grouped below by what they're for. All import `../../../pathscribe.css` directly rather than relying on a shared shell, per this codebase's established modal convention.

## Case-level workflow

- **`CaseSignOutModal.tsx`** — the real sign-out modal (stain types, real-time coding summary via `computeCaseCodingSummary`). **Real, per direct guidance ("Yes we should scope 'Return to Trainee'/'Reject with Notes'"): a new `onReject` prop, rendered as "↩️ Return to Trainee"** alongside the existing "✍️ Sign Out Case" button, only when `isCountersign` is true — disabled until real feedback text is entered, since a rejection with no explanation gives the resident nothing to act on. Wired to `useSignOutWorkflow.ts`'s new `handleReturnToTrainee()` — see `hooks/README.md`'s own entry, and `services/cases/README.md`'s fuller account, for the real logic this button triggers.
- **`PreFinalisationModal.tsx`** — the pre-finalize review screen: drag-to-reorder specimens/synoptics, per-field completeness warnings, biometric/password signing panel. (The old drag-to-*exclude* mechanism — which fed the now-removed "Deferred" synoptic status — was removed; every synoptic report's required fields must be complete before finalize, no bypass.)
- **`FinalizeSynopticModal.tsx`** — lighter-weight finalize confirmation for a single synoptic.
- **`AiReviewModal.tsx`** — AI triage/spell-checker flow (Space/→ confirm, O override, S skip, Esc cancel).
- **`UnsavedWarningModal.tsx`** — shown navigating away from a case with unsaved changes.
- **`FixativeTimeGateModal.tsx`** — blocks sign-out when a specimen requiring fixation-time tracking (CAP/ASCO biomarker guidance, cold-ischemia timing) is missing it.
- **`ProtocolChangeModal.tsx`** — shown when AI re-evaluates synoptic protocol assignment after microscopic description is submitted; diff view with per-change checkboxes.

## Holds

- **`RetentionHoldModal.tsx`** — place/release a case-level hold gating **disposal** after finalization (litigation, patient request, research).
- **`CaseHoldModal.tsx`** — place/release a case-level hold gating **finalize** on an active case ("something truly wrong" — quality issue, awaiting outside materials, clinical discrepancy, pending consultation). Deliberately separate from `RetentionHoldModal` — see `types/case/CaseHold.ts`'s own header for the full distinction.

## Specimens, blocks & material

- **`SpecimenEditModal.tsx`** — add/edit a specimen.
- **`AddOrdersModal.tsx`** — replaces the old, single-purpose "+ Add Specimen" button with a richer flow.
- **`BlockStainEditorModal.tsx`** — the "Blocks & Stains" modal: block/decant status, stain ordering, foreign ID fields, cassette color control, secondary-label printing.
- **`MatrixBlockEditorModal.tsx`** — tab-gated editor for shared/matrix blocks (`types/case/MatrixBlock.ts`): "Details" (status, piece tracking) and, per direct billing-expert guidance (PS-93), "Biopsy Array / Matrix Mapping" — the real Array Mapper for targeting a new ancillary stain order at specific cores.
- **`CreateBiopsyArrayModal.tsx`** — real feature for assigning multiple specimens into one shared cassette (biopsy array).
- **`ForeignIdFields.tsx`** — small, local-state component for foreign-ID inputs; fixes a real rapid-keystroke data-corruption bug in the old inline foreign-ID JSX.
- **`CassetteColorControl.tsx`** — the cassette color picker/display used inside `BlockStainEditorModal`.
- **`MaterialTrackingHistoryModal.tsx`** — real, nested Specimen → Block → Slide scan-log/location history viewer.

## Amendment, versioning & review

- **`AmendmentModal.tsx`** — real amendment/addendum/correction modal (replaced an earlier, fully decorative version whose submit handler never persisted anything).
- **`VersionHistoryModal.tsx`** — real report version history (`ReportVersionRecord`), including the patient/encounter snapshot at each version.
- **`DeficiencyHistoryModal.tsx`** — read-only view of a case's specimen deficiency history.
- **`DiscordanceReconciliationModal.tsx`** — Frozen-to-Permanent reconciliation entry. **Real, current status (PS-113, Stage 5):** writes exclusively to `qaActivityRecordService`/`QaActivityRecord.ts` (`services/quality/`) now — the old `reconciliationService`/`ReconciliationRecord.ts` this modal originally wrote to, and briefly dual-wrote to during the Stage 3/4 migration, is retired and deleted (first release, no real production history to preserve). Real, disclosed gap: this modal has no test of its own — no established pattern for testing a modal exists anywhere in this codebase yet, so one wasn't invented unprompted as a side effect of this migration. Its correctness is verified indirectly, through the already-tested service it calls.

## Team, printing & CoPilot

- **`CaseTeamModal.tsx`** — drag-and-drop staff assignment onto participation-type lanes. **Jurisdiction-aware (Sep 2026, per Pete's own per-country role data):** on open, resolves the case's performing lab and its `jurisdiction` via the shared `services/facilities/resolveCasePerformingLabScope.ts`, then (1) only offers lanes for types valid in that jurisdiction (`isParticipationTypeOfferedIn()` — a UK-scoped Advanced Practitioner BMS never appears on a Canadian case), (2) shows each type's real local title (`resolveParticipationTypeLabel()` — "Specialist Pathologist (FRCPA)" on an Australian case), and (3) shows the **effective** Countersign/Finalise badges via `resolveParticipationTypeAuthority()` — the same lab → country → platform-default resolution the sign-out gate enforces. Real fix in (3): the badges previously showed the raw platform-default flags, which could promise a different rule than the gate actually applied. A type an existing active participant already holds always stays visible even when out of scope, so a real assignment is never silently hidden — only never newly offered. All of that selection/resolution lives in `resolveCaseTeamParticipationTypes()` (`services/participationTypes/IParticipationTypeService.ts`) — the modal only calls it (no business logic in components; guarded by `standingRules.guard.test.ts`). See `services/participationTypes/README.md`.
- **`ManageReprintsModal.tsx`** — cascading, checkbox-driven 4-column reprint manager.
- **`CopilotReportViewModal.tsx`** — CoPilot mode's own "print" — the completed synoptic data sent back to the LIS, since CoPilot has no separate narrative document.

## Batch 338 (PS-342): spell checking

The free-text boxes in `AmendmentModal`, `CaseSignOutModal` (countersign feedback), `CaseHoldModal`, `RetentionHoldModal`, `DiscordanceReconciliationModal` and `AiNarrativeReviewModal` use `SpellCheckedTextarea`, so they're checked in the case's spelling language. `AiReviewModal`'s "Skip" hint now uses `common.skip`, since the key it borrowed belonged to the retired AI spelling check.

## Signer confirmation (Batch 344, PS-60 follow-up)

`CaseSignOutModal`, `FinalizeSynopticModal` and `PreFinalisationModal`'s signing panel asked for a username and password and never checked them (the pre-finalisation panel accepted any three characters). Each now uses `useSignerConfirmation` + `SignerConfirmationFields` (`components/Signing/`), and calls its sign callback only with a confirmation in hand:
- **Demo password session:** the password, plus the username on the first signature of a sign-in session.
- **SSO session:** the identity provider's sign-in popup.
- **Biometric button:** demo builds only, because the WebAuthn check is still simulated.
- **Pre-finalisation panel:** names the signed-in user instead of the case's assigned pathologist, and no longer signs automatically when the biometric "cadence" says a recent verification is still good. A signature always takes a click.
- **Props removed:** `CaseSignOutModal` lost `signOutUser` / `signOutPassword` / `signOutError` and their change handlers; `FinalizeSynopticModal` lost `finalizePassword` / `finalizeError`; `PreFinalisationModal` lost `userId` / `userDisplayName` / `userCredentials`.
- **Confirmation passed on:** `onConfirm` receives the `SignatureConfirmation`.
- **Checked by:** `services/auth/signingScreens.guard.test.ts`.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`MaterialTrackingHistoryModal.tsx` (the header accession) and `PreFinalisationModal.tsx` (the accession and patient name line) are tagged.

## Batch 367 (PS-74): no inline CSS

`AiReviewModal.tsx`, `CaseTeamModal.tsx`, `CassetteColorControl.tsx`, `MatrixBlockEditorModal.tsx`, `ProtocolChangeModal.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368 (PS-353)

- **`ChangeHistoryModal.tsx`** (new) shows the report's change history:
  - entries newest first;
  - an area filter;
  - old → new, or a word-level diff for long text;
  - every value tagged `data-phi`;
  - Export CSV for anyone holding `report:change-history:export` (Batch 369, PS-355). The button is greyed out, with the reason in its tooltip, for anyone else.
- **`VersionHistoryModal.tsx`:** the patient/encounter snapshot values (name, MRN, date of birth) are now tagged `data-phi`. They weren't. The PHI check missed them because the values come through a generic label/value list; noted in `services/phi/`.
- **`CaseTeamModal.tsx`** takes `participationTypeService` from `@/services`.

## Batch 369 (PS-355)

`ChangeHistoryModal` no longer takes a `role` prop. Its Export button is a `CapabilityButton` (`report:change-history:export`), shown greyed out with the reason for anyone without it.

## Batch 370 (PS-356)

`ChangeHistoryModal` takes `exportContext` (the case and its facility) so the Export button reflects the user's facility assignment.

## Batch 380 (PS-359): Field Requirements, group 1

- **`SpecimenEditModal`:**
  - Save checks the organisation's "Add or edit specimen" requirements and marks required labels.
  - Voice: "save specimen".
  - **Fixed:** the laterality chosen here was never saved. It now goes to `collection.laterality`, and the modal shows it when reopened.
- **`AmendmentModal`:**
  - Save/Release checks the "Amendments and addenda" requirements.
  - When an organisation requires clinician notification for minor amendments or addenda, the notification section shows for them too, with its own note and a matching description.
  - Voice: "save amendment", "save correction", "release addendum".
  - Converted on touch: dates use the user's locale (they were fixed to `en-US`); the banner, the version line, the reason placeholder and the unknown-user fallback are translated instead of joined with English punctuation.
  - The reason dictionary comes through `@/services`, so the modal came off the mock-import baseline.
- **`CriticalFindingsModal`:**
  - Record checks the "Critical findings" requirements; read-back can be made required.
  - Voice: "record notification".
  - The quoted finding uses each language's quotation marks.
  - New `CriticalFindingsModal.test.tsx` (3).

## Batch 381 (PS-359): Field Requirements, group 2

- **`CaseHoldModal`, `RetentionHoldModal`:**
  - Place/Release go through `services/cases/caseHolds.ts` (note, capability, fresh hold list, audit).
  - The buttons are `CapabilityButton`s, and a refusal is shown.
  - Voice: "place hold", "release hold".
  - Dates use the user's locale.
- **`CreateBiopsyArrayModal`:** Save checks `biopsyArrayMissing`. Voice: "save biopsy array".
- **`BlockStainEditorModal`:**
  - The cancel-block and restain forms check `blockCancelMissing` / `restainMissing`.
  - Converted on touch: their dates (fixed to `en-US`) and the comment author/date lines use the user's locale, and the author line is a translated template.
  - Molecular targets and cassette colours come through `@/services`, so it came off the mock-import baseline.

## Batch 382 (PS-359): Field Requirements, group 3 (part 1)

- **`DiscordanceReconciliationModal`:**
  - What each step needs comes from `discordanceMissing`; the modal shows "Still required: …" and marks required labels. The button follows the stage: concordant, discordant, or (no category yet) a disabled Record.
  - The record is built by `services/quality/discordanceRecord.ts`, not in the component. Voice: "record discordance".
  - Off the mock-import baseline.
- **`components/Billing/PostSignoutBillingChangeModal`:** Confirm checks `billingChangeMissing`. Voice: "confirm billing change". Off the mock-import baseline.
- **`components/Billing/CorrectAppliedCodeModal`:** Correct checks `correctedCodeCheck` (a code that differs from the original) and needs `billing:applied-code:correct` (`CapabilityButton`). Voice: "correct billing code". Off the mock-import baseline.
- New tests: `DiscordanceReconciliationModal.test.tsx` (3), `PostSignoutBillingChangeModal.test.tsx` (2), `CorrectAppliedCodeModal.test.tsx` (3).

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

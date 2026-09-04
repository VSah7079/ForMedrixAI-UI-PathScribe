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

- **`CaseTeamModal.tsx`** — drag-and-drop staff assignment onto participation-type lanes.
- **`ManageReprintsModal.tsx`** — cascading, checkbox-driven 4-column reprint manager.
- **`CopilotReportViewModal.tsx`** — CoPilot mode's own "print" — the completed synoptic data sent back to the LIS, since CoPilot has no separate narrative document.

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

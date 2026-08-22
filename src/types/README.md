# src/types/

Pure TypeScript type/interface definitions — no runtime logic. 12
subfolders (each with its own `README.md`, linked below) plus 13
root-level files. 38 files total.

## Folder index

| Folder | What it is |
|---|---|
| [access/](./access/README.md) | Real, tracked access-request tickets (Pediatric, Pool, Orchestration) |
| [case/](./case/README.md) | **Central folder** — the core case domain model (`Case`, `Specimen`, `RetentionHold`, `CaseHold`, `MatrixBlock`, and more) |
| [config/](./config/README.md) | Org-hierarchy config shapes (CaseMask, Enterprise, Hospital tier) |
| [events/](./events/README.md) | PathScribe-owned internal event contracts for the LIS/middleware integration seam |
| [footPedal/](./footPedal/README.md) | Hands-free grossing-bench peripheral control config |
| [intraop/](./intraop/README.md) | Intraop Pre-Check "Unlinked Intraoperative Entries" queue data model |
| [labels/](./labels/README.md) | Real label identifiers + physical label-size presets used by every label-printing feature |
| [patients/](./patients/README.md) | Break-Glass rebind reason-code taxonomy (MPI Interface Exception module) |
| [printing/](./printing/README.md) | Real network-print job dispatch + callback event contract |
| [quality/](./quality/README.md) | Frozen-to-Permanent reconciliation record (full reviewed population, not just mismatches) |
| [reports/](./reports/README.md) | Real report lifecycle beyond the synoptic itself — amendment/addendum, version history, informal review, LIS-side correction tracking |
| [specimen/](./specimen/README.md) | Input shape for adding a specimen mid-workflow |

## Root-level files (not in a subfolder)

- **`index.ts`** — barrel re-exports.
- **`serviceResult.ts`** — an older `ServiceResult<T>` shape (`{success, data, error}`), still genuinely used by the `aiIntegration/` subsystem — see "Real findings" below before assuming this is dead.
- **`systemConfig.ts`**, **`template.ts`**, **`templateTypes.ts`**, **`reportPart.ts`**, **`smarttag.types.ts`**, **`voiceMacros.ts`**, **`flagsRuntime.ts`**, **`FlagDefinition.ts`**, **`AuditEvent.ts`**, **`SynopticAuditEvents.ts`**, **`ContributionDashboard.ts`** — standalone domain types not yet folded into a dedicated subfolder.

## Real findings

**A genuinely instructive near-miss, worth recording honestly:**
`serviceResult.ts` defines an older `ServiceResult<T>` shape
(`{success, data, error}`). An initial grep for direct import paths
found zero consumers, so it was deleted as apparently-dead — matching
several other confirmed-dead duplicate types found elsewhere in this
review. `tsc` immediately caught what the grep missed: 3 files
(`services/aiIntegration/IAIIntegrationService.ts`,
`MockAIIntegrationService.ts`, `PathScribeAIService.ts`) import it
indirectly through `types/index.ts`'s barrel re-export, a path the
initial search didn't check. Traced further before just restoring it
blindly: confirmed `PathScribeAIService` is genuinely instantiated by
a real, live component (`OrchestratorSectionEditor.tsx`, part of
`SynopticReportPage`) — not dead code. Restored the file, with the
real finding documented in it directly: **two different
`ServiceResult` conventions genuinely coexist in this codebase right
now** — this older `{success, data, error}` shape (used by the
`aiIntegration/` subsystem) and the newer `{ok, data, meta, error}`
shape in `services/types.ts` (used by essentially everything else,
e.g. `caseRouter`). Each is internally consistent within its own call
chain but inconsistent with the other. Worth consolidating at some
point — not something to guess at or force through a folder review.
The broader lesson, since it's the reason this is written up in this
much detail: a `grep` returning zero hits is evidence, not proof —
worth verifying against `tsc`'s actual, complete picture (which
resolves barrel exports, type-only imports, and every other path a
simple text search can miss) before deleting anything based on it.

**`template.ts`'s `TemplateStatus` vs `templateService.ts`'s own
`TemplateStatus`** — flagged in an earlier pass of this review as a
possible duplicate-type collision. Checked properly this time: these
are genuinely different, unrelated concepts that happen to share a
name coincidentally — `types/template.ts`'s version belongs to
`ReportTemplate` (the Tiptap-based report-*building* templates, a
completely different system from CAP/RCPath protocols). Confirmed no
file imports both into the same scope, so there's no actual collision
risk despite the shared name. Not a bug — just a naming coincidence
worth being aware of, not worth "fixing" (renaming either one is a
clarity nice-to-have, not a correctness issue).

**Four apparently-unused exported types, checked individually rather
than bulk-flagged** (after the `serviceResult.ts` lesson above, each
was verified by its actual exported name, not just file path):
- `DigitalAsset`/`Decant` (`case/Material.ts`) — false positive, both
  genuinely used (`Specimen.ts`, `MaterialTreePanel.tsx`).
- `ErasureCertificate` (`case/ErasureCertificate.ts`) — confirmed zero
  consumers, but this is deliberate, well-documented, forward-looking
  scaffolding for a real GDPR Article 17 compliance feature, not
  abandoned code. The file's own header explicitly notes it's waiting
  on legal counsel sign-off before being "wired to a real delete."
  Left alone.
- `AddSpecimenPayload` (`specimen/AddSpecimenPayload.ts`) — confirmed
  zero consumers, but references a real, existing service
  (`services/hardware/ModeAInterfaceService.ts`) by name in its own
  header with specific, confident integration reasoning — reads as
  planned-but-not-yet-wired, similar to the erasure certificate above,
  not confirmed dead. Left alone.
- `ReportSnapshot`/`ReportSnapshotHistory` (`case/ReportSnapshot.ts`)
  — confirmed zero consumers, and *this* one looks genuinely
  superseded rather than merely not-yet-built. `types/reports/
  ReportVersionRecord.ts` (confirmed live and "already relied on by
  SynopticReportPage.tsx" per its own header) covers materially the
  same concern — tracking original/corrected/addendum report release
  events — with an overlapping `trigger: 'initial_signout' |
  'amendment'` field. Reads like an earlier design that was reworked
  into `ReportVersionRecord`'s different, actually-implemented
  approach, with the old one never removed. Flagged rather than
  deleted — the evidence is circumstantial, not certain, and this is
  exactly the kind of call that deserves a real decision rather than a
  guess.

## Not exhaustively reviewed

The remaining ~30 files (`case/Case.ts` and its siblings, `config/`,
`reports/`, `intraop/`, `quality/`, `systemConfig.ts`, `template.ts`,
etc.) were spot-checked for the specific patterns above (duplicate
types, orphaned exports) rather than read field-by-field in full. Pure
type-definition files are lower-risk for the kind of business-logic
bugs this review has focused on elsewhere — no `any` casts or runtime
logic live here to find.

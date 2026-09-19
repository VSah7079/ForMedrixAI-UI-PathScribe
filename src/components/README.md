# components/

Master index for `src/components/`. One line per top-level folder,
cross-linked to that folder's own `README.md` for real detail.

**Maintenance rule:** when a folder's *contents* change, update that
folder's own `README.md`. Only touch *this* file if a folder's *purpose*
changes, or a folder is added/removed/split/merged.

## Folder index (24 folders, all reviewed)

| Folder | What it is |
|---|---|
| [Config/](./Config/README.md) | Every admin/configuration screen β€” 54 files across 11 subfolders, see its own index |
| [TemplateBuilder/](./TemplateBuilder/README.md) | Report *layout/assembly* builder β€” distinct from Config/Protocols/'s synoptic *data-capture* templates |
| [Editor/](./Editor/README.md) | Tiptap rich text editor + `tiptapBridge/` (AI-integration bridge) |
| [Voice/](./Voice/README.md) | Voice dictation settings/controls |
| [ClientDictionary/](./ClientDictionary/README.md) | Facility Configuration table + editor modal (folder/file names kept as `Client*` — see that folder's own README) |
| [Contribution/](./Contribution/README.md) | My Contribution dashboard β€” 5 tabs/tiles, all serving `ContributionDashboardPage.tsx` |
| [Common/](./Common/README.md) + Button/ | Shared UI primitives: `ConfirmModal`, `LookupModal`, `InlineCommentThread`, `SuffixSelect`, `Dropdown`, `SearchableCombobox`, `PatientIdStatusDot`, `LogoutWarningModal`, `SessionExpiryWarningModal`, `DraftRecoveryModal`, `SessionSupersededNotice` |
| [QualityAssurance/](./QualityAssurance/README.md) | 8 QA/compliance reporting tabs (Countersign Turnaround, Intraop Linkage, Reconciliation, FPPE/Credentialing, Post-Finalization Drift, Patient Match Review, Retention Holds Management Review, Access Request Response) |
| [BarcodeScanner/](./BarcodeScanner/README.md) | Real, camera-based barcode capture (`@zxing/browser`), replacing a previous random-MRN simulator |
| [Worklist/](./Worklist/README.md) | Case worklist table |
| [Icons/](./Icons/README.md) | Icon components |
| [Flags/](./Flags/README.md) | Flag display components |
| [EnhancementRequest/](./EnhancementRequest/README.md) | Feature request submission |
| [ValidationStudies/](./ValidationStudies/README.md) | Parallel-run validation study management |
| [TemplateRequest/](./TemplateRequest/README.md) | New-synoptic-template request form |
| [Search/](./Search/README.md) | Global case search bar (NavBar) |
| [RequestReview/](./RequestReview/README.md) | Informal review request modal (not the same as Delegate) |
| [NavBar/](./NavBar/README.md) | Top nav bar |
| [InternalNotes/](./InternalNotes/README.md) | Internal notes drawer |
| [PatientHistory/](./PatientHistory/README.md) | Patient history modal (SynopticReportPage) |
| [Audit/](./Audit/README.md) | Centralized audit logging hook |
| [AppShell/](./AppShell/README.md) | Global layout shell + the real internal user directory |
| [SpecimenPicker/](./SpecimenPicker/README.md) | Specimen Dictionary lookup modal (AccessionPage) |
| [Synoptic/](./Synoptic/README.md) | Synoptic page sidebar wrapper |
| [Autopsy/](./Autopsy/README.md) | **NEW (Sep 2026)** — Autopsy Pathology Module UI. Real, presentational form components only — no case-creation/routing wiring yet |
| [ExternalConsult/](./ExternalConsult/README.md) | **NEW (Sep 2026)** — PS-290, the internal pathologist-facing issuance/management modal for External Consult / Second-Opinion Access — NOT real token security, see the folder's own README |

## Loose files at `components/` root (Aug 2026)

Three real files sit directly in `components/`, not inside any
subfolder — all part of the same real, global scan-station feature
(see `hooks/README.md`'s own "Scan station & material scanning"
section for the hooks these mount):

- **`MaterialScanTrackingBridge.tsx`** — mounts
  `useGlobalMaterialScanTracking()` exactly once, at the app root
  (`App.tsx`, alongside `ScannerProvider` itself) — never tied to any
  specific page or case being open. Renders nothing; a deliberate
  "hook as a component" pattern purely so it can be mounted once via
  JSX in `App.tsx`.
- **`ScanStationPrompt.tsx`** — real fix, per direct follow-up: "the
  premise of setting a current station in an actual case is not
  correct... should be identified at login. Should be sticky too."
  Replaces the old, case-scoped `MaterialTreePanel.tsx` selector
  entirely — a station is a property of the terminal, never of
  whatever case happens to be open.
- **`StationSwitchGuardModal.tsx`** — real feature, per direct
  follow-up's exact 3-choice table for an unsaved-data station switch:
  Save & Switch / Discard & Switch / Cancel (stay at the current
  station to finish editing). See `useGlobalStationSwitch.ts`'s own
  header for the real guard logic this modal presents.

## Naming/structure pass (July 2026)

Prompted by a direct question: does `Common/` being this thin, in a
codebase this size, actually make sense? It didn't β€” the deeper look
found several folders whose *names* didn't communicate their contents,
independent of whether the code itself was correct. Renamed/consolidated:

| Old | New | Why |
|---|---|---|
| `system/` (lowercase) | `ClientDictionary/` | Collided by capitalization only with `Config/System/` (a much bigger, unrelated folder); told you nothing about Client Dictionary being what's inside |
| `UI/` | folded into `Common/` | Single-file folder named as generically as possible; `ConfirmModal.tsx` is exactly the same category of thing as `Common/LookupModal.tsx` |
| `PatientReportPage/` | folded into `Common/` | The page that name referred to was deleted as dead code earlier this session; only `InlineCommentThread.tsx` (a genuinely shared component) was left behind in a folder named after something that no longer existed |
| `AccessionPage/` | `SpecimenPicker/` | Identical name to `pages/AccessionPage/`, a completely different folder β€” this one is just a picker component, not the page |
| `CasePanel/` | `PatientHistory/` | Gave no signal the folder contains the patient history modal specifically β€” no other "case panel" concept existed to distinguish it from |
| `synoptic/` (lowercase) | `Synoptic/` | The only folder in all of `components/` breaking PascalCase convention |
| `Dashboards/` | folded into `Contribution/` | Both files (`FlagRow.tsx`, `CaseMixTile.tsx`) exclusively serve `ContributionDashboardPage.tsx` β€” same audience as everything already in `Contribution/`; "Dashboards" (plural, generic) didn't say which dashboard |

**Kept as-is, deliberately** β€” flagged as overloaded terminology rather
than renamed, since each name is individually accurate for what it
contains:

- **"Search"** means three different things depending on folder β€”
  `components/Search/CaseSearchBar.tsx` (global case search),
  `Config/Search/ConfigSearchBar.tsx` (Configuration page's own search),
  and `pages/SearchPage.tsx` (the dedicated SNOMED/ICD/specimen lookup
  page). Each is correctly named for what it does; the overlap is only
  confusing if you forget which folder you're in.
- **"Template"** means genuinely different things in `Config/Protocols/`
  (data-capture) vs. `TemplateBuilder/` (report layout) vs.
  `TemplateRequest/` (a request form for a new one) β€” already documented
  in `TemplateBuilder/README.md`'s own Notes section.
- **"Review"** means different things in `RequestReview/` (ask a
  colleague to informally look at a case) vs. `Config/Protocols/ReviewQueueSection.tsx`
  (formal protocol lifecycle review) β€” different domains, not a naming
  mistake.
- **"Editor"** means different things in `components/Editor/` (Tiptap
  narrative writing surface) vs. `Config/Protocols/SynopticEditor.tsx`
  (structured template *definition* builder) β€” a fourth confirmed
  instance of this same pattern, prompted by a direct question and
  checked rather than assumed correct. See `Config/Protocols/README.md`.

Every rename above: confirmed sole/all real consumers via full-`src/`
grep before moving, updated every import path and self-documented header
comment, verified zero dangling references afterward, and ran each moved
file through `esbuild` as a syntax/resolution sanity check (this
environment has no `tsconfig`/`node_modules` for a real `tsc` run β€” that
remains the first real check on your end).

## Known issues found across components/

- **Macros/index.tsx hardcoded fonts** (Config/) β€” drift risk vs.
  `services/fonts/`.
- **Hardcoded `isSuperAdmin={true}`** (Config/System/) β€” see
  `ACCESS_CONTROL_PLAN.md` at repo root. Planned, not blocking, revisit
  before first real customer deployment.
- **`TemplatePreviewPanel.tsx` still on the old node-list preview shape**
  (TemplateBuilder/) β€” works correctly today via a real adapter, not
  urgent.

## Fixes applied across components/

See `Config/README.md`'s own fixes log for full detail on the Config/
subfolder work β€” summarized here for a single cross-folder view:

- `Staff/RoleDictionary.tsx`, `ClientDictionary/ClientTable.tsx` β€” stale
  header path comments fixed.
- **Orchestrator Mode** β€” real, previously-nonfunctional toggle rebuilt
  with org default + per-internal-client override
  (`Facility.internalAiOrchestratorEnabled`). Dead `NarrativeTemplatesTab`
  cluster deleted.
- **`CaseRoutingSection.tsx` β†’ `CasePoolAssignmentSection.tsx`** rename,
  matching the services/ side.
- **`specimenTypes.ts` relocated** from `components/Config/System/` to
  `services/specimenDictionary/` β€” was an inverted dependency. Caught by
  Pete.
- **Participation-types consolidation** β€” `Config/System/ParticipationTypesSection.tsx`
  and `Config/Staff/RoleDictionary.tsx` each maintained a separate,
  disconnected local list of participation types, drifted to different
  type membership entirely from `services/participationTypes/mockParticipationTypeService.ts`
  (the real service `CaseTeamModal.tsx` actually uses). Found by tracing
  a user-reported drag-and-drop bug back through the data layer. Both
  screens now use the real service directly; final 8-type canonical list
  defined by Pete against real CLIA/CAP/ACGME clinical role requirements.
  `TypeModal.tsx`'s mojibake β€” previously assessed here as cosmetic
  comments-only β€” turned out to include a separate instance actually
  rendering wrong in the live UI across all 9 admin screens sharing that
  modal; traced to root cause via raw bytes and fixed. Same investigation
  also surfaced a critical Demo Reset bug: `CASE_KEYS` referenced
  `'ps_cases'`, a key `mockCaseService.ts` never actually wrote to (real
  key: `'cases'`) β€” Demo Reset had likely never correctly cleared primary
  case data. Full detail in `Config/README.md`, `Config/Staff/README.md`,
  `Config/System/README.md`.
- **`TemplateRenderer.tsx` fully rewritten** to consume real
  `EditorTemplate` content via `getTemplate()` instead of a hardcoded
  placeholder β€” 19 real seeded templates now display correctly, plus new
  SNOMED/ICD coding display. `types/templateTypes.ts` and
  `src/templates/mockDcisTemplate.ts` deleted as fully dead.
- **Orphaned third protocol-editing system deleted** β€” `src/protocols/`
  and `src/types/ProtocolDefinition.ts`, plus the unreachable route in
  `App.tsx`. Caught by Pete.
- **`PathScribeEditorHandle` duplicate declaration consolidated**
  (Editor/) β€” now a single source of truth in `PathScribeEditorRef.ts`.
- **`Editor/integration/` renamed to `Editor/tiptapBridge/`** for clarity.
- **`system/clients/desktop.ini` deleted** β€” Windows Explorer metadata
  file, not source code. Recommend adding `desktop.ini` to `.gitignore`.
- **`Common/Button/Button.test.tsx` deleted** β€” confirmed empty scaffold,
  no `Button.tsx` ever existed.
- **`PatientReportPage.tsx` deleted** β€” routed but genuinely unreachable;
  every real navigation goes to `/case/${id}/synoptic` instead. Confirmed
  with Pete. `mock/mockReports.ts` kept β€” still used by `FullReportPage.tsx`.
- `Audit/useAuditLog.ts` β€” removed a literally duplicated header comment.
- **Full naming/structure pass** β€” see the table above. 7 folders
  renamed or consolidated; every move verified via grep + esbuild.
- **`RequestReviewModal.tsx`'s reviewer list rebuilt** on the real
  `services/users/mockUserService.ts` directory (filtered to active
  Pathologists), replacing a standalone hardcoded array that had drifted
  into real ID collisions with `AppShell.tsx`'s directory. Collision-free
  by construction now, not just patched around.
- **PRIORITY_FIXES.md #8 β€” CLOSED. Modal-overlay shell consolidation,
  all 14 files.** What started as `components/UI/ConfirmModal.tsx` found
  with exactly 1 real consumer became a full sweep across
  `LogoutWarningModal.tsx`, `ResourcesModal.tsx`, `EnhancementRequestModal.tsx`
  (already correct, confirmed), `AuditLogPage.tsx`, `ConfigurationPage.tsx`,
  `AppShell.tsx`, `SynopticEditor.tsx`, `protocolShared.tsx`,
  `TemplateRenderer.tsx`, `PathScribeEditor.tsx`, `SynopticReportPage.tsx`,
  `AddCodeModal.tsx`, plus `Home.tsx` (found along the way, with two of
  its own duplicate modals eliminated by reuse rather than reformatted a
  third time) and `AuditLogPage.tsx`'s own third copy of the same Quick
  Links modal.
- **`LogoutWarningModal.tsx` consolidation**, prompted directly by Pete
  given the reliability stakes of `SynopticReportPage.tsx` β€” a second,
  separate implementation with a different prop interface and its own
  uncorrected z-index bug was found in that page's own `modals/` folder
  and merged into one shared `Common/LogoutWarningModal.tsx`. Same
  investigation found and removed a dead `overlayStyle` prop across four
  of that page's other modals, plus one redundant CSS modifier.
- **Session Security β€” Phase 1 of the Inactivity Timeout & Draft Recovery
  feature, complete.** A real idle-detection timer, honest warning modal,
  and forced logout, closing a genuine gap: `AuthContext.tsx` had no
  timeout mechanism at all, while the audit log had two fabricated demo
  entries falsely implying one had worked successfully in the past
  (removed immediately, ahead of any diligence review). Resolved per the
  currently-open case (org default, overridden by whichever client
  performs the work on that case) rather than a multi-institution
  "strictest among all active permissions" model, matching PathScribe's
  actual single-case-focused UI. New: `Config/System/SessionSecuritySection.tsx`,
  `services/session/` (restructured mid-session into a proper
  interface/mock/firestore-stub trio, see `services/session/README.md`),
  `hooks/useIdleTimeout.ts`, `Common/SessionExpiryWarningModal.tsx`.
  `Facility.idleTimeoutMinutesOverride` added and wired into Facility
  Configuration's edit modal.

  **Phase 2 (draft caching + recovery) also now complete** β€” new
  `services/drafts/`, `hooks/useDraftCache.ts`, `Common/DraftRecoveryModal.tsx`,
  wired into `SynopticReportPage.tsx`. Caches the full case (18 distinct
  dirty-able things found via a full `markDirty()` call-site audit, not
  just synoptic answers β€” an earlier, narrower version would have missed
  most of them), explicitly excluding patient demographics for HIPAA
  minimum-necessary reasoning and data-integrity (avoiding a stale
  restore overwriting fresh LIS/EHR data). Local-only restore, no
  auto-persist. Full detail in `Config/README.md`, `Common/README.md`,
  and `ClientDictionary/README.md` (the per-client override field).

---
*Tracking docs (`PRIORITY_FIXES.md`, `ACCESS_CONTROL_PLAN.md`) live at the
repo root, not under `src/`.*

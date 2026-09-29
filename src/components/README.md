# components/

Master index for `src/components/`. One line per top-level folder,
cross-linked to that folder's own `README.md` for real detail.

**Maintenance rule:** when a folder's *contents* change, update that
folder's own `README.md`. Only touch *this* file if a folder's *purpose*
changes, or a folder is added/removed/split/merged.

## Folder index (27 folders, all reviewed)

| Folder | What it is |
|---|---|
| [Config/](./Config/README.md) | Every admin/configuration screen — 54 files across 11 subfolders, see its own index |
| [TemplateBuilder/](./TemplateBuilder/README.md) | Report *layout/assembly* builder — distinct from Config/Protocols/'s synoptic *data-capture* templates |
| [Editor/](./Editor/README.md) | Tiptap rich text editor + `tiptapBridge/` (AI-integration bridge) |
| [LiveUpdates/](./LiveUpdates/README.md) | The live-update connection badge for the OR boards and Intraop Queue (PS-262) |
| [Printing/](./Printing/README.md) | On-screen print feedback: the PathScribe Agent status line (PS-52) and interface-engine print results with Retry (PS-54) |
| [SpellCheck/](./SpellCheck/README.md) | The report screens' spell checking: context, editor extension, spell-checked text box, right-click menu, spelling language control (PS-342) |
| [Voice/](./Voice/README.md) | Voice dictation settings/controls |
| [FacilityDictionary/](./FacilityDictionary/README.md) | Facility Configuration table + editor modal (superseded an orphaned `ClientDictionary/` fork, deleted in the i18n sweep's batch 178 — see that folder's own README) |
| [Contribution/](./Contribution/README.md) | My Contribution dashboard — 5 tabs/tiles, all serving `ContributionDashboardPage.tsx` |
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

## Recent (Sep 2026)

- **Search results (Sep 2026, Batch 350).** `Worklist/WorklistTable.tsx` gained `preserveOrder`, so Search shows the server's sorted, paged results as they are. Its status labels are translated, and its remaining raw inline styles were converted. `AppShell/AppShell.tsx` marks a return to Search through `utils/search/searchSession.ts`.

- **Quick UI fixes (Sep 2026, Batch 349).** `Config/Macros/MacroPanel.tsx` (PS-126): readable hint text, an administrators' **All** tab grouped by type, Enterprise offered only to administrators, and a read-only note on macros the user may not change. `Search/CaseSearchBar.tsx` (PS-101): every case status in the header search popup has a translated, readable label.

- **Network print results (Sep 2026, PS-54, Batch 347).** New `Printing/NetworkPrintJobs.tsx`, mounted in `App.tsx` above the agent status line: labels sent to *Direct via Interface Engine* printers show printed or the reason they didn't, with a manual Retry.

- **Agent print status (Sep 2026, PS-52, Batch 346).** New `Printing/AgentPrintStatus.tsx`, mounted once in `App.tsx`: while a label goes through the PathScribe Agent it says whether it is being sent, queued (and how many jobs are ahead) or printing. `Config/System/PrinterProfilesSection.tsx` gained the optional **Agent Port** field.

- **Live updates (Sep 2026, PS-262, Batch 342).** New `LiveUpdates/LiveStatusBadge.tsx`, which shows whether the OR boards and Intraop Queue are live, local-only, reconnecting or offline.

- **Dependency security (Sep 2026, PS-344, Batch 340).** The editor runs on TipTap 3.31.3, patching a high-severity ReDoS and a `__proto__` attribute issue; React Router is 6.30.6. `AppShell`'s message config links are followed only when they are PathScribe paths (`utils/safeInternalPath.ts`).

- **Spell checking in the report screens (Sep 2026, PS-342, Batch 338).**
  - **New `SpellCheck/`:** the report editor and every report text box are checked in the case's own language, with medical, facility and personal dictionaries. Right-click a squiggle for suggestions or to add the word.
  - **Language:** the case's choice, else the assigned pathologist's preference (Staff → edit → **Spelling language**), else the ordering facility's default.
  - **AI spelling check retired:** Accept in the report editor now commits the section directly.
  - `Editor/PathScribeEditor.tsx` has no inline CSS and no browser storage left.

- **Autopsy signing authority; staff credentials editor (Sep 2026, PS-327, Batch 331).**
  - **Credentials editor:** Staff → edit gains a **Jurisdictional credentials & appointments** section, for example a medical examiner appointment.
  - **Autopsy signing:** Autopsy PAD/FAD signing is now checked. Forensic cases need an active appointment for their jurisdiction.
- **Drafting locked to Template Author; built-in template roles (Sep 2026, PS-63, Batch 329).**
  - **Read-only editor:** the template editor opens read-only for anyone without Template Author (Admin inherits it).
  - **Built-in roles:** Template Author, Template Approver and Lab Director appear in Staff → Roles for every site, and keep working if renamed.
- **Template review rules enforced (Sep 2026, PS-63, Batch 328).**
  - **Approving and publishing** now need an approver role, and an approver who isn't one of the template's authors (unless the site allows self-approval).
  - **Required Reviewers:** the site sets how many approvals a template needs.
  - **SNOMED:** publishing a diagnostic template needs 80% SNOMED coverage.
  - **Settings screen:** System → Administration & Compliance → **Template Review**.
  - The reviewer page's inline styles are gone.
- **Synoptic template workflow documented (Sep 2026, PS-63, Batch 326).**
  - **Admin Guide section:** building, reviewing and publishing a synoptic template. It is in `Config/Protocols/README.md`, written from an end-to-end walkthrough in the app.
  - **Fix:** refreshing the editor after the first save of a new template or copy no longer creates a second copy.
- **LIS ingestion layer and native dropdown colours (Sep 2026, Batch 323).**
  - **PS-87:** the Assist screen is now **Assist LIS Ingestion**, with a staging queue view, **Retry failed**, and **Test an inbound message** for HL7 v2 or JSON. See `services/lisIngestion/README.md`.
  - **PS-62:** every native `<select>` shares one dark open-list style. See `Common/README.md`.
- **Assist LIS Polling (Sep 2026, PS-87, Batch 322).** A new System → Integrations screen (`Config/System/AssistLisPollingSection.tsx`). When the polled LIS reports Gross Complete or Microscopic/Diagnosis Complete, the AI prepares a synoptic draft. The draft appears in the existing report editor as unverified AI suggestions. See `services/assistPolling/README.md`.
- **AI models: global catalog, per-tenant adoption (Sep 2026, PS-58, Batch 320).** The Models tab (`Config/Models/`) and the store (`ValidationStudies/ModelStoreModal.tsx`) now work on the current organisation's adoption records over a global ForMedrixAI catalog. Adopting, defaulting or retiring a model in one organisation doesn't affect another. See `services/models/README.md`.
- **Dead messaging CSS removed (Sep 2026, PS-78, Batch 319).** 130 `ps-msg-*` rules for 70 classes no component uses were deleted from `pathscribe.css`. The live message drawer (`AppShell/AppShell.tsx`) was checked in a real browser and shows no difference. See `AppShell/README.md` and `docs/ARCHIVE.md`.
- **Duplicate policy (Sep 2026, PS-73, Batch 317).**
  - **Which screens:** Duplicate is offered only where `services/duplication/duplicatePolicy.ts` allows it. It was removed from Physicians, Container Types, Delegation Types and RVU code-map rows, and added to ten configuration screens.
  - **Protocol actions:** the synoptic protocol screens' Duplicate / Export JSON / New Version / Archive (previously dead or wrong) are real in `Config/Protocols/ProtocolCardParts.tsx`.
  - **Localized names:** copy names come from `t('common.copyOfName')` everywhere; nothing stores an English "(Copy)" any more.
  - **Bugs fixed along the way:**
    - Specimen Dictionary saves dropping fields;
    - TAT edits wiping role scope;
    - add-vs-edit keyed off entry presence (TAT, the routing-rule priority check).
  - **Inline styles removed:** SynopticEditor, RoleDictionary and the protocol list screens.
  - **Enforcement:** `services/duplication/duplicatePolicy.guard.test.ts`.
  - **Detail:** `Config/System/README.md`, `Config/Protocols/README.md`.
- **Jurisdiction-bound signing authority + standing-rules pass (Sep 2026,
  PS-327 / PS-341)** — `Config/System/TypeModal.tsx` gained the
  Facility-Level Sign-Out Authority editor: each performing lab's
  active rule, where it comes from (country default with its regulatory
  basis / platform default / facility override with admin and date), a
  "break-glass" override that starts from the inherited values, and a
  justification that goes to the audit log.
  `Config/System/ParticipationTypesSection.tsx` saves through
  `services/participationTypes/saveParticipationType.ts`, which stamps
  who/when/why and writes the audit entry.
  `pages/SynopticReportPage/modals/CaseTeamModal.tsx` (outside this
  folder) offers only the roles valid in the case's jurisdiction, with
  local titles.
  All three components render and dispatch only; the logic lives in
  `services/participationTypes/`. No raw inline styles (CSS custom
  properties only), all UI text in five languages, enforced by
  `services/participationTypes/standingRules.guard.test.ts`. Full detail
  in `Config/System/README.md` and `services/participationTypes/README.md`.
- **Encoding repair (Sep 2026)** — this README (39) and `Config/README.md` (46)
  had 85 corrupted characters between them: UTF-8 em-dashes, arrows, and ✅ that had
  been decoded as Windows code pages ("β€”" for "—", "βœ…" for "✅").
  All restored. A repo-wide scan found no other affected file.

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
codebase this size, actually make sense? It didn't — the deeper look
found several folders whose *names* didn't communicate their contents,
independent of whether the code itself was correct. Renamed/consolidated:

| Old | New | Why |
|---|---|---|
| `system/` (lowercase) | `ClientDictionary/` | Collided by capitalization only with `Config/System/` (a much bigger, unrelated folder); told you nothing about Client Dictionary being what's inside |
| `UI/` | folded into `Common/` | Single-file folder named as generically as possible; `ConfirmModal.tsx` is exactly the same category of thing as `Common/LookupModal.tsx` |
| `PatientReportPage/` | folded into `Common/` | The page that name referred to was deleted as dead code earlier this session; only `InlineCommentThread.tsx` (a genuinely shared component) was left behind in a folder named after something that no longer existed |
| `AccessionPage/` | `SpecimenPicker/` | Identical name to `pages/AccessionPage/`, a completely different folder — this one is just a picker component, not the page |
| `CasePanel/` | `PatientHistory/` | Gave no signal the folder contains the patient history modal specifically — no other "case panel" concept existed to distinguish it from |
| `synoptic/` (lowercase) | `Synoptic/` | The only folder in all of `components/` breaking PascalCase convention |
| `Dashboards/` | folded into `Contribution/` | Both files (`FlagRow.tsx`, `CaseMixTile.tsx`) exclusively serve `ContributionDashboardPage.tsx` — same audience as everything already in `Contribution/`; "Dashboards" (plural, generic) didn't say which dashboard |

**Kept as-is, deliberately** — flagged as overloaded terminology rather
than renamed, since each name is individually accurate for what it
contains:

- **"Search"** means three different things depending on folder —
  `components/Search/CaseSearchBar.tsx` (global case search),
  `Config/Search/ConfigSearchBar.tsx` (Configuration page's own search),
  and `pages/SearchPage.tsx` (the dedicated SNOMED/ICD/specimen lookup
  page). Each is correctly named for what it does; the overlap is only
  confusing if you forget which folder you're in.
- **"Template"** means genuinely different things in `Config/Protocols/`
  (data-capture) vs. `TemplateBuilder/` (report layout) vs.
  `TemplateRequest/` (a request form for a new one) — already documented
  in `TemplateBuilder/README.md`'s own Notes section.
- **"Review"** means different things in `RequestReview/` (ask a
  colleague to informally look at a case) vs. `Config/Protocols/ReviewQueueSection.tsx`
  (formal protocol lifecycle review) — different domains, not a naming
  mistake.
- **"Editor"** means different things in `components/Editor/` (Tiptap
  narrative writing surface) vs. `Config/Protocols/SynopticEditor.tsx`
  (structured template *definition* builder) — a fourth confirmed
  instance of this same pattern, prompted by a direct question and
  checked rather than assumed correct. See `Config/Protocols/README.md`.

Every rename above: confirmed sole/all real consumers via full-`src/`
grep before moving, updated every import path and self-documented header
comment, verified zero dangling references afterward, and ran each moved
file through `esbuild` as a syntax/resolution sanity check (this
environment has no `tsconfig`/`node_modules` for a real `tsc` run — that
remains the first real check on your end).

## Recent additions

- **Country Signing Rules (Batch 335, PS-341):** `Config/System/CountrySigningRulesSection.tsx` is the platform-level editor for per-country signing rules. See `Config/System/README.md`.
- **Code Import (Batch 334, PS-89):** `Config/System/CodeImportSection.tsx` imports billing codes from CSV as four-eyes approval jobs. See `Config/System/README.md`.

## Known issues found across components/

- **Macros/index.tsx hardcoded fonts** (Config/) — drift risk vs.
  `services/fonts/`.
- **Hardcoded `isSuperAdmin={true}`** (Config/System/) — see
  `docs/architecture/ACCESS_CONTROL_PLAN.md`. Planned, not blocking, revisit
  before first real customer deployment.
- **`TemplatePreviewPanel.tsx` still on the old node-list preview shape**
  (TemplateBuilder/) — works correctly today via a real adapter, not
  urgent.

## Fixes applied across components/

See `Config/README.md`'s own fixes log for full detail on the Config/
subfolder work — summarized here for a single cross-folder view:

- `Staff/RoleDictionary.tsx`, `ClientDictionary/ClientTable.tsx` — stale
  header path comments fixed.
- **Orchestrator Mode** — real, previously-nonfunctional toggle rebuilt
  with org default + per-internal-client override
  (`Facility.internalAiOrchestratorEnabled`). Dead `NarrativeTemplatesTab`
  cluster deleted.
- **`CaseRoutingSection.tsx` → `CasePoolAssignmentSection.tsx`** rename,
  matching the services/ side.
- **`specimenTypes.ts` relocated** from `components/Config/System/` to
  `services/specimenDictionary/` — was an inverted dependency. Caught by
  Pete.
- **Participation-types consolidation** — `Config/System/ParticipationTypesSection.tsx`
  and `Config/Staff/RoleDictionary.tsx` each maintained a separate,
  disconnected local list of participation types, drifted to different
  type membership entirely from `services/participationTypes/mockParticipationTypeService.ts`
  (the real service `CaseTeamModal.tsx` actually uses). Found by tracing
  a user-reported drag-and-drop bug back through the data layer. Both
  screens now use the real service directly; final 8-type canonical list
  defined by Pete against real CLIA/CAP/ACGME clinical role requirements.
  `TypeModal.tsx`'s mojibake — previously assessed here as cosmetic
  comments-only — turned out to include a separate instance actually
  rendering wrong in the live UI across all 9 admin screens sharing that
  modal; traced to root cause via raw bytes and fixed. Same investigation
  also surfaced a critical Demo Reset bug: `CASE_KEYS` referenced
  `'ps_cases'`, a key `mockCaseService.ts` never actually wrote to (real
  key: `'cases'`) — Demo Reset had likely never correctly cleared primary
  case data. Full detail in `Config/README.md`, `Config/Staff/README.md`,
  `Config/System/README.md`.
- **`TemplateRenderer.tsx` fully rewritten** to consume real
  `EditorTemplate` content via `getTemplate()` instead of a hardcoded
  placeholder — 19 real seeded templates now display correctly, plus new
  SNOMED/ICD coding display. `types/templateTypes.ts` and
  `src/templates/mockDcisTemplate.ts` deleted as fully dead.
- **Orphaned third protocol-editing system deleted** — `src/protocols/`
  and `src/types/ProtocolDefinition.ts`, plus the unreachable route in
  `App.tsx`. Caught by Pete.
- **`PathScribeEditorHandle` duplicate declaration consolidated**
  (Editor/) — now a single source of truth in `PathScribeEditorRef.ts`.
- **`Editor/integration/` renamed to `Editor/tiptapBridge/`** for clarity.
- **`system/clients/desktop.ini` deleted** — Windows Explorer metadata
  file, not source code. Recommend adding `desktop.ini` to `.gitignore`.
- **`Common/Button/Button.test.tsx` deleted** — confirmed empty scaffold,
  no `Button.tsx` ever existed.
- **`PatientReportPage.tsx` deleted** — routed but genuinely unreachable;
  every real navigation goes to `/case/${id}/synoptic` instead. Confirmed
  with Pete. `mock/mockReports.ts` kept — still used by `FullReportPage.tsx`.
- `Audit/useAuditLog.ts` — removed a literally duplicated header comment.
- **Full naming/structure pass** — see the table above. 7 folders
  renamed or consolidated; every move verified via grep + esbuild.
- **`RequestReviewModal.tsx`'s reviewer list rebuilt** on the real
  `services/users/mockUserService.ts` directory (filtered to active
  Pathologists), replacing a standalone hardcoded array that had drifted
  into real ID collisions with `AppShell.tsx`'s directory. Collision-free
  by construction now, not just patched around.
- **PRIORITY_FIXES.md #8 — CLOSED. Modal-overlay shell consolidation,
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
  given the reliability stakes of `SynopticReportPage.tsx` — a second,
  separate implementation with a different prop interface and its own
  uncorrected z-index bug was found in that page's own `modals/` folder
  and merged into one shared `Common/LogoutWarningModal.tsx`. Same
  investigation found and removed a dead `overlayStyle` prop across four
  of that page's other modals, plus one redundant CSS modifier.
- **Session Security — Phase 1 of the Inactivity Timeout & Draft Recovery
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

  **Phase 2 (draft caching + recovery) also now complete** — new
  `services/drafts/`, `hooks/useDraftCache.ts`, `Common/DraftRecoveryModal.tsx`,
  wired into `SynopticReportPage.tsx`. Caches the full case (18 distinct
  dirty-able things found via a full `markDirty()` call-site audit, not
  just synoptic answers — an earlier, narrower version would have missed
  most of them), explicitly excluding patient demographics for HIPAA
  minimum-necessary reasoning and data-integrity (avoiding a stale
  restore overwriting fresh LIS/EHR data). Local-only restore, no
  auto-persist. Full detail in `Config/README.md`, `Common/README.md`,
  and `ClientDictionary/README.md` (the per-client override field).

## Batch 353

- **TAT and delegations are now services** (`services/tatConfig/`, `services/delegations/`):
  - the TAT settings screen (`Config/System/`) saves through `tatTargetService`;
  - the Quality tab and Enterprise rollup read through the services.
- **Deployment baselines:** four component files came off them.

## Batch 356

`Config/System/InstrumentsSection.tsx` is new: the instrument list (PS-326).

## Batch 358

`Config/System/EquipmentSection.tsx` replaced `InstrumentsSection.tsx`: the equipment register.

## Batch 359

- `Config/System/GrossingHardwareSection.tsx` is new.
- Printer Profiles and Equipment show the device links.

## Batch 360

`Config/System/EquipmentLogModal.tsx` is new: a device's service log.

## Batch 361

`Config/System/EquipmentSection.tsx` shows a device with an open malfunction or past due in red.

## Batch 362

`NavBar/LanguageSwitcher.tsx` offers Belgian Dutch (NL-BE).


## Batch 363 (PS-72): patient data tagged for screenshot redaction

Components across `AppShell/`, `Audit/`, `Config/System/`, `FacilityDictionary/`, `PatientHistory/`, `QualityAssurance/`, `RequestReview/`, `Search/` and `Worklist/` tag the patient identifiers they show with `data-phi` for screenshot redaction. See `services/phi/`.


## Batch 364 (PS-349, PS-350): support references

**`Support/`** (new): `SupportReferenceChip` and `SupportReferenceLookup`. `EnhancementRequest/` no longer sends identifiers, and `Search/` accepts support references.

---
*Tracking: `PRIORITY_FIXES.md` was retired 2026-08-19 — its open items are
Jira PS-57 to PS-71, so `PRIORITY_FIXES.md #N` citations throughout these
READMEs are historical (see `docs/ARCHIVE.md`). `ACCESS_CONTROL_PLAN.md`
lives in `docs/architecture/`. Working rules for every change: repo-root
`CLAUDE.md`.*

## React Router 7 (Batch 341, PS-344)

Every file here that used `react-router-dom` now imports the same hooks and components from `react-router` 7 (`react-router-dom` was removed from the project). Nothing else changed: the app had already opted into version 7's behaviour. See `src/i18n/README.md` → Batch 341.

## Signing (Batch 344, PS-60 follow-up)

[`Signing/`](Signing/README.md): the "confirm it's you" step before a signature. It has two parts:
- `SignerConfirmationFields`: password fields for demo sessions, or a note that the identity provider will ask again for SSO sessions.
- `SignatureConfirmModal`: a small modal for the cytology sign-out and the autopsy PAD/FAD, which had no confirmation at all.

The decisions are in `services/auth/signerConfirmation.ts`.

**Batch 345:** `Config/Staff/LinkedSignInAccounts.tsx`, a person's linked single-sign-on accounts in Staff → edit, with Unlink (audited).

## Batch 355

`Contribution/qualityCalculations.ts`: a comment that pointed to the deleted informal-review banner was updated (PS-346).

## Batch 365 (PS-347)

`NavBar/LanguageSwitcher.tsx` offers Belgian French (FR-BE). The menu names both French variants.

## Batch 367 (PS-74): no inline CSS

Subfolders converted their last inline styles to `pathscribe.css` classes (see each folder's README). Standing rule 1 now holds app-wide, checked by `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368

Several component folders now take their services from `@/services` instead of mock files, and came off the deployment baseline. The folders are Config/System, Contribution, FacilityDictionary, QualityAssurance, Search and TemplateBuilder; see each README.

## Batch 369 (PS-355)

- **`Common/CapabilityButton.tsx`**: an action button greyed out, with the reason, when the user lacks its capability.
- **`Config/Staff/`**: the Role Dictionary's Capabilities tab, with dependency prompts. The old Permissions tab is renamed Commands.
- **`QualityAssurance/`**: every export button is gated by that report's own capability. Five tabs are off the deployment baseline.

## Batch 370 (PS-356)

- **`Config/Staff/`:** role and staff saves are checked, and the self-escalation gap is closed. Staff get a facility assignment. The role-level switches that did nothing are removed.
- **`Config/System/DemoResetTab`:** the logic is in `services/demoReset/`, and the full reset needs a capability.
- **`QualityAssurance/`:** exports carry facility context.
- **`Common/CapabilityButton`:** takes a context and says why a button is greyed out.

## Batch 371

- **`Config/Staff/`:** the Superadmin role is read-only, and managed by ForMedrixAI.
- **`Config/System/`:** governing-bodies editing is for ForMedrixAI support only, and so are the terminology endpoint details.

## Batch 372

- **`Config/System/SupportAccessSection`:** the hospital's support access policy, approvals and support audit; support's access requests.

## Batch 374

- **`Common/ScreenGate`:** the route check for screens.
- **`NavBar`:** the quick case search shows only with Search access, and the credentials line is the user's own.

## Batch 376

- **`Config/System/FieldRequirementsSection`:** required fields by page (PS-359).

## Batch 379

- **`Config/System/FieldRequirementsSection`:** field hints; Grossing's switchable protocol rule (PS-359).

## Batch 380

- **`Config/System/FieldRequirementsSection`:** the Case report page's groups (PS-359).

## Batch 381

- **`Config/System/FieldRequirementsSection`:** the Case report page's group 2 groups (PS-359).

## Batch 382

- **`Billing/`** (new README): the post-sign-out billing reason and applied-code correction modals now take their required fields from Field Requirements; correcting a code needs `billing:applied-code:correct`. Both came off the mock-import baseline.
- **`Config/System/FieldRequirementsSection`:** two more groups on the Case report page (PS-359).

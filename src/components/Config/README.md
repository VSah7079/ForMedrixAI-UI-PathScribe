# components/Config/

The biggest, most central components folder — every admin/configuration
screen in PathScribe (analogous to `services/cases/` in scale). 54 files
across 11 subfolders.

**Maintenance rule:** when a subfolder's *contents* change, update that
subfolder's own `README.md`. Only touch *this* file if a subfolder's
*purpose* changes, gets added, removed, split, or merged.

## Loose files directly in this folder

- **`configDirtyGuardContext.ts`** — **New (PS-128, Sep 2026).** A small,
  opt-in React Context bridging a Config tab's own real local "unsaved
  draft" state up to `pages/ConfigurationPage.tsx`'s own tab-switch/
  voice-nav/search navigation, which previously had no way to see it and
  would silently discard it. One `setDirty(boolean)` — deliberately not a
  per-tab-id registry, since `ConfigurationPage.tsx` only ever mounts one
  tab at a time. First real consumer: `Macros/MacroPanel.tsx`. See
  `pages/README.md`'s own `ConfigurationPage.tsx` entry for the full
  account, including which other real `isDirty` producers in this folder
  (`Templates/TemplateRenderer.tsx`, `Protocols/SynopticEditor.tsx`) were
  investigated and ruled out as not applicable — both are separate,
  standalone routes, never mounted inside `ConfigurationPage.tsx`'s own
  tab system.

## Folder index

| Folder | What it is | Status |
|---|---|---|
| [AI/](./AI/README.md) | Provider selection, model config, AI Behavior tab | ✅ Reviewed |
| [Templates/](./Templates/README.md) | Protocol review queue + lifecycle reviewer | ✅ Reviewed — 1 known bug |
| [NarrativeTemplates/](./NarrativeTemplates/README.md) | AI narrative section config (data only — tab UI deleted) | ✅ Reviewed — dead tab confirmed & removed |
| [Actions/](./Actions/README.md) | Voice/shortcut action registry editor | ✅ Reviewed |
| [Macros/](./Macros/README.md) | Text-expansion macro editor | ✅ Reviewed — 1 minor drift risk |
| [Models/](./Models/README.md) | This organisation's adopted AI models (global catalog + per-tenant adoption, PS-58) | ✅ Reviewed |
| [Search/](./Search/README.md) | Configuration page's own search bar | ✅ Reviewed |
| [Staff/](./Staff/README.md) | Staff directory + role/permission dictionary | ✅ Reviewed — 2 fixes applied |
| [Terminology/](./Terminology/README.md) | Terminology endpoint config + health monitor | ✅ Reviewed |
| [System/](./System/README.md) | 30 files — client/case/routing/TAT/session/dictionary admin | ✅ Reviewed — 1 rename, 6 fixes applied |
| [Protocols/](./Protocols/README.md) | Protocol registry + review queue + the real template builder | ✅ Reviewed — see TemplateRenderer bug below |

## Known issues (cross-folder)

- **Macros/index.tsx hardcoded fonts** (Config/) — drift risk vs.
  `services/fonts/` (the real dictionary is `System/FontsSection.tsx`'s
  own data).
- **Hardcoded `isSuperAdmin={true}`** (System/) — `GoverningBodiesSection`
  and `TerminologyServicesSection` are never called with a real,
  role-derived value. See `docs/architecture/ACCESS_CONTROL_PLAN.md` — planned,
  not blocking, revisit before first real customer deployment.
- **~9 real service storage keys missing from `DemoResetTab.tsx`**
  (System/) — down from ~13 after this session's `CASE_KEYS` fix; the
  remaining gap was logged in `PRIORITY_FIXES.md` as its own item (that
  file was retired 2026-08-19; its open items moved to Jira PS-57 to PS-71
  — see `docs/ARCHIVE.md`).

## Jurisdiction-bound signing authority (Sep 2026, PS-327 / PS-341)

`System/TypeModal.tsx` and `System/ParticipationTypesSection.tsx` are
now the admin surface for who may sign out, and whose work needs a
countersign, per facility and per country. Each performing lab shows
the active rule and its source: the country default with its regulatory
basis, the platform default, or a facility override with who and when.
Admins get an explicit "Override default for this facility" control and
a revert. Every override change is stamped who/when/why and written to
the audit log.

Both screens render and dispatch only; the logic is in
`services/participationTypes/` (`facilityAuthorityEditor.ts`,
`saveParticipationType.ts`). Their inline styles now pass only CSS
custom properties, and their UI text, including jurisdiction names
(`jurisdictionNames.*`), is in all five locales. A guard test enforces
all of this: `services/participationTypes/standingRules.guard.test.ts`.
Detail: `System/README.md`.

This README's own text was also repaired: 46 corrupted characters
(em-dashes, arrows, and ✅ marks decoded as Windows code pages) were restored.

## Fixes applied this pass

- `Staff/RoleDictionary.tsx` — corrected stale header path comment
  (`Config/Users/` → `Config/Staff/`).
- **Orchestrator Mode — real bug, fixed.** Confirmed via full-repo grep
  that `NarrativeTemplatesTab` (old tab) was fully dead, but it was the
  only code in the entire app that ever wrote the orchestrator-mode
  localStorage key — so the toggle silently never worked, anywhere.
  Rebuilt as `Config/AI/orchestratorModeConfig.ts`: a real, persisted
  org-level default (toggleable from `OrchestratorConfigSection.tsx`) plus
  a per-facility override (`Facility.internalAiOrchestratorEnabled`,
  editable in Facility Configuration's AI & Performance tab, for NHS trusts /
  multi-site arrangements where not every performing lab wants AI
  narrative auto-draft on). See `Config/AI/README.md` and
  `services/facilities/README.md` for full detail. Deleted the confirmed-dead
  `NarrativeTemplatesTab`/`SectionList.tsx`/`SectionEditor.tsx`.
- **PRIORITY_FIXES.md #3 — CLOSED.** `CaseRoutingSection.tsx` renamed to
  `CasePoolAssignmentSection.tsx` (file + component + `System/index.tsx`
  import site), matching the already-completed `casePoolAssignmentService.ts`
  rename on the services/ side. Confirmed zero dangling references.
- `System/specimenTypes.ts` — removed 3 leftover editing-artifact comments,
  then **relocated to `services/specimenDictionary/specimenTypes.ts`**
  (caught by Pete: a services/ interface was importing its core type from
  inside components/ — inverted dependency, fixed across 10 consumers).
- **PRIORITY_FIXES.md #2 — CLOSED.** `TemplateRenderer.tsx` fully
  rewritten to consume real `EditorTemplate` content via `getTemplate()`
  instead of a hardcoded placeholder. Two now-fully-dead files deleted:
  `types/templateTypes.ts` (its own audit-event exports were already an
  orphaned duplicate of `types/AuditEvent.ts`) and
  `src/templates/mockDcisTemplate.ts` — `src/templates/` is now empty,
  resolving the stray-folder relocation question by elimination rather
  than a move. See `Templates/README.md` and `Protocols/README.md` for
  full detail.
- **Participation-types consolidation — real, active data-source
  disconnect, found and fixed.** `System/ParticipationTypesSection.tsx`
  and `Staff/RoleDictionary.tsx`'s Case Participation tab each
  independently maintained their own local list of participation types,
  completely disconnected from `services/participationTypes/
  mockParticipationTypeService.ts` — the real service
  `pages/SynopticReportPage/modals/CaseTeamModal.tsx` actually uses. The
  two lists had drifted to different type membership entirely, not just
  different metadata on the same types. Found by tracing a user-reported
  drag-and-drop bug in `CaseTeamModal` all the way back through the data
  layer, not by inspection. Both admin screens now read/write through the
  real service directly; the final 8-type canonical list was defined
  directly by Pete against real CLIA/CAP/ACGME clinical role
  requirements. `TypeModal.tsx`'s mojibake (previously assessed as
  cosmetic) turned out to include a separate instance actually rendering
  wrong in the live UI across all 9 admin screens sharing this modal —
  traced to root cause via raw bytes and fixed. Full detail in
  `Staff/README.md` and `System/README.md`.
- **Demo Reset critical fix.** Same investigation surfaced that
  `DemoResetTab.tsx`'s `CASE_KEYS` referenced `'ps_cases'` — a key
  `mockCaseService.ts` never actually wrote to (its real key is
  `'cases'`) — meaning Demo Reset had likely never correctly cleared
  primary case data at all. Found via a full, unrestricted
  `storageGet`/`storageSet` audit across `services/`, not limited to the
  `pathscribe_` prefix (the exact reason this and 8 other keys had gone
  undetected by an earlier, narrower pass).
- **Session Security — Phase 1 of the Inactivity Timeout & Draft Recovery
  feature, complete (full spec in `PRIORITY_FIXES.md`).** A real
  idle-detection timer, honest warning modal, and forced logout, replacing
  what turned out to be nothing at all — `AuthContext.tsx` had zero
  timeout logic anywhere, while `services/auditlog/mockAuditService.ts`
  had two fabricated demo entries claiming a "session expired after 60
  min inactivity" event had fired successfully in the past. Those
  entries were removed immediately, ahead of any technical or IP
  diligence review, independent of when the real feature shipped.
  Resolution is deliberately per-currently-open-case (an org-wide
  default, overridden by whichever client performs the work on the case
  on screen) rather than a multi-institution "strictest among all active
  permissions" model — matches PathScribe's actual single-case-focused
  UI, and avoids inventing a user-to-client permissions concept that
  doesn't exist anywhere in the data model. New:
  `System/SessionSecuritySection.tsx` (org-default admin screen),
  `services/session/` (resolution logic — restructured mid-session into
  a proper interface/mock/firestore-stub trio after an earlier single-file
  version was caught not matching this codebase's established convention;
  see `services/session/README.md`), `hooks/useIdleTimeout.ts`,
  `Common/SessionExpiryWarningModal.tsx`.
  `Facility.idleTimeoutMinutesOverride` added to `IFacilityService.ts` and
  wired into Facility Configuration's edit modal (AI & Performance tab).
  Modal copy deliberately
  reworded from the original spec to avoid claiming draft auto-save
  exists (at the time, that was Phase 2, not yet built) — same
  false-claim risk just removed from the audit log.

  **Phase 2 now also complete.** Real draft caching + recovery, wired
  into `SynopticReportPage.tsx` via new `services/drafts/` (matching
  the `I`/`mock`/`firestore`-stub convention exactly — an earlier draft
  was a single non-conforming file, caught and corrected before anything
  depended on it) and `hooks/useDraftCache.ts`. Caches the full case,
  not just synoptic answers — a full audit of this page's own
  `markDirty()` call sites found 18 distinct dirty-able things (Priority,
  Flags, Case comments, Specimens, Codes, etc.), meaning an earlier,
  narrower version would have silently missed most real editable
  content. Explicitly excludes the `patient` object (name/DOB/MRN) —
  HIPAA minimum-necessary reasoning plus a real data-integrity concern
  (patient demographics are read-only LIS/EHR master data; restoring a
  stale cached copy over freshly-fetched current data would be a
  correctness bug, not just a privacy one). Restore is local-only, no
  auto-persist — marks the case dirty via the existing mechanism so the
  pathologist's normal Save Draft review serves as the actual
  verification step. Full detail in `Common/README.md` and
  `ClientDictionary/README.md` (the per-client override field).

## Duplicate policy (Batch 317, PS-73)

Across Config/, Duplicate is offered only where `services/duplication/duplicatePolicy.ts` allows it (complex configuration, templates, multi-site variants). It is never offered for real people or flat lookups. A guard test enforces the policy against every component. Copy names are localized. Details: `System/README.md`, `Protocols/README.md`, `Staff/README.md`, and `services/duplication/README.md`.

## AI models: global catalog, per-tenant adoption (Batch 320, PS-58)

`Models/` lists the current organisation's adopted models. What an organisation decides about a model (status, its default, case counts) is its own adoption record, never the shared ForMedrixAI catalog entry. See [`services/models/`](../../services/models/README.md).

## Assist LIS Ingestion (Batches 322–323, PS-87)

System → Integrations → **Assist LIS Ingestion** configures how the external LIS's updates reach PathScribe in Assist mode: polling, HL7 v2 messages or JSON webhooks, all through one staging queue. It also sets which LIS statuses mean Gross Complete or Microscopic/Diagnosis Complete. See [`services/lisIngestion/`](../../services/lisIngestion/README.md) and [`services/assistPolling/`](../../services/assistPolling/README.md).

## Native dropdowns (Batch 323, PS-62)

Native `<select>` elements stay native; their open lists share one dark style app-wide. See `components/Common/README.md`.

## Printer profiles: PathScribe Agent port (Batch 346, PS-52)

System → Workstation & Hardware → **Printer Profiles** has an optional **Agent Port** for PathScribe Agent printers. Leave it empty unless IT moved the agent off 9100–9102; PathScribe tries it first. See `System/README.md`.

## Spelling language preference (Batch 338, PS-342)

Staff → edit records each pathologist's **Spelling language**; cases assigned to them are spell-checked in it unless the case sets its own. See `Staff/README.md`.

## Country Signing Rules (Batch 335, PS-341)

System → Clinical Lookups → **Country Signing Rules** is the platform-level editor for each participation type's per-country rules: local title, signing-authority flags, regulatory basis, and whether a country-scoped role is offered there. Only a platform administrator can edit. Every change needs a reason and is audited. See `System/README.md`.

## Code Import (Batch 334, PS-89)

System → Financial & Revenue Lookups → **Code Import (Bulk)** uploads a CSV of billing codes as one job for four-eyes approval, and lists every job with rollback. Pending Billing Rule Approvals decides a job as a whole. See `System/README.md`.

## Staff credentials editor (Batch 331, PS-327)

`Staff/StaffTab.tsx`'s edit form records jurisdiction-scoped credentials and appointments, and audits each change. Forensic autopsy sign-out requires such an appointment. See `Staff/README.md`.

## Template review rules enforced (Batch 328, PS-63)

Approve and Publish on the reviewer page (`Templates/TemplateRenderer.tsx`) are now checked by the service:
- approver roles;
- no self-approval unless the site allows it;
- the site's required number of reviewers;
- at least 80% SNOMED coverage for diagnostic templates.

The two settings are in `System/TemplateGovernanceSection.tsx`. The Admin Guide is in `Protocols/README.md` → "Who may approve and publish".

**Batch 329:** the template editor (`Protocols/SynopticEditor.tsx`) opens read-only for users without the Template Author role (Admin inherits it). Template Author, Template Approver and Lab Director are now built-in roles in Staff → Roles.

## Admin guide: synoptic templates (Batch 326, PS-63)

[`Protocols/README.md` → "Admin guide: building and publishing a synoptic template"](./Protocols/README.md#admin-guide-building-and-publishing-a-synoptic-template) is customer-facing Admin Guide material for the whole template lifecycle, written from an end-to-end walkthrough in the app. The same batch fixed a refresh-creates-a-second-copy bug in the editor.

## Batch 353

`System/TATConfigSection.tsx` now reads and saves TAT targets through `tatTargetService`, not browser storage. See [System/README.md](System/README.md).

## Batch 356

**New System section:** Instruments, under Workstation & Hardware (PS-326). Molecular batches pick their target instrument from it. See [System/README.md](System/README.md).

## Batch 358

System → Instruments became **System → Equipment**, one register for every device (hybrid: workflow settings stay on their own screens). See [System/README.md](System/README.md).

## Batch 359

**New System section: Grossing Hardware.** Its service existed, but it had no screen. Printer Profiles and Grossing Hardware now name their physical device from the equipment register, and the register shows which settings point at each device.

## Batch 360

The Equipment register gained maintenance and calibration schedules, a service status column, and a per-device service log (append-only, audited).

## Batch 361

The Equipment register shows a device with an open malfunction or past due in red.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`System/`: three sections tag patient identifiers for screenshot redaction; `CasePoolAssignmentSection` came off the mock-import baseline.


## Batch 364 (PS-349, PS-350): support references

`System/DemoResetTab.tsx` clears the new support references.

## Batch 367 (PS-74): no inline CSS

Subfolders converted their last inline styles to `pathscribe.css` classes (see each folder's README). Standing rule 1 now holds app-wide, checked by `services/styleRules/inlineCss.guard.test.ts`.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
- **Batch 345:** `Staff/LinkedSignInAccounts.tsx`, a person's linked single-sign-on accounts in Staff → edit, with Unlink (audited). See `Staff/README.md`.

## Macros: administrators and Enterprise macros (Batch 349, PS-126)

`Macros/MacroPanel.tsx`: administrators open on an **All** tab that lists every macro grouped by type (Enterprise, then facilities, then each user's personal macros). Only administrators are offered **Enterprise (every facility)**; for anyone else an Enterprise macro, or another user's personal one, opens read only. The sidebar hint was nearly invisible (about 2.3:1 contrast) and is now readable. See `Macros/README.md`.

## Batch 369 (PS-355)

The Role Dictionary (`Staff/`) has a Capabilities tab, the enforced part of a role:
- capabilities are grouped;
- dependencies are prompted for;
- every change is audited.

The 189 entries formerly labelled Permissions are voice and keyboard commands and are now labelled Commands. See `Staff/README.md`.

## Batch 370 (PS-356)

Saving roles and staff, and the full demo reset, need capabilities. Before this, any signed-in user could change roles and staff role assignments. See `Staff/README.md` and `System/README.md`.

## Batch 371

Hospital administrators have no control over Superadmin, which is ForMedrixAI's. The platform-wide governing-bodies setting is ForMedrixAI's too. See `Staff/README.md` and `System/README.md`.

## Batch 372

System → Support Access: each hospital decides whether ForMedrixAI support may reach its data, approves each visit, and reviews and exports what support did. See `System/README.md`.

## Batch 376

System → Field Requirements: each organisation chooses which fields a page requires (PS-359). See `System/README.md`.

## Batch 379

System → Field Requirements: Grossing's "Grossing protocol attached" rule, the organisation's switch for requiring a protocol before grossing completes (PS-359). See `System/README.md`.

## Batch 380

System → Field Requirements: the Case report page (Add/Edit specimen, amendments and addenda, critical findings), PS-359. See `System/README.md`.

## Batch 381

System → Field Requirements: the Case report page's group 2 (holds, comments, delegation, biopsy arrays, block cancellation and restains), PS-359.

## Batch 382

System → Field Requirements: the Case report page's group 3, part 1 (frozen-final reconciliation, billing changes after sign-out), PS-359.

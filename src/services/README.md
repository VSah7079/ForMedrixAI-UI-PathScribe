# src/services/ — Master Index

This folder contains every data-access and business-logic service in
PathScribe. If you're new to this codebase, read this file first, then
drill into the specific subfolder's own `README.md` for detail.

**Maintenance rule:** when a subfolder's *contents* change, update that
subfolder's own `README.md`. Only touch *this* file if a subfolder's
*purpose* changes, gets added, removed, split, or merged — i.e. if the
one-line description in the index table below would need to change.
Run `node scripts/check-services-docs.cjs` any time you're unsure whether
this file and the per-folder READMEs are still in sync — don't rely on
memory.

**Real, standing UI convention (Sep 2026, per direct instruction) —
applies to `pages/`/`components/`, not this folder, but discoverable
from here since this is the most-read doc in the codebase**: any new
page or modal must not ship with hardcoded, user-facing strings —
translate from the start; updating an existing page or modal's own UI
text means converting it to the same real i18n framework as part of
that change. See `src/i18n/README.md` for the full account.

---

## The core pattern: interface / mock / firestore

Most folders here follow the same three-file shape:

- **`I<Name>Service.ts`** — the contract (TypeScript interface + shared types).
- **`mock<Name>Service.ts`** — the real, currently-active implementation.
  Despite the name "mock," this is what the running app actually uses
  today — it's `localStorage`-backed rather than a placeholder.
- **`firestore<Name>Service.ts`** — a *deliberate, forward-looking stub*
  for the eventual real backend. Not dead code, not wired in yet. When a
  real backend exists, swapping it in is meant to be a one-line change in
  `services/index.ts`.

Where a folder deviates from this pattern, its own `README.md` explains
why (e.g. `services/ai/` is a provider-abstraction layer, not a CRUD
service; `services/grossing/` is deliberately types-only because its real
logic lives in `services/cases/mockCaseService.ts`; `services/hl7/` is a
larger, multi-file scaffolded subsystem; `services/session/` is a small
resolution module, not a CRUD service — see its own README for why it
still follows the interface/mock/firestore split despite that).

## Root-level files (not in a subfolder)

- **`index.ts`** — the barrel file. Re-exports every real mock service
  under its clean public name (e.g. `mockUserService` → `userService`).
  Most of the app imports services from here, not from individual folders.
- **`types.ts`** — shared types used by every service interface in the
  app: `ServiceResult<T>` (the `{ ok: true, data } | { ok: false, error }`
  result shape every service method returns) and `ID`. **Extended (Aug
  2026)** with an optional `meta?: ServiceResultMeta` on the success
  branch (`hasMore`/`nextCursor`) for real, cursor-based pagination —
  currently used by `cases/ICaseService.ts`'s `getAll()`. Deliberately
  optional and additive: every existing caller across the app that
  destructures just `{ ok, data }` is completely unaffected; only a
  caller that explicitly opts in (`SearchPage.tsx`'s Load More) reads
  `result.meta`. Verified non-breaking directly (`tsc --noEmit` clean
  across the whole app) before building anything on top of it.
  **Real gotcha, confirmed directly (Sep 2026) while building the
  Protocol-Driven Workflow Infrastructure story**: with this project's
  own `tsconfig.json` (`strictNullChecks: false`), TypeScript does
  **not** narrow `ServiceResult<T>` on `if (!res.ok) { ...res.error }`
  or `if (res.ok) {...} else { ...res.error }` — `res.error` still
  type-errors as if `res` were the whole union. The real, already-
  established workaround elsewhere in this codebase (`services/hl7/
  processInboundWsiScanStatusUpdateEvent.ts`, `NewContainerModal.tsx`'s
  own `if ('error' in res)`) is the one that actually narrows:
  `if ('error' in res) { ...res.error }`, or `if (res.ok === false)`.
  Use one of those two forms — never bare `!res.ok` — anywhere the
  branch needs `res.error`.
- **`mockStorage.ts`** — thin typed `localStorage` wrapper used by nearly
  every mock service. Becomes unused once Firestore services replace the
  mocks.
- **`enhancementRequestService.ts`** — routes user-submitted enhancement
  requests (Email or Portal/webhook mode). Mock phase logs to console.
- **`phiSelectors.ts`** — central registry of DOM selectors marking PHI/PII
  elements, used by `useScreenCapture` to redact sensitive data before a
  screenshot is attached to an Enhancement Request or QA Feedback
  submission. **Tag new PHI-bearing UI with `data-phi="true"` — see this
  file's own header for how.**

**REMOVED (July 2026):** `synopticNotificationService.ts` (root-level) —
this was the item listed here as "STUB, deliberately... Logs to console
until a real backend exists." Deleted after being found to be a genuine,
active bug rather than an intentional stub: `hooks/useSynopticAudit.ts`
was importing from *this* file instead of the real, complete
implementation at `services/communications/synopticNotificationService.ts`
(recipient resolution, real email templates — correctly exported via its
own barrel, just never actually wired to the hook). Real protocol
lifecycle notifications (approve/reject/publish) were silently never
sent, with no visible error anywhere. Fixed the import, confirmed zero
other consumers of the root-level file, deleted it. Full detail in
`PRIORITY_FIXES.md` #15.

## Folder index

| Folder | What it is |
|---|---|
| [abnormalDetection/](./abnormalDetection/README.md) | **NEW (Sep 2026)** — PS-105/PS-129: real, admin-configurable discrete trigger-rule dictionary (synoptic field/value → Abnormal/Critical/Malignant severity) |
| [access/](./access/README.md) | **NEW (August 2026)** — real, tracked AccessRequest tickets (Pediatric, Pool, Orchestration) — replaces message-only requests with a real status lifecycle and quality-metric turnaround time |
| [accessioning/](./accessioning/README.md) | **NEW (Sep 2026)** — Structured Clinical History Dictionary spec's own User Story 5: real, accession-wide validation combining case + specimen clinical history, order-level `accessionStatus`, and the outbound `order.accessioned`/`order.deficiency.created` queue |
| [actionRegistry/](./actionRegistry/README.md) | Voice/shortcut action catalog |
| [ai/](./ai/README.md) | Core AI provider abstraction (Claude/GPT/Bedrock swap layer) |
| [aiBehavior/](./aiBehavior/README.md) | Admin AI behavior settings (confidence thresholds etc.) |
| [aiIntegration/](./aiIntegration/README.md) | Higher-level AI features: transcript refine, suggestions, spellcheck |
| [auditlog/](./auditlog/README.md) | System-wide audit log |
| [auth/](./auth/README.md) | Case access control + institution/session resolution (not login) |
| [batches/](./batches/README.md) | **NEW (August 2026)** — cassette/slide chain-of-custody through histology processing nodes via container barcode scanning, plus the real, computed pending-batch-load queue |
| [billing/](./billing/README.md) | **NEW (August 2026)** — real CPT-to-work-RVU mapping table and calculation, workload/productivity tracking only (not a billing system) |
| [biometric/](./biometric/README.md) | WebAuthn e-signature |
| [caseRegistry/](./caseRegistry/README.md) | **NEW (August 2026)** — real accession-number generation/masking per organisation, with real facility-timezone-aware `{YEAR}` and annual sequence reset |
| [cancerRegistry/](./cancerRegistry/README.md) | **NEW (Sep 2026)** — RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports gap (NAACCR, CPAC, COSD, INCa, ADT/GEKID, AIHW, NZCR, KCCR) for surgical pathology broadly — genuinely distinct from `cytology/`'s own screening-registry dispatch; found and fixed a real, previously-unconfirmed gap (no ICD-O-3 behavior-code capture existed anywhere) before this could be built honestly |
| [cases/](./cases/README.md) | **Central folder** — case data access, LIS/Orchestration routing, production migration plan |
| [cassetteColors/](./cassetteColors/README.md) | **NEW (August 2026)** — admin-manageable cassette color dictionary (White/Blue/Red/Pink/Green-Mesh/Yellow + custom), fallback policy lives per-color |
| [cassetteRouting/](./cassetteRouting/README.md) | **NEW (August 2026)** — admin-manageable rules resolving which cassette color an order routes to (protocol/priority/station/facility/case type) |
| [clientSLA/](./clientSLA/README.md) | Per-client SLA/TAT targets |
| [clients/](./clients/README.md) | Client (institution) dictionary |
| [clinical/](./clinical/README.md) | **NEW (Sep 2026)** — PS-105: negation-aware AI detection of critical/abnormal narrative findings at sign-out, plus the real, append-only record of how a pathologist actually communicated one |
| [clinicalHistory/](./clinicalHistory/README.md) | **NEW (Sep 2026)** — Structured Clinical History Dictionary spec's own User Stories 1–2: the real, admin-editable six-category history dictionary and its inbound accession-payload validation/ingestion |
| [codes/](./codes/README.md) | Terminology system CONFIG (which SNOMED/ICD variants are enabled) |
| [coldChain/](./coldChain/README.md) | **NEW (Sep 2026)** — RFP-APLIS-2026-GLOBAL Reference Laboratory Sensor & Cold-Chain Integration gap: real telemetry ingestion, excursion detection against an admin-editable threshold dictionary, and a real workflow hold on `batches/`'s own Batch entity |
| [communications/](./communications/README.md) | Email/notification transport |
| [containerTypes/](./containerTypes/README.md) | Specimen container-type dictionary |
| [cytology/](./cytology/README.md) | **NEW (Sep 2026)** — Phase 1 of the Cytology & Cervical Screening module: real, standard 2014 Bethesda System category dictionary (adequacy, general categorization, interpretation/result) |
| [deficiencies/](./deficiencies/README.md) | Specimen/requisition deficiency tracking |
| [delegationTypes/](./delegationTypes/README.md) | Case delegation type dictionary |
| [diagnosisCodes/](./diagnosisCodes/README.md) | Referring physician's order-time diagnosis code |
| [digitalPathology/](./digitalPathology/README.md) | **NEW (Sep 2026)** — shared computational-pathology/AI vendor integration (Paige, Ibex, PathAI, Proscia, Hologic) and WSI scan-batch infrastructure, relocated out of `cytology/` since surgical pathology needs it equally |
| [drafts/](./drafts/README.md) | **NEW (July 2026)** — local caching of in-progress unsaved work (Inactivity Timeout & Draft Recovery Phase 2) |
| [encounters/](./encounters/README.md) | **NEW (August 2026)** — Patient/Encounter Management Subsystem: real encounter tracking, sibling to `patients/`'s identifier crosswalk |
| [events/](./events/README.md) | **NEW (August 2026)** — real-time event distribution layer for critical patient state changes (Patient/Encounter Management Subsystem Phase 4) |
| [externalResources/](./externalResources/README.md) | **NEW (July 2026)** — admin-managed reference links (CAP protocols, WHO classification, lab systems), org-scoped with real per-viewer relevance filtering |
| [facilities/](./facilities/README.md) | **NEW (August 2026)** — canonical `Facility` entity, replaces the old `clients/` (`Client`) entirely |
| [flags/](./flags/README.md) | Case/specimen flag dictionary |
| [fonts/](./fonts/README.md) | Editor font dictionary |
| [governingBodies/](./governingBodies/README.md) | **NEW (August 2026)** — real persistence for the Governing Bodies list (CAP, RCPath, ICCR, RCPA, + custom) |
| [grossing/](./grossing/README.md) | Grossing template routing (types only, real logic in cases/) |
| [grossingRoutingOverrides/](./grossingRoutingOverrides/README.md) | Per-client grossing route exceptions |
| [grossingHardware/](./grossingHardware/README.md) | **NEW (Sep 2026)** — RFP-APLIS-2026-GLOBAL Story 9 (Grossing Station Hardware Integration): real camera capture via `getUserMedia()`, digital scale bridge architecture, confirmation that speech-to-text gross dictation was already built |
| [hardware/](./hardware/README.md) | **NEW (August 2026)** — `ModeAInterfaceService`: dispatches hardware/LIS orders through the existing HL7 seam |
| [hardwareContainers/](./hardwareContainers/README.md) | **NEW (August 2026)** — check-in/check-out registry for semi-permanent, laser-engraved reusable racks/baskets |
| [hl7/](./hl7/README.md) | Standard HL7 ORM^O01 builder — deliberate pre-integration scaffolding |
| [interfaceEngine/](./interfaceEngine/README.md) | **NEW (August 2026)** — real Category E (Order Creation) dispatch for the JSON/REST interface spec; mock-backed, no real backend/transport yet |
| [interfaceExceptions/](./interfaceExceptions/README.md) | **NEW (August 2026)** — real holding queue for inbound ADT/patient-management messages that can't be safely auto-processed (unresolved identity, missing MRG-5) |
| [internalNotes/](./internalNotes/README.md) | Lab-internal case notes + management reviews |
| [intraop/](./intraop/README.md) | Intraoperative Pre-Check queue |
| [intraopDashboard/](./intraopDashboard/README.md) | **NEW (Sep 2026)** — RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section Dashboard: Location-First "Station Identity" terminal binding, quick-auth PIN, real live-timer/stat-threshold logic, and the real-time OR-facing view over `intraop/`'s own existing data |
| [labelDesigner/](./labelDesigner/README.md) | **NEW (Sep 2026)** — real, drag-and-drop label layout designer spanning nine label types, with Enterprise/facility hierarchy and per-group lockdown |
| [lisSync/](./lisSync/README.md) | Narrow mock for one UI sync-freshness indicator |
| [locations/](./locations/README.md) | **NEW (August 2026)** — real Location dictionary (wards/rooms/beds, facility-scoped), for HL7 PV1 |
| [macros/](./macros/README.md) | Text-expansion macro dictionary |
| [messages/](./messages/README.md) | Internal staff messaging |
| [migration/](./migration/README.md) | **NEW (Sep 2026)** — RFP-APLIS-2026-GLOBAL Historical Data Migration Engine: real field-mapping pipeline, MPI dedup reuse, and cross-validation reporting for legacy LIS import — deliberately not the full Case-creation transform, confirmed to be a genuine backend-heavy piece |
| [mockInterfaceEngine/](./mockInterfaceEngine/README.md) | **NEW (Sep 2026)** — dev/demo-only MSW mock for PS-239's own real, not-yet-built backend endpoint, double-gated (dev-only build + explicit opt-in) |
| [models/](./models/README.md) | AI model registry |
| [molecular/](./molecular/README.md) | **NEW (Sep 2026)** — the Full Molecular Testing Execution Module, 21 real phases (see this folder's own README for the full account) |
| [molecularOrders/](./molecularOrders/README.md) | **NEW (Sep 2026)** — Protocol-Driven Workflow Infrastructure story Part 2b: outbound queue for real assay orders (`order.molecular`) and instrument orders (`order.instrument`), fed by an accession trigger, an HPV-positive reflex trigger, and a cytology batch-creation trigger |
| [narrativeSignals/](./narrativeSignals/README.md) | AI-vs-pathologist edit-diff capture + PHI de-identification |
| [orderIntake/](./orderIntake/README.md) | Pending-orders queue + Client/Department resolution |
| [organisation/](./organisation/README.md) | Organization/Site/Lab hierarchy (Enterprise + participating hospitals) |
| [patients/](./patients/README.md) | **NEW (July 2026)** — real Master Patient Index (MPI), org-scoped identity resolution with a genuine ambiguous-match review workflow |
| [participationTypes/](./participationTypes/README.md) | Case Team role dictionary |
| [performanceTargets/](./performanceTargets/README.md) | Admin productivity targets |
| [physicians/](./physicians/README.md) | Physician directory |
| [priority/](./priority/README.md) | Display metadata for the 3 fixed priority tiers |
| [printerProfiles/](./printerProfiles/README.md) | **NEW (August 2026)** — real printer capability registry (ZPL/DPI/DataMatrix size) for correct label template selection |
| [printSettings/](./printSettings/README.md) | **NEW (August 2026)** — real, admin-configurable, lab-wide default label-printing behavior (on-demand vs. batch, guardrails, scan verification, container label size) — Tier 1 only, per direct follow-up on the hierarchical print-settings architecture |
| [protocols/](./protocols/README.md) | Standalone processing-protocol dictionary |
| [quality/](./quality/README.md) | Discordance tracking (Frozen-to-Permanent gate) |
| [qualityAssurance/](./qualityAssurance/README.md) | **NEW (Sep 2026)** — real `QaScope` (referring-source dimension) plus the RFP-APLIS-2026-GLOBAL Enterprise BI Rollup gap's own `resolveJurisdictionRollup` (performing-lab jurisdiction dimension) — local-aggregate-first, enterprise-wide-rollup-second data-residency logic |
| [referenceCheck/](./referenceCheck/README.md) | **NEW (August 2026)** — checks whether a foundational config entity (Client, Subspecialty, Department) is still referenced before deactivation |
| [referral/](./referral/README.md) | **NEW (Sep 2026)** — RFP-APLIS-2026-GLOBAL Inter-Laboratory Specimen Referral gap: outbound manifest + inbound result/transit-status tracking, built as a real, additive layer on `batches/`'s own manifest architecture and `facilities/`'s own multi-role Facility, not a new, parallel entity for either |
| [reportParts/](./reportParts/README.md) | Atomic report-building-block library |
| [reportRelease/](./reportRelease/README.md) | **NEW (August 2026)** — Post-Sign-Out Release Buffer: a real, configurable hold window between sign-out and genuine external release, with recall |
| [reportTemplates/](./reportTemplates/README.md) | Report template assembly + routing resolution chain |
| [reports/](./reports/README.md) | **Active work (2026)** — amendment/versioning system |
| [research/](./research/README.md) | **NEW (August 2026)** — external PubMed literature feed for the dashboard ticker (live NCBI eUtils, no firestore stub — see its README) |
| [retentionPolicy/](./retentionPolicy/README.md) | **NEW (August 2026)** — retention-eligibility resolution + computed disposal/pending-hold queues + real scan-to-dispose action |
| [roles/](./roles/README.md) | Staff role/permission dictionary |
| [routingRules/](./routingRules/README.md) | Admin template routing rule overrides |
| [savedSearches/](./savedSearches/README.md) | Saved search/filter presets |
| [scanStations/](./scanStations/README.md) | **NEW (August 2026)** — registry of physical scan/work stations (where a tech scans at the bench), facility-scoped |
| [session/](./session/README.md) | **NEW (July 2026)** — idle-session-timeout resolution (org default + per-performing-lab override) + same-browser session-supersede detection |
| [departments/](./departments/README.md) | Coarse-grained specimen classification |
| [specimenDictionary/](./specimenDictionary/README.md) | Fine-grained Specimen Dictionary (SpecimenEntry) — the real backend |
| [stains/](./stains/README.md) | Stain catalog (3 sub-concepts: type/sectioning/order macro) |
| [subspecialties/](./subspecialties/README.md) | Subspecialty/pool/workgroup dictionary |
| [systemConfig/](./systemConfig/README.md) | Lab-wide system configuration |
| [templateSuggestions/](./templateSuggestions/README.md) | AI-driven synoptic template suggestion (split from templates/ 2026) |
| [templates/](./templates/README.md) | Synoptic template library management |
| [terminologySearch/](./terminologySearch/README.md) | Live REST API terminology search (SNOMED/ICD/LOINC/CPT) |
| [users/](./users/README.md) | Staff user directory |
| [validationStudies/](./validationStudies/README.md) | Validation Study governance workflow |
| [voicemacro/](./voicemacro/README.md) | Voice-triggered macro dictionary |

## Known issues (as of this review — see PRIORITY_FIXES.md in project root)

- `services/stains/firestoreStainService.ts`'s auto-generated stub comment
  names only one of its three real mocks as "the active implementation" —
  should name all three. Cosmetic, not yet fixed.
- `services/aiBehavior/IAIBehaviorService.ts`'s own header comment has a
  stale file path. Cosmetic, not yet fixed.

**RESOLVED, removed from this list (July 2026):**
- ~~`src/templates/mockDcisTemplate.ts` needs relocating~~ — resolved by
  elimination, not relocation. Deleted as fully dead once
  `TemplateRenderer.tsx` was rewritten (see next item) — it was typed
  against a schema (`types/templateTypes.ts`) that no longer exists.
  `src/templates/` is now an empty folder. See `PRIORITY_FIXES.md` #3.
- ~~`TemplateRenderer.tsx` ignores `templateId`~~ — fixed. Rewritten to
  consume `templateService.ts`'s real `getTemplate()`/`EditorTemplate`
  directly; 19 real seeded templates now display correctly. See
  `PRIORITY_FIXES.md` #2.
- ~~stale header path comments~~ (5 files: `aiIntegration/PathScribeAIService.ts`,
  `cases/casePoolAssignmentService.ts`, `templates/templateService.ts`,
  `templateSuggestions/{ISynopticTemplateSuggestionService,ITemplateSuggestionSignalService}.ts`) —
  all confirmed benign (matching the documented renames below) and fixed.
  Found via `scripts/check-organization.cjs`, which now reports zero
  findings across `pages/`, `services/`, `hooks/`, and `contexts/`. See
  `PRIORITY_FIXES.md` #16.

## Renames executed July 2026 (for anyone using old references/bookmarks)

- `services/aiIntegration/GeminiAIIntegrationService.ts` → `PathScribeAIService.ts`
- `services/voicemacro/mockVoiceService.ts` → `mockVoiceMacroService.ts`
- `services/cases/caseRoutingService.ts` → `casePoolAssignmentService.ts`
- `services/cases/firestoreCaseService.ts` → `FirestoreCaseService.ts` (casing fix)
- `services/templates/{ISynopticTemplateSuggestionService,ITemplateSuggestionSignalService,mockTemplateSuggestionSignalService,synopticTemplateSuggestionService}.ts` → moved to new `services/templateSuggestions/`
- `pages/Synoptic/Codes/codeSearchService.ts` → `services/terminologySearch/codeSearchService.ts`
- `services/internalNotes/{ICaseNoteService,firestoreCaseNoteService}.ts` — deleted (dead legacy lineage, superseded by `IInternalNoteService`/`mockInternalNoteService`)

## New folders added July 2026

- **`session/`** — built for the Inactivity Timeout & Draft Recovery
  feature (`PRIORITY_FIXES.md` #13), Phase 1. Worth its own callout: the
  first version of this folder was a single, non-conforming file with
  bare exported functions instead of a proper service object — caught
  and restructured into the standard interface/mock/firestore-stub
  pattern before it became a second precedent for future folders to copy
  incorrectly. See its own README for the full correction.
- **`drafts/`** — built for the same feature's Phase 2. Followed the
  standard pattern correctly from the start (learned from `session/`'s
  correction above).

## New folders added August 2026

- **`billing/`** — real, minimal CPT-to-work-RVU mapping and calculation
  infrastructure, built because `ProductivityTab.tsx`'s and
  `ContributionDashboardPage.tsx`'s RVU tiles had both been entirely
  hardcoded with nothing real to compute from. Not the interface/mock/
  firestore pattern — a pure static reference table plus pure
  calculation functions, no service, nothing to mock. See its own
  README for real, important scope limits (not a billing system; a
  small curated code subset with values verified against current CMS
  data, not the full CPT file; its rule-based CPT default is honestly
  not physician-entered coding and must never be presented as
  billing-ready).
- **`research/`** — external peer-reviewed literature feed powering the
  PubMed ticker on the Home dashboard, replacing a static line of marketing
  copy ("The AI models are updated and synchronized with the latest CAP
  protocols"). Deviates from interface/mock/firestore: the real backend is
  NCBI and external, so a Firestore stub would be misleading rather than
  forward-looking — interface and mock only. See its own README for the two
  things that matter beyond the code: the feed is **uncurated** (`sort=pub_date`,
  `retmax=1`, no quality filter or retraction check, behind a badge reading
  "Latest Research"), and the 24-hour `localStorage` cache **does not survive
  non-persistent VDI**, where the profile is discarded at logoff — so the
  rate-limit protection it was built for silently does not apply in exactly
  the estates it was designed for.

## New folders added September 2026

- **`cytology/`** — Phase 1 of the real Cytology & Cervical Screening
  module (a genuinely new, real requirements doc, distinct from the
  existing surgical-pathology-oriented PS-105 abnormal-detection work).
  Real, per direct guidance: any configuration for this module lives as
  a new subtab under System — same interface/mock pattern as every
  other admin dictionary, not a new, separate configuration surface.
  This phase covers only the real, standard 2014 Bethesda System
  category vocabulary (specimen adequacy, general categorization,
  interpretation/result) — verified against IARC's own published
  Bethesda reference before building the seed data, not improvised.
  Later phases (the cytologist-specific worklist, workload/QC tracking,
  HPV integration, multi-region compliance, patient follow-up,
  Cyto-Histo correlation) are real, separate, sequenced work — not
  built here.

- **`molecular/`** — the real Full Molecular Testing Execution Module
  (a genuinely new, real requirements doc — HPV/CT-NG/respiratory PCR
  and NGS workflows), spanning 19 real phases: foundational entities
  and real barcode/UUID generation matching every format the given
  specification names; the plate/well layout UI with real scan-to-well
  and drag-fallback auto-population; bidirectional JSON payload
  processing; real hardware-bridge printing (the same real QZ Tray path
  cassette/slide labels already use); a mathematically-verified
  multi-zone requisition ZPL layout (later found to have real bugs a
  visual check — not math alone — caught, see `README.md`'s own Phase
  11-18 account); the real audit trail (lifecycle tracking + backwards
  traceability); scan-to-verify dispatch gating; the extraction-rack
  workflow step; a full, direct spec re-read that closed four real
  gaps (aliquot volume capture, control lot validation, Dynamic Control
  Rules, Position Enforcements) plus real, expanded ANSI/SLAS plate
  format support (6/12/48/1536-well, strip formats) and a real, latent
  row-labeling bug that surfaced; real commercial Positive/Negative
  Control lot tracking, per direct CLIA/CAP guidance; and finally the
  real interface-engine HTTP client itself
  (`dispatchMolecularWorklist.ts`), built against the architecture
  settled in the real Interface Engine Integration epic (PS-239,
  tracked in Jira, not a file in this repo). See this folder's own
  `README.md` for the full, phase-by-phase account —
  it is long, and deliberately so, since several real bugs were only
  found by directly re-reading the given specification or by a real,
  human visual check this environment cannot perform itself.

- **`labelDesigner/`** — a real, drag-and-drop label layout designer
  spanning nine real label types (requisition, specimen, block, slide,
  decant, and four molecular asset labels), per direct follow-up.
  Real, deliberate architectural decision, confirmed by directly
  reading `components/TemplateBuilder/`'s own real code first: that
  system's report-oriented `TemplateNode`/`BaseNode` is built around a
  12-column *flowing* grid, genuinely wrong for a label's own fixed,
  physical x/y layout — a new, parallel data model was built instead,
  while genuinely reusing the same real UI pattern (palette → canvas →
  inspector) and the same real native-HTML5 drag-and-drop mechanic.
  Real Enterprise/facility hierarchy, mirroring
  `FacilityInterfaceEngineConnection`/`FacilityLisRouting`'s own
  already-established pattern exactly: every label type has a real
  Enterprise-level default; only the "Specimen & Processing" group
  (requisition/specimen/decant) allows a real, per-facility override,
  per direct guidance's own explicit configuration-strategy table —
  "Histology Assets" (block/slide) and every "Molecular Asset" type are
  deliberately locked to the Enterprise default, genuinely enforced in
  the service layer (a facility-scoped save attempt is refused
  outright), since hardware compatibility (cassette/slide printers,
  automated stainers, slide scanners, liquid handlers) depends on every
  real facility producing an identical physical format. **Real, honest
  limit, stated plainly**: does not yet touch actual print output for
  any label type — see this folder's own `README.md` for the full,
  named list of every real print entry point this would need wiring
  into, and every other real, explicitly-deferred idea (dynamic,
  parametric field visibility; a centralized, version-controlled
  template store; a printer-agnostic ZPL/EPL/DPL abstraction layer).
  **Real, direct correction**: first surfaced as its own home-page
  tile/route; per direct follow-up ("Label Designer isn't a tile, its
  a tab in configuration"), moved to a real tab under
  `components/Config/System/` instead — see that folder's own
  `README.md` for the account of that move, including a flagged,
  not-yet-reconciled inline-CSS convention mismatch found in the same
  pass.

- **`clinicalHistory/`** and **`accessioning/`** — the Structured
  Clinical History Dictionary & Accessioning Integration specification
  (five user stories): a real, admin-editable six-category history
  dictionary (`clinicalHistory/`), and the real, accession-wide
  validation/deficiency/outbound-event logic built on top of it
  (`accessioning/`). Deliberately shared, app-wide homes, not
  `cytology/` — the spec's own PRIOR_PATH example and its own
  "Accessioning Integration" title both confirm this is captured for
  any specimen type. See `cytology/README.md`'s own Phase 76 for the
  full build narrative, including a genuine mid-build data-model
  correction (case-level history stays the real, primary default;
  additive, specimen-level history was added for genuinely
  multi-specimen cases) and the real, explicit scope boundary this
  phase drew (an "inherited" combined view during actual cytotech/
  pathologist review is separate, later work).

- **`digitalPathology/`** — shared computational-pathology/AI vendor
  integration (a real, admin-editable dictionary seeded with five
  real, named, FDA-cleared products — Paige Prostate, Ibex Prostate
  Detect, PathAI AISight Dx, Proscia Concentriq AP-Dx, Hologic Genius
  Digital Diagnostics), the canonical `AiScreeningResult` schema, and
  a real CAPA-design decision applied throughout: a genuine
  "discordant" human judgment raises an `open` `SpecimenDeficiency` —
  never auto-CAPA, always a human decision from there. Also the new
  home for `IWsiScanBatchService.ts`, relocated out of `cytology/`
  since whole-slide scanning is domain-agnostic — surgical pathology
  needs it equally, not just cytology.

- **`referral/`** — the RFP-APLIS-2026-GLOBAL Inter-Laboratory
  Specimen Referral gap, closed by direct instruction to "review the
  Batch operations as this is the logical place to host this
  functionality. Reuse existing configurations if possible." Real,
  additive layer on two already-existing pieces rather than new,
  parallel ones: a seventh `BatchProcessingNode`
  (`'External Referral'`, `batches/`) reuses that folder's own real
  scan/manifest/reconciliation architecture for an outgoing referral
  shipment; a new `reference_lab` `FacilityRole` (`facilities/`) makes
  an external lab a real, selectable destination. Dispatch is
  automatic — completing a real referral batch (either real
  completion path) enqueues the manifest and creates the tracking
  record on its own, no separate manual trigger. **A real,
  pre-existing gap found and fixed along the way**: two separate,
  parallel Facility-editing modals
  (`components/FacilityDictionary/FacilityEditorModal.tsx` and
  `components/ClientDictionary/ClientEditorModal.tsx`) each maintain
  their own, hand-written `FacilityRole[]` order array, neither
  derived from the real `FacilityRole` type — both had to be updated
  by hand for the new role, and neither the compiler nor anything
  else would have caught only one being updated. See `facilities/README.md`'s
  own note for the full account; not fixed structurally here, since
  that's a real, separate refactor of its own.

- **`coldChain/`** — the RFP-APLIS-2026-GLOBAL Reference Laboratory
  Sensor & Cold-Chain Integration gap. A real, admin-editable
  temperature-threshold dictionary, seeded directly from the RFP's
  own two stated examples (Frozen Tissue: max -20°C; Fresh Tissue:
  max 8°C) rather than invented values; a genuinely new `StorageUnit`
  entity for fixed equipment (freezers/refrigerators — confirmed
  nothing like it existed before); and a real, pure excursion-
  detection function reused by the real inbound processor. Real,
  additive extensions to two existing folders rather than new,
  parallel entities: `hardwareContainers/`'s own `HardwareContainer`
  gained smart-container fields (and a previously-missing `update()`
  method, found and fixed while wiring this in), and `batches/`'s own
  `Batch` gained a `coldChainExcursion` hold, gated into
  `completeReconciliation()` the same real way missing/unexpected
  items already are. **Real, honest scope**: a workflow hold and a
  case-scoped CAPA deficiency both require a real, active batch to
  attach to — a `StorageUnit` excursion, or a smart container with no
  active batch, is a real, genuine equipment-level issue surfaced
  only via the reading's own flag, never a fabricated case
  association.

- **`intraopDashboard/`** — the RFP-APLIS-2026-GLOBAL Intraoperative/
  Frozen Section Dashboard, built against a direct, detailed design
  brief for Location-First terminal authentication with quick-switch
  user attribution ("badge tap or PIN"). Genuinely separate from
  `intraop/` (bench-side pre-check capture) — this is the real-time,
  OR-facing view over that same, existing data. A real "Station
  Identity" terminal (`OrSuiteTerminal`) bound to one specific,
  already-facility-scoped `Location` — a customer with many
  institutions each having their own "OR 1" was already structurally
  safe before this folder existed. Live per-specimen timers mirror
  `batches/DecalBatch.ts`'s own proven client-side-tick-against-an-
  absolute-timestamp pattern exactly, for the same real resilience
  reason (a dropped connection never freezes a STAT clock). **Two
  real, direct corrections made along the way**: the dashboard page
  was initially wired inside this app's normal authenticated route
  wrapper, which would have defeated the entire point of a kiosk
  display that must never hit a session timeout — caught and moved to
  a genuinely public route before shipping; and a **third**,
  previously-unknown, locally-redeclared `StaffUser` type was found
  inside `components/Config/Staff/StaffTab.tsx` (on top of the two
  already known — see `referral/`'s own entry above for context on
  this app's `FacilityRole[]`-style duplication risk pattern) while
  wiring the new `quickAuthPin` field through. **Real, honest scope**:
  the actual real-time push channel is a real backend need, filed on
  the Backend Needs Log; and the RFP's own fourth sub-requirement for
  this gap, automatic frozen/final correlation flagging, is
  confirmed genuinely manual today (a pathologist opens a
  reconciliation modal themselves) — not addressed here.

- **`migration/`** — the RFP-APLIS-2026-GLOBAL Historical Data
  Migration Engine gap, whose own Backend Needs Log entry is explicit
  that it is "fundamentally a backend-heavy story; the frontend piece
  is comparatively small." Real, working field-mapping pipeline
  (admin-editable, scoped per legacy source system), real reuse of
  this app's own, already-existing MPI dedup
  (`services/patients/resolveOrCreatePatient()`) — confirmed directly
  that a genuine ambiguous match found during migration lands in the
  exact same review queue a live accession's own ambiguous match
  would, no new review surface needed — and real, pure cross-
  validation reporting against a source system's own claimed record
  count. **Real, honest scope boundary, confirmed before building
  further**: `caseService.createCase()` requires a full, complete
  `Case` object with real specimen/block/slide structure a flat
  legacy record's minimal fields cannot honestly populate — building
  that transform is itself the real, substantial backend-heavy piece
  this gap's own Backend Needs Log already names, not something
  faked here. This pipeline's own real scope stops at mapping,
  validation, and MPI resolution.

- **`cancerRegistry/`** — the RFP-APLIS-2026-GLOBAL Broader Cancer
  Registry Exports gap (NAACCR, CPAC, COSD, INCa, ADT/GEKID, AIHW, NZ
  Cancer Registry, KCCR), for surgical pathology broadly. Before
  writing any code, `services/facilities/IRegistrySettingsService.ts`'s
  own header was found to already defer this exact work, pointing to
  a real, already-researched document
  (`src/FHIR_DISPATCH_ARCHITECTURE_PLAN.md`) with a critical finding:
  NAACCR explicitly excludes cervical carcinoma in situ/CIN III from
  reportability, and this dispatch must never be triggered from
  cytology sign-out — only from a real, confirmed surgical pathology
  diagnosis. That document also flagged a genuinely unconfirmed
  question: does this app capture an ICD-O-3 code's own real behavior
  digit (the /2 vs /3 that rule depends on)? **Confirmed directly: it
  did not** — `MedicalCode.system` had no `'ICD-O'` value, no
  `Specimen.coding` field existed for it, and `SynopticReportPage.tsx`'s
  own `handleAddCodesToSpecimens` was silently dropping any ICD-O-
  tagged code entirely. All three fixed as real, necessary
  prerequisites before any registry logic could be honest. The real
  dispatch trigger (`dispatchCancerRegistryReportIfApplicable.ts`) is
  wired into `useSignOutWorkflow.ts`'s real surgical pathology sign-out
  and nowhere else. **A second, real, honest gap — not fixed here**:
  there is still no way for a pathologist to actually *enter* an
  ICD-O code in this app (live search is a "coming soon" placeholder,
  same as ICD-11's neighboring one) — this module's own pipeline is
  real and fully tested against a `Case` with populated ICD-O data,
  but won't receive real data until that separate capture-path gap is
  closed. See `cancerRegistry/README.md` for the full account.

- **`qualityAssurance/`** — the RFP-APLIS-2026-GLOBAL Enterprise
  Business Intelligence Rollup Dashboard gap. The existing `QaScope`
  system (enterprise/organisation/client) describes the *referring*
  source, not the *performing lab* — the dimension this gap's own
  data-residency requirement actually depends on ("respecting local
  data-residency rules at the performing-lab tier while rolling up
  anonymized/aggregated metrics enterprise-wide"). Confirmed directly
  before building: the app already had every real building block —
  `Facility.jurisdiction`, a real `isEnterprise`/`parentId` enterprise
  hierarchy (seeded across US/GB_EW/GB_SCT), `resolveTenantFacility()`
  (resolves a case's `originHospitalId` to its real, jurisdiction-
  bearing Enterprise Facility), and `contributionDashboardCalculations.ts`'s
  own real `computeOrgWideTatPerformance`/`realWorkRvuForCase`/
  `wasAiAssisted` (newly exported for reuse, previously private to
  that file) — just not yet connected. `resolveJurisdictionRollup()`
  groups cases by performing-lab jurisdiction first, computes each
  jurisdiction's own aggregate numbers with those same, already-tested
  functions, and only ever combines the resulting AGGREGATE rows
  enterprise-wide — raw case data never itself crosses a jurisdiction
  boundary. New UI: `EnterpriseRollupTab.tsx`, a new, fifth QA pillar
  (didn't belong to Operations, Financials, CAPA, or Cytology, being
  genuinely cross-cutting), reusing this module's own established
  cross-tenant audit-logging and PHI-safe export conventions exactly.
  **Real, honest scope boundary**: real, tested local-aggregation
  logic built against this app's own single-instance data as a stand-
  in for true multi-facility federation — genuine, physically-separate
  per-facility data hosting across jurisdictions is real, separate
  backend work this app doesn't have, per the RFP's own note. See
  `qualityAssurance/README.md` for the full account.

- **`grossingHardware/`** — RFP-APLIS-2026-GLOBAL Story 9 (Grossing
  Station Hardware Integration). Confirmed directly before building:
  real speech-to-text gross dictation already existed (the same real
  `VoiceProvider.tsx` dictation mode used for micro/diagnosis), so
  only camera and scale integration were real, open gaps. Built a
  real hardware-profile service reusing the established
  `PrinterBridgeType` pattern (including its own real, named
  `pathscribe_agent` local-agent concept, PS-52), a real, working
  camera capture component using the browser's standard
  `getUserMedia()` (no bridge required — most grossing cameras are
  standard USB/UVC devices), and a real, tested HTTP contract for a
  future scale bridge, with an honest `stable`/`unstable` reading
  distinction. Camera capture is genuinely functional and wired into
  `BlockStainEditorModal.tsx`'s block cards; the scale path is real,
  tested architecture whose connection to an actual physical scale is
  unverifiable from this sandbox, per the RFP's own note. See
  `grossingHardware/README.md` for the full account.

- **Comment-field parity across material types** (Sep 2026, prompted
  directly): confirmed `Specimen.comments` existed but
  `HistologyBlock`, `StainOrder`, `Decant`, and `MatrixBlock` did not
  have a comparable field. First pass reused `CaseComment` (rich
  text/HTML, backed by the full TipTap-based `PathScribeEditor`)
  directly — a real, direct follow-up caught this as genuine overkill
  for a short, operational block/stain/decant-level note, and worse,
  a real bug: the actual composer was a plain `<input type="text">`,
  never routed through `PathScribeEditor`, yet rendered via
  `dangerouslySetInnerHTML` as if it had been — any HTML-significant
  character a user typed would have been interpreted as markup.
  Fixed with a new, dedicated `MaterialComment` type
  (`types/case/MaterialComment.ts`) — genuinely plain text, same real
  author/timestamp shape as `CaseComment`, never rendered via
  `dangerouslySetInnerHTML`. Added to all four material types
  (`types/case/Specimen.ts`, `types/case/Material.ts`,
  `types/case/MatrixBlock.ts`). Real, working UI in
  `BlockStainEditorModal.tsx` for block, decant, and stain comments,
  reusing that modal's own existing generic `onUpdateBlock`/
  `onUpdateDecant` patch callbacks rather than a new persistence path.
  `MatrixBlock`'s own comment UI was not wired in this pass — the
  data-model field is real and ready, matrix-block editing is a
  separate, not-yet-explored surface.

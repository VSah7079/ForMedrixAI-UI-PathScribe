# src/

The application root. Loose files that sit directly here, with no folder of their own — nearly every subfolder has its own `README.md` (see `pages/README.md`, `services/README.md`, `types/README.md`, `components/README.md`, `utils/README.md`, etc.; `mocks/`, `orchestrator/`, `protocols/`, and `styles/` don't have one yet). For setup and scripts see the repo-root [`README.md`](../README.md).

## Standing rules for every change

No inline CSS, no business logic in components, and full international support (every UI string via `t()`, every key in all five locales). The full rules and the pre-delivery checklist are in the repo-root [`CLAUDE.md`](../CLAUDE.md); the i18n reference is [`i18n/README.md`](./i18n/README.md). Three tests enforce them: `i18n/localeParity.test.ts` (every key, every locale, project-wide), `services/participationTypes/standingRules.guard.test.ts` (all three rules, for the signing-authority screens), and `services/duplication/duplicatePolicy.guard.test.ts` (the Duplicate policy, localized copy names project-wide, and no inline CSS in the admin screens it covers).

## Duplicate policy (Sep 2026, PS-73)

Which admin records can be duplicated, and what a copy keeps or clears, is decided in [`services/duplication/`](./services/duplication/README.md). The rule of thumb: complex configuration, templates and multi-site variants can be copied; real people, flat lookups and audit records can't. Copy names always come from `t('common.copyOfName')`.

## Recent batches

- **Batch 382 (Sep 2026, PS-359):** Field Requirements for the case report page's frozen-versus-final reconciliation and the two billing modals (post-sign-out reason, applied-code correction), each with a voice command. Correcting an applied billing code now needs its own capability, `billing:applied-code:correct`, given to every role that could before.
- **Batch 381 (Sep 2026, PS-359):** Field Requirements for the case report page's holds, comments, Delegate, biopsy arrays, and block cancellation and restains. Holds and delegation now need capabilities, given to every role that could use them before. The report page came off the deployment baselines.
- **Batch 380 (Sep 2026, PS-359):** Field Requirements reach the case report page: Add/Edit specimen, amendments and addenda, and critical findings, each with a voice save command. Fixed minor amendments and addenda that couldn't be saved from a new draft.
- **Batch 379 (Sep 2026, PS-359):** Grossing's protocol rule is required by default but switchable per organisation. Switched off, completing a specimen that has no protocol asks for confirmation and routes it for secondary review as an open QA deficiency.
- **Batch 378 (Sep 2026, PS-359):** Complete grossing. The Grossing screen can finish grossing, by button, voice or keyboard, once the organisation's Grossing field requirements are met. Cases move to Gross Complete, and it's audited.
- **Batch 376 (Sep 2026, PS-359):** Field Requirements. Each organisation chooses which fields a page requires before saving, and locked fields are always required. Accession is the first page.
- **Batch 375 (Sep 2026):** fewer Home tiles. The two peer-review queues are views in the Worklist, Add-On Orders is an action on a case's report page, and Batch Management is in the Pathology Workspace.
- **Batch 374 (Sep 2026):** the Home page shows only the tiles a user may open. Each screen is a capability that roles grant, and routes check it too. There are four new bench roles: Accessioner, Histotechnologist, Cytotechnologist and Molecular Technologist.
- **Batch 373 (Sep 2026):** every demo case belongs to an organisation. Hospital ids are linked to their organisations, and the international screening labs are organisations in their own right. Organisations with nobody to approve support access start at Always allowed in the demo.
- **Batch 372 (Sep 2026):** ForMedrixAI support access, controlled by each hospital.
  - **Policy per organisation:** Disabled, Approval required (default) or Always allowed, with an access window (default 2 hours).
  - **Just-in-time approval:** support requests access per ticket with a reason; the hospital's approvers get a message and approve or reject; access ends when the window runs out or either side ends it.
  - **The hospital's own support audit:** every request, decision, open, list, search and edit by support, hash-chained so changes show, exportable as CSV or JSON.
- **Batch 371 (Sep 2026):** Superadmin is reserved for ForMedrixAI support.
  - **Read-only for hospitals:** the role holds every capability and is read-only in a hospital's Role Dictionary.
  - **Platform-only capabilities** can't be put on a hospital role.
  - **Support access to other organisations' cases** is checked and audited.
  - **Demo sign-ins:** only ForMedrixAI people use Superadmin.
- **Batch 370 (Sep 2026, PS-356):** capabilities, phase 2.
  - **Closed a self-escalation gap:** anyone signed in could edit roles (their own capabilities included) and staff role assignments. That now needs `config:roles:manage`, `config:staff:edit` and `config:staff-access:assign`.
  - **Facility scope:** staff get a facility assignment that limits case actions and QA exports.
  - **Removed:** the role-level pediatric, orchestration and facility switches, which were never enforced.
  - **Demo reset:** the full reset needs a capability, and its logic moved to `services/demoReset/`.
- **Batch 369 (Sep 2026, PS-355):** capabilities. Access control is now enforced:
  - capabilities are checked by the service that does the work, audited with the granting role, and have no bypass;
  - they cover the change-history export and the 14 QA report exports;
  - the Role Dictionary has a grouped Capabilities tab with dependency prompts;
  - two new built-in roles, QA Reviewer and Superadmin.

  The old unenforced Permissions tab is now Commands. See `services/authorization/`.
- **Batch 368 (Sep 2026, PS-353):** report change log. Every case save is recorded: who, when, workstation, and every field changed old → new (`services/reportChangeLog/`). The report page has a Change history view with word-level diffs, and an audited CSV export (since Batch 369 it needs the capability `report:change-history:export`).
- **Batch 367 (Sep 2026, PS-74):** no inline CSS anywhere in the UI. The last ~120 inline styles moved into `pathscribe.css`, and colours built in JSX became `--ps-hue` + `color-mix()`. `services/styleRules/` checks the whole app with no exception list.
- **Batch 366 (Sep 2026, PS-68):** the unused `types/case/ReportSnapshot.ts` was removed; `ReportVersionRecord` is the one report release record.
- **Batch 365 (Sep 2026, PS-347):** Belgian French (fr-BE) regional variant (`i18n/`); Netherlands dates are DD-MM-YYYY; the order lookup writes and finds dates of birth in every jurisdiction's format (`utils/isoDateForSearch.ts`).
- **Batch 364 (Sep 2026, PS-349/PS-350):** support tickets no longer send the page address (it carried the case number); support references (`SR-7K2Q-9MXD`) stand in for case numbers, with a lookup for lab staff (`services/supportReferences/`).
- **Batch 363 (Sep 2026, PS-72):** every patient identifier the UI shows is tagged for redaction in support-ticket screenshots, and a structure-aware check (`services/phi/`) keeps it that way.
- **Batch 362 (Sep 2026):** Belgian Dutch (nl-BE) added as a regional variant of Dutch: Belgian wording where it differs, Dutch elsewhere, Belgian date formats (`i18n/`).
- **Batch 361 (Sep 2026):** a device with an open malfunction or past due is shown in red in the equipment register and the molecular batch instrument picker (flagged, not blocked).
- **Batch 360 (Sep 2026):** equipment maintenance and calibration records. Each device can have schedules and an append-only, audited service log; the register shows up-to-date, due-soon, overdue and open-malfunction status (`services/equipment/`).
- **Batch 359 (Sep 2026):** Printer Profiles and a new Grossing Hardware screen name their physical device from the equipment register; the register shows which settings point at each device.
- **Batch 358 (Sep 2026):** one equipment register for every device: identity, make, model, serial number, lab, station and status (`services/equipment/`, Configuration → System → Equipment). It replaced the Instruments list; molecular batches target its analysers. Workflow settings stay on their own screens.
- **Batch 357 (Sep 2026):** demo scan stations and instruments gain seed records added after a browser stored them (`services/mockSeedMerge.ts`), so the molecular bay appears without Demo Reset.
- **Batch 356 (Sep 2026):** PS-326: an instrument list (`services/instruments/`, Configuration → System → Instruments). Molecular batches pick their target instrument from it instead of typing it, and worklist dispatch checks the instrument's scan station.
- **Batch 355 (Sep 2026):** PS-346: deleted the orphaned informal-review banner (`pages/SynopticReportPage/components/InformalReviewBanner.tsx`), its CSS, its keys in all five languages, and the one rule only it used.
- **Batch 354 (Sep 2026):** Search's submitting-facility and performing-lab filters include every organisation under a chosen one, so a Trust finds its sites' cases (`services/facilities/facilityHierarchy.ts`, `services/caseSearch/`, `pages/SearchPage.tsx`).
- **Batch 353 (Sep 2026):** TAT targets and case delegations moved behind services the API server can own (`services/tatConfig/`, `services/delegations/`). Every screen and service that used them now goes through `tatTargetService` / `delegationService`, instead of the TAT screen's browser storage and the demo case service. Six files came off the deployment baselines. Contract: `docs/architecture/TAT_AND_DELEGATION_API.md`.
- **Batch 352 (Sep 2026):** facility records for the 11 ordering clients the Manchester, Midwest, Henry Ford and Desert Valley outreach demo cases pointed at, each linked to its performing lab, so Search by performing lab finds those cases (`services/facilities/`).
- **Batch 351 (Sep 2026):** Search section 3: the 15 new searchable kinds of case data: case type, sign-out/release date, pathologist role, revisions, holds, result flag, pending work, TAT, subspecialty, performing lab, location, intake, payer, CPT, autopsy (`services/caseSearch/`, `pages/SearchPage.tsx`).
- **Batch 350 (Sep 2026):** Search repaired, with results paged on the server (`services/caseSearch/`, `utils/search/`, `pages/SearchPage.tsx`). The broken filters work, export covers every match, saved searches use a service, and the page is off the deployment baseline. Contract: `docs/architecture/CASE_SEARCH_API.md`.
- **Batch 349 (Sep 2026):** quick UI fixes: PS-100 warning toasts stay until closed, PS-101 case search finds an MRN or other identifier on its own and searches all dates for one, PS-126 readable macro text and an administrators' "All" macro list grouped by type (`utils/toastPolicy.ts`, `utils/search/`, `services/macros/macroAccess.ts`).
- **Batch 348 (Sep 2026):** PS-67, one service result shape across the app: the AI services' older `{ success, data, error }` type (`types/serviceResult.ts`) is removed.
- **Batch 347 (Sep 2026):** PS-54, interface-engine print results reach the user over the live-update connection, with a manual Retry (`services/networkPrint/`); slide labels now print on that path.
- **Batch 346 (Sep 2026):** PS-52, a configurable agent port and an on-screen "queued / printing now" status line for agent print jobs (`components/Printing/`).
- **Batch 345 (Sep 2026):** each signature checked when it is saved, and stored (PS-60 follow-up).
  - **The check:** sign-out, countersign, finalize, cytology and autopsy signing all check the signer's confirmation, including the SSO sign-in token, before the signed change is written.
  - **The record:** a signature record keeps who signed, what it meant and how they were confirmed (`services/signatures/`).
  - **Staff → edit:** now lists a person's linked sign-in accounts, with Unlink.
- **Batch 344 (Sep 2026):** signer confirmation (PS-60 follow-up).
  - **What changed:** every signature now proves who is signing: the password again, or for SSO the hospital's sign-in page again.
  - **Where:** sign-out, countersign, finalize, cytology, autopsy PAD/FAD.
  - **Why:** before, the password fields were never checked.
  - **Lockout:** five failures lock signing for 15 minutes.
  - **Popup page:** `main.tsx` answers the sign-in popup's return page without starting the app.
- **Batch 343 (Sep 2026):** PS-60 single sign-on.
  - **SSO:** sign-in with the hospital's identity provider: OpenID Connect with PKCE, Entra ID first, Okta and others generically. No client secret is needed. Only provisioned, active staff get in.
  - **Password sign-in:** the demo accounts' plain-text passwords are gone from the code and the bundle (hashed, and left out of SSO-only builds).
  - **Specs:** the API server's part is specified in `docs/architecture/AUTHENTICATION_OIDC.md`.
- **Batch 342 (Sep 2026):** PS-262 live updates.
  - **What:** OR Suite Live Boards and the Intraop Queue update across devices through a SignalR hub on the ASP.NET Core API server (Pete's decision). The client reconnects forever, falls back to polling, and shows a connection badge.
  - **Without a hub:** same-browser windows still update instantly.
  - **Hub spec:** in `docs/architecture/`.
- **Batch 341 (Sep 2026):** PS-344 follow-up.
  - **React Router 7:** upgraded from 6.30.6 to 7.18.4, which closes the last React Router advisory. The app now imports from `react-router`; the `react-router-dom` package is gone.
  - **Node 24 LTS:** the project is standardised on it (`engines` 24.x, `.nvmrc`).
  - **Audit:** `npm audit` is down to 2 moderate findings, both in legacy Firebase tooling.
- **Batch 340 (Sep 2026):** PS-344 dependency security.
  - **Findings:** `npm audit` went from 54 (8 high, 46 moderate) to 4 moderate.
  - **Updates:** TipTap 3.23.4 → 3.31.3 (all editor packages), React Router 6.30.4 → 6.30.6, vitest 4.1.10 → 4.1.11 and js-yaml 4.3.2, plus a patched minimatch for typescript-eslint through `overrides`.
  - **Mitigated:** React Router 6's remaining open-redirect advisory is fixed only in React Router 7. PathScribe now guards the one navigation target that comes from stored data (`utils/safeInternalPath.ts`, used for message config links in `AppShell`).
- **Batch 339 (Sep 2026):** PS-342 dictionary build step for the licensed clinical vocabularies.
  - **What it does:** drop the SPECIALIST Lexicon, SNOMED CT editions and LOINC into `spellcheck-data/licensed/`, then run `npm run spellcheck:build`. The build derives word lists for every language: English dialects follow SNOMED's language reference sets, and translations come from the national editions and LOINC's linguistic variants. US/UK pairs become regional-variant rules. SNOMED/LOINC words also appear in suggestions.
  - **Tested:** end to end on synthetic sample files, and in the browser. Waiting on the licences (PS-343).
- **Batch 338 (Sep 2026):** PS-342 spell checking in the report screens.
  - **Where:** the report editor and every report text box (synoptic text fields, report modals, cytology notes, intraop quick gross and frozen diagnosis). Squiggles appear about 300 ms after typing stops, with no effect on typing speed; right-click for suggestions, Ignore, or Add to my / the facility dictionary.
  - **Language:** the case's own choice (a control in each report screen), else the assigned pathologist's preference (Staff → edit), else the ordering facility's default.
  - **Retired:** the AI spelling check on Accept.
  - **Fix:** suggestions are now ranked by closeness, so "specimin" offers "specimen" first.
  - **Clean-up:** `PathScribeEditor.tsx` has no inline CSS or browser storage left.
- **Batch 337 (Sep 2026):** PS-342, German spell checking added under the GPL (per Pete).
  - **How it ships:** the dictionary ships unmodified, as a separate file, with the full GPL texts and a source offer.
  - **Before release:** a lawyer's confirmation and a source-request contact are needed.
  - **Gap:** German has no medical word list yet.
- **Batch 336 (Sep 2026):** PS-342 spell-check engine.
  - **Engine:** real Hunspell (WebAssembly) in a Web Worker, checking through the personal → facility → regional check → medical → clinical → base tiers, with codes passed through. It checks 5,000 words in about 25 ms in the browser.
  - **Content:** a PathScribe pathology lexicon (English with US/UK pairs; a Korean seed list), and dictionaries for English (4 variants), French, Dutch and Korean.
  - **Personal and facility dictionaries:** facility words are audited.
  - **Fix:** a malformed CSS comment in `pathscribe.css` had been breaking `vite build`.
  - **Next:** the editors are wired up in Batch 338.
- **Batch 335 (Sep 2026):** PS-341 completed.
  - **Country Signing Rules:** a new System screen where a platform administrator edits each participation type's rules per country. It covers the local title, signing flags and regulatory basis, and whether a country-scoped role is offered. Every change is audited with a reason.
  - **Fix:** saved signing-rule changes now reach the sign-out check without a page reload.
- **Batch 334 (Sep 2026):** PS-89 screens.
  - **Code Import (Bulk):** a new System screen uploads a CSV, matches its columns, lists refused rows with reasons, and imports one job for a second person to approve. Every job is listed with rollback.
  - **Pending approvals:** an import job is approved or rejected as a whole.
  - **Audit:** every step is audited.
  - **Database:** the docs now record Microsoft SQL Server as the production database.
- **Batch 333 (Sep 2026):** PS-89, Generic Code Engine (rules and storage).
  - **Billing rules:** they carry a vocabulary and a country.
  - **Bulk imports:** each is one PENDING_APPROVAL job, decided as a whole under four-eyes, with rollback.
  - **Fix:** approving a future-dated rule no longer retires the current rule early.
- **Batch 332 (Sep 2026):** PS-327 completed for Cytology.
  - **Pathologist track:** per-lab and country signing authority now applies to Cytology's pathologist track. The cytotechnologist track's CLIA rules are unchanged.
  - **Translated:** Cytology's sign-out text and the Autopsy body-release banner.
- **Batch 331 (Sep 2026):** PS-327. Autopsy PAD/FAD signing now checks signing authority. Before this, anyone reaching the button could sign.
  - **All autopsies:** they use Surgical Pathology's per-lab and country rules, with the coroner jurisdiction choosing the country profile.
  - **Forensic cases:** these also need an active jurisdictional appointment. There's no admin override.
  - **Recording appointments:** the new Staff credentials editor records them.
- **Batch 330 (Sep 2026):** deployment-readiness guard.
  - **What it checks:** UI code may not import mock services, browser storage or Firebase directly.
  - **Existing files:** they are listed in a baseline that only shrinks. So the screens stay deployable to public or private cloud while the real backend is built.
  - **New helper:** `utils/uiPreferences.ts` for display preferences.
- **Batch 329 (Sep 2026):** PS-63.
  - **Drafting:** limited to Template Author, and Admin inherits it. The editor opens read-only otherwise.
  - **Built-in roles:** Template Author, Template Approver and Lab Director are built-in roles with fixed ids, so renaming them doesn't break the rules. Existing sites gain them automatically.
- **Batch 328 (Sep 2026):** PS-63, template review rules enforced.
  - **Approving and publishing:** limited to Template Approver / Lab Director / Admin, and never by the template's own authors unless the site allows it.
  - **Required Reviewers:** a site setting, 1 by default.
  - **SNOMED:** diagnostic templates need 80% SNOMED coverage to publish.
  - **Settings:** System → Template Review.
- **Batch 327 (Sep 2026):** HTTPS everywhere PathScribe makes a connection.
  - **Workstation agent:** it now connects over encrypted WebSocket only (`wss://`), with a certificate unique to each workstation.
  - **Report renderer and interface receiver:** production builds require `https://` URLs and refuse to fall back to `http://localhost`.
  - **Grossing scale:** its agent address must be `https://`.
  - The deployed app itself was already HTTPS-only: Vercel redirects HTTP and sends HSTS.
- **Batch 326 (Sep 2026):** PS-63.
  - **Admin Guide:** a section on building, reviewing and publishing synoptic templates (`components/Config/Protocols/README.md`), written from an end-to-end walkthrough in the app.
  - **Fix:** refreshing the template editor after the first save no longer creates a second copy.
  - **Found and left for a decision:** the "≥80% SNOMED before publishing" rule isn't enforced, and authors can publish their own templates.
- **Batch 325 (Sep 2026):** PS-52, PathScribe's side of the workstation PathScribe Agent (`utils/labels/pathscribeAgent/`).
  - **Discovery:** it tries ports 9100, 9101 and 9102 and trusts only a real agent handshake.
  - **Printing:** each print gets a job ID and waits for that job's own success or error.
  - **Contract:** the agent's developers build to the WebSocket contract in its README.
  - Printers set to Bridge Type **PathScribe Agent** now print through it; the agent program itself is still to be built.
- **Batch 323 (Sep 2026):**
  - **PS-87, LIS ingestion layer (Pete's design):** HL7 v2, JSON webhook and polling adapters feed one staging queue, and the Assist AI-draft worker reads only from it. Admin screen: **Assist LIS Ingestion**. See `services/lisIngestion/README.md`.
  - **PS-62, native dropdowns:** every native `<select>` shares one dark open-list style. See `components/Common/README.md`.
- **Batch 322 (Sep 2026):** PS-87, Assist-mode LIS polling. PathScribe polls the external LIS.
  - **Gross Complete:** the AI picks the synoptic templates and fills what the gross supports.
  - **Microscopic/Diagnosis Complete:** the AI completes the draft.
  - **Review:** every draft waits for pathologist review in the existing report editor.
  - Admin screen: System → Integrations → Assist LIS Polling. Details in `services/assistPolling/README.md`.
- **Batch 321 (Sep 2026):** Admin Guide material on how a site prints labels, and what a customer's IT must agree to before the PathScribe Agent is installed (PS-52). It is in `services/printerProfiles/README.md`; no code changed.
- **Batch 320 (Sep 2026):** PS-58. AI models are now a global ForMedrixAI catalog plus per-organisation adoption records (Pete's Option 2).
  - Status, default and case counts belong to each organisation.
  - The store's "Download" is now **Adopt**.
  - The old unscoped model list is migrated on first load.
  - `firestore.rules` covers `/modelCatalog` and `/organisations/{orgId}/adoptedModels`.
  - Details in `services/models/README.md`.
- **Batch 319 (Sep 2026):** PS-78. `pathscribe.css` lost 130 dead `ps-msg-*` rules (70 classes no source file uses, left over from a pasted earlier Messages UI spec), about 830 lines. A browser computed-style comparison of the live message drawer found no visual change. Full account in `docs/ARCHIVE.md`. The same batch also fixed a timeout in `pages/__tests__/ConfigurationPage.test.tsx`: the page was imported dynamically inside the first test, which timed out on a loaded machine and cascaded into six more failures.
- **Batch 318 (Sep 2026):**
  - **PS-137:** abnormal-detection agreement signals are tagged with the covering Validation Study.
  - **PS-86:** Audit Log → Interfaces → **Outbound Dispatches** shows each OrderCreated send and its outcome, and opens the exact JSON payload.
  - Details: `services/abnormalDetection/`, `services/interfaceEngine/`, `pages/README.md`, and the Batch 318 entry in `i18n/README.md`.

## Application entry & routing

- **`main.tsx`** — real React entry point, mounts `App` and imports the two root stylesheets. Batch 344: on `/auth/signing/<provider>` (the signature-confirmation popup) it only passes the identity provider's answer back to the opener and never starts the app.
- **`App.tsx`** — the route table (every `<Route path=...>` in the app), lazy-loaded page imports, `ToastContainer`.
- **`ProtectedRoute.tsx`** — auth gate: redirects unauthenticated users to `/login`, passing the page they wanted as `from` (Batch 343), and wires idle-timeout and session-supersede detection.
- **`MobileRestrictedRoute.tsx`** — real device-based route restriction for the Intraop Queue mobile/OR workflow (viewport width + `pointer:coarse`, not width alone, plus a `sessionStorage` override escape hatch — see `utils/deviceDetection.ts`'s own header for the full reasoning).

## Stylesheets

- **`pathscribe.css`** — the main, real stylesheet. Very large (20,000+ lines) — every `.ps-*` class family referenced throughout every component's own README lives here.

  **Real, found-and-fixed accessibility bug across the whole file, per direct report ("occasional text that is dark and pretty much impossible to read")**: systematically audited every plain `color:` declaration for real, computed low luminance (never assumed from a color's name — actually computed relative luminance for every match), then, for each dark match, checked its own real CSS rule block for a genuinely light background before deciding it was actually broken — a dark color is completely correct when its own rule also sets a light/bright background (e.g. dark text on a bright accent-colored button), and several real print-only rules (`@media print`, `#ps-copilot-print-area` and its own real print override for `.ps-copilot-report-diff-current`) are correctly dark-on-white, confirmed directly by tracing them into their real `@media print` block rather than assumed.

  **Root cause, confirmed with two directly-verified examples before fixing anything at scale**: `#0f172a`/`#1e293b` — this app's own darkest background-palette colors — were being used as *text* color in ~75 real places, almost certainly copy-pasted from rules originally written for a light-themed context and never updated for this dark theme. `.rp-shell` (the ReportPreviewPage window's own root container) set `background: #1a2332; color: #1a1a1a;` on the *same rule* — its own default text color was dark while its own background was also dark, so anything inside it without a more specific override was silently invisible. `.ps-orch-chev`/`.ps-orch-hint` sat right between a dozen correctly-light-colored sibling rules using `#1e293b` instead — and `.ps-orch-chev`'s own `:hover` state correctly used `#64748b`, meaning the chevron icon was genuinely invisible until hovered, exactly matching the "occasional" symptom reported.

  **60 real instances fixed**, each replaced by exact line number (never a blanket find/replace, since the same offending color values also appear correctly elsewhere in genuinely fine, bright-background contexts that were deliberately left untouched) — `#0f172a`/`#1a1a1a`/`#0d1117`/`#0b1120` (the darkest, "primary/heading" role in the original mistaken source) mapped to this app's own real primary light text color, `#e2e8f0`; `#1e293b`/`#1f2937`/`#333` (slightly lighter, "secondary/body" role) mapped to this app's own real secondary/muted light text color, `#94a3b8`. One real, selector-informed exception: `.ps-orch-synoptic-lock`'s own `#1e3a2f` (a dark, muted green — clearly intended as a status/badge indicator, per its own class name) mapped to `#34d399`, this app's own already-established success-green (`.ps-orch-badge--done`), rather than the generic primary/secondary mapping. Verified directly, not assumed: re-ran the same detection script afterward and confirmed zero remaining real matches; confirmed brace balance (6,375 open / 6,375 close) wasn't disturbed by the automated, line-targeted edits.

  **Real, deliberately NOT touched, and why**: ~15 instances of dark text on a genuinely bright button/badge background (e.g. `#0f172a` on `.ps-btn-pill`'s own `#0ea5e9` blue) — real, readable, intentional design, confirmed by computing the actual background luminance rather than assuming; the full `.ps-copilot-print-area`/`.ps-copilot-report-diff-current` print-only cluster, confirmed genuinely inside `@media print` by tracing brace depth back to the actual `@media print` line, not assumed from the selector name alone.

  **Real, per direct follow-up ("let's check for inline use too")**: the same systematic, luminance-based search run across every real `.tsx`/`.ts` file for inline `style={{...}}` color declarations. Most of the 30 initial matches turned out to be genuine false positives on closer inspection — standalone print/email/label HTML template strings that correctly render on white outside this app's own UI entirely (`ValidationStudiesSection.tsx`, `printLabels.ts`, `CopilotReportViewModal.tsx`, `enhancementEmailTemplates.ts`), light-background modals/dropdowns with `background: 'white'`/`'#fff'` on their own enclosing container (`SynopticEditor.tsx`, several `PathScribeEditor.tsx` popovers), and tab/filter-configuration objects where a `color:` field is decorative data, not CSS text color at all (`QualityAssurancePage.tsx`, `WorklistPage.tsx`). 5 real bugs confirmed and fixed, documented at each affected component's own README: `components/Editor/README.md` (the most significant one — a real, user-reachable bug where `PathScribeEditor.tsx`'s own dark-mode toggle correctly switched the toolbar chrome but left the actual report text hardcoded to the light theme's own color, found to be a real follow-up gap in an *earlier* theming fix to this same component), `components/Config/Protocols/README.md` (two lifecycle-stepper separator characters), `components/Config/Templates/README.md` (the same separator pattern, independently confirmed), and `components/ClientDictionary/README.md` (a save button, borderline-readable against its own teal background state, matching the exact pattern already fixed in `.ps-login-submit` above).

- **`index.css`** — base/reset styles loaded alongside `pathscribe.css`.
- **`login-brand.css`** — login-page-specific branding styles.
- **`research-ticker.css`** — styles for the PubMed literature feed ticker (`ps-litfeed-*` namespace).

## Type declarations

- **`vite-env.d.ts`** — standard Vite client type reference.
- **`global.d.ts`** — global `Window` interface augmentation (e.g. `window.find`).
- **`talisman.d.ts`** — type declaration for the untyped `talisman/phonetics/double-metaphone` module (used by patient-matching phonetic search).

## Real findings

**`NETFLIX_SETUP.md`, `ACCESS_CONTROL_PLAN.md`, `PRIORITY_FIXES.md`** — corrected Sep 2026: an earlier version of this note said none of these existed anywhere and the reason was "genuinely unclear". Both claims were wrong; `docs/ARCHIVE.md` records exactly what happened. `ACCESS_CONTROL_PLAN.md` moved to [`docs/architecture/`](../docs/architecture/ACCESS_CONTROL_PLAN.md) and still exists. `NETFLIX_SETUP.md` was retired as completed one-time setup. `PRIORITY_FIXES.md` was retired on 2026-08-19, when its open items became Jira PS-57 to PS-71, so the many `PRIORITY_FIXES.md #N` citations in folder READMEs are historical references, not broken links to a live file.

**`css-audit.cjs`** — confirmed real and present, distinct from (not identical to) `scripts/css-audit.js` — different line counts (134 vs. 146), so likely a diverged copy rather than a simple duplicate. Every other similar audit script in this codebase lives in `scripts/`, matching this file's own header comment ("Place anywhere in the project and run..."), which suggests it was designed to be portable and just never got moved. Worth a real decision on whether to consolidate with `scripts/css-audit.js` or confirm they've genuinely diverged for a real reason.

**`FHIR_DISPATCH_ARCHITECTURE_PLAN.md`** — a real, deliberate, forward-looking planning document (`Status: PLANNED, not built`), same spirit as the access-control planning once described above. Records the confirmed target architecture for standardizing external registry/EHR dispatch on FHIR JSON via a boundary adapter layer (cytology's own domain model stays untouched), and — critically — a real research finding made before any of it was built: cytology sign-out must never drive cancer-registry dispatch for cervical findings, at any severity, since national reportability standards (NAACCR/SEER) explicitly require histologic confirmation, not a cytology impression alone.

**`FRONTEND_AS_SPEC_CAVEATS.md`** — real, per direct guidance: "the team is using the front end to help them define the backend." Consolidates every place in this codebase where the mock/demo implementation contains a deliberate simplification, an honest documented gap, or a client-side-only mechanism that would produce a wrong or dangerously incomplete real backend if read as literal spec. Leads with the most severe finding by far: `getSessionUser()` reads role and permissions directly from unauthenticated, client-editable `localStorage` — every authorization rule built on top of it is real, careful logic worth porting, but the trust boundary itself must never be. Also covers: four real national-ID gaps (MRN standing in for KCCR/PPSN/Health+Care Number/Medicare) that would get real registry submissions rejected if not fixed before going live; the workload-cap report's Enterprise-only simplification versus the real three-tier cascade already enforced elsewhere; the Cancer Registry/cytology boundary rule that currently exists only as prose in `FHIR_DISPATCH_ARCHITECTURE_PLAN.md`, not as any enforced type constraint; and the QA report aggregation logic being a reference for correct *behavior*, not code meant to be ported line-for-line into a real, server-side query.

---
*Subfolder READMEs: [pages/](./pages/README.md) · [services/](./services/README.md) · [types/](./types/README.md) · [components/](./components/README.md) · [utils/](./utils/README.md) · [hooks/](./hooks/README.md) · [contexts/](./contexts/README.md) · [data/](./data/README.md) · [i18n/](./i18n/README.md) · [api/](./api/README.md) · [audit/](./audit/README.md) · [loaders/](./loaders/README.md) · [firebase/](./firebase/README.md) · [theme/](./theme/README.md) · [constants/](./constants/README.md) · [mock/](./mock/README.md). No README yet: `mocks/`, `orchestrator/` (previously linked here, but the file doesn't exist), `protocols/`, `styles/`.*

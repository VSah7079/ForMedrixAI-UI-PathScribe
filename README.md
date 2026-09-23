# src/i18n/

Real, per the RFP-APLIS-2026-GLOBAL Multi-Language UI & Localization
Framework gap: "A real i18n framework for the application UI itself —
not to be confused with the existing per-dictionary translated *data*
(e.g. SFCC's French labels), which does not make the surrounding UI
translatable." The five real languages the RFP itself names are
wired in: English, French, German, Dutch, Korean.

## What already existed before this gap, confirmed directly

Two of the three "localized formats" this gap asks for were already
real and mature in this app — genuinely different systems from the
UI-translation framework below, and not touched by this work:

- **Date/time formats**: `JURISDICTION_LOCALE` in
  `types/systemConfig.ts` — real, jurisdiction-aware formatting
  (including Korea's own KS X ISO 8601 standard and Germany's own
  distinct dot-separated DIN convention).
- **National-ID formats**: `IDENTIFIER_FORMAT_LIBRARY`, same file —
  real, researched regex patterns per jurisdiction (e.g. France's
  INS/NIR, with its own real check-digit structure).

**Address formats** were the one genuine gap among the three — no
`Address` type or formatting utility existed anywhere. Built here:
`utils/formatAddress.ts`, covering the real, structural line-ordering
differences per jurisdiction (US/CA's comma-separated "city, region
postalCode"; the continental-European "postalCode city" convention
shared by FR/DE/NL; and Korea's own genuine structural outlier —
most-general-to-most-specific, postal code first, the reverse of
every other jurisdiction here).

## The real, working framework

- **`config.ts`** — real `i18next`/`react-i18next` setup (the
  standard, most widely-used real library for a React app, not a
  bespoke mechanism). Real language detection + `localStorage`
  persistence, matching this app's own established preference-
  persistence convention elsewhere.
- **`locales/{en,fr,de,nl,ko}.json`** — the real translation files.
- **`components/NavBar/LanguageSwitcher.tsx`** — the real, working
  switcher, wired into the main nav bar.

## Real, honest scope — and the rule that closes the gap over time

PathScribe has thousands of user-facing strings across dozens of
large pages (`SynopticReportPage.tsx` alone is 5,000+ lines).
Translating all of them in one pass is a real, substantial content
effort — not something this framework build claims to have done. The
locale files above cover a real, representative core (common actions,
navigation, the login page) sufficient to prove the framework
genuinely works end to end — selecting a language in the switcher
immediately re-renders every string that has been wired to it.

**Real, per direct instruction — the standing rule for all future
work, not a one-time cleanup**:

1. **Any new page or modal must not ship with hardcoded, user-facing
   strings.** Every real, visible string in new UI goes through
   `useTranslation()`/`t()` from the start, with a real key added to
   every one of the five locale files above — never just `en.json`
   with the others left to catch up later.
2. **Updating an existing page or modal means converting its own
   real, visible strings to this same framework as part of that
   change** — not a separate, deferred pass. A change that touches a
   page's own UI text is the real, natural point to convert it; this
   is how the app's translation coverage actually grows over time,
   the same way `LoginPage.tsx` and `NavBar.tsx`'s own "Log out"
   control were converted here, in the same pass that added the
   language switcher next to them.

This makes translation coverage a real, ongoing property of normal
development, not a backlog item that never gets prioritized against
new features — per direct instruction while scoping this gap.

## Second real conversion: Batch Management (Sep 2026)

Per the standing rule above — touched while adding the three cytology
`BatchProcessingNode` values (`services/batches/`, the Protocol-Driven
Workflow Infrastructure story's Part 2a). `BatchManagementPage.tsx`
and `NewContainerModal.tsx` were the first substantial, real feature
pages (not just the login/nav shell) to get converted — every real,
visible string in both files, not just the new cytology additions,
per rule #2 above. New `batchManagement`/`newContainerModal` keys
across all five locale files. Two real design notes worth keeping:

- `BatchProcessingNode` values (`'Decal / Special Processing'`, etc.)
  are real, live data-matching keys elsewhere in the app (station
  `workflowStage` matching, `Batch.processingNode` itself) — they are
  **never** translated at the data layer. Only their *display* goes
  through `batchManagement.nodes.*`/`batchManagement.nodeTileLabel.*`,
  looked up by the untranslated English key exactly the way
  `NODE_COLOR` already was.
- `Batch['status']` (`active`/`reconciling`/`complete`/`aborted`)
  works the same way via `batchManagement.status.*`.

`BatchDetailView.tsx` (same folder) was **not** touched in this pass
— per rule #2, conversion happens when a page's own UI text is
actually edited, and this pass never edited that file. It still has
its own, separate, un-translated `STATUS_LABEL` — a real, known,
deferred gap the next real edit to that file should close.

**Honest caveat**: the French/German/Dutch translations follow
standard professional lab terminology; Korean lab/clinical
terminology in particular would benefit from native-speaker review
before this reaches real clinical users — same real, incremental
posture as the rest of this file's own translation coverage.

## Third/fourth conversions: triage gate UI (Sep 2026)

Part 2c of the Protocol-Driven Workflow Infrastructure story.
`GrossingReleasePanel.tsx` (`pages/SynopticReportPage/components/`)
was rewritten with the new triage checklist/override UI and converted
to `useTranslation()` in the same pass, per the standing rule — its
own pre-existing strings (block labels, Release & Print) went through
too, not just the new triage additions. `PendingGrossingTriageTile.tsx`
(`pages/WorklistPage/`) is a brand-new component, built with i18n from
the start (rule #1) — deliberately NOT folded into `WorklistPage.tsx`
itself (1,151 lines, not yet converted): a new, separately-converted
component plus one new render line in that page is not the same as
editing that page's own existing text, so `WorklistPage.tsx` itself
stays out of scope for this pass, same real "only what was actually
touched" boundary as `BatchDetailView.tsx` in the Batch Management
conversion above.

## Eighth conversion: Vendor Integrations screens (Sep 2026)

Real, per direct follow-up ("No text strings in these new page/
modals?") — a genuine miss caught and fixed, not a deliberate
exception. `VendorIntegrationsSection.tsx`,
`ImageManagementSystemVendorDictionarySection.tsx`, and
`GrossImagingVendorDictionarySection.tsx` (all three genuinely new
this session) had shipped with zero i18n, following the *local*
convention of the pre-existing Config/System admin sections they sit
alongside (`DpVendorDictionarySection.tsx`,
`OrSuiteTerminalsSection.tsx`, `MigrationFieldMappingsSection.tsx` —
confirmed directly, none of which use `useTranslation()` at all).
That local convention turned out to be an accumulated gap, not a
documented policy exception — the standing rule has no stated
carve-out for admin screens. All three new files converted; the
pre-existing sibling files they render alongside were not touched
(same "only what's actually edited" boundary as `WorklistPage.tsx`
elsewhere in this app) and remain a real, separate, un-converted gap
of their own.

## Seventh conversion: Molecular Order Queue (Sep 2026)

`pages/MolecularOrderQueuePage/MolecularOrderQueuePage.tsx` — a
brand-new page (per direct request to demo HPV orders/reflex
genotyping), built with `useTranslation()` from the start, same as
every other new page above.

## Sixth conversion: OR Suite Live Board dismissal workflow (Sep 2026)

`pages/OrSuiteDashboardPage.tsx` was substantially rewritten (cards →
full-width rows, four real board states, the two-step dismiss
confirmation modal) and converted to `useTranslation()` in the same
pass, per the standing rule — every string in the file, not just the
new dismissal additions, now goes through the `orSuiteDashboard.*`
namespace across all 5 locale files. The file also had zero real
`pathscribe.css` classes before this pass (100% inline `style={{}}`)
— converted alongside the i18n work, same "touching a page's own UI
is the trigger for both standing rules at once" reasoning applied to
`GrossingReleasePanel.tsx` and the Batch Management pages earlier.

## Fifth conversion: Grossing Screen (Sep 2026)

Part 3 of the Protocol-Driven Workflow Infrastructure story —
`pages/GrossingScreenPage/GrossingScreenPage.tsx`, a brand-new page,
built with `useTranslation()` from the start (rule #1): every visible
string (protocol header, block table, audit panel, confirmation
dialog) goes through the `grossingScreen.*` namespace across all 5
locale files. The one new button added to the existing, un-converted
`SynopticReportPage.tsx` ("Open Grossing Screen") also went through
`t()` from the start — new content gets the same treatment as a new
page even when it lands inside a not-yet-converted file, same real
"only what was actually added" boundary as the batchManagement/
pendingTriageTile conversions below.

## Related, real fix: voice input (Sep 2026)

Prompted by a direct question about whether this app's own Gemini-
connected voice control had any real multi-language support already.
Investigation confirmed it did not — `constants/voiceProfiles.ts` was
English-accent-tuning only (e.g. `EN-DE` meant "English spoken with a
Germanic accent," not the German language), and several of those
accent ids were being passed directly to the browser's native
`SpeechRecognition.lang` as invalid, invented BCP-47 tags ('en-DE',
'en-CN', 'en-EE', 'en-ME' are not real, recognized locales). Fixed:
`recognitionLang` is now a separate, real field on every profile,
carrying a genuinely valid BCP-47 tag (the real English dialects map
to their own real locale; genuine accent-only categories with no real
corresponding dialect fall back to `en-US`, never an invented tag).
Four real, new *language* profiles were added — French, German,
Dutch, Korean (the same four this UI framework supports) — each with
a real, distinct `language` marker and its own genuinely-recognized
BCP-47 tag (`fr-FR`, `de-DE`, `nl-NL`, `ko-KR`), plus
`contexts/punctuationMaps.ts`, a real, native-language punctuation-
command vocabulary for each (e.g. French "virgule" → ", ").

**Real, honest remaining gap for genuine "Voice First, multi-
language" parity**: `services/actionRegistry/`'s own 191 real
navigation/action entries all carry English-only `voiceTriggers` —
speaking a command like "delete" in French would not be recognized,
only free-text dictation and its punctuation. Nor was the Gemini-
based structured-content refinement prompt (`aiIntegration/PathScribeAIService.ts`)
audited for non-English dictation quality. Both are real, separate,
substantial pieces of work, not attempted here — see
`services/actionRegistry/README.md`'s own note, and
`src/MULTILANG_VOICE_COMMANDS_PLAN.md` for the full, considered
scoping plan for closing the voice-command half of this gap.

## Third real conversion: Waste Tracking Report (Stain QC Module §2.5, Sep 2026)

Per the standing rule above — a brand-new page (`DisposalReportPage.tsx`,
`pages/BatchManagement/`), so it was written with `useTranslation()`/`t()`
from the start rather than converted after the fact. New `disposalReport.*`
namespace across all five locale files (page title/subtitle, stat labels,
material-type labels, filter labels, table columns, export-sheet column
headers, loading/empty states), plus two additive keys under the existing
`batchManagement.*` namespace (`disposalReportTile`/`disposalReportTitle`)
for the new nav tile on `BatchManagementPage.tsx` — that page was already
fully converted (the "Second real conversion" entry above), so only the two
new keys were added, not a re-conversion.

## Fourth real conversion: Microtomy Workstation (PS-284, Sep 2026)

Per the standing rule above — a brand-new page (`MicrotomyWorkstationPage.tsx`
and its five components, `pages/MicrotomyWorkstationPage/`), so it was written
with `useTranslation()`/`t()` from the start rather than converted after the
fact. New `microtomyWorkstation.*` namespace across all five locale files
(scan prompt, block-summary context panel, alert-flag badges, slide grid
columns/actions, print status, hardware/print controls, label preview,
cytology/decant panel, comment drawer, remove/reprint reason prompts, batch
progress modal).

Also a genuinely new case: `Home.tsx` had **zero** i18n before this change —
first time this file needed touching. Per rule #2 (convert only what you
touch, not the whole file in one pass), only the new tile's two strings
(`home.microtomyTile.title`/`.description`) were converted, using
`useTranslation()` added fresh to that file; the other 13 existing tiles on
that page remain hardcoded English, same precedent as `GrossingScreenPage.tsx`'s
nav button living inside the not-yet-fully-converted `SynopticReportPage.tsx`.

Verified programmatically (not by eye): all five locale files parse as valid
JSON and have identical key sets after this change — 95 leaf keys under
`microtomyWorkstation.*`/`home.microtomyTile.*` combined, matched exactly
across en/fr/de/nl/ko, and 627 leaf keys total across each entire locale
file, also matched exactly.

## Fifth real conversion: Embedding Station (PS-285, Sep 2026)

Same real situation as the Microtomy Workstation conversion above: a
brand-new page (`EmbeddingStationPage.tsx` and its four components,
`pages/EmbeddingStationPage/`), written with `useTranslation()`/`t()` from
the start. New `embeddingStation.*` namespace across all five locale files
(scan prompt, block-summary context panel with toggleable + read-only
derived alert badges, piece-count verification, discrepancy reporting,
mold-size/orientation controls, split-block tracking, specimen block
summary, hardware/reprint controls, reprint-reason prompt, comment drawer).

Also touched `Home.tsx` again — only the new tile's two strings
(`home.embeddingTile.title`/`.description`) were converted, same
"convert only what you touch" precedent as the Microtomy tile before it;
the rest of that file (14 tiles now hardcoded English, one already
converted) is untouched.

Verified programmatically (not by eye): all five locale files parse as
valid JSON and have identical key sets after this change — 61 leaf keys
under `embeddingStation.*`/`home.embeddingTile.*` combined, matched
exactly across en/fr/de/nl/ko, and 688 leaf keys total across each entire
locale file, also matched exactly.

## Sixth real conversion: Slide Distribution Station (PS-286, Sep 2026)

Same real situation again: a brand-new page (`SlideDistributionStationPage.tsx`
and its three components, `pages/SlideDistributionStationPage/`), written
with `useTranslation()`/`t()` from the start. New `slideDistribution.*`
namespace across all five locale files (continuous-scan prompt, header/
context bar, work queue with real `Case.order.priority` badges, batch-
progress slot grid, active-slide detail + chain-of-custody history,
destination toggle + pathologist/subspecialty quick-picker + physical/
scanner fields, scan exception log with one-touch reasons).

Also touched `Home.tsx` again — only the new tile's two strings
(`home.slideDistributionTile.title`/`.description`) were converted, same
"convert only what you touch" precedent as the two tiles before it.

Verified programmatically (not by eye): all five locale files parse as
valid JSON and have identical key sets after this change — 47 leaf keys
under `slideDistribution.*`/`home.slideDistributionTile.*` combined,
matched exactly across en/fr/de/nl/ko, and 735 leaf keys total across
each entire locale file, also matched exactly.

## Seventh real conversion: Add-On Order Page (PS-287, Sep 2026)

Same real situation again: a brand-new page (`AddOnOrderPage.tsx` and its
four components, `pages/AddOnOrderPage/`), written with
`useTranslation()`/`t()` from the start. New `addOnOrder.*` namespace
across all five locale files — search/open-case landing, context bar,
block-context panel (status badges, levels-cut counts, tiny-tissue/
fragile flags), the Quick-Add Order Matrix (recut/special-stain/IHC/
molecular kind toggle, IHC panel picker, control-pairing mode), the
Order Summary & Routing panel (cart, priority, slide media, cutting
instructions, send-out lab picker), and the Order Tracking dashboard
(five tracking stages plus Exception/Cancelled, and the full flag/
approve/modify/cancel exception-response flow).

Also touched `Home.tsx` again — only the new tile's two strings
(`home.addOnOrderTile.title`/`.description`) were converted, same
"convert only what you touch" precedent as every tile before it.

Verified programmatically (not by eye): all five locale files parse as
valid JSON and have identical key sets after this change — 75 leaf keys
under `addOnOrder.*`/`home.addOnOrderTile.*` combined, matched exactly
across en/fr/de/nl/ko, and 810 leaf keys total across each entire
locale file, also matched exactly.

## Eighth real conversion: Facility Ops Dashboard (PS-288, Sep 2026)

Same real situation again: a brand-new page
(`FacilityOpsDashboardPage.tsx` + `components/DashboardSummaryView.tsx`,
`pages/FacilityOpsDashboard/`) and a brand-new admin Config section
(`DisplayProfilesSection.tsx`), both written with
`useTranslation()`/`t()` from the start — new `facilityOpsDashboard.*`
namespace (bind-display setup screen, offline/stale badge, queue/age/
overdue formatting, the five real dashboard view titles) and new
`displayProfiles.*` namespace (the Display Profile registry's own
add/edit modal and list).

Also touched `Home.tsx` again for its own new tile
(`home.facilityOpsDashboardTile.title`/`.description`) — same
"convert only what you touch" precedent as every tile before it.

Verified programmatically (not by eye): all five locale files parse as
valid JSON and have identical key sets after this change — 39 new leaf
keys added, 849 leaf keys total across each entire locale file, matched
exactly across en/fr/de/nl/ko.

## Ninth real conversion: Facility Ops Dashboard device-token confirmation (PS-288 follow-up, Sep 2026)

Direct follow-up closing a real, disclosed gap in the Facility Ops
Dashboard's own device registry (see
`services/facilityOpsDashboard/README.md`'s own account): the new
device-token confirmation step in `FacilityOpsDashboardPage.tsx`'s
`ProfileSetup` (`confirmTokenTitle`/`confirmTokenDescription`/
`confirmTokenPlaceholder`/`confirmTokenError`/`confirmTokenNote`) adds
5 new leaf keys to the existing `facilityOpsDashboard.*` namespace,
built with `useTranslation()`/`t()` from the start like the rest of
that namespace.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 5 new leaf keys added,
854 leaf keys total across each entire locale file, matched exactly
across en/fr/de/nl/ko.

## File-by-file cleanup sweep, and the end of "convert only what you touch" (Sep 2026)

Real, per direct decision: following the completion of this session's
Jira backlog sweep, work moved to a new phase — a file-by-file codebase
cleanup (business logic extraction, inline CSS removal, dead code
removal, and i18n) worked one file at a time, same discipline as the
Jira sweep. For i18n specifically, the standing rule above (convert only
what you touch) is now superseded for any file this sweep actually
visits: every file the sweep opens gets full i18n conversion of its own
real, visible strings in the same pass, whether or not the rest of that
file's own logic/CSS needed changing — not deferred to a future edit.

The rule for genuinely untouched files is unchanged: a file this sweep
has not yet reached stays exactly as it was, hardcoded English included,
until its own turn comes.

**`Home.tsx`**, closed out first as part of this: every tile this page's
own prior conversions had left hardcoded (Accession, Worklist, Batch
Management, Configuration, Cytology QC Peer Review Queue, Surgical
Post-Sign-Out QA, Intraop Queue, My Contribution, Search — 9 tiles) plus
the "Welcome back," header and footer copyright/status line are now
real, translated strings across all five locale files. The 3 tiles
already converted on arrival (Add-On Orders, Pathology Workspace,
Quality & Compliance) were untouched — nothing to convert there.
`Home.test.tsx` adopted the same `react-i18next` mock (return the raw
key) already established in `OrSuiteDashboardPage.test.tsx`, so its
existing assertions target stable keys instead of one locale's literal
English text.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 22 new leaf keys added,
976 leaf keys total across each entire locale file, matched exactly
across en/fr/de/nl/ko.

**`OutboundDlqSection.tsx`**, next in the "10 larger top-level pages"
tier (batch 4): had no i18n at all before this pass. Every hardcoded
string converted — section title/subtitle for both the Failed and
Queued tables, the "All Performing Labs" default option, both tables'
column headers, the `ERROR_LABEL` map's 4 values (now `ERROR_LABEL_KEY`,
resolved through `t()`), the "Unknown" fallback, the "(max exceeded)"
retry-count suffix, the ICD-10/Provider-NPI input placeholders, both
action button labels, the "✓ Captured" indicator, the CAPA button
label, both tables' empty-row messages, and the Simulate Timeout/
Rejected button labels — new `outboundDlq` namespace, 30 leaf keys.
Also real, along the way: the two identical `style={{ display: 'flex',
gap: 6 }}` inline blocks and the one `style={{ marginTop: 24 }}` block
became real CSS classes (`.ps-dlq-inline-actions`,
`.ps-dlq-section-header--spaced`), and a genuine pre-existing bug was
fixed — `.ps-conf-hint`, referenced by this file (and 8 others) via
`className`, had never actually been defined anywhere in
`pathscribe.css`; it now has a real base definition plus
`--success`/`--warning`/`--danger` modifiers. The other 8 files' own
inline color overrides on `.ps-conf-hint` are left as-is for now,
deferred to when the sweep reaches each of them individually.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 30 new leaf keys added,
1006 leaf keys total across each entire locale file, matched exactly
across en/fr/de/nl/ko.

**`LoginPage.tsx`**, next in the "10 larger top-level pages" tier: this
page already had partial i18n from an earlier pass (email/password field
labels, the sign-in button and its loading state). This sweep converted
everything that was still hardcoded — the brand descriptor, all 4
environment-badge labels (Production/Validation/Training/Development,
now `login.environment.*`), "Forgot password?" and its click-through
message, the password show/hide `aria-label`s, the "Please enter your
email and password" validation error, the "or continue with" divider,
both SSO button labels + their shared "Soon" badge + their shared
"Single sign-on is not yet available" title, the PHI access notice, and
the session-conflict `ConfirmModal`'s title/message/confirm label (its
cancel label now reuses the existing, already-established
`common.cancel` key rather than adding a duplicate). Also a real, small
fix found along the way: `login.invalidCredentials` already existed in
every locale file but was never actually referenced anywhere in the
code — the page had its own separate hardcoded English string with
slightly different wording for the same case. Reused the existing key
rather than adding a second one, updating its value (across all 5
locales) to match what the page actually displays. No inline CSS and no
extractable business logic — the file was already class-based, and its
handlers are thin, UI-bound wrappers around `useAuth().login()`.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 19 new leaf keys added
plus 1 existing key's value corrected, 1025 leaf keys total across each
entire locale file, matched exactly across en/fr/de/nl/ko.

**`OutboundInterfaceDlqSection.tsx`**, next in the "10 larger top-level
pages" tier: had no i18n at all before this pass. Every hardcoded string
converted — section title/subtitle for both the Failed and Queued
tables, the per-queue-type `QUEUE_CONFIG` labels (option label + both
column labels, ×3 queue types: Patient ADT, Pathology Result, Assist-Mode
LIS Sync), the lis_sync-disabled warning banner, all table headers, the
inline error-code labels, the "(max exceeded)" suffix, all button labels
(including their "Sending…" busy states), the "✓ Captured"/CAPA labels,
both empty-row messages, and the live "✓ Dispatched and accepted…"
success message shown after a real dispatch. New `outboundInterfaceDlq`
namespace, 37 leaf keys. Deliberately left untranslated, on the same
principle applied elsewhere this sweep: the `errorMessage`/`comment`
strings this file passes into `markFailed()`/
`specimenDeficiencyService.raise()` — those are persisted records (like
an audit-log entry), not live display chrome, so a change of UI locale
shouldn't retroactively change what a stored record says. Checked
against `OutboundDlqSection.tsx` (swept two batches ago) for duplicated
business logic per the standing sweep discipline — found none; the two
files share no queue types or services, and reused its two new CSS
classes (`.ps-dlq-inline-actions`, `.ps-dlq-section-header--spaced`) and
its `.ps-conf-hint--success`/`--warning` modifiers directly rather than
adding new ones.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 37 new leaf keys added,
1062 leaf keys total across each entire locale file, matched exactly
across en/fr/de/nl/ko.

**`OrSuiteDashboardPage.tsx`** — verification pass only, no changes.
Confirmed (not assumed) already fully i18n'd and CSS-classed from an
earlier pass: no `style={{}}` anywhere in the file, no remaining
hardcoded UI strings (grepped, not just read), and its own header
comments already document that per-row business logic was deliberately
moved out to `resolveOrBoardRowDisplayState.ts`/`OrBoardRow.tsx`. Nothing
to do here.

**`BillingLogsSection.tsx`**, next in the "10 larger top-level pages"
tier (608 lines): had no i18n at all before this pass. Every hardcoded
UI string converted — page title/subtitle, all three filter-option
arrays (Status/Billing Type/Type — 19 option labels total), the dynamic
`summarizeFilters()` chip-summary text (a plain function, not a
component — takes `t` as a parameter, the same convention already used
for pure resolver functions like `resolveSynopticFieldLabel.ts`), every
section label/placeholder/aria-label in the filter sidebar, the Save
Query / Clear / Search controls (with `_one`/`_other` pluralized filter-
and result-count badges), the results-pane empty/no-search states, the
on-screen results table's column headers, and all three Lookup modal
titles/subtitles. New `billingLogs` namespace, 102 leaf keys.
Deliberately left untranslated, same policy as elsewhere this sweep: the
CSV export's own column headers and meta-header field names in
`handleExportCSV` — a data-interchange format, not live UI chrome.
**Two real, redundant inline `style={{}}` blocks found and removed**
(not just relocated to CSS): the local `Chip` component's
`--accent: '#0891B2'` turned out to exactly reproduce
`.ps-searchpage-chip`'s own CSS fallback (`var(--accent, #0891B2)`) —
unlike `SearchPage.tsx`'s own `Chip`, which threads a real, distinct
per-item accent color through, this one never receives one, so the
inline override was a no-op every single render. Removed outright. The
outer shell's `style={{ height: '100%' }}` became a real
`.ps-search-shell--embedded` modifier class in `pathscribe.css` instead
of being deleted outright, since (unlike `SearchPage.tsx`'s own
full-page usage of `.ps-search-shell`) this instance is embedded inside
`AuditLogPage.tsx`'s tab body and isn't guaranteed a flex ancestor for
the class's own `flex: 1` to size against — same visual result, just a
real class instead of an inline override. Also restructured the
on-screen results table's header array from raw English strings into
`{key, labelKey}` pairs, since the "Detail" column's own CSS-class
special-case previously keyed off the literal string `'Detail'`, which
would have silently broken once that column's header went through
`t()` in any non-English locale.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 102 new leaf keys added,
1164 leaf keys total across each entire locale file, matched exactly
across en/fr/de/nl/ko.

**`ContributionDashboardPage.tsx`** (843 lines) — the pathologist's own
"My Contribution" dashboard (KPIs, TAT/RVU tiles, quality flags, teaching
cases, supervision progress). Had no i18n at all before this pass.
Converted every hardcoded UI string across the page and its 4 locally-
defined sub-components (`WeeklyOverviewChart`, `Rvu30Tile`,
`TatPerformanceTile`, `TeachingCasesTile`) — tab labels, KPI tile labels
(including the two org-config-dependent "Cases Signed Out"/"Cases
Finalised" variants), all tile titles/subtitles/empty-states, the TAT
tile's interpolated "% of Nh target" and "weighted across N facilities"
lines, and the Teaching Cases tile's several pluralized strings
(`_one`/`_other`: case counts, countersign counts, changed-field counts).
New `contributionDashboard` namespace, 57 leaf keys.

**Real, previously-inert dead code removed**: `kpiExtras`' own
`targetLabel` field was set on 2 of its 3 entries ("of volume target",
"AI adoption target") but grepped as never read anywhere in the file's
JSX — the %-of-target figure has always rendered with no label beside
it. Removed the field entirely rather than leaving it to look load-
bearing to the next reader.

**Real inline-CSS fix**: the "My Progress" supervision tile's
`style={{ width: '${progress.pct}%' }}` became a `--progress-width`
custom property + a new `.ps-contrib-progress-fill--dynamic-width`
class, the same pattern this same file's own `WeeklyOverviewChart`/
`TatPerformanceTile` bars already establish for genuinely data-driven
values (left untouched, since those were already doing this correctly).

**Real naming collision surfaced and fixed**: this file already imported
`pathscribeTheme as t` for its color tokens — adding `useTranslation()`'s
own `t` would have silently shadowed it (a `TS2339` on `t.colors...`
caught this immediately at `tsc` time). Renamed the theme import to its
own name (`pathscribeTheme`) at both of its two call sites rather than
aliasing around the clash, since `t` for the translation function is the
overwhelmingly dominant convention across every other file this sweep
has touched.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 57 new leaf keys added,
1221 leaf keys total across each entire locale file, matched exactly
across en/fr/de/nl/ko.

## 2026-09-20 — `IntraopQueuePage.tsx` (file-by-file sweep, batch 7)

The bench-facing intraoperative capture form (`NewEntryForm` and its
scan/demographics/specimen steps), the desktop merge queue
(`EntryCard`/`MergeModal`), and every sub-component in between
(`SkipReasonMenu`, `PreparationLogger`, `MilestoneActions`,
`SpecimenCard`) had no i18n at all before this pass — the largest
single-file conversion so far this sweep (111 new leaf keys, one file).

- **i18n**: added `useTranslation()` to every component in the file
  (main page + 7 sub-components) and converted every hardcoded UI
  string — form field labels, placeholders, step headings, button
  labels, hint text, empty states, and the milestone/skip-reason/
  preparation-type label maps (converted from `Record<Type, string>`
  literal maps to `Record<Type, string>` *key* maps, looked up with
  `t()` at each call site, same pattern used for enum-like label maps
  throughout this sweep). New `intraopQueue` namespace, 112 leaf keys
  × 5 locales (111 new + 1 follow-up `page.breadcrumb` key added when
  the page's own `pushCrumb()` call — missed on the first pass — was
  found and converted to match the precedent already established in
  10 other swept pages).
  - Pluralized the specimen-count summary (`specimenSummary_one` /
    `_other`) and the frozen-block log button
    (`logButton_frozenBlock_one` / `_other`), both using the existing
    `_one`/`_other` + `{{count}}` convention.
  - Reused `common.cancel` for every bare "Cancel" button (6 call
    sites across `NewEntryForm`, `SkipReasonMenu`, and `MergeModal`)
    rather than adding duplicate per-component keys.
  - `MILESTONE_LABEL`/`SKIP_REASON_LABEL`/`PREPARATION_TYPE_LABEL`
    were each shared across 2–3 components (`SpecimenCard`,
    `SkipReasonMenu`, `PreparationLogger`); converted once to
    `_KEY` maps and reused everywhere rather than duplicating keys
    per call site.
  - **Deliberately left in English**: the `context` field passed to
    `startDictation()` in the two dictation call sites (`patient
    name`, `operating room number`, `gross description`, etc.) — this
    is a processing hint sent to the dictation/voice service, not
    text rendered on screen. The paired `label` field on the same
    calls IS rendered (by `VoiceCommandOverlay.tsx`, confirmed by
    reading that component) and was translated.
- **Real bug found and fixed along the way**: converting the
  `PREPARATION_TYPE_LABEL` `<select>`'s `.map(t => ...)` loop variable
  collided with the newly-added `useTranslation()`'s own `t` in
  `PreparationLogger` — caught before it ever reached `tsc` (the loop
  variable would have silently shadowed the translation function,
  compiling fine but rendering type *values* like `"frozen_block"`
  instead of translated labels for every option after the first).
  Renamed the loop variable to `pt`.
- **Inline CSS**: none found — the file already used only CSS classes
  from `pathscribe.css`, confirmed by grep for `style={{` before
  starting (zero matches).
- **Dead code / business logic**: none found beyond what the file's
  own extensive header/inline comments already document and justify
  (e.g. `simulateScan()` kept deliberately alongside the real camera
  scanner for camera-less environments; the reset-confirmation gate;
  the voice-eligibility single-specimen restriction). No UI business
  logic worth extracting into a resolver/hook was found — the file's
  logic is either form-local state or thin calls into
  `intraoperativeService`, already the established pattern.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 111 new leaf keys
(`intraopQueue`) plus 1 follow-up breadcrumb key, 1332 leaf keys
total across each entire locale file, matched exactly across
en/fr/de/nl/ko.

## 2026-09-20 — `AuditLogPage.tsx` (file-by-file sweep, batch 8)

The System Logs page — 5 top-level tabs (Audit, Errors, Interfaces,
Quality Assurance, Financial), the last two each hosting their own
inner sub-tabs (Interfaces: Interface Exceptions / Outbound Interface
DLQ; Financial: Billing Logs / Outbound DLQ, both of which render
already-swept sections). Had no i18n at all before this pass — the
second-largest single-file conversion in this sweep after
IntraopQueuePage.tsx.

- **i18n**: added `useTranslation()` and converted every on-screen
  string across all 5 tabs — page header/subtitle/role-notice, tab and
  sub-tab labels, filter pills, `<select>` options and their
  `aria-label`s, search placeholders, on-screen table column headers,
  empty states, status/type/severity badge text, and the footer count
  lines (with `{{shown}}`/`{{total}}` interpolation). New `auditLog`
  namespace, 111 new leaf keys × 5 locales (some added in a couple of
  small follow-up batches as additional strings were found mid-sweep:
  a scrollable-table `aria-label` per tab, and several free-text
  fragments embedded in the Quality Assurance tab's own per-group
  `detail` strings — see below).
  - Reused `auditLog.shared.*` for the several exact duplicates found
    across tabs (the date-range `<select>` options, "to" separator,
    and Export CSV button all appear on 3–4 tabs each) rather than
    keying them per tab.
  - **Deliberately left in English**: every CSV export's own column
    headers, and every value passed into a CSV export's meta-header
    filter object (`{'Type': ..., 'Status': ..., 'Group': ...}`) —
    same "exported/persisted data stays English" convention already
    established for every CSV export earlier in this sweep (audit,
    error, interface, and quality exports all keep this). Concretely:
    `GROUP_LABELS` (the original, English-only record) and
    `GROUP_STATUS_OPTIONS[...].label` (the English `label` field, kept
    alongside a new `labelKey` field) are still exactly what the CSV
    exports use; only the on-screen `<select>` options, empty-state
    text, and footer counts were switched to the translated
    `GROUP_LABEL_KEY` / `opt.labelKey` equivalents.
- **Real, locale-correctness bug found and fixed**: the Quality
  Assurance tab's status badge picked its resolved/open/pending color
  by string-matching `r.statusLabel` against hardcoded English
  literals (`['Closed', 'Merged', 'Concordant', ...].includes(...)`).
  Translating `statusLabel` for on-screen display would have silently
  broken every badge's color in every non-English locale (the
  translated text would never match the English list). Fixed by
  adding a `statusTone: 'resolved' | 'open' | 'pending'` field to
  `QualityRecord`, computed once per record from the same stable,
  locale-independent status values the filters already use (not from
  display text), and switching the badge's class to read `statusTone`
  directly. `QualityRecord` also gained `statusLabelKey` alongside the
  now CSV-only `statusLabel`, so the on-screen table shows
  `t(r.statusLabelKey)` while the export keeps the English text.
- **Real bug found and fixed while converting**: two of the sub-tab
  switcher `.map(t => ...)` callbacks (Interfaces and Financial tabs)
  used `t` as their loop variable, which would have silently shadowed
  the newly-added `useTranslation()`'s own `t`. Renamed both to `sub`.
  A third, unrelated `const t = setTimeout(...)` in the page's initial
  load effect was also renamed (`loadTimer`) for the same reason,
  though it never reached a real bug since `t` (translation) isn't
  referenced inside that effect.
- **Small, real UI-text fixes found while converting the Quality tab's
  per-group `detail` strings** (previously plain, untranslated
  template literals): the `deficiency` group's `'Case-level'`
  specimen fallback, the `countersign` group's lowercase `'pending'`
  attending-name fallback, the `intraop-linkage` group's `'OR
  {number}'` prefix, the `patient-match` group's `'MRN {number}'`
  parenthetical, the `fppe` group's `'proctor: {name}'` parenthetical
  and `'{n} cases reviewed'` (now pluralized, `_one`/`_other`), and
  the `management-review` group's `'{n} item(s)'` (also pluralized) —
  all converted to `t()` calls with interpolation/pluralization,
  matching the established convention.
- **Inline CSS**: 2 real occurrences found and removed — the "Patient
  Management Only" filter's `style={{ cursor: 'pointer', gap: 6 }}`
  (the checkbox-as-pill `<label>`, which doesn't inherit the base
  `.ps-auditlog-pill` button's `cursor: pointer` the way a `<button>`
  would) became a new `.ps-auditlog-pill--checkbox` class, and the
  Interfaces/Financial sub-tab switchers' `style={{ marginBottom: 16
  }}` (used identically in 2 places) became a new
  `.ps-auditlog-tabswitch--spaced` class.
- **Dead code / business logic**: none found. The CSV export
  functions, date-threshold helper, badge-style helpers, and the
  per-group Quality Assurance normalization were all already
  module-level or clearly-scoped component-body functions — no UI
  business logic embedded in JSX needed extracting, consistent with
  this file's own header comments documenting several earlier
  extraction passes (the `quickLinks` IIFE-to-value conversion, the
  `AuthContext`-based role dedup) that already happened before this
  sweep reached it.

Verified programmatically: all five locale files parse as valid JSON
and have identical key sets after this change — 111 new leaf keys
(`auditLog`), 1465 leaf keys total across each entire locale file,
matched exactly across en/fr/de/nl/ko.

## `QualityAssurancePage.tsx` — file-by-file sweep, batch 8

- **`QualityAssurancePage.tsx`** (1476 lines) — the CAPA/nonconformance
  work queue: 6 modal components (Escalate to CAPA, Immediate
  Containment, Raise Deficiency, Effectiveness Check, Resolve Billing
  Deficiency, Review Code Review Pool Entry) plus the main page (7
  pillars — Operations, Financials, CAPA Engine, Cytology QA,
  Enterprise Rollup, QA Dashboard, Inspection Mode — each with its own
  tab/tile switching). Had no i18n at all before this pass. New
  `qualityAssurance` namespace, 158 new leaf keys × 5 locales.
  - **i18n**: converted every on-screen string across all 6 modals and
    the main page — headers, intro sentences, form labels/
    placeholders/hints, buttons, pillar/tile labels and titles, table
    column headers, empty states, status text, and the closed-item
    review banner (properly pluralized, `_one`/`_other`).
    - Two label maps (`RESOLUTION_REASON_LABEL`,
      `DEFICIENCY_TYPE_LABEL`) were literal `Record<Key,string>`s used
      only in on-screen `<select>` options — neither feeds a CSV
      export (both financials CSV exports use the raw status/type
      code, not the label), so both converted straight to i18n-key
      maps (`RESOLUTION_REASON_LABEL_KEY`, `DEFICIENCY_TYPE_LABEL_KEY`)
      with no English-for-export counterpart needed, unlike the
      dual-field (`label`/`labelKey`) pattern used elsewhere in this
      sweep for maps that do serve both.
    - **Deliberately left in English**: all three CSV export functions
      (`exportActiveQueue`, `exportClosed`, `exportManagementReviews`)
      and the Financials tab's inline CSV builder keep their plain-
      English column-keyed row objects (`'Case'`, `'Status'`, `'Issue
      Type'`, etc.) untouched — same "exported data stays English"
      convention as the rest of this sweep. The on-screen `<thead>`
      column headers for the same tables are a separate, now-
      translated array (`columnsFor()` and two inline arrays), so the
      two never share a literal.
    - Also deliberately left in English, per this sweep's established
      "persisted/audit data stays English" convention: the
      `auditService.logEvent()` detail string in
      `handleResolveBillingDeficiency` (a billing code-correction audit
      trail entry).
  - **Real bug found and fixed while converting — a `toLowerCase()` on
    translated text caught before it shipped**: an early draft of the
    Resolve modal's intro sentence built `t('...case').toLowerCase()`
    to get a lowercase "case" — the same anti-pattern flagged and
    avoided in the `AuditLogPage.tsx` entry above (`.toLowerCase()` is
    not semantically valid on an arbitrary translated string; German
    nouns are always capitalized, Korean has no letter case at all).
    Caught during this file's own review before verification, not by
    `tsc`. Fixed by replacing the whole "Specimen X, case Y — detail"
    line with two dedicated, fully-composed interpolated keys
    (`modals.shared.introWithSpecimen` / `introNoSpecimen`) so every
    language renders its own natural word order and case, rather than
    concatenating separately-translated fragments.
  - **Real `t`-shadowing bugs found and fixed (6 instances)** — by far
    the most in one file this sweep, because this file's pre-existing
    code used `t` as a generic loop variable for "type" in several
    unrelated places:
    1. `RaiseDeficiencyModal`'s `activeTypes`/`eligibleTypes` filters
       and its type-options `.map(t => ...)` all used `t` for
       "deficiency type". Renamed to `dt` (3 call sites).
    2. The main component's `typeName`/`resolutionName` helpers used
       `deficiencyTypes.find(t => ...)` / `resolutionTypes.find(t =>
       ...)`. Renamed to `dt`/`rt`.
    3. `trendData`'s per-month `closedThisMonth` filter used `const t =
       new Date(x.resolvedAt).getTime()`. Renamed to `resolvedTime`.
    4. `columnsFor(t: Tab)` used `t` as its own parameter name — the
       single most direct collision, since this function's whole job
       (after this pass) is to *return* translated column headers via
       the hook's `t`. Renamed the parameter to `tb`.
    5. The pillar-tile grid's `.filter(t => ...).map(t => {...})`
       used `t` for each tile object, reading `t.label`/`t.color`/
       `t.key`/`t.count`/`t.sublabel` throughout the callback body —
       the largest single rename in this file. Renamed to `tile`.
    None of these reached a live bug before this pass (none of the
    pre-existing code called translation), but every one would have
    silently broken the moment a `t()` call was added inside its
    scope — which several of them now need. All verified via a clean
    `npx tsc --noEmit -p .` and the full passing test suite.
  - **Inline CSS**: 2 real occurrences found and removed — the
    `ReviewPoolEntryModal` outcome-toggle button pair's `style={{
    display: 'flex', gap: 6 }}`, and the active-deficiency table row's
    Contain/Escalate button pair's `style={{ display: 'flex', gap: 6,
    flexWrap: 'wrap' }}` — both replaced with one new, shared
    `.ps-qa-inline-actions` class. The per-tile dynamic color styling
    (`style={{ '--tile-bg': ..., '--tile-border': ... } as
    React.CSSProperties}`) was deliberately left as-is: it's the same
    CSS-custom-property technique already established for
    `.ps-wl-filter-tile` elsewhere in the app for genuinely per-item
    runtime colors, not a removable static style.
  - **Small, real UI-text fixes found while converting**: three
    literal `—`/`…` unicode escape sequences
    (`RaiseDeficiencyModal`'s specimen label, "— Whole case —" option,
    and "Select a type…" option) were written directly in JSX text
    children rather than inside a JS string/template literal, where
    `\uXXXX` is never interpreted — meaning the page was literally
    rendering the six characters `\`, `u`, `2`, `0`, `1`, `4` on
    screen instead of an em dash. Found while reading the source
    for the i18n conversion; fixed as a side effect of moving that
    text into translated string values (which do interpret real
    special characters correctly).
  - **Dead code / business logic**: none found — this file's own
    header comments already document several earlier extraction
    passes (dual mock/Firestore deficiency sourcing routed through
    `firestoreDeficiencyIds`, the `correctServiceCharge` orchestration
    extracted out of `handleResolveBillingDeficiency`, the `?open=`
    deep-link highlight effect), and the CSV export functions/
    memoized derivations were all already properly scoped outside the
    render body.

### Validation

- `npx tsc --noEmit -p .`: clean (including catching and fixing all 6
  `t`-shadowing sites and the `toLowerCase()`-on-translated-text bug
  above before it ever reached `tsc`).
- Full suite: 499/499 files, 4329/4329 tests passing (no dedicated
  test file exists for `QualityAssurancePage.tsx`; no coverage lost).
- All five locale files verified programmatically to have identical
  key sets after the addition — 1465 → 1625 leaf keys, matched
  exactly across en/fr/de/nl/ko.

Ninth of 10 larger top-level page files. Next up: `SearchPage.tsx`
(2127 lines) — the largest remaining top-level page file.

## `SearchPage.tsx` — file-by-file sweep, batch 9

- **`SearchPage.tsx`** (2127 lines) — the case-search screen: the
  filter sidebar (accession date, identifier, patient demographics,
  status/priority, flags, synoptic protocol, pathologist, attending,
  comp flags, facility, specimen, diagnosis, SNOMED CT, ICD codes),
  the results pane (summary line, export, reassign-patient, load
  more), the Quick Links modal, and 10 sub-components including 9
  lookup modals (Specimen Dictionary, SNOMED CT, ICD Codes, Synoptic
  Protocol, Case Flags, Pathologist, Attending Physician, Submitting
  Facility, Computational Flags). Had no i18n at all before this
  pass. New `searchPage` namespace, 190 new leaf keys × 5 locales
  (1787 after the main pass, +3 for a sidebar-toggle gap found while
  reviewing the finished conversion — see below — for 1790 total).
  - **i18n**: added `useTranslation()` to every sub-component named in
    the handover (`BrowseBtn`, `SynopticLookupContent`,
    `UserLookupContent`, `FlagsLookupContent`, `CompFlagsLookupContent`,
    `FacilityLookupContent`, `SpecimenLookupContent`, `IcdModalContent`,
    `SnomedAxisContent`, `CodeLookupContent`, the main `SearchPage`
    component) plus `SnomedModalContent` (renders `SNOMED_AXIS_META`'s
    own tab-bar labels directly — the same "on-screen text" test the
    rest of this sweep applies, even though it wasn't itself named in
    the handover's sub-component list). Converted every placeholder,
    label, button, aria-label, title, and empty state across the
    sidebar filter form, results pane, and all 9 lookup modals.
    - `buildSummary()` (module-level, non-hook) converted to take a
      `t` param, same pattern as `resolveSynopticFieldLabel.ts` — every
      summary fragment (accession range, patient/MRN/MPI, specimen/
      diagnosis/SNOMED/ICD/status/gender/DOB/age/priority/flags/
      synoptic/pathologist/attending lists) now a fully-composed,
      interpolated key rather than concatenated English fragments.
    - Five label-key-map conversions, each keeping the real underlying
      value used for filtering/matching/backend submission untouched
      and translating only the on-screen label: `STATUS_PILL_META`
      (keyed by the real `CaseStatus`), a new `PRIORITY_LABEL_KEY`
      (parallel to the untouched `PRIORITY_OPTIONS`), a new
      `GENDER_LABEL_KEY`/`GENDER_OPTIONS` (locale key `NonBinary` vs.
      the real value `Non-binary` — punctuation differs, so mapped
      explicitly rather than derived), and a new
      `SPECIMEN_TYPE_LABEL_KEY` (parallel to the untouched
      `SPECIMEN_TYPES`/`SPECIMEN_TYPE_COLOURS`, including the type pill
      text and the specimen `LookupItem` badge). `SNOMED_AXIS_META`
      converted the same way (`label`/`placeholder` → `labelKey`/
      `placeholderKey`) since its `id` field is the real value sent to
      `codeService.search()`.
    - `quickLinks`' own object keys (`Protocols`/`References`/
      `Systems`) left untouched (used for `.map()`/lookup); a new
      `RESOURCE_SECTION_LABEL_KEY` translates only the displayed
      section heading, per the handover's explicit instruction.
    - **Deliberately left in English**: `handleExportCSV`'s column
      headers (`'Accession'`, `'Patient Name'`, `'MRN'`, `'Sex'`,
      `'DOB'`, `'Specimen(s)'`, `'Accession Date'`, `'Physician'`,
      `'Priority'`, `'Status'`, `'Flags'`) — same "exported data stays
      English" convention as the rest of this sweep.
  - **Real bug found and fixed while converting — a missed breadcrumb
    translation, same pattern caught in earlier files**: `useEffect(()
    => { pushCrumb('Case Search', '/search'); }, [pushCrumb]);` set
    the breadcrumb from a hardcoded English literal rather than
    `t('searchPage.page.title')`; fixed, with `t` added to the
    effect's own dependency array so the breadcrumb updates if the
    language changes after mount.
  - **All 9 `t`-shadowing sites from the handover's own pre-flight
    grep, fixed before any `t()` call was added in their scope**:
    `buildSummary`'s and `runSearch`'s `ALL_SYNOPTICS.find(t=>...)`
    (renamed to `syn`, 2 sites); `SpecimenLookupContent`'s
    `SPECIMEN_TYPES.filter(t=>...)` and its `['All',
    ...typesInUse].map(t=>...)` (renamed to `type`, 2 sites);
    `IcdModalContent`'s `allTabs.filter(t=>...)`, `.some(t=>...)`, and
    `.map(t=>...)` (renamed to `at`, 3 sites); the table-height
    effect's `const t = setTimeout(measure, 50)` and the `isLoaded`
    effect's `const t = setTimeout(...)` (both renamed to `timer`, 2
    sites). Re-verified after conversion with the handover's own grep
    pattern — zero real matches remain (the two `type`-prefixed hits
    it still turns up are false positives of the pattern itself, not
    shadowing).
  - **Gap found in the pre-written key design, fixed directly**: the
    sidebar's collapse/expand rail toggle (`title="Expand filters"` /
    `title="Collapse filters"`) and its collapsed-state "Filters" badge
    weren't in the handover's key list or the locale-insertion script.
    Added a small `searchPage.sidebar.{expandFilters,collapseFilters,
    filtersBadge}` group to all 5 locale files directly (+3 leaf keys,
    parity re-verified programmatically across en/fr/de/nl/ko), rather
    than leaving those three strings in English.
  - **Inline CSS**: none found needing removal — all 7
    `style={{...}}` occurrences are the same established
    `--accent`/`--tile-*` CSS-custom-property pattern used elsewhere in
    this sweep for genuinely per-item runtime colors (chip/pill accent,
    identifier badge color), not removable static styling.
  - **Dead code**: none found.
  - Every translated string runtime-verified (not just `tsc`-checked)
    by instantiating `i18next` directly against the built locale files
    and rendering representative keys in French and Korean — plural
    forms (`filterCount`, `summary.resultCount`), multi-argument
    interpolation (`summaryParts.accessionRange`, `summary.loadMore`),
    a space-containing leaf key (`specimenTypeLabelKey["Gross Only"]`),
    and Korean word order (`codeLookup.searchPlaceholder`) all resolved
    correctly.

### Validation

- `npx tsc --noEmit -p .`: clean, both before and after the conversion.
- Full suite: 499/499 files, 4329/4329 tests passing (no dedicated
  test file exists for `SearchPage.tsx`; no coverage lost either way).
- All five locale files verified programmatically to have identical
  key sets throughout — 1625 → 1787 leaf keys after the main
  `add_search_page_i18n.py` pass, → 1790 after the sidebar-toggle gap
  fix, matched exactly across en/fr/de/nl/ko at every step.

Tenth of 10 larger top-level page files — the last one. Next up: task
#179 (23 page directories under `src/pages`) and task #180 (31
component subdirectories under `src/components`), per the standing
"keep going the same way" instruction.

## `AccessionPage/` directory — file-by-file sweep, batch 10

First directory-scoped sweep under task #179 — all 6 files under
`src/pages/AccessionPage/` converted together in one batch (the main
page plus its own companion modals/panel), rather than one at a time,
since they share one real i18n namespace and several of the smaller
files only make sense read alongside the parent.

- **`AccessionPage.tsx`** (4095 lines) — the accessioning workflow
  itself: the Case & Patient / Specimens / Outside Patient Data tab
  bar, Import-from-Order search, Patient Origin/Intake Type selector
  (Standard/Downtime/Outside), the full demographics grid, the
  Cytology and Autopsy conditional cards, patient ID/priority/
  encounter/facility/provider fields, clinical indication, case
  comment/deficiency actions, the entire Specimens tab (per-specimen
  fields, the autopsy organ picker, foreign-ID-collision warnings),
  the Ready-to-Accession/Labels/Grossing-Templates cards, and the
  Outside Patient Data tab. Had no i18n at all before this pass. New
  `accessionPage` namespace, 331 leaf keys × 5 locales in the main
  pass (`add_accession_i18n.py`), +4 more for a mid-conversion gap
  (`fix_accession_i18n_gaps.py`) — 335 for this file's own share of
  the namespace.
  - **i18n**: `useTranslation()` added to the main component and to
    the local `Icd10Picker` sub-component; every on-screen label,
    placeholder, button, tab, toast, validation message, and empty
    state converted.
    - Two label-key-map conversions, keeping the real underlying value
      untouched and translating only the on-screen label:
      `AUTOPSY_ORGAN_PICKER_GROUPS` (added `sectionId`/`titleKey`
      fields, replacing static `sectionTitle` strings) and a new
      `AUTOPSY_ORGAN_LABEL_KEY: Record<AutopsyOrganCode, string>` (35
      organ codes), replacing the old algorithmic
      `autopsyOrganCodeLabel()` formatter function (removed as dead
      code once the map replaced it).
    - `<option value="realCode">Label</option>` patterns (sex,
      laterality, hormonal status, HPV result, case authority,
      container category, etc.) translated directly on the label side
      — the real, persisted/matched `value` never changes, so these
      needed no label-key-map indirection, unlike the dictionary-style
      constants above.
    - A PHI-masking-driven key redesign: values like the accession
      number are wrapped in their own `<strong data-phi="...">`
      element for DOM-level masking and can't be interpolated as plain
      text into a translated string without defeating that masking.
      `accessionPage.labelsCard.hint` was redesigned to end with a
      dangling preposition ("...for") so the JSX can append the
      `<strong data-phi="accession">` element and its own trailing
      period separately.
    - **Deliberately left untouched, per this sweep's established
      scoping rule**: shared type-level constants imported and used
      across many not-yet-swept files (`JURISDICTION_LABELS`,
      `BREAK_GLASS_REASON_CODES`, `PATIENT_ID_BY_JURISDICTION` — 12
      other consumer files, confirmed via grep) and the `user?.name ??
      'Unknown User'` fallback (confirmed via grep to be the same,
      deliberately-English convention in 14 files project-wide,
      including an already-swept one).
  - **Real bug found and fixed while converting — the same missed-
    breadcrumb pattern caught in earlier files**: `useEffect(() => {
    pushCrumb('Accession', '/accession'); }, [pushCrumb]);` set the
    breadcrumb from a hardcoded English literal; fixed to
    `pushCrumb(t('accessionPage.page.title'), '/accession')` with `t`
    added to the dependency array.
  - **9 `t`-shadowing sites found and fixed before any real `t()` call
    was added in their scope**: `.filter(t => t.active)`-style
    callback parameters renamed to `mpt` (master payment type, 3
    sites), `dt` (deficiency type, 2 sites), `tpl` (grossing template,
    2 sites), `st` (specimen type string, 1 site). Re-verified with a
    final targeted grep — zero real matches remained.
  - **Inline CSS**: 19 `style={{...}}` occurrences removed, replaced
    with ~15 new named classes in `pathscribe.css` (conditional-card
    padding, section headings, specimen-row spacing, the laterality
    "suggested" badge, the autopsy organ-picker grid/chips, etc.) —
    verified via grep afterward: zero `style={{` remain in the file.
  - **Dead code**: the old `autopsyOrganCodeLabel()` formatter
    function, superseded by `AUTOPSY_ORGAN_LABEL_KEY` above.
- **`IntraopMergePromptModal.tsx`** (70 lines) — the intraop-entry
  match prompt shown on accession. `useTranslation()` added; header,
  intro (interpolated `{{caseId}}`), MRN/fuzzy-match badge text, the
  plural specimen-count label (`_one`/`_other`, with `{{orNumber}}`/
  `{{surgeon}}`/`{{count}}`), the no-quick-gross fallback, footer note,
  and all 3 footer buttons converted under `accessionPage.
  intraopMergeModal.*`. No inline styles, no `t`-shadowing.
- **`OrderLookupModal.tsx`** (207 lines) — the Order Lookup & Patient
  Verification modal. `useTranslation()` added; header, subheader,
  search placeholder (interpolated `{{format}}`), the pending-orders/
  known-patients section labels, the shared grid column headers,
  loading/no-match states, and the close button converted under
  `accessionPage.orderLookupModal.*`. No inline styles, no
  `t`-shadowing.
- **`PatientLinkSearch.tsx`** (84 lines) — the reusable patient-link
  search widget (shared by the Outside Patient "Check for Existing
  Patient" flow and the general Family Relation field).
  `useTranslation()` added; the "Undo" button, search placeholder,
  loading/no-match states, and the confirmed-patient/result-row MRN+DOB
  text converted under `accessionPage.patientLinkSearch.*` (2 keys —
  `mrnDob`, `resultMrnDob` — added directly, discovered only once this
  file's own JSX was actually being converted, not in the original
  design). One `style={{ marginBottom: 10 }}` removed, replaced with a
  new `.ps-accession-outside-subtitle--spaced` modifier class.
- **`ReportDeficiencyModal.tsx`** (141 lines) — the manual multi-
  deficiency reporting modal. `useTranslation()` added; header (case
  vs. specimen variants), intro, the per-entry remove-title, issue/
  add-another-issue label, detail field+placeholder, add/cancel/done
  buttons converted under `accessionPage.deficiencyModal.*`. 6
  `style={{...}}` occurrences removed, replaced with the `.ps-
  deficiency-entry-*` classes already sitting in `pathscribe.css`. 2
  `t`-shadowing sites fixed (`deficiencyTypes.filter(t => ...)` and
  `deficiencyTypes.find(t => ...)`, both renamed to `dt`) before
  `useTranslation()`'s own `t` was introduced.
- **`ClinicalHistory/ClinicalHistoryEntryPanel.tsx`** (293 lines) —
  the structured clinical-history entry panel (cascading Specimen
  Type → Category → History Code, with dynamic metadata inputs and a
  real typeahead). `useTranslation()` added; heading, hint, the
  empty-state row, Applies-To/category/specimen-type/history-item
  labels, the add/remove buttons, and both error messages (including
  a plural `missingFieldsError_one`/`_other`) converted under
  `accessionPage.clinicalHistory.*`. The module-level `CATEGORY_LABELS`
  map converted to a label-key-map (`CATEGORY_LABEL_KEY`, parallel to
  `accessionPage.clinicalHistory.categoryLabel.*`) — the real
  `ClinicalHistoryCategoryCode` values it's keyed by are untouched.
  ~15 `style={{...}}` occurrences removed, replaced with the new
  `.ps-clinhist-*` classes. 1 `t`-shadowing site fixed
  (`targets.some(t => ...)`, renamed `tg`) — plus two more found only
  once `useTranslation()`'s own `t` was actually in scope
  (`targets.find(t => ...)` for `activeTarget`, and three `.map(t =>
  ...)` sites rendering `<option>`s), all renamed (`tg`/`st`) and
  re-verified with a final grep. This file's own header comment
  claimed "no inline styles" despite having ~15 of them; the comment
  is corrected to reflect the real, current (now genuinely
  inline-style-free) state rather than left contradicting the code.
- **Real bug found and fixed, outside the 6 swept files — a genuine
  infinite render loop, surfaced only once `AccessionPage.e2e.test.tsx`
  (a real, full form-submission test that mounts a real
  `BreadcrumbProvider`) was run against the newly-added `[pushCrumb,
  t]` breadcrumb effect**: `BreadcrumbContext.tsx`'s own `pushCrumb`
  trimmed the crumb trail back to an already-matching tail entry via
  `prev.slice(0, existingIdx + 1)` unconditionally — a fresh array
  reference every call, even when the slice's own contents were
  identical to `prev`. Combined with a non-memoized mock `t` (the same
  `useTranslation: () => ({ t: (key) => key })` convention already
  established in this codebase's own test files), the effect re-fired
  every render, and `pushCrumb`'s always-new reference meant React
  never saw a stable state — a real, synchronous infinite render loop
  that pegged one CPU core and grew heap usage for as long as the
  process was left running, not merely a slow test. Fixed by adding a
  same-reference bail-out (`existingIdx === prev.length - 1 ? prev :
  ...`) alongside the pre-existing tail-duplicate bail-out just below
  it. This is shared infrastructure, not scoped to Accession — any
  other page hitting the identical `[pushCrumb, t]` pattern (several
  already do: `SearchPage.tsx`, `IntraopQueuePage.tsx`,
  `BatchManagementPage.tsx`, and others) was equally exposed to this
  bug; none of their own tests happened to mount a real
  `BreadcrumbProvider`, which is why it surfaced here first.
- **Test files updated to match** (both had real, pre-existing
  coverage — not new gaps left uncovered by this pass):
  `ClinicalHistoryEntryPanel.test.tsx` (added the standard
  `vi.mock('react-i18next', ...)` raw-key mock, updated the
  placeholder/button-text assertions it drove to match the new i18n
  keys instead of the old literal English) and
  `AccessionPage.e2e.test.tsx` (already had the mock from an earlier
  pass; updated every literal-English placeholder/label/button/tab
  assertion — given-names/family-names placeholders, Submitting
  Facility label, provider search placeholder, the Specimens/Case &
  Patient tab buttons, Select-from-Specimen-Dictionary, Organ(s)
  Included, the Heart organ checkbox label, Jurisdiction/Case
  Authority labels, and Submit Accession — to match their new i18n
  keys; real seeded data assertions like patient/facility/physician
  names were left untouched, since that data is not translated).

### Validation

- `npx tsc --noEmit -p .`: clean, both before and after the
  conversion.
- Full suite re-run after the `BreadcrumbContext.tsx` fix: all 6
  AccessionPage-related test files (`ClinicalHistoryEntryPanel.test.tsx`,
  `AccessionPage.e2e.test.tsx`, and the 4 files their imports touch —
  `reportingModeRouting.test.ts`, `processAdtMessage.test.ts`,
  `foreignIdCollision.test.ts`, `generateDefaultMaterial.test.ts`) —
  69/69 tests passing.
- All five locale files verified programmatically to have identical
  key sets throughout — 1790 → 2126 leaf keys, matched exactly across
  en/fr/de/nl/ko at every step (including the two follow-up gap-fix
  patches).

## `BatchManagement/` directory (remaining files) — file-by-file sweep, batch 11

Continuing task #179: the five `BatchManagement/` files not already
covered by the pre-existing `batchManagement.*` namespace
(`BatchManagementPage.tsx` itself was already converted before this
sweep began). Each gets its own top-level namespace, per this sweep's
one-namespace-per-page rule, while reusing the shared
`batchManagement.status.*`, `batchManagement.nodes.*`, and
`batchManagement.itemCount_one`/`_other` keys rather than duplicating
them.

- **`DisposalQueuePage.tsx`** — new `disposalQueue.*` namespace. Added
  a `MATERIAL_TYPE_LABEL_KEY` label-key-map (`block`/`slide`/
  `wet_tissue` — the real `DisposalQueueItem['materialType']` value
  stays untouched for filtering; only the label is translated).
  Fixed the missed-breadcrumb pattern (`pushCrumb(t('disposalQueue.
  pageTitle'), ...)`, `t` added to the effect's deps). Converted the
  scan-flash message, the full-screen "screen turns red" overlay text
  and its dismiss hint, and the manifest rows (shared-specimen
  suffix, eligible-since date). No inline styles existed in this file
  to remove.
- **`PendingBatchQueuePage.tsx`** — new `pendingBatchQueue.*`
  namespace. Its own `MATERIAL_TYPE_LABEL_KEY` (`block`→"Cassette",
  `slide`→"Slide" — deliberately different English wording from
  DisposalQueuePage's map, since this page's own real
  `PendingBatchQueueItem['materialType']` values read differently in
  context; kept as two distinct label-key-maps rather than merged).
  Fixed the breadcrumb. Converted the search box, the filtered/
  unfiltered section-label variants, the per-case grouping heading
  (reusing `batchManagement.itemCount` rather than a duplicate key),
  and a newly-discovered gap filled proactively:
  `pendingBatchQueue.specimenLabel` ("Specimen {{label}}"), which had
  been left as an untranslated literal prefix in the original code.
  Two inline styles (`marginBottom: 16` / `marginBottom: 4;
  fontWeight: 600`) removed in favor of new `.ps-batch-pending-case-
  group`/`.ps-batch-pending-case-heading` classes.
  - **Bold-emphasis tradeoff**: the original "Scoped to `<strong>`
    facility`</strong>`" text was first redesigned with the
    dangling-prefix split this sweep has used elsewhere for PHI
    masking, but that split assumes a fixed word order the value can
    be appended to — Korean's postpositional particles attach after
    the noun, so a language-agnostic "prefix + bold value + suffix"
    split can't be made correct for it. Reverted to a single,
    fully-interpolated sentence (`t('pendingBatchQueue.scopedTo',
    { facility })`) without the `<strong>` wrapper, accepting the
    minor loss of visual emphasis — consistent with how most other
    dynamic values elsewhere in the app already render unbolded.
- **`CreateBatchModal.tsx`** — new `createBatchModal.*` namespace.
  Reused `batchManagement.nodes.*` for both the processing-node
  `<select>` options and the post-creation confirmation screen's meta
  line. Also fixed a real, pre-existing quality gap while converting:
  the confirmation screen previously rendered the raw `'STAT'`/
  `'Routine'` priority value untranslated; it now resolves through
  `createBatchModal.priorityStat`/`priorityRoutine` like the toggle
  buttons above it. No inline styles, no `t`-shadowing.
- **`EngraverMonitorPage.tsx`** — new `engraverMonitor.*` namespace.
  Two label-key-maps (`STATUS_LABEL_KEY` for the five real
  `EngraverStatus` values, `SUPPLY_WARNING_LABEL_KEY` for the three
  real `SupplyWarningCode` values). The module-level
  `formatSupplyWarning()` helper — called from inside a `.map()`,
  outside any component's own render scope — takes `t` as its first
  parameter, matching the established `buildSummary(t, ...)`
  convention from an earlier `SearchPage` batch. New CSS classes for
  the status-summary tiles and device cards (`.ps-engraver-status-*`,
  `.ps-engraver-device-*`); the 4 remaining `style={{`s are all
  genuinely dynamic per-status/per-device colors (tile background/
  border, count color, card border, status-badge background/color),
  consistent with this sweep's established convention for real
  per-value color computation.
- **`BatchDetailView.tsx`** (568 lines — the largest file in this
  batch) — new `batchDetail.*` namespace. Fixed one `t`-shadowing
  site (`setTick(t => t + 1)` → `setTick(tick => tick + 1)`). Removed
  the local `STATUS_LABEL` constant entirely in favor of reusing
  `batchManagement.status.*` (kept the local `STATUS_COLOR` map,
  since colors stay local/untranslated everywhere else in this
  namespace too). Added its own `MATERIAL_TYPE_LABEL_KEY` — a third,
  distinct label-key-map from the two above, since `BatchItem
  ['materialType']` (`BatchItemMaterialType`, 7 real values including
  `matrix_block`/`decant_slide`) is a materially larger type than
  either `RetainableMaterialType` or `PendingBatchQueueItem
  ['materialType']`, confirmed via a targeted grep before designing
  it rather than assumed. Converted every toast/flash message
  (`handleScan`, transfer/complete/abort/override/remove/move/
  release-rack), the detail header (processing-node display now via
  `batchManagement.nodes.*`, STAT/rack/status badges using new
  `.ps-batch-detail-*` classes), the decal-timer overdue/remaining
  text, the referral-tracking status branches, the cold-chain-
  excursion alert and its acknowledge-button `window.prompt()` text,
  both scan hints, the manifest and unexpected-scans sections
  (matched/missing/unexpected badges keep their ✓/○/emoji markers
  outside the translated text, per this sweep's established PHI/
  emoji convention), the override/aborted notes, the full action-
  button row (Release Rack, Transfer to Processing / Start
  Reconciliation, Abort Batch, Complete Batch and its disabled-title
  tooltip, Supervisor Override), and both confirmation modals (Abort
  Batch: title/body/placeholder/buttons; Supervisor Override: title/
  interpolated body/placeholder/buttons). The one remaining
  `style={{` (the status pill's dynamic background/color) is genuine
  per-status color, kept inline like `STATUS_COLOR` elsewhere. The
  `abortReason.trim() || 'No reason given.'` fallback was left as a
  service-default value, not on-screen copy, matching this sweep's
  existing "Unknown User"-fallback precedent.

### Real bug found and fixed

Not scoped to this batch's own five files, but surfaced by
`AccessionPage.e2e.test.tsx` in batch 10 and already fixed in
`BreadcrumbContext.tsx` before this batch began (see the batch-10
entry above for the full writeup) — flagged again here because every
file in this batch uses the same `[pushCrumb, t]` breadcrumb-effect
pattern the bug affected, and all five were confirmed fixed by
that same shared-infrastructure change rather than needing individual
patches.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite re-run: 499/499 test files, 4329/4329 tests passing (no
  dedicated test file references any of these five components, so no
  coverage was gained or lost — confirmed via grep before and after).
- All five locale files verified programmatically to have identical
  key sets throughout — 2126 → 2251 leaf keys, matched exactly across
  en/fr/de/nl/ko, including the two follow-up gap-fix patches
  (`pendingBatchQueue.specimenLabel`, `batchDetail.materialType.*`)
  discovered mid-conversion.

## `CytologyWorklistPage/CytologySlideOverDrawer.tsx` — closing out the directory, batch 12

The last unconverted file in `CytologyWorklistPage/`. Unlike every
other file in this batch's own directory, it needed no i18n work at
all: it's a generic slide-over shell (shared by the Material View,
Synoptic Reporting, and ROSE drawers) whose only text is a `title`
prop supplied by its callers — and both call sites
(`CytologyScreeningPage.tsx`'s three `<CytologySlideOverDrawer>`
usages) already pass translated `t(...)` values. So the only real
work here was the CSS extraction this sweep also requires: 3 inline
styles (`width: 420`, the header `<h2>`'s font/color/margin, and the
scrollable body's flex/overflow/padding) replaced with new
`.ps-cytology-slideover`/`.ps-cytology-slideover-title`/
`.ps-cytology-slideover-body` classes in `pathscribe.css`. No dead
code, no `t`-shadowing, nothing to translate.

This closes out task #179's `CytologyWorklistPage` entry: 6/6 files
now converted.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite re-run: 499/499 test files, 4329/4329 tests passing (no
  dedicated test file references this component; the two real
  callers' own existing coverage is unaffected since only styling
  changed).
- No locale changes this batch (nothing to translate) — leaf-key
  count unchanged from batch 11 (2251, matched across en/fr/de/nl/ko).

## `Synoptic/` directory (smaller files) — file-by-file sweep, batch 13

The first half of task #179's `Synoptic` entry: the four smaller
files (`UI/SaveToast.tsx`, `Comments/CommentModalShell.tsx`,
`Comments/CaseCommentModal.tsx`, `Comments/ReportCommentModal.tsx`).
The two large modals (`Codes/AddCodeModal.tsx`, 1309 lines, and
`Delegate/DelegateModal.tsx`, 541 lines — both with dozens of inline
styles and hardcoded strings apiece) were deliberately split off as
their own dedicated batch rather than folded in here, given their
size.

- **`UI/SaveToast.tsx`** — no strings to translate (`message` is a
  caller-supplied prop). Its one real conversion: the two binary
  visual states (`opacity`/`transform` toggling on `visible`) were
  moved out of inline `style={{...}}` into a static `.ps-save-toast`
  class plus a `.ps-save-toast--visible` modifier applied via
  conditional className, rather than kept as dynamic inline style —
  a real, closed two-state toggle doesn't need to stay inline the way
  a genuinely continuous/per-value color does elsewhere in this
  sweep.
- **`Comments/CommentModalShell.tsx`** — new `commentModalShell.*`
  namespace (just `close`, its one hardcoded string — the shared
  shell's title/subtitle/footer content all come from its callers).
  The dynamic drag-position `style={...}` (calculated from live
  `pos.x`/`pos.y` state) stays inline, same as every other
  genuinely-computed-position case in this sweep.
- **Real dedup, done while converting**: `CaseCommentModal.tsx` and
  `ReportCommentModal.tsx` each defined an identical `SYNC_LABELS`
  map and `OriginBadge` component — byte-for-byte duplicates.
  Extracted both into a new shared `Comments/OriginBadge.tsx`, built
  with i18n from the start (a `SYNC_EMOJI`/`SYNC_LABEL_KEY` pair, the
  emoji kept outside the translated text per this sweep's convention)
  rather than converting the duplicate twice and letting them drift.
- **`Comments/CaseCommentModal.tsx`** — new `caseCommentModal.*`
  namespace. The PHI-masking dangling-prefix split
  (`subtitlePrefix`/`subtitleSuffix` around the `<strong data-phi>`
  accession span) reuses the pattern established in an earlier
  AccessionPage batch. `footerLeft`'s manual singular/plural string
  concatenation became a real `_one`/`_other` pluralized key
  (`commentsOnCase`).
- **`Comments/ReportCommentModal.tsx`** — new `reportCommentModal.*`
  namespace, plus two keys pulled into a shared `synopticComments.*`
  namespace (`postComment`, `newCommentNote`) since both comment
  modals render that exact button/note identically — kept shared
  rather than duplicated into each page's own namespace, the one
  deliberate exception to this sweep's per-page-namespace rule when
  two pages render the literal same UI text. The dynamic `title`
  (built from the caller's own `specimenName`) and the finalized-vs-
  editable subtitle branch are real per-case content, not translated
  as static strings — only the surrounding labels are.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite re-run: 499/499 test files, 4329/4329 tests passing. No
  dedicated test file references any of these five files (confirmed
  via grep), so no coverage was gained or lost.
- All five locale files verified programmatically to have identical
  key sets throughout — 2251 → 2272 leaf keys, matched exactly across
  en/fr/de/nl/ko.

## `Synoptic/Codes/AddCodeModal.tsx` and `Synoptic/Delegate/DelegateModal.tsx` — file-by-file sweep, batch 14

The second half of task #179's `Synoptic` entry, closing out that
directory at 6/6 files. Both files are large (1309 and 541 lines) and
dense with inline styles, so this batch was almost entirely CSS
extraction plus i18n, with a couple of real behavioral simplifications
found along the way.

- **`Delegate/DelegateModal.tsx`** — new `delegateModal.*` namespace.
  Roughly two dozen new `.ps-delegate-*` classes replace inline
  styling across the header, the two-panel body, the `RecipientCard`
  and `TypeZone` subcomponents, and the drag overlay. `dt.id`/
  `dt.label`/`dt.description` (the delegation-type data itself) were
  deliberately left untranslated — `mockDelegationTypeService.ts`'s
  own `create()` lets a site define custom delegation types beyond
  the 7 seeded defaults, so this is real, admin-configurable data,
  same "admin-editable dictionary stays untranslated" precedent as
  `colorNames` in `EngraverMonitorPage.tsx` (batch 11). The staff-role
  value (`Pathologist`/`Resident`/…) was left untranslated too, for
  consistency with how that same `StaffUser` role enum already
  renders untranslated everywhere else in the app — introducing a
  new, file-scoped translation for it here would be inconsistent
  rather than complete.
- **`Codes/AddCodeModal.tsx`** — new `addCodeModal.*` namespace. The
  larger of the two conversions:
  - `ALL_SYSTEMS`/`SNOMED_FILTERS` module-level constants gained
    `SYSTEM_LABEL_KEY`/`SNOMED_FILTER_LABEL_KEY`/`_HINT_KEY`
    label-key-maps. The coding-*standard* names (SNOMED CT, ICD-10,
    LOINC, ICD-O, CPT, OPCS-4) stay identical across every locale as
    proper nouns but are still wrapped in a translation key — the
    same precedent already set by this app's own existing
    `snomedCt`/`snomedTitle` keys elsewhere. The plain-English
    hierarchy-filter names (All/Morphology/Anatomy/Specimen/Organism)
    get real per-locale translations.
  - The whole AI-prompt text sent to `callAi()` (both the UK and
    non-UK branches, several hundred words) was deliberately **not**
    translated — it's model input, not on-screen UI, the same
    "exported/persisted data stays English" reasoning this sweep
    already applies to CSV export headers.
  - **Real simplification, done while converting**: `CodeChip`'s
    manual `hovered` state (`useState` + `onMouseEnter`/
    `onMouseLeave`, only to toggle a background/border color) was
    replaced with a plain CSS `:hover` rule, removing the state
    entirely. Same for the context-menu buttons' hover handlers and
    the header close button's hover handlers — all three were doing
    in JS what a `:hover` selector already does declaratively. The
    new hover rules are scoped with an extra component-local class
    alongside the shared `fm-flag-chip`/`acd-ctx-menu-btn`/
    `acd-close-btn` classes so `FlagManagerModal.tsx`'s own,
    independent use of `fm-flag-chip` is never affected.
  - **Real fix found while converting**: the context-menu buttons'
    inline hover handlers set a cyan tint (`rgba(8,145,178,0.15)`)
    that differed from the pre-existing (but, it turned out, entirely
    unused) `.acd-ctx-menu-btn:hover` CSS rule's white tint — the CSS
    rule was updated to the real, intended color so the JS handlers
    could be removed rather than kept as a second, conflicting source
    of truth.
  - AI-suggestion and search-result rows reuse several `acd-*` classes
    (`acd-code-badge`, `acd-system-badge`, `acd-sug-desc`,
    `acd-confidence-hi/lo`, `acd-already-added`, `acd-added-check`,
    `acd-add-btn`) that were already defined in `pathscribe.css` but,
    on inspection, not yet wired to any element — the file's inline
    styles had been left in place instead. Wired them in rather than
    adding parallel new classes.
  - Every genuinely dynamic per-value color (system-tab accent,
    SNOMED-filter accent, context-menu position, chevron rotation,
    drag transform) stays inline, consistent with this sweep's
    established convention.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite re-run: 499/499 test files, 4329/4329 tests passing. No
  dedicated test file references either component.
- All five locale files verified programmatically to have identical
  key sets throughout — 2272 → 2379 leaf keys, matched exactly across
  en/fr/de/nl/ko.

This closes out task #179's `Synoptic` entry: 6/6 files converted.

Next up: continuing task #179 — `WorklistPage` (1/4 done:
`WorklistPage.tsx` 1566 lines, `AmendedAddendaTriageTile.tsx`,
`ResourcesModal.tsx` remain), `MolecularBatchPage` (0/4),
`ReportPreview` (0/2) — plus task #180 (31 component subdirectories
under `src/components`, not yet surveyed), plus `SynopticReportPage`
(23,896 lines / 54 files, 3/54 converted) flagged as its own separate
future batch, per the standing "keep going the same way" instruction.

## `WorklistPage/` — file-by-file sweep, batch 15

Closes out task #179's `WorklistPage` entry at 4/4
(`PendingGrossingTriageTile.tsx` was already converted before this
sweep reached it).

### Files swept this batch

- `src/pages/WorklistPage/AmendedAddendaTriageTile.tsx`
- `src/pages/WorklistPage/ResourcesModal.tsx`
- `src/pages/WorklistPage/WorklistPage.tsx` (1566 lines)

### What changed

- **`AmendedAddendaTriageTile.tsx`** — new `amendedAddendaTriageTile.*`
  namespace (`title_one`/`_other`, per-kind `label`/`badge`
  sub-objects, `draftNotReleased`). **Real dead-data removal**: the
  original `TriageItem.label` field was a hardcoded string set once
  at fetch time — fully redundant with the already-stored `kind`
  discriminant. Removed the field entirely; the displayed label is
  now resolved from `kind` via a `LABEL_KEY` map at render time. This
  also incidentally fixes a latent staleness bug — a string cached at
  fetch time never updated if the locale changed afterward; resolving
  at render time always reflects the current locale.
- **`ResourcesModal.tsx`** — new `resourcesModal.*` namespace
  (`quickLinks`, `protocols`, `references`, `systems`, `close`);
  CSS extraction only otherwise (`.ps-resources-*` classes).
- **`WorklistPage.tsx`** — new `worklistPage.*` namespace, the larger
  conversion:
  - `FILTER_LABELS` (the page's own "single source of truth" map for
    both the page title and every filter tile's default label — its
    header comment explains the real label-drift bugs it was built
    to fix) became `FILTER_LABEL_KEY`: the real filter-state keys
    (`'urgent'`, `'draft'`, `'countersign'`, …) stay untouched — they
    drive real filtering/routing — only the displayed label is
    resolved through `t()` at render time.
  - The two `toast.error(...)` calls surfacing pediatric/orchestration
    access-denial messages (redirect-triggered, from
    `caseAccessControl.ts`'s enforcement) are now translated.
  - The LIS Cases / Outreach mode tiles' tooltips, labels, and
    Urgent/Pool badges; the branch tabs (`All Cases`/`Surg Path`/
    `Cytology`/`Autopsy`); the page-title fallback; the table's
    `aria-label` — all converted.
  - **Real simplification found while converting**: all 19 filter
    tiles independently computed the exact same `` `← Back to
    ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` ``
    ternary inline — nineteen copies of one string. Collapsed into a
    single `backToLabel` computed once (via `t('worklistPage.backTo',
    { target: … })`) and reused by every tile's `label` ternary,
    removing the duplication rather than translating it nineteen
    times over.
  - The `+{{count}} in Pool` urgent-tile sublabel and the
    `Showing: …`/`Filter by: …` tile tooltip templates were converted
    to interpolated keys, feeding the tile's own already-resolved
    `label` in as `{{label}}` — consistent with this sweep's existing
    pattern of composing one translated string from another.
  - Left deliberately untouched: `CURRENT_USER_NAME`'s `'Dr. Sarah
    Johnson'` fallback and the pool-claim `'MFT Pool'` fallback — both
    are literal fallback *data* values (a person's name, a pool's
    name), not UI chrome, consistent with how proper-noun fallback
    data elsewhere in this app stays untranslated.
  - Left deliberately untouched, per an explicit pre-existing code
    comment in the file (lines ~1145–1154): the outer wrapper divs'
    plain layout inline styles (`position`/`width`/`height`/
    `fontFamily`/`display`/`flexDirection`) — a full inline-style-to-
    CSS-class conversion for this specific page is tracked separately
    as **PS-74** and explicitly out of scope for whatever pass added
    that comment. Respected the same boundary here: this sweep's
    mandate is i18n and *incidental* CSS cleanup, not a second pass at
    PS-74's own larger, separately-tracked layout work. The many
    CSS-custom-property-driven inline styles (`'--tile-bg'`,
    `'--tile-label-color'`, etc., cast `as React.CSSProperties`) were
    also left as-is — a distinct, already-legitimate pattern for
    passing dynamic per-state values into existing CSS rules, not
    something PS-74 or this sweep needs to "fix."

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file references any of the three components.
- All five locale files verified programmatically to have identical
  key sets — **2379 → 2436 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

Next up: `MolecularBatchPage` (0/4), `ReportPreview` (0/2) — plus
task #180 (31 component subdirectories under `src/components`, not
yet surveyed), plus `SynopticReportPage` (23,896 lines / 54 files,
3/54 converted) flagged as its own separate future batch, per the
standing "keep going the same way" instruction.

## `MolecularBatchPage/` — file-by-file sweep, batch 16

Closes out the `MolecularBatchPage` entry at 4/4.

### Files swept this batch

- `src/pages/MolecularBatchPage/MolecularRackWorklistPage.tsx`
- `src/pages/MolecularBatchPage/MolecularControlRulesPage.tsx`
- `src/pages/MolecularBatchPage/MolecularRackLoadingPage.tsx`
- `src/pages/MolecularBatchPage/MolecularPlateBuilderPage.tsx` (718 lines)

### What changed

- **`MolecularRackWorklistPage.tsx`** — new `molecularRackWorklistPage.*`
  namespace. Already used real CSS classes throughout; i18n only.
- **`MolecularControlRulesPage.tsx`** — new `molecularControlRulesPage.*`
  namespace. `c.sampleType` (the real `MolecularSampleType` enum, e.g.
  `CONTROL_NTC`) is displayed as its raw code, matching how this same
  value already renders elsewhere in the module — no curated label
  existed for it here to preserve.
- **`MolecularRackLoadingPage.tsx`** — new `molecularRackLoadingPage.*`
  namespace; one inline `style={{ display:'flex', gap:8,
  alignItems:'center' }}` replaced with the already-existing
  `.ps-flex-row-gap-8` utility class (an exact match). `'Unknown
  Station'`/`'Unknown User'` fallbacks left untranslated — literal
  fallback data, not UI copy, same precedent as elsewhere in this
  sweep.
- **`MolecularPlateBuilderPage.tsx`** — new `molecularPlateBuilderPage.*`
  namespace, the largest conversion in this batch. This file had
  essentially no CSS classes of its own (nearly everything was inline
  `style={{...}}`), so most of the work was extracting ~25 new,
  page-scoped `.mb-*` classes (header row, banners, panels, the plate
  grid, well buttons, the legend, the trace-detail cell) plus a
  handful of new generic spacing/font utilities (`ps-mt-8/14/20`,
  `ps-mb-6/10/20`, `ps-fs-12`) alongside the existing `ps-mt-16`/
  `ps-mb-16`/etc. set. Every genuinely dynamic per-value color (sample-
  type/well colors, the gating-result color, the plate grid's own
  column count) stays inline via CSS custom properties.
  - `SAMPLE_TYPE_LABEL` and a new `PLATE_LAYOUT_LABEL_KEY` became
    label-key-maps — the real `MolecularSampleType`/
    `MolecularPlateLayout` enum values stay untouched (used for color
    indexing and the create payload); only the displayed label
    resolves through `t()`.
  - **Real bug found and fixed while converting**: the dispatch-result
    banner's color was decided by string-matching the *displayed*
    text (`dispatchResultMessage.startsWith('Worklist dispatched')`)
    to tell success from failure. That only worked because the success
    message was a hardcoded English literal — translating it would
    have silently broken the color in every other locale (a French
    success message doesn't start with "Worklist dispatched"). Fixed
    by tracking success as its own boolean (`dispatchResult: {
    message, success }`) instead of pattern-matching the text.
  - **Real copy cleanup found while converting**: two of the batch-
    status banners had this codebase's own code-comment "real, "
    rhetorical qualifier leaked into actual user-facing text — "the
    real, replacement batch", "a real clone of a superseded, earlier
    batch", "every real patient specimen well". Cleaned up to plain
    English before translating, so the odd phrasing wasn't carried
    into every locale.
  - The clone-source banner's clickable link sits mid-sentence in a
    translated string; resolved by composing the full translated
    sentence once, then locating the (already-translated) link text
    inside it and wrapping just that substring in a `<span>` —
    correct regardless of a given locale's word order, rather than
    assuming the link falls at a fixed character offset.
  - Renamed several `.map(t => …)`/`.find(t => …)` loop variables that
    would otherwise shadow the new `t()` translation function (`at`
    for assay types, `rt` for reagent component types, `st` for
    sample types) — harmless to leave shadowed, but confusing to read.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**.
- All five locale files verified programmatically to have identical
  key sets — **2436 → 2592 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

Next up: `ReportPreview` (0/2) — plus task #180 (31 component
subdirectories under `src/components`, not yet surveyed), plus
`SynopticReportPage` (23,896 lines / 54 files, 3/54 converted)
flagged as its own separate future batch, per the standing "keep
going the same way" instruction.

## `ReportPreview/` — file-by-file sweep, batch 17

Closes out the `ReportPreview` entry at 2/2.

### Files swept this batch

- `src/pages/ReportPreview/ReportPreviewPage.tsx`
- `src/pages/ReportPreview/ReportPreviewRenderer.tsx` (678 lines)

### What changed

- **`ReportPreviewPage.tsx`** — new `reportPreviewPage.*` namespace
  (live/standalone indicator, "Updated …", print/close buttons,
  loading state). No inline CSS in this file to extract — it already
  used real `rp-*` classes throughout.
  - **Real gap found and fixed**: the patient-name span in the top
    bar wasn't wrapped in a `data-phi` attribute the way the
    accession right next to it already is. Every other patient-name
    display in this app marks itself `data-phi="name"` for the same
    real capture/redaction tooling to find; this one was silently
    missed. Added it.
- **`ReportPreviewRenderer.tsx`** — new `reportPreviewRenderer.*`
  namespace covering the section-status badges ("Accepted"/"Edited"/
  "AI Draft"), empty/placeholder states, the patient-header field
  labels (Patient/MRN/Date of Birth/Referring/Clinician), the
  template-indicator bar, the empty-report state, and the footer's
  "CONFIDENTIAL — PATHOLOGY REPORT" line. This is the on-screen
  report *preview* (interactive, clickable section headings, live
  badges) rather than a final exported artifact, so it's treated as
  ordinary UI chrome — same as every other page in this sweep — not
  as "exported data stays English." The clinical content itself
  (section HTML, patient name, diagnostic text) is untouched, as is
  the literal per-hospital institution data (`getInstitution()`'s
  real addresses/department names) and the existing `'en-GB'`
  date-formatting in `buildRenderScope` — that's the app's established,
  separate jurisdiction-locale system for clinical dates, not a UI-
  language concern this sweep touches.
  - Found the same missing-`data-phi="name"` gap on this file's own
    patient-name spans (the case-header field and the footer line)
    and fixed both, for the same reason as `ReportPreviewPage.tsx`.
  - No inline-style extraction needed — every `style={{...}}` in this
    file is already documented, per its own header comments, as a
    deliberate exception for genuinely dynamic, per-template admin
    values (`labelStyle()`, `numColumns`/`columnGap`), matching this
    sweep's own convention for what stays inline.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing** —
  including the dedicated `ReportPreviewRenderer.sectionLabelConfig.test.tsx`,
  which asserts against CSS classes/inline styles, not the translated
  strings.
- All five locale files verified programmatically to have identical
  key sets — **2592 → 2619 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

Next up: task #180, `src/components/` — surveyed this batch (see below)
and found to be dramatically larger than implied above: **188 files,
62,662 lines** still lack `useTranslation` entirely. Broken into many
future batches, smallest directories first.

---

## `src/components/` — first batch (smallest directories), batch 18

### Scope survey for task #180

Before converting anything, ran a full survey of `src/components/`
(31 top-level subdirectories) via
`grep -rl "useTranslation" $(find src/components -name '*.tsx' -not -name '*.test.tsx')`.
Result: **188 files, 62,662 lines** across this directory alone have
never been touched by this sweep — far larger than any batch so far
(the previous largest, batch 16, was ~1,850 lines across 2 files).
This needs its own multi-batch plan, the same way `SynopticReportPage`
(23,896 lines / 54 files, 3/54 converted) already has one. Flagging
the largest scopes now so they're not mistaken for "a batch" later:
`Config/` (103 files / 32,773 lines), `TemplateBuilder/` (10 files /
4,614 lines), `QualityAssurance/` (15 files / 3,841 lines), `Common/`
(15 files / 1,842 lines), and two standalone giants outside any of
the above, `Worklist/WorklistTable.tsx` (2,204 lines) and
`AppShell/AppShell.tsx` (1,745 lines). Each of those needs a
dedicated future batch (or several) of its own.

This batch takes the smallest, simplest files first to start closing
out the smaller subdirectories completely.

### Files swept this batch

- `src/components/Synoptic/SynopticSidebar.tsx` (25 lines)
- `src/components/Icons/Icons.tsx` (163 lines) — **no i18n needed**
- `src/components/SpecimenPicker/SpecimenDictionaryPicker.tsx` (100 lines)
- `src/components/GrossingHardware/CameraCaptureControl.tsx` (143 lines)
- `src/components/BarcodeScanner/BarcodeScanner.tsx` (194 lines)
- `src/components/Billing/PostSignoutBillingChangeModal.tsx` (96 lines)
- `src/components/Billing/CorrectAppliedCodeModal.tsx` (77 lines)
- `src/components/RequestReview/RequestReviewModal.tsx` (346 lines)

Closes out `Synoptic` (component-level file), `Icons`, `SpecimenPicker`,
`GrossingHardware`, `BarcodeScanner`, `Billing`, and `RequestReview`
completely.

### What changed

- **`SynopticSidebar.tsx`** — its one inline `style={{...}}` was a
  single static object with no per-instance variation, so replaced
  with a real class (`.synoptic-sidebar`) rather than a CSS custom
  property. No strings to translate.
- **`Icons.tsx`** — surveyed and left untouched on purpose: every
  export here is a plain SVG icon component (`SunIcon`, `MoonIcon`,
  `HelpIcon`, `MonitorIcon`, `WarningIcon`, `X`) with no rendered
  text at all. Nothing for `useTranslation` to do.
- **`SpecimenDictionaryPicker.tsx`** — new `specimenDictionaryPicker.*`
  namespace (modal header, search placeholder, "Custom specimen"
  option, no-matches message, Cancel). The dictionary's own `type`
  values (e.g. "Breast", "Skin") are real per-org dictionary data and
  stay untranslated, matching the `getInstitution()` precedent —
  only the `'Other'` fallback-bucket label is translated at render
  time, and the real value stays the untranslated internal grouping
  key.
- **`CameraCaptureControl.tsx`** — new `cameraCaptureControl.*`
  namespace (capability/permission/device error messages, capture
  panel title, Cancel/Uploading/Capture). Extracted its inline
  `style={{...}}` blocks (all static) to new `.ccc-*` classes.
  Renamed two `.forEach(t => t.stop())` loop variables to `track` —
  they shadowed the newly-introduced `t()` translation function.
- **`BarcodeScanner.tsx`** — new `barcodeScanner.*` namespace
  (permission/device/start-failure error messages, requesting/
  scanning hints, Cancel). Already used real classes throughout, so
  i18n only.
- **`PostSignoutBillingChangeModal.tsx`** — new
  `postSignoutBillingChangeModal.*` namespace (header, intro,
  reason/comment labels and placeholder, Cancel/Confirm). Already
  used real classes, so i18n only.
- **`CorrectAppliedCodeModal.tsx`** — new `correctAppliedCodeModal.*`
  namespace (header, intro, corrected-code label, Cancel/Correct
  Code).
  - **Real copy cleanup**: the intro paragraph had picked up this
    codebase's own comment habit of qualifying things as "Real, …" —
    "Real, per direct guidance's own 'credit the old, charge the
    new' pattern…" leaked into the actual on-screen text. Same
    "leaked rhetorical tic" pattern already found and fixed twice in
    `MolecularPlateBuilderPage.tsx` (batch 16). Cleaned to plain
    English before translating.
- **`RequestReviewModal.tsx`** — the largest file this batch. New
  `requestReviewModal.*` namespace covering the header, the sent-
  confirmation screen, the review-type picker, the code-review
  routing notice, the colleague search/list, the optional-note field,
  the info notice, and the action buttons.
  - Extracted its ~30 inline `style={{...}}` blocks to new `rrm-*`
    classes in `pathscribe.css`. The genuinely dynamic, per-state
    ones (review-type button, colleague row, avatar, send button —
    all vary by selection/enabled state) keep their dynamism via CSS
    custom properties (`--rrm-type-border`, `--rrm-row-bg`,
    `--rrm-avatar-color`, `--rrm-send-bg`, etc.) referenced from the
    class; everything else became a plain static rule.
  - **Deliberate judgment call**: `NOTE_TYPES[].label` (the English
    strings that get folded into the message body/subject actually
    sent via `mockMessageService.send()`) stays untranslated —
    that's persisted data a *different* recipient reads later in
    their own session, with no mechanism to re-localize it at read
    time, the same "exported/persisted data stays English" call this
    sweep already makes for CSV headers and AI-prompt text. A
    separate `labelKey` was added on each entry for the on-screen
    type-picker buttons, which *are* translated. `informalReviewService`'s
    `note` field (the user's own free-text) was already untouched —
    it's genuine user input, not app copy, regardless of locale.
  - Two sentences needed a value bolded mid-sentence ("Case **X** has
    been added to the pool", "**Name** has been sent a message…").
    Added a small `boldSubstrings()` helper that resolves the
    sentence via `t()` first, then locates each value by `indexOf`
    and wraps it — the same resolve-then-slice approach already used
    for the clickable-link-inside-a-sentence case in
    `MolecularPlateBuilderPage.tsx` (batch 16), generalized to plain
    `<strong>` emphasis and to more than one value per sentence.
  - Renamed the `NOTE_TYPES.map(t => ...)`/`.find(t => ...)` loop
    variable to `nt` — shadowed the new `t()` translation function.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**.
- All five locale files verified programmatically to have identical
  key sets — **2619 → 2686 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Synoptic/SynopticSidebar.tsx`
- `src/components/Icons/Icons.tsx` (unchanged, included for completeness)
- `src/components/SpecimenPicker/SpecimenDictionaryPicker.tsx`
- `src/components/GrossingHardware/CameraCaptureControl.tsx`
- `src/components/BarcodeScanner/BarcodeScanner.tsx`
- `src/components/Billing/PostSignoutBillingChangeModal.tsx`
- `src/components/Billing/CorrectAppliedCodeModal.tsx`
- `src/components/RequestReview/RequestReviewModal.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/pathscribe.css`
- `src/i18n/README.md`

Next up: a completeness check on directories already showing
`useTranslation` — see below, this turned out to matter.

---

## `NavBar/` — completeness pass, batch 19

### Why this batch exists

Started as a quick completeness check on directories that already
showed `useTranslation` (per batch 18's note not to assume "has the
hook" means "fully converted"). `NavBar/` was exactly that trap: 2 of
3 files already imported `useTranslation`, but `NavBar.tsx` itself
had only ever translated its one Logout button — the entire
`SystemInfoModal` (23 rows across 5 sections), the Clinical Links
modal, the Focused Mode switch-back button, the avatar tooltip, and
the Messages button's aria-label/title were all still hardcoded
English, plus 5 leftover inline `style={{...}}` blocks.
`NavBarScanStation.tsx` (179 lines) had never been touched at all.
Given `NavBar` renders on effectively every authenticated page, this
was worth finishing properly rather than leaving partially done.

### Files swept this batch

- `src/components/NavBar/NavBar.tsx` (452 lines) — completed, was ~5% converted
- `src/components/NavBar/NavBarScanStation.tsx` (179 lines) — 0% → 100%

Closes out `NavBar/` at 3/3 files fully converted.

### What changed

- **`NavBar.tsx`** — new `navBar.*` namespace (Close, Messages/
  Messages-unread, Clinical Links, External Resources, Focused Mode,
  the avatar tooltip) plus a nested `navBar.systemInfo.*` namespace
  for every row label, section header, and status string in the
  System Info modal (23 rows across User/Application/AI Provider/
  Browser & System/API Connectivity, plus the footer hint and Copy
  button).
  - Extracted the 4 static inline `style={{...}}` blocks (System Info
    modal width, Links modal width, Focused Mode button sizing) to
    new `.nb-*` classes; the one genuinely dynamic style (the
    Messages icon's urgent color) keeps its dynamism via a CSS custom
    property.
  - **Deliberate judgment call**: `handleCopy()`'s clipboard "Support
    Report" text block — the plain-text diagnostic dump meant to be
    pasted into a support ticket — stays English. It's generated once
    and read by PathScribe support staff in a different context
    entirely, not UI re-rendered per viewer; same "exported/persisted
    data stays English" call this sweep already makes for CSV headers
    and AI-prompt text. The on-screen modal *rows* showing the same
    kind of information are ordinary UI chrome and are translated.
  - Left untranslated as real product-identity/proper-noun literals:
    "ForMedrix · PathScribe AI" (brand), Product/Company/Version
    values ("PathScribe AI", "ForMedrix", "0.9.0"), the
    `EXTERNAL_LINKS[].name` values (CAP, WHO, PathologyOutlines,
    UpToDate — real third-party resource names), and "Dr. Sarah
    Johnson" / "MD, FCAP" (literal fallback mock-user data, matching
    `WorklistPage`'s own `CURRENT_USER_NAME` fallback precedent from
    batch 15). The brand name inside the footer's redaction hint is
    passed through as a `{{brand}}` interpolation value rather than
    baked into the translated sentence.
- **`NavBarScanStation.tsx`** — new `navBarScanStation.*` namespace
  covering the provenance labels ("fixed to this station"/"your own
  default"/"no station set"), the Go-to-Bench and station-picker
  button titles (interpolated with the station name), the dropdown
  menu, and the "clear this terminal's fixed station" action. Already
  used real classes throughout, so i18n only.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing** (no
  dedicated test file exists for either component).
- All five locale files verified programmatically to have identical
  key sets — **2686 → 2745 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/NavBar/NavBar.tsx`
- `src/components/NavBar/NavBarScanStation.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/pathscribe.css`
- `src/i18n/README.md`

Next up: `ExternalConsult/ExternalConsultAccessModal.tsx` — see below.

---

## `ExternalConsult/` — file-by-file sweep, batch 20

### Files swept this batch

- `src/components/ExternalConsult/ExternalConsultAccessModal.tsx` (293 lines)

Closes out `ExternalConsult/` at 1/1 files.

### What changed

New `externalConsultAccessModal.*` namespace covering the disclosure
banner, the header (list/issue/created titles), the token list (with
a `STATUS_LABEL_KEY` label-key map alongside the existing
`STATUS_COLOR` map — the real status value stays untouched for the
color lookup and as underlying data; only the displayed badge text is
translated, same pattern as `WorklistPage`'s `FILTER_LABEL_KEY`), the
issue form (consultant identifier/organization/scope/note fields,
validation errors), and the created-link screen.

- **Real PHI gap found and fixed**: the header's case-label line
  (`{accessionNumber} · {patientName}`) had no `data-phi` attribute at
  all — every sibling modal in this app (`RequestReviewModal.tsx`,
  batch 18) tags the equivalent composite line `data-phi="true"`; this
  one was silently missed. Added it. The consultant's own name
  (`consultantIdentifier`) is explicitly *not* tagged — it's the
  outside doctor's name, not patient-identifying data, so tagging it
  would have been a false positive in the other direction.
- Extracted roughly 25 inline `style={{...}}` blocks to new `eca-*`
  classes (reusing `ps-conf-required`, `rrm-optional-label`,
  `rrm-textarea`, `rrm-strong`, and `rrm-cancel-btn` from
  `RequestReviewModal.tsx`'s own batch-18 classes where they matched
  exactly, rather than duplicating them). The genuinely dynamic ones
  (scope-mode button, status badge, submit-button cursor) keep their
  dynamism via CSS custom properties.
- Renamed the `tokens.map(t => ...)` loop variable to `tok` — shadowed
  the new `t()` translation function.
- **Real test fix required**: this file has a dedicated test,
  `ExternalConsultAccessModal.test.tsx`, whose own header comment
  explicitly noted "This component has no useTranslation() calls…so
  react-i18next isn't mocked here" — true before this batch, no longer
  true after. Its assertions (`getByText('Active')`,
  `getByText('Revoke')`, etc.) started failing because the real
  i18next instance (`src/i18n/config.ts`, which calls `i18n.init()` as
  a module-load side effect) was never initialized in this test
  file's module graph — `t()` had nothing to resolve keys against, so
  it returned the raw key string instead of English text. Fixed with
  the same side-effect import `main.tsx` itself uses
  (`import '@/i18n/config'`) at the top of the test file, and updated
  the stale comment. This is the first file in the sweep where an
  existing dedicated test asserted literal on-screen text against a
  component being converted — worth flagging for future batches:
  check for this exact failure mode (raw translation keys rendered
  instead of resolved text) whenever a dedicated test exists.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing** —
  including the now-fixed `ExternalConsultAccessModal.test.tsx`.
- All five locale files verified programmatically to have identical
  key sets — **2745 → 2788 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/ExternalConsult/ExternalConsultAccessModal.tsx`
- `src/components/ExternalConsult/ExternalConsultAccessModal.test.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/pathscribe.css`
- `src/i18n/README.md`

Next up: read-through completeness check on `Autopsy/` and
`OrSuiteDashboard/` — see below, this turned out to matter too.

---

## `Autopsy/` and `OrSuiteDashboard/` — completeness pass, batch 21

### What this batch found

A proper line-by-line read (not just a grep for leftover inline
styles) of the two directories flagged as "provisional" in batch 20.

`Autopsy/AutopsyAuthorizationCompletionForm.tsx` and
`AutopsyBodyReleaseForm.tsx` — genuinely complete. No hardcoded
strings, no inline styles left.

`OrSuiteDashboard/OrBoardRow.tsx` — one real gap: `resolveCurrentWorkflowStep()`
(in `resolveActiveIntraopRequestsForLocations.ts`, a services-layer
function, not the component itself) returns one of 4 English display
strings directly ("Pathologist Review", "Sectioning", "Touch Prep",
"Grossing") based on which milestones a specimen has. `OrBoardRow.tsx`
rendered that value straight through with no way to translate it —
every other string in the file already went through `t()`.

### What changed

- **`resolveActiveIntraopRequestsForLocations.ts`**: `resolveCurrentWorkflowStep()`
  now returns a stable key (`CurrentWorkflowStep`: `'grossing' |
  'touch_prep' | 'sectioning' | 'pathologist_review'`) instead of the
  display string. The `ActiveIntraopRequest.currentWorkflowStep` field
  type follows suit. Same "keep the real value untouched, translate
  only what's displayed" call this sweep already makes with label-key
  maps (`WorklistPage`'s `FILTER_LABEL_KEY`,
  `ExternalConsultAccessModal`'s `STATUS_LABEL_KEY` from batch 20) —
  here it required a small service-layer change rather than a
  component-local map, since the English string was being generated
  one layer down, not just displayed.
- **`OrBoardRow.tsx`**: new `WORKFLOW_STEP_LABEL_KEY` map translates
  the key for display. New `orSuiteDashboard.workflowStep.*` locale
  keys (nested under the namespace this component already used).
- **Two real test updates required** (mechanical, not behavioral):
  `resolveActiveIntraopRequestsForLocations.test.ts` asserted the old
  display strings as the function's return value — updated to the new
  keys. `resolveOrBoardRowDisplayState.test.ts`'s mock data literal
  updated to match the new field type.
- **A third test needed a one-line fix for a different reason**:
  `OrSuiteDashboardPage.test.tsx` deliberately mocks `react-i18next`
  to make `t()` return the raw key (an established, intentional
  convention in this specific test file, documented in its own header
  — unlike the real bug fixed for `ExternalConsultAccessModal.test.tsx`
  in batch 20, where the component had never been given a translation
  mock at all). Its one assertion checking the old literal `'Grossing'`
  text became `'orSuiteDashboard.workflowStep.grossing'` — the raw key
  now rendered, matching every other assertion in that same file.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**.
- All five locale files verified programmatically to have identical
  key sets — **2788 → 2792 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/OrSuiteDashboard/OrBoardRow.tsx`
- `src/services/intraopDashboard/resolveActiveIntraopRequestsForLocations.ts`
- `src/services/intraopDashboard/resolveActiveIntraopRequestsForLocations.test.ts`
- `src/services/intraopDashboard/resolveOrBoardRowDisplayState.test.ts`
- `src/pages/OrSuiteDashboardPage.test.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

Next up: task #180 continues into fresh territory. `Config/`,
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, `AppShell.tsx`,
and `Worklist/WorklistTable.tsx` remain flagged as their own future
batches given their size — none of the smaller, simpler directories
have an obvious next candidate surveyed yet, so the next batch should
start with a fresh small-directory survey the way batch 18 did.
`SynopticReportPage` (23,896 lines / 54 files, 3/54 converted) is
unchanged and still pending.

## `InternalNotes/`, `TemplateRequest/`, `EnhancementRequest/`,
## `Audit/` — file-by-file sweep, batch 22

## Files swept this batch

- `InternalNotes/InternalNotesDrawer.tsx`
- `TemplateRequest/TemplateRequestModal.tsx`
- `EnhancementRequest/EnhancementRequestButton.tsx`
- `EnhancementRequest/EnhancementRequestModal.tsx`
- `Audit/BreakGlassRebindModal.tsx`
- `Audit/InterfaceExceptionReviewModal.tsx`

All six were at 0% — none had `useTranslation` before this batch.

## What changed

- **`InternalNotesDrawer.tsx`** — full inline-style-to-class
  conversion (`ind-*`, ~35 classes/rules, several driven by CSS custom
  properties for the note-type/visibility/save-button active states)
  plus full i18n. Replaced the imported, English-only
  `INTERNAL_NOTE_TYPE_LABELS` service export with a local
  `NOTE_TYPE_LABEL_KEY` map (same label-key-map pattern used
  throughout this sweep) — the service export itself is untouched at
  its source since nothing else imports it. The delete button's
  removed `onMouseEnter`/`onMouseLeave` inline hover handlers became a
  plain `.ind-delete-btn:hover` rule.
- **`TemplateRequestModal.tsx`** — full conversion (`trm-*` classes).
  The organ list and the urgency labels use the label-key-map
  pattern: the real English value is what's embedded in the message
  subject/body/JSON metadata sent to the admin pool via
  `messageService.send()` (persisted, read in a different context, so
  it stays English); only the on-screen `<option>`/radio text is
  translated. The submitted-confirmation sentence uses the same
  `boldSubstrings()` helper as `RequestReviewModal.tsx` (a local copy,
  not exported) to bold the interpolated organ/standard/procedure
  values correctly regardless of a locale's word order.
- **`EnhancementRequestButton.tsx`** — i18n for the tooltip; the
  inline style + `onMouseEnter`/`onMouseLeave` opacity hover became a
  plain `.erb-trigger-btn:hover` rule; removed one dead commented-out
  duplicate `fontSize` line found along the way.
- **`EnhancementRequestModal.tsx`** — full conversion (`erm-*`
  classes). Same label-key-map treatment as `TemplateRequestModal.tsx`
  for category/priority: the real value is what's emailed to the
  product/QA team via `submitEnhancementRequest()`, so it stays
  English in the payload; only the chip/button display text is
  translated. The PHI-redaction summary line (field count, PDF-masked
  count) uses i18next's `_one`/`_other` plural keys instead of the
  original manual `!== 1 ? 's' : ''}` string-building.
- **`BreakGlassRebindModal.tsx`** / **`InterfaceExceptionReviewModal.tsx`**
  — both already used the app's shared `ps-*` classes throughout (no
  meaningful inline-style cleanup needed beyond one static
  `width: min(600px, 92vw)`, moved to a one-line modifier class), so
  this batch was almost entirely i18n. Both files' on-screen copy had
  the codebase's own "Real, " rhetorical tic leaked into it (e.g. "a
  real Case", "the real, confirmed EHR patient", "a real, unresolved
  identity issue") — cleaned before translating, same call already
  made for `CorrectAppliedCodeModal.tsx` and
  `MolecularPlateBuilderPage.tsx` earlier in this sweep. Two persisted
  audit-trail note strings (written via
  `interfaceExceptionService.resolve()`, read later by other admins)
  stay English by the same "exported/persisted data stays English"
  rule as message bodies elsewhere — one of them had the same "real"
  tic and was cleaned for wording quality without being translated.
  Also **two real missing-`data-phi` bugs found and fixed**: the
  source/target patient name+MRN+DOB cards in
  `InterfaceExceptionReviewModal.tsx`, and the patient-search-result
  rows in `BreakGlassRebindModal.tsx`, were rendering patient names
  and MRN/DOB with no `data-phi` tag at all.

## Validation

- `npx tsc --noEmit -p .`: clean after every file.
- Full suite: **499/499 test files, 4329/4329 tests passing**. None of
  the six files had a dedicated test file, so neither of the two
  i18n-test-breakage patterns from batches 20–21 applied here.
- All five locale files verified programmatically to have identical
  key sets across every namespace added this batch — **2792 → 2979
  leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/InternalNotes/InternalNotesDrawer.tsx`
- `src/components/TemplateRequest/TemplateRequestModal.tsx`
- `src/components/EnhancementRequest/EnhancementRequestButton.tsx`
- `src/components/EnhancementRequest/EnhancementRequestModal.tsx`
- `src/components/Audit/BreakGlassRebindModal.tsx`
- `src/components/Audit/InterfaceExceptionReviewModal.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## Next up

Task #180 continues. `Config/`, `TemplateBuilder/`,
`QualityAssurance/`, `Common/`, `AppShell.tsx`, and
`Worklist/WorklistTable.tsx` remain flagged as their own future
batches given their size — the next batch should start with a fresh
small-directory survey (`Search/`, `Flags/`, `Editor/`,
`ValidationStudies/`, `ClientDictionary/`, `FacilityDictionary/`,
`Worklist/`, `Voice/`, `Contribution/` have been noted at a
directory-line-count level but not yet read file-by-file).
`SynopticReportPage` is unchanged and still pending.

## `Voice/`, `Flags/`, `Search/`, `Worklist/`, `Contribution/` —
## file-by-file sweep, batch 23

## Files swept this batch

- `Voice/VoiceMissPrompt.tsx`
- `Voice/VoiceSettings.tsx`
- `Voice/VoiceToggleButton.tsx`
- `Voice/SpeechConfigTab.tsx`
- `Voice/VoiceCommandOverlay.tsx`
- `Flags/AutoCreatedBanner.tsx`
- `Search/ReassignCasePatientPanel.tsx`
- `Worklist/SlideDetailDrawer.tsx`
- `Worklist/PoolClaimModal.tsx`
- `Contribution/FlagRow.tsx`
- `Contribution/CaseMixTile.tsx`

All eleven were at 0% — none had `useTranslation` before this batch.
This batch opened with a directory-level survey of nine
previously-unexamined `src/components/` subdirectories (`Search/`,
`Flags/`, `Editor/`, `ValidationStudies/`, `ClientDictionary/`,
`FacilityDictionary/`, `Worklist/`, `Voice/`, `Contribution/`), all
found at 0% conversion; the larger files in each (`CaseSearchBar.tsx`,
`FlagManagerModal.tsx`, `PathScribeEditor.tsx`,
`ValidationStudiesSection.tsx`, `ClientEditorModal.tsx`,
`FacilityEditorModal.tsx`, `WorklistTable.tsx`, `QualityTab.tsx`,
`ProductivityTab.tsx`, `AIContributionTab.tsx`, and the two
`IdentifierFormatsTab.tsx` copies) are flagged as their own future
dedicated batches, same treatment already given to `Config/`,
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`.

## What changed

- **All five `Voice/` files** — full conversion (`vmp-*`, `vset-*`,
  `vtb-*`, `sct-*`, `vco-*` classes, several driven by CSS custom
  properties for active/badge/dot colors). `VOICE_PROFILES[].label`
  and voice-macro `spoken`/`written` text (user-authored data, not UI
  chrome) were deliberately left untranslated, along with the raw
  spoken transcript shown in `VoiceMissPrompt.tsx`/
  `VoiceCommandOverlay.tsx`. **Found and fixed a genuine, unrelated
  bug along the way**: `VoiceToggleButton.tsx` referenced a
  `dictPulse` CSS animation that had no global `@keyframes` definition
  anywhere in the codebase — it only ever appeared to work because
  `VoiceCommandOverlay.tsx` happens to mount at the same time and
  injects the same keyframe name via its own local `<style>` tag.
  Fixed by adding one canonical global `@keyframes dictPulse` to
  `pathscribe.css`.
- **`AutoCreatedBanner.tsx`** — small i18n-only conversion (`acb-*`
  classes on top of the shared `.banner-warning`), with the flag count
  using i18next's `_one`/`_other` plural keys.
- **`ReassignCasePatientPanel.tsx`** — full conversion (`rcpp-*`
  classes) plus three "Real, "-tic cleanups. Required refactoring the
  local `statusMessage` state from `string` to `React.ReactNode` (plus
  a new `moveOk: boolean | null` state for the success/error color
  logic) so the success message could embed a `<span
  data-phi="name">` around the target patient's name — the same
  `React.ReactNode` pattern `ConfirmModal.tsx`'s own `message` prop
  already uses for this reason. **Two real missing-`data-phi` bugs
  found and fixed**: the attribution paragraph and the confirmation
  message were both rendering patient name/MRN/accession with no
  `data-phi` tag at all.
- **`SlideDetailDrawer.tsx`** — full conversion. `SLIDE_STATUS_LABEL`
  became `SLIDE_STATUS_LABEL_KEY` (label-key-map pattern). Three
  static inline styles became `sdd-*` modifier classes on the shared
  `.wl-dp-badge`. Two "Real, " tics cleaned. Deliberately left
  `readiness.summaryText`/`triage.primaryText`/
  `triage.biomarkerSummary` (computed diagnostic summary text from
  `resolveWorklistDpBadges.ts`, not static UI chrome) untranslated,
  consistent with leaving service-generated clinical text alone
  elsewhere in this sweep. **One real missing-`data-phi` bug found and
  fixed**: the accession/patientName/MRN subtitle line had no
  `data-phi` tag.
- **`PoolClaimModal.tsx`** — full conversion. Uses the same local
  `boldSubstrings()` helper as `TemplateRequestModal.tsx`/
  `RequestReviewModal.tsx` for the two single-bolded-value sentences
  (blocked-by name; pool name + config path). The two
  multi-colored-phrase "Ready/Acting" description sentences use
  sentence-fragment `t()` key composition rather than introducing
  react-i18next's `<Trans>` component (confirmed via grep to be unused
  anywhere else in this codebase) — consistent with the sweep's
  established pragmatic-fragment style. The admin access-request
  email subject/body sent via `sendAccessRequestToAdmins()` stays
  English (persisted, read by a different-context reader). No PHI
  appears in this modal, so no `data-phi` changes were needed.
- **`FlagRow.tsx`** / **`CaseMixTile.tsx`** — small Contribution
  Dashboard tiles, fully converted. Severity/category labels use the
  label-key-map pattern (`SEVERITY_LABEL_KEY`/`CATEGORY_LABEL_KEY`);
  the underlying `Severity`/`CaseMixData` keys stay untouched.
  `CaseMixTile.tsx`'s dynamic bar height/color/opacity moved to CSS
  custom properties on a new `cmt-*` class set; its now-unused
  `pathscribeTheme` import and local `t` alias (dead code once the
  inline styles were replaced) were removed.

## Validation

- `npx tsc --noEmit -p .`: clean after every file.
- Full suite: **499/499 test files, 4329/4329 tests passing**. None of
  the eleven files had a dedicated test file, so neither of the two
  i18n-test-breakage patterns from batches 20–21 applied here.
- All five locale files verified programmatically to have identical
  key sets across every namespace added this batch — **3030 → 3120
  leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/Voice/VoiceMissPrompt.tsx`
- `src/components/Voice/VoiceSettings.tsx`
- `src/components/Voice/VoiceToggleButton.tsx`
- `src/components/Voice/SpeechConfigTab.tsx`
- `src/components/Voice/VoiceCommandOverlay.tsx`
- `src/components/Flags/AutoCreatedBanner.tsx`
- `src/components/Search/ReassignCasePatientPanel.tsx`
- `src/components/Worklist/SlideDetailDrawer.tsx`
- `src/components/Worklist/PoolClaimModal.tsx`
- `src/components/Contribution/FlagRow.tsx`
- `src/components/Contribution/CaseMixTile.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## Next up

Task #180 continues. The larger files flagged during this batch's
opening survey (`CaseSearchBar.tsx`, `FlagManagerModal.tsx`,
`PathScribeEditor.tsx`, `ValidationStudiesSection.tsx`,
`ClientEditorModal.tsx`, `FacilityEditorModal.tsx`,
`WorklistTable.tsx`, `QualityTab.tsx`, `ProductivityTab.tsx`,
`AIContributionTab.tsx`, and the two `IdentifierFormatsTab.tsx`
copies) join `Config/`, `TemplateBuilder/`, `QualityAssurance/`,
`Common/`, and `AppShell.tsx` as future dedicated batches given their
size. The remaining small, not-yet-swept files in `Search/`
(`CaseSearchResultRow.tsx` or similar), `Flags/`, `Editor/`,
`ValidationStudies/`, `ClientDictionary/`, and `FacilityDictionary/`
are candidates for the next batch. `SynopticReportPage` is unchanged
and still pending.

## `Editor/`, `ValidationStudies/`, `Contribution/`, `ClientDictionary/`,
## `FacilityDictionary/` — file-by-file sweep, batch 24

## Files swept this batch

- `Editor/NarrativeEditor.tsx`
- `ValidationStudies/ModelStoreModal.tsx`
- `Contribution/MentorTab.tsx`
- `ClientDictionary/ClientTable.tsx`
- `FacilityDictionary/FacilityTable.tsx`

All five were at 0% — none had `useTranslation` before this batch.
This batch picked up the small remaining files from batch 23's
directory survey, deliberately leaving the flagged large files
(`PathScribeEditor.tsx`, `ValidationStudiesSection.tsx`,
`ClientEditorModal.tsx`, `FacilityEditorModal.tsx`, the two
`IdentifierFormatsTab.tsx` copies, `QualityTab.tsx`,
`ProductivityTab.tsx`, `AIContributionTab.tsx`) for their own future
dedicated batches.

## What changed

- **`NarrativeEditor.tsx`** — a thin wrapper around
  `PathScribeEditor.tsx`. Its one inline style became `.ne-wrap`; its
  default `placeholder` prop moved from a destructuring default (which
  can't call `t()`) to a `placeholder ?? t('narrativeEditor.defaultPlaceholder')`
  fallback resolved inside the component body.
- **`ModelStoreModal.tsx`** — full conversion (`msm-*` classes). The
  `VENDOR_LABEL` map (Anthropic/OpenAI/Google/Other — proper nouns)
  was left as-is; everything else on screen (the intro copy, empty/
  loading/error states, the per-listing "Published … benchmark …%"
  meta line) was translated.
- **`MentorTab.tsx`** — i18n conversion on top of its existing shared
  `.ps-contrib-*` classes (only one small new class needed). The
  countersigned-case count uses i18next's `_one`/`_other` plural keys.
  `progress.label` (from `describeSupervisionProgress()` in
  `caseMixCalculations.ts`) was deliberately left untranslated — it's
  computed diagnostic/progress text generated by a service function,
  not static UI chrome, consistent with how similar service-generated
  text (`resolveWorklistDpBadges.ts`'s summary strings, interface-
  exception `reason` fields) has been left alone elsewhere in this
  sweep.
- **`ClientTable.tsx`** / **`FacilityTable.tsx`** — the two heaviest
  files in this batch: near-line-for-line duplicate components (one
  literally imports `Facility as Client`), each almost entirely
  inline-styled. Both got a full conversion to a single **shared**
  `fct-*` CSS class set (rather than two separate near-identical
  copies of the same ~50 rules) — a deliberate exception to this
  sweep's usual per-component class-prefix convention, justified by
  the two components already being verbatim duplicates of each other.
  `FACILITY_ROLE_LABELS` and `JURISDICTION_LABELS` (imported from
  `IFacilityService.ts`/`systemConfig.ts`) were left untranslated —
  both are shared registries referenced from `Config/`,
  `QualityAssurance/`, and `AccessionPage.tsx` as well, so translating
  them belongs to those files' own future dedicated batches, not this
  one. A stray leftover `// ── Delete confirmation ──` comment
  heading a since-removed block (dead code) was dropped from both
  files during the rewrite.

## Validation

- `npx tsc --noEmit -p .`: clean after every file.
- Full suite: **499/499 test files, 4329/4329 tests passing**. None of
  the five files had a dedicated test file, so neither of the two
  i18n-test-breakage patterns from batches 20–21 applied here.
- All five locale files verified programmatically to have identical
  key sets across every namespace added this batch — **3120 → 3204
  leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/Editor/NarrativeEditor.tsx`
- `src/components/ValidationStudies/ModelStoreModal.tsx`
- `src/components/Contribution/MentorTab.tsx`
- `src/components/ClientDictionary/ClientTable.tsx`
- `src/components/FacilityDictionary/FacilityTable.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## Next up

Task #180 continues. The large files flagged across batches 23–24
(`Search/CaseSearchBar.tsx`, `Flags/FlagManagerModal.tsx`,
`Editor/PathScribeEditor.tsx`,
`ValidationStudies/ValidationStudiesSection.tsx`,
`ClientDictionary/ClientEditorModal.tsx`,
`FacilityDictionary/FacilityEditorModal.tsx`, the two
`IdentifierFormatsTab.tsx` copies, `Worklist/WorklistTable.tsx`,
`Contribution/QualityTab.tsx`, `Contribution/ProductivityTab.tsx`,
`Contribution/AIContributionTab.tsx`) remain queued as their own
dedicated batches, alongside the long-standing `Config/`,
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. With this batch, every small file in the nine
directories surveyed at the start of batch 23 has now been swept —
the next batch should tackle one of the queued large files directly
rather than another directory survey. `SynopticReportPage` is
unchanged and still pending.

## `Search/CaseSearchBar.tsx` — file-by-file sweep, batch 25

## Files swept this batch

- `Search/CaseSearchBar.tsx`

This was one of the large files flagged at the end of batch 23 (526
lines). It was at 0% — no `useTranslation` before this batch.

## What changed

- **`CaseSearchBar.tsx`** — unlike most files tackled by size alone in
  this sweep, this one already used the app's shared `ps-search-*`/
  `ps-casebar-*` classes throughout, so no CSS extraction was needed —
  this was an i18n-only conversion. Converted: the search placeholder
  (compact and full variants) and `aria-label`; the "Scanned"
  indicator; the "no case found" / "fetching from LIS" messages; the
  results-modal header ("Searching…" / "N case(s) match…", now using
  i18next's `_one`/`_other` plural keys); the six results-table column
  headers; the local `statusLabel` map (converted to the established
  `STATUS_LABEL_KEY` label-key-map pattern — the underlying case
  `status` string is untouched); the "N specimen(s)" sub-row text
  (plural keys again); and the "matched:" prefix on the match-hint
  line. Per-flag chip names (`hit.flags[].name`) are case data, not UI
  chrome, so left untranslated, same treatment as flag/label text
  elsewhere in this sweep.

  **One real missing-`data-phi` bug found and fixed**: the results
  row's `{hit.dob} · {hit.sex}` span had no `data-phi` tag at all —
  DOB is PHI under this codebase's own established convention (see
  `WorklistTable.tsx`'s and `OrderLookupModal.tsx`'s `data-phi="dob"`
  usage), and this row already carefully tagged the adjacent
  accession (`data-phi="accession"`) and patient-name
  (`data-phi="name"`) spans but skipped this one.

## Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the namespace added this batch — **3204 → 3227
  leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/Search/CaseSearchBar.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` changes this batch — the file already used
existing shared classes throughout.)

## Next up

`Flags/FlagManagerModal.tsx` (788 lines) is a reasonable next single-
file target, followed by `Editor/PathScribeEditor.tsx` (1033 lines).
The remaining queued large files —
`ValidationStudies/ValidationStudiesSection.tsx`,
`ClientDictionary/ClientEditorModal.tsx`,
`FacilityDictionary/FacilityEditorModal.tsx`, the two
`IdentifierFormatsTab.tsx` copies, `Worklist/WorklistTable.tsx`,
`Contribution/QualityTab.tsx`, `Contribution/ProductivityTab.tsx`,
`Contribution/AIContributionTab.tsx` — stay queued, alongside
`Config/`, `TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. `SynopticReportPage` is unchanged and still pending.

## `Flags/FlagManagerModal.tsx` — file-by-file sweep, batch 26

## Files swept this batch

- `Flags/FlagManagerModal.tsx`

788 lines, one of the large files flagged at the end of batch 23. It
was at 0% — no `useTranslation` before this batch.

## What changed

- **`FlagManagerModal.tsx`** — this file already used the app's
  extensive, pre-existing `.fm-*` class family (shared across
  `AddCodeModal.tsx`, `CaseTeamModal.tsx`, `DelegateModal.tsx`, several
  `Config/System/*` modals, etc.), so most of the work here was i18n
  plus reconciling a few inline-style spots against that shared
  system rather than inventing new classes:
  - Converted every on-screen string: the header eyebrow/title/badge,
    the left-panel target rows and empty-flags notes, the search
    placeholder and column headers (case/specimen-"level" via a new
    `LEVEL_LABEL_KEY` map), the catalog's empty states and per-card
    severity tooltip/Applied/+Apply text, the footer status text, the
    Discard-changes confirmation dialog, and the scope dialog (Remove
    from one specimen vs. all). Case/specimen counts use i18next's
    `_one`/`_other` plural keys throughout.
  - **Fixed a real cross-file bug while cleaning up the footer**: the
    Save button used the `fm-btn-cancel` class (semantically wrong —
    that's the Cancel button's class) with a large block of inline
    styles hand-rolling a green "ready to save" look, and the
    Cancel/Save buttons sat as bare siblings of the status text
    relying on a `flex: 1` hack to lay out correctly. This exact
    inline-style block is also duplicated verbatim in
    `CaseTeamModal.tsx`/`DelegateModal.tsx` (not touched here — out of
    this batch's scope) — but `AddCodeModal.tsx`, converted in an
    earlier batch, already shows the correct cleaned-up shape: the
    existing `.fm-btn-save` class plus an `.fm-footer-actions` wrapper
    div around the two buttons. This file was rebuilt to match that
    established, already-shared pattern instead of repeating the
    inline-style workaround.
  - Also reused the already-existing `.acd-footer-status--error`
    modifier (from `AddCodeModal.tsx`) for the save-error state,
    rather than inventing a new one.
  - Added `data-phi="accession"` to the case accession number shown in
    the header and the left-panel "Case {{accession}}" row (this
    modal previously showed it untagged). Specimen `label`/
    `description` text was deliberately left without a `data-phi` tag
    — checked against `WorklistTable.tsx`'s `SpecimenChip`, which
    doesn't tag these either, confirming that's this codebase's actual
    convention (specimen labels/descriptions aren't treated as PHI
    here, unlike patient name/MRN/DOB/accession).

## Validation

- `npx tsc --noEmit -p .`: clean (one redundant type-narrowing check
  TypeScript itself flagged — `hasTarget &&` already narrows
  `targetLevel` to `"case" | "specimen"` via aliased-condition control
  flow, so the follow-up `targetLevel !== "none"` check was removed).
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the namespace added this batch — **3227 → 3278
  leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/Flags/FlagManagerModal.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## `Editor/PathScribeEditor.tsx` — file-by-file sweep, batch 27

## Files swept this batch

- `src/components/Editor/PathScribeEditor.tsx`

1033 lines — the last of the three large files flagged at the end of
batch 23. This is the rich-text editor itself: the toolbar, its six
dropdown/modal sub-components (Find & Replace, Insert Table, Macro
picker, Line/Paragraph Spacing, Font/Highlight/Shading color picker,
Borders), and the Tiptap wiring underneath.

## What changed

- **New `pse-*` CSS class family** replacing inline styles across all
  six toolbar sub-components (`FindReplacePanel`, `InsertTableModal`,
  `MacroModal`, `SpacingDropdown`, `ColorPicker`, `BorderDropdown`) and
  the "Loading editor…" fallback state. The dropdown-anchored panels
  share a common `.pse-dropdown-panel` base for position/border/shadow,
  each with its own width override. `ColorPicker`'s per-swatch
  `background: color` stays inline (a literal, per-instance color
  value from the fixed `COLORS` list — same precedent as `FlagRow.tsx`
  in batch 23), and `InsertTableModal`'s grid keeps one inline
  `gridTemplateColumns` since the grid's column count is a genuine
  runtime variable.

- **Left the toolbar's own theming untouched, again.** `TBtn`/`Divider`
  read from `EditorThemeContext` (light/dark) and stay exactly as
  designed — this was already assessed as legitimate centralized
  theming in an earlier pass over this file, not inline-CSS sprawl.
  The one dropdown that genuinely needed the same theme-driven
  coloring — the tab-width menu (background/border/shadow, plus each
  option's active state) — got the `FlagRow.tsx`-style treatment
  instead of a plain class: static layout in `.pse-tabwidth-menu`/
  `.pse-tabwidth-item`, with the theme-dependent colors passed through
  as CSS custom properties (`--pse-tw-bg`, `--pse-tw-item-bg`, etc.)
  rather than hardcoded, so dark mode still works correctly.

- Converted every on-screen and tooltip string: all ~40 toolbar button
  `title`s (Bold/Italic/Underline/alignment/lists/headings/tables/
  macros/signature line/find & replace/undo-redo/theme toggle), the
  "Macro" button label, the tab-width tooltip and menu items (via
  `_one`/`_other` plurals — "space" vs. "spaces"), the six dropdown/
  modal sub-components' full text (find/replace fields and match
  count, table-size picker, macro search/empty state, spacing options,
  "No Color", border names), and the "Loading editor…" fallback.
  `ColorPicker`'s panel title is passed in from each toolbar call site
  (Font Color / Highlight / Paragraph Shading), so those three
  call-site strings were translated too, not just the component itself.

- Translated the inserted signature-line boilerplate ("Date:" /
  *Pathologist Signature*) — this is UI-generated content assembled
  and inserted into the report at the user's request, the same
  category as `NarrativeEditor.tsx`'s default placeholder text, not
  persisted/exported data that needs to stay English.

- **Fixed a real dead-prop bug.** The `placeholder` prop was destructured
  as `placeholder: _placeholder = '...'` (an ESLint unused-var
  underscore) and never actually used — no `@tiptap/extension-placeholder`
  was wired in, despite the package already being installed. This meant
  `NarrativeEditor.tsx` (converted in batch 24) has been passing a
  translated placeholder down to this component that was silently
  discarded the whole time. Fixed by importing and configuring the
  `Placeholder` extension for real: `placeholder` now flows through
  as `effectivePlaceholder` (falling back to a new translated default
  key when no prop is passed), memoized into a `placeholderExtension`
  and added to the editor's `extensions` array, with a matching
  `.is-editor-empty::before` CSS rule (using the theme's disabled-text
  color, so it still looks right in dark mode) added to the component's
  existing inline `<style>` block.

## Validation

- `npx tsc --noEmit -p .`: clean. (One intermediate error caught and
  fixed along the way: the local `X` icon from `../Icons` only accepts
  a `style` prop, not `className` — three toolbar delete-column/row/table
  badges tried to pass it a class; reverted those three back to inline
  `style` since the icon component itself doesn't support classes.)
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `pathScribeEditor` namespace added this batch —
  **3278 → 3357 leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/Editor/PathScribeEditor.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## `ValidationStudies/ValidationStudiesSection.tsx` — file-by-file sweep, batch 28

## Files swept this batch

- `src/components/ValidationStudies/ValidationStudiesSection.tsx`

1093 lines — the next large file in the queue. Configuration screen for
parallel-run AI validation studies: three sub-tabs (Studies, Dashboard,
Reports), five modal/sub-components (`StudiesTab`, `SubmitForReviewModal`,
`RecordApprovalModal`, `StudyFormModal`, `DashboardTab`, `ReportsTab`),
and a print-report HTML generator.

## What changed

- Converted every on-screen string across all six components: section
  titles/subtitles, empty states, table headers, form labels/placeholders/
  hints, the study status badges (new `STATUS_LABEL_KEY` map, replacing
  `STATUS_LABELS`), pluralized facility/pathologist/template counts
  (`_one`/`_other`), and the long "How this works — with an example"
  explainer panel (intro, a Beta-model note, six worked-example steps,
  a footer).

- **First use of `Trans` in this sweep.** The "How this works" panel has
  several sentences with multiple independent bolded phrases inside one
  paragraph (e.g. six numbered steps, each with its own bolded lead-in,
  and step 6 alone bolds four separate words: "Report.", "PASS",
  "CONDITIONAL PASS", "FURTHER REVIEW"). The established `boldSubstrings()`
  helper (used elsewhere in this codebase, and added to this file too)
  is designed for bolding a runtime *value* — a name, an ID — inside an
  already-translated sentence, not for marking up multiple independent
  static phrases within one string. `Trans` with a `components` prop
  keyed by tag name (e.g. `<strong>...</strong>` in the translation
  string, matched via `components={{ strong: <strong /> }}`) is the
  correct tool for that and is already supported by the installed
  `react-i18next` version. `boldSubstrings()` itself is still used
  for the two governance-modal sentences that really do bold a
  runtime-computed value (the translated status name, e.g. "Approved").

- **Left `buildReportHtml()` (the printed/exported validation report)
  in English**, along with `gradeResult()`'s `description` field that
  feeds it — both are documented inline with why: the generated report
  is a printed, persisted document (`finalGrade` gets written back to
  the study record) analogous to a CSV export or an audit-trail
  artifact, not on-screen UI chrome, so it follows this codebase's
  established "exported/persisted data stays English" convention.

- Replaced several inline `style={{...}}` blocks with new `.ps-vs-*`
  CSS classes on top of the file's existing shared class family:
  the study-form modal's fixed width/height, the "Browse the store"
  link button, various `marginTop`/`marginBottom` spacing tweaks, and
  the whole "How this works" panel's typography. The per-status study
  badge and the dashboard's status badge — previously inline
  `color`/`borderColor`/`background` computed from the `STATUS_COLORS`
  map — now pass those through as CSS custom properties consumed by
  `.ps-vs-study-badge`, the same pattern used for `FlagRow.tsx`'s
  severity badges. The various "green if meeting target, red if not"
  comparisons (KPI cards, table cells, report preview) became two
  small modifier classes, `.ps-vs-metric--good`/`.ps-vs-metric--bad`
  (plus `.ps-vs-kpi--good`/`.ps-vs-kpi--bad` for the KPI card border),
  replacing per-render inline color computation with a class driven by
  the same boolean.

- **Noticed, not fixed:** every one of the three sub-tabs (`StudiesTab`,
  `DashboardTab`, `ReportsTab`) accepts an `isSuperAdmin` prop, threaded
  all the way down from the top-level `ValidationStudiesSection`, but
  immediately discards it as `_isSuperAdmin` — none of them read it.
  Unlike the `PathScribeEditor.tsx` placeholder bug in batch 27, this
  isn't a mechanical wiring fix: nothing in this file specifies what a
  super-admin should be able to do that an ordinary admin can't, so
  actually gating something on it would mean guessing at a permissions
  model. Flagging it here as a real gap for whoever owns that decision,
  not silently dropping the prop or inventing behavior for it.

## Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `validationStudies` namespace added this batch —
  **3357 → 3492 leaf keys**, matched exactly across en/fr/de/nl/ko.

## What's in this zip

- `src/components/ValidationStudies/ValidationStudiesSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## Next up

Remaining queued large files: the two `IdentifierFormatsTab.tsx`
copies, `Worklist/WorklistTable.tsx`, `Contribution/QualityTab.tsx`,
`Contribution/ProductivityTab.tsx`, `Contribution/AIContributionTab.tsx`
— stay queued, alongside `Config/`, `TemplateBuilder/`,
`QualityAssurance/`, `Common/`, and `AppShell.tsx`. The duplicated
green-Save-button inline-style block noticed in
`CaseTeamModal.tsx`/`DelegateModal.tsx` back in batch 26 is still
worth a look whenever either of those files comes up for its own
pass, and the unused `isSuperAdmin` prop noticed in batch 28 is worth
a look whenever a real permissions model for the ValidationStudies
screen is defined. `SynopticReportPage` is unchanged and still
pending.

## ClientEditorModal.tsx / FacilityEditorModal.tsx — file-by-file sweep, batch 29

### Files swept this batch

- `src/components/ClientDictionary/ClientEditorModal.tsx`
- `src/components/FacilityDictionary/FacilityEditorModal.tsx`

The Add/Edit modal for a single facility record, ~1400 lines each.
Confirmed via `diff` to be near-verbatim duplicates (same pattern as
`ClientTable.tsx`/`FacilityTable.tsx` in batch 24) — same seven tabs
(General, LIS Integration, Identifier Formats, Reporting, TAT &
Escalation, AI & Performance, Locations), same helpers, same
validation, with one real content difference: `FacilityEditorModal.tsx`
has an extra "Abnormal Detection" field (gated on the
`performing_lab` role) that `ClientEditorModal.tsx` does not have.

### What changed

- **Shared CSS, separate locale namespaces** — the same pattern as
  `ClientTable`/`FacilityTable`. Both files now use one shared `cem-*`
  class family added to `pathscribe.css` (`.cem-input`, `.cem-label`,
  `.cem-section`, `.cem-chip-label`, `.cem-toggle-row`,
  `.cem-escalation-*`, `.cem-locations-*`, `.cem-footer-save`, and
  about 45 more), but each component reads its own locale namespace
  (`clientEditorModal` / `facilityEditorModal`) since the two files'
  copy differs in real, specific wording — not just the obvious
  "Client" vs "Facility" nouns, but structurally different hint text,
  option labels, and placeholders throughout (see below).

- **Removed the module-level `INPUT`/`LABEL`/`SECTION`/`grid2` style
  objects and the `onF`/`onB` focus/blur handlers entirely.** Those
  handlers existed only to manually set `e.currentTarget.style.
  borderColor` on focus/blur — replaced with plain `:focus`
  pseudo-class rules on `.cem-input` and the pre-existing
  `.ps-modal-dark-input`/`--error` classes. This removes real
  per-keystroke-adjacent JS in favor of native CSS, in keeping with
  this sweep's "inline CSS removed" mandate — not scope creep, since
  the handlers had no purpose beyond driving that one inline style.

- **Reused pre-existing exact-match classes where they genuinely
  matched** (`.ps-client-editor-grid-2`) and created new ones where
  they didn't (`.cem-section`, `.cem-label` — the existing
  `.ps-client-editor-section-label`/`-group-label` had different
  colors/sizes than this file's own `SECTION`/`LABEL` objects, so
  reusing them would have been a visual regression).

- **`FacilityEditorModal.tsx`'s extra Abnormal Detection field was
  preserved, not dropped or copied into the Client file.** It's
  gated on `hasRole('performing_lab')`, has its own checkbox
  (`facilityEditorModal.general.abnormalDetectionCheckbox`) and a
  hint explaining the enterprise-level/facility-level override
  relationship (`abnormalDetectionHint`) — translated like everything
  else, in the `facilityEditorModal` namespace only.

- **`FacilityEditorModal.tsx`'s translations use the file's own
  original English copy**, which was still present (unconverted) when
  this batch started, rather than reconstructed text — so its option
  labels keep their real detail (e.g. `"High - notify on next login"`,
  `"Pathology Group - all pathologists assigned to this facility"`,
  `"Hours from received before first-open escalation fires. Blank =
  system default."`). `ClientEditorModal.tsx` had already been
  rewritten with `t()` calls in an earlier session before this
  summary point, so its English source strings no longer existed to
  copy from; its `clientEditorModal` namespace uses shorter,
  reconstructed equivalents instead. The two files' wording therefore
  isn't byte-for-byte parallel — expected, since they're separate
  namespaces reflecting each file's own real copy, not a shared
  template.

- `REPORTING_OPTIONS` and `ESCALATION_TARGETS` (previously
  module-level arrays with hardcoded English labels) moved inside the
  component body in both files, since they now call `t()`.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for either component.
- All five locale files verified programmatically to have identical
  key sets across the `clientEditorModal` and `facilityEditorModal`
  namespaces added this batch — **3492 → 3658 → 3827 leaf keys**,
  matched exactly across en/fr/de/nl/ko at each step.

### What's in this zip

- `src/components/ClientDictionary/ClientEditorModal.tsx`
- `src/components/FacilityDictionary/FacilityEditorModal.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

Remaining queued large files: `Worklist/WorklistTable.tsx`,
`Contribution/QualityTab.tsx`, `Contribution/ProductivityTab.tsx`,
`Contribution/AIContributionTab.tsx`, alongside `Config/`,
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. `SynopticReportPage` is unchanged and still pending.

## IdentifierFormatsTab.tsx — file-by-file sweep, batch 30

### Files swept this batch

- `src/components/ClientDictionary/IdentifierFormatsTab.tsx`
- `src/components/FacilityDictionary/IdentifierFormatsTab.tsx`

The Identifier Formats tab embedded in both the Client and Facility
editor modals (485 lines each) — format rows with a live regex test
tool, a "simulate a scan" tool, and LIS-preset filtering.

### What changed

- **Confirmed via `diff` that these two files are not just near-
  duplicates but byte-for-byte identical apart from file-path and
  component-name references inside comments** — no rendered string
  differs between them at all. That's a real departure from every
  other twin pair swept so far (`ClientTable`/`FacilityTable`,
  `ClientEditorModal`/`FacilityEditorModal`), which all had at least
  some genuine wording differences and so kept separate locale
  namespaces. Here, duplicating one identical translation set under
  two namespace names would just be dead weight, so both files share
  a single `identifierFormatsTab` namespace instead. Each file still
  gets its own `t()` calls (they're separate components with separate
  import paths), just pointed at the same keys.
- Converted every on-screen string: the header/subtitle (enterprise
  vs. facility variants), the override toggle and its "not overridden"
  infobox, the jurisdiction/locale info card (including the
  `patientIdStandard`/`patientIdStandards` plural), the LIS-preset
  filter buttons, the Tier 1/Tier 2 section headers and empty states,
  every format row's kind badge, tier badge, barcode-type chips, live
  regex test field (placeholder, match/no-match result, and the
  pass/fail banner sentence), the "simulate a scan" tool, and the
  enhancement-request footer note.
- `KIND_LABELS` and `BARCODE_LABELS` (previously module-level
  `Record<.... string>` constants) moved inside the component/row
  where `t()` is available; `LIS_OPTIONS`' brand-name entries (CoPath,
  Epic Beaker, Sunquest, Cerner PathNet, Meditech) are left as literal
  strings — real product names, not UI copy — matching this sweep's
  established treatment of proper nouns.
- Replaced the two remaining inline `style={{...}}` blocks (the
  override-toggle row and the not-overridden infobox — everything
  else in this file already used its own `ps-idf-*` class family) with
  two small new classes, `.ps-idf-override-row`/`.ps-idf-override-
  checkbox`/`.ps-idf-override-label` and `.ps-idf-infobox`, added to
  `pathscribe.css`.
- **Noticed, not fixed:** `pathscribe.css` already carries the
  `.ps-idf-*` class block fully duplicated three times (confirmed via
  grep) before this batch touched it — this looks like accidental
  repeated appends from earlier work, not something introduced by
  this sweep. Full CSS de-duplication across the file is a much larger
  undertaking than one batch's scope; flagging it here as a real
  cleanup opportunity for a future pass rather than attempting it
  inline with this batch's own additions.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `identifierFormatsTab` namespace added this
  batch — **3827 → 3889 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/ClientDictionary/IdentifierFormatsTab.tsx`
- `src/components/FacilityDictionary/IdentifierFormatsTab.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

Remaining queued large files unchanged: `Worklist/WorklistTable.tsx`,
`Contribution/QualityTab.tsx`, `Contribution/ProductivityTab.tsx`,
`Contribution/AIContributionTab.tsx`, alongside `Config/`,
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. The pre-existing triplicated `.ps-idf-*`/
`.ps-body-modal-*` CSS block noticed this batch is worth a dedicated
cleanup pass of its own. `SynopticReportPage` is unchanged and still
pending.

## WorklistTable.tsx — file-by-file sweep, batch 31

### Files swept this batch

- `src/components/Worklist/WorklistTable.tsx`

2204 lines — the main case worklist table: sortable columns, status
dots, flag/specimen chips, pool/amendment/autopsy group-divider rows,
a card-view fallback for narrow windows, digital-pathology readiness
badges, staff assignment, and the Pediatric/Orchestration restricted-
access modals.

### What changed

- **i18n**: added `useTranslation()`/`Trans` to the main component and
  to all 5 module-level sub-components that render their own text
  (`FlagChip`, `SpecimenChip`, `StatusDot`, `UrgentDot`, `AbnormalDot`
  — each needed its own hook call, since they're separate
  `React.memo`'d components, not JSX fragments of the main one).
  Converted every on-screen string: the 13 column headers, the
  multi-sort ribbon (including the `asc`/`desc` direction badge), both
  empty states, every chip/dot tooltip (flag chip, specimen chip,
  status dot, urgent dot, abnormal-finding dot, deficiency warning,
  staff "Resident/Fellow" and "Message {{name}}" tooltips), the pool
  sub-state labels ("Grossed"/"New" and their tooltips), the mixed-
  report-status badge ("{{finalized}}/{{total}} Final"), the divider
  labels ("Urgent"/"All Cases", built inside the `displayRows` memo,
  not JSX — `t` added to that memo's own dependency array so they
  re-resolve on a language switch), the restricted-pool badges
  (`_one`/`_other` for the count), the card view's field labels
  (Patient, Accession · Physician, Specimen(s) — pluralized via
  `{{count}}` — Flags, Staff), the pediatric/orchestration restriction
  copy (both the inline hint text and the full-sentence variants), the
  digital-pathology badge tooltips, and both access-request modals
  (title/subtitle/body/buttons — the two modal bodies use `Trans` for
  their embedded `<em>`/`<strong>` markup, the same tool this sweep
  first used in `ValidationStudiesSection.tsx`, batch 28). New
  `worklistTable` namespace, 73 leaf keys × 5 locales.
  - Reused the app's existing top-level `common.close` key for both
    modals' Close buttons rather than adding a duplicate
    `worklistTable.common.close` — caught by grepping the existing
    locale files for "Close" before inventing a new key, the same
    reuse discipline `LoginPage.tsx` established for `common.cancel`.
  - Several column-header words (Patient, MRN, Sex, Accession, Status,
    Staff) were checked against existing translations elsewhere in the
    locale files (`caseSearchBar.col.*`, `billingLogs.table.*Header`,
    `intraopQueue.*.mrnLabel`) and matched to the same wording for
    cross-page consistency, rather than inventing new phrasing.
  - **Deliberately left in English, per this sweep's established
    "exported/persisted data stays English" convention**: every
    `auditService.logEvent()` `event`/`detail` string (Pediatric/
    Orchestration Access Denied/Requested — 4 call sites), and the
    `subject`/message body/title passed to `openComposeTo()` and
    `sendAccessRequestToAdmins()` — all of these are either an
    audit-trail record or text composed *for a different reader*
    (the compose drawer's pre-filled subject, the email/message sent
    to System Admins), not UI chrome rendered for the pathologist
    looking at this table. Each site now carries an inline comment
    explaining why, matching the pattern already used in
    `ValidationStudiesSection.tsx`'s printed report.
  - **Also left untranslated, and flagged as a real, separate gap**:
    `resolveDigitalReadinessBadge`/`resolveDpTriageBadge`'s own
    `summaryText`/`primaryText`/`biomarkerSummary` output (rendered
    directly in the Digital Readiness/DP AI Triage columns) — that
    text is generated in `services/digitalPathology/
    resolveWorklistDpBadges.ts`, a file this batch didn't visit, so
    per the sweep's "only what's actually touched" boundary it's
    unconverted. Same reasoning for the pool-group/amendment-group/
    autopsy-group divider *labels themselves* (e.g. a real per-pool
    name like "GI Pool — Urgent", "Amendment & Correction", "Fully
    Authorized") — those strings originate in `poolGrouping.ts`,
    `amendmentGrouping.ts`, and `autopsyGrouping.ts` respectively, not
    in this file; only the two divider labels actually built *inside*
    `WorklistTable.tsx` itself ("Urgent"/"All Cases") were converted.
    "RES" (the resident badge's own compact text) was deliberately
    left as a domain abbreviation, same treatment as MRN/DOB elsewhere
    in this file — only its tooltip is real UI copy.
  - **Real, small dead-whitespace cleanup, not a translation
    decision**: `HEADER_COLUMNS`'s "Status" entry carried three
    trailing non-breaking spaces (`'Status   '`) with
    no CSS rule anywhere that ever depended on it — confirmed by grep,
    `.wl-col-th`/`.wl-col-header-btn` had no rules in `pathscribe.css`
    at all before this batch (see below). Trimmed.
- **Inline CSS removed** — this file already leaned on its own `wl-*`
  class family, but the table view in particular still had several
  real, computed-per-row `style={{...}}` objects; converted the ones
  that were genuine, repeatable wins:
  - `.wl-status-dot`/`.wl-card__status-badge` now read their computed
    per-status colors from CSS custom properties (`--wl-status-color`/
    `--wl-status-glow`, `--wl-badge-bg`/`--wl-badge-color`/
    `--wl-badge-border`) set inline, rather than setting `background`/
    `color`/`border` directly — the same pattern this batch's own
    handover pointed at (`ValidationStudiesSection.tsx`'s
    `.ps-vs-study-badge`).
  - The case-ID color logic (isRush > isUrgent > isPool > default),
    previously a per-render inline `style={{ color: ... }}` ternary in
    *both* the card view and the table view, became two small modifier
    class families instead: `.wl-case-id--rush/--urgent/--pool` (card)
    and a new `.wl-case-id-inline` base class with its own
    `--rush/--urgent/--pool` modifiers (table — this cell previously
    had no class at all, just a bare `<div style={{...}}>`).
  - The table row's background (selected > hover-on-pool > hover >
    none) and border-left color (selected > pool > rush > urgent >
    none) — previously one large per-render inline `style={{...}}`
    object covering 5 properties — became two independent,
    mutually-exclusive class picks (`.wl-tr--selected`/`--hover-pool`/
    `--hover` for background, `.wl-tr--border-selected`/`--pool`/
    `--rush`/`--urgent` for the border), each resolved with the same
    priority order the old ternary chain used, so there's never a
    specificity conflict between two classes claiming the same
    property.
  - The column header buttons' sort-state color (primary sort >
    active sort > default) became `.wl-col-header-btn--primary`/
    `--active`, added alongside a base `.wl-col-header-btn` rule —
    these classNames were already being applied every render with
    zero corresponding CSS anywhere in `pathscribe.css` (confirmed by
    grep before starting), so the button was 100% inline-styled the
    entire time despite "having" a class.
  - Three identical `style={{ padding: 0 }}` divider `<div>`s (the
    table view's own amendment/autopsy/pool divider wrappers) became
    one `.wl-card-divider--flush` modifier.
  - The two Pediatric/Orchestration modal's one-off
    `style={{ borderColor: ... }}` overrides became two new, generic
    `.ps-modal--accent-amber`/`--accent-sky` modifiers on the shared
    `.ps-modal` class family — named by color, not by this file's own
    callers, so any future modal needing the same accent-border
    treatment can reuse them instead of adding its own.
  - The static `style={{ height: '80px' }}` bottom-buffer div and the
    `style={{ marginLeft: 6 }}` card-header breakdown badge became
    `.wl-bottom-buffer` and `.wl-pool-substate--spaced`.
  - **Left as-is, deliberately**: the 14 `<col style={{ width: ...
    }}>` colgroup widths (inherently one unique static value per
    column — turning them into 14 one-off classes wouldn't be a real
    win over the inline value they already are, per this batch's own
    "don't force it" guidance) and the `innerRef` mirror-bar spacer's
    `style={{ height: '1px' }}` (genuinely JS-driven — its `width` is
    rewritten imperatively by the `ResizeObserver` effect, so it isn't
    static styling to move to a class).
- **Business logic / dead code**: none found needing extraction or
  removal beyond the whitespace cleanup above. This file's own header
  comments already document several earlier extraction passes
  (`poolGrouping.ts`, `amendmentGrouping.ts`, `autopsyGrouping.ts`,
  `resolveWorklistDpBadges.ts`, `caseUrgency.ts`,
  `participationTypeLookup.ts`) — the module-scope helpers that remain
  in the file itself (`getSortValue`, `compareValues`,
  `getStatusStyle`, `getFlagPalette`, `getReportBreakdown`) are all
  genuinely worklist-display-specific, not reusable business logic
  misplaced in a component.
- **Real bug caught before it reached `tsc`**: an early draft of the
  Orchestration modal's translated handler mistakenly wrote a JS
  comment as a JSX comment (`{/* ... */}`) inside the `onClick`
  handler's plain function body (not a JSX return) — that syntax is
  only valid inside JSX, and inside an arrow function body it would
  have been parsed as a stray object-literal expression statement.
  Caught on review before running `tsc`, fixed by using a plain `//`
  comment instead.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component (confirmed via
  `find ... -iname "*WorklistTable*test*"`, zero results), so there
  was nothing to adapt for the new translation keys.
- All five locale files verified programmatically to have identical
  key sets across the `worklistTable` namespace added this batch —
  **3889 → 3962 leaf keys**, matched exactly across en/fr/de/nl/ko.
  Every `t('worklistTable.*')` key referenced in the rewritten file
  (including the dynamic ones — `HEADER_COLUMNS`' own `labelKey`
  lookups and `abnormalDot.severity.${severity}`) was cross-checked
  against the JSON leaves directly, not just by `tsc` passing.

### What's in this zip

- `src/components/Worklist/WorklistTable.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### What's in this zip

- `src/components/Worklist/WorklistTable.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## `Contribution/QualityTab.tsx` — file-by-file sweep, batch 32

### Files swept this batch

- `src/components/Contribution/QualityTab.tsx`

897 lines — the pathologist-facing quality/TAT dashboard tab: summary
tiles (discordant cases, amended reports, concordance rate, and one
tile per enabled TAT type), a `recharts` TAT trend chart with target/
peer reference lines and a custom tooltip, a 4-way section nav, and
three data-table sections (Discordant Diagnoses, Amended Reports, TAT
Outliers, and TAT by Facility with per-client comparison cards).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `qualityTab` namespace — 104 leaf keys × 5 locales.
  Covers: the fixed and per-TAT-type summary tile labels and "Last
  {{range}}"/"Click for trend"/"▲ Showing trend" copy; the date-range
  selector buttons and "Trend period:" label; the whole TAT trend
  chart (title, subtitle, period-avg/vs-target/vs-peers summary row,
  close button, legend, custom tooltip with `_one`/`_other`
  pluralized case counts, and the two reference-line callout labels);
  the 4 section-nav buttons; the Discordant Diagnoses and Amended
  Reports table titles/subtitles/headers; the discordant-delta labels
  (Concordant/Minor Variance/Downgraded/Upgraded); the TAT Outliers
  sub-toggle buttons, per-type subtitles/value-labels/table headers/
  empty state; and the entire TAT by Facility section (title,
  subtitle, metric toggle, no-target/no-cases fallback states,
  `_one`/`_other` pluralized breach badge and "…case(s)" usage-percent
  label, delta-vs-peers text, you/peer legend labels, and the footer
  disclaimer).
  - `ENABLED_TAT_TYPES` and `FIXED_SUMMARY_TILES` stayed module-level
    constants — their `label` fields were dropped and resolved via
    `t()` at each usage site instead, rather than moving the whole
    array inside the component just to reach a live `t()`.
  - **Real bug fixed in the same pass**: every `ENABLED_TAT_TYPES.map/
    find/some(t => ...)` callback used `t` as its own iteration-
    variable name, which would have silently shadowed the real
    `t()` translation function inside those exact callbacks — the
    only places that needed to call it. Renamed all of them to `tt`.
  - **Left in English, per the established "exported/persisted data
    stays English" convention**: none applied here — this file makes
    no `auditService`/compose-message calls. `TREND_DATA`'s own month
    labels (`"Sep '24"` etc.) and `formatWeekLabel`'s hardcoded
    `'en-US'` locale were left alone and flagged instead (see below),
    since they're demo chart-axis data, not UI chrome being displayed
    for the current user.
- **Real, separate gap flagged, not fixed**: `formatWeekLabel()`
  formats the 30-day view's weekly chart-axis labels via
  `d.toLocaleDateString('en-US', ...)` — hardcoded to English
  regardless of the active UI language. Left as-is because the data
  it's labeling (`TREND_DATA`) is itself entirely fabricated demo
  data, not a live computation; a real fix would want real TAT-trend
  data behind it first.
- **CSS**: converted the file's dynamic-color inline `style={{...}}`
  blocks using the CSS-custom-property / modifier-class patterns
  established in `WorklistTable.tsx` (batch 31):
  - Per-config arbitrary colors (`s.color`/`tt.color` from
    `FIXED_SUMMARY_TILES`/`ENABLED_TAT_TYPES`) → a `--tile-color`/
    `--accent` custom property read by `.ps-quality-summary-tile__value`,
    `.ps-tat-trend__legend-item--dynamic`, and `.ps-tat-trend__tooltip-line`.
  - The finite threshold colors (`barColor`'s 3-way pct check,
    `deltaLabel`'s faster/slower check, the trend summary's vs-target/
    vs-peer checks, and the tooltip's over/under-target check) became
    real `--good`/`--warn`/`--bad` modifier classes on
    `.ps-tat-client__bar-fill`, `.ps-tat-client__legend-dot`,
    `.ps-tat-client__you-label`, `.ps-tat-client__delta`,
    `.ps-tat-trend__summary-delta`, and `.ps-tat-trend__tooltip-footer`
    — no more hex literals computed in JS on every render for these.
  - Left the bar-fill `width`/peer-marker `left` percentages inline —
    genuine per-item computed layout positions, not colors, matching
    the "computed values that are real inline, not a lazy default"
    carve-out from batch 31. Also left the trend summary pill's
    `background`/`color`/`border` (a single dynamic hex expanded into
    three CSS properties with two different alpha suffixes) as inline
    style — reproducing that exact alpha-blend purely in static CSS
    would need `color-mix()`, which nothing else in this codebase uses.
  - **Fixed a real, separate pre-existing gap**: the file's own code
    comment noted `.ps-delta--concordant`/`--variance`/`--upgraded`
    had no matching CSS rules anywhere. Added all four
    (`.ps-delta--concordant/--variance/--upgraded/--downgraded`) to
    `pathscribe.css`. While adding them, found and fixed a real
    classification bug: the old ternary gave "Downgraded" the same
    `ps-delta--upgraded` class as "Upgraded" (invisible before now,
    since neither class had a matching rule) — replaced with a
    4-branch lookup so each of the four real delta values gets its
    own class.
- **Business logic / dead code**: none found needing extraction — the
  real computation already lives in `qualityCalculations.ts`, and this
  file's own module-scope helpers (`barColorClass` (renamed from
  `barColor`), `deltaLabel`, `severityClass`, `formatWeekLabel`,
  `generateLast4Weeks`) are all genuinely display-specific. No dead
  code found beyond what earlier passes already removed (see this
  file's own header comments on `mockDiscordant`/`mockAmended`/the
  four `mock*Outliers` arrays/`_TatTooltip`/`DemoDataBadge`, all
  already gone before this batch).

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `qualityTab` namespace added this batch —
  **3962 → 4066 leaf keys**, matched exactly across en/fr/de/nl/ko.
  Every `t('qualityTab.*')` key referenced in the file (including the
  dynamic `tat.${key}.label`, `tiles.${key}`, and
  `discordant.delta.${key}` lookups, and the `_one`/`_other`
  pluralized keys) was cross-checked against the JSON leaves directly.

### What's in this zip

- `src/components/Contribution/QualityTab.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### What's in this zip

- `src/components/Contribution/QualityTab.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## `Contribution/ProductivityTab.tsx` — file-by-file sweep, batch 33

### Files swept this batch

- `src/components/Contribution/ProductivityTab.tsx`

473 lines — the pathologist-facing productivity/RVU dashboard tab: an
RVU summary tile, a peer-comparison card, a monthly case-count bar
chart, a YTD RVU accumulation line chart (`recharts`), and a print/
export row.

### What changed

- **i18n**: added `useTranslation()` to every sub-component that
  renders its own text (`BarChart`, `LineChart`, `RvuTile`,
  `PeerComparison`, and the main `ProductivityTab`) and converted
  every on-screen string to a new `productivityTab` namespace — 43
  leaf keys × 5 locales. Covers: the bar-chart hover tooltip; the
  line-chart series names, Y-axis label, and tooltip value formatter;
  the RVU tile (title, delta-vs-last-year, subtitle, the `_one`/
  `_other` pluralized "unrecognized code(s)" warning, avg-per-case);
  the peer-comparison card (title, subtitle, `_one`/`_other`
  pluralized peer count, loading/no-peers/disabled states, and the
  You/Peer Average/Top Performer/Last Year row labels — shared
  between the comparison card's rows and the line chart's legend
  toggles via the same translation keys); the chart-type nav buttons,
  the 1M/3M/6M/YTD date-range buttons, the monthly and YTD section
  titles/subtitles/legends; and the Print/Export PDF buttons
  (including the "connect to your PDF library" stub alert shown to
  the user on click).
  - No `auditService`/compose-message calls exist in this file, so the
    "exported/persisted data stays English" convention didn't apply
    in the usual way. `computeRvuSummary()`'s returned `period` field
    (e.g. `"YTD 2026"`, from `productivityCalculations.ts`) contains
    the English word "YTD" baked into a computed data string — left
    untouched since it's returned by a service function outside this
    batch's file, not JSX chrome in this component; flagged below.
- **Inline CSS — deliberately left as-is, and why**: unlike most files
  swept so far, this one styles everything through inline
  `style={{...}}` objects built entirely from the shared
  `theme.colors.*`/`theme.gradients.*` token object
  (`@theme/pathscribeTheme`), not `pathscribe.css` classes. Since
  every value already traces back to one shared theme source rather
  than being a repeated hardcoded magic value, converting this file
  to CSS classes would mean duplicating the theme as CSS custom
  properties for no real readability or maintainability win — so it
  was left alone, and only the hardcoded UI strings were treated as
  in-scope for this batch. Documented inline in the file's own header
  comment for future batches touching this file.
- **Business logic / dead code**: none found needing extraction — the
  real computation already lives in `productivityCalculations.ts`,
  and the calculation/fetch logic already carries its own detailed
  "real fix" history in this file's header comments (RVU summary,
  monthly RVU breakdown, and peer comparison were all previously
  hardcoded demo data, already fixed in earlier passes). No dead code
  found this batch.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `productivityTab` namespace added this batch —
  **4066 → 4109 leaf keys**, matched exactly across en/fr/de/nl/ko.
  Every `t('productivityTab.*')` key referenced in the file, including
  the `_one`/`_other` pluralized `rvu.unrecognizedCode` and
  `peer.subtitleWithCount` keys, was cross-checked against the JSON
  leaves directly.

### What's in this zip

- `src/components/Contribution/ProductivityTab.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` change this batch — see "Inline CSS" above.)

### What's in this zip

- `src/components/Contribution/ProductivityTab.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` change this batch — this file doesn't use the
class-based styling system; see "What changed" above.)

## `Contribution/AIContributionTab.tsx` — file-by-file sweep, batch 34

### Files swept this batch

- `src/components/Contribution/AIContributionTab.tsx`

521 lines — the pathologist-facing "AI Contribution" dashboard tab:
acceptance-rate breakdown by case type (derived live from the real
Specimen Dictionary), an acceptance-trend chart built from real
per-user AI-feedback events, an AI-overrides table, and an
AI-assisted-vs-manual comparison table.

### What changed

- **i18n**: added `useTranslation()` to the main component and to
  `DemoDataBadge`, and converted every on-screen string to a new
  `aiContributionTab` namespace — 46 leaf keys × 5 locales. Covers the
  practice-wide-validation pointer link, all 4 summary tiles
  (including their interpolated delta text), the section-nav and
  date-range buttons, the case-type breakdown card (title/subtitle/
  unit/loading state), the AI-overrides table (title/subtitle/column
  headers/empty state), the AI-vs-manual comparison table (title/
  subtitle/legend/column headers, which interpolate the AI/Manual
  labels into "{{label}} Cases"/"{{label}} Avg TAT" rather than
  duplicating near-identical header strings), the trend chart (title/
  subtitle/period label/tooltip), and the demo-data badge.
  - **Real fix**: `WorkflowDataset` (and the single `synopticDataset`
    built from it) used to carry a full set of UI label/title/
    subtitle strings directly on the data object — a leftover from a
    removed "workflow" toggle concept that once switched between
    multiple named datasets (per this file's own "Real fix:
    narrativeDataset... removed entirely" comment). With only one
    dataset left, those fields were always-static English baked into
    a plain object with no way to reach a live `t()` call. Moved them
    out into `t()` calls inside the component; `WorkflowDataset` now
    holds only genuine data (`summary`/`breakdown`/`overridden`/
    `comparison`).
  - **Real dead code removed in the same pass**: `WorkflowDataset.label`
    (the old per-dataset workflow name, `"Synoptic AI (Assist)"`) and
    `.monthlyShape` (a hardcoded illustrative year-pattern array) were
    both confirmed unread anywhere in this component —
    `monthlyShape` is explicitly superseded by the real
    `buildRealTrend()` (per that function's own comment) and was
    simply never deleted when its replacement landed. Both fields and
    their type/dataset entries were removed.
  - **Left in English, deliberately**: `synopticDataset.overridden`/
    `.comparison`'s mock fallback content uses real-diagnosis-shaped
    strings (`"Gleason 3+4=7"`, `"Atypical ductal hyperplasia"`, etc.)
    as illustrative example data. These were left untranslated rather
    than casually machine-translated — clinical terminology is
    precision-critical in a pathology LIS, and this app never
    translates diagnosis text coming from real case records either.
    Documented inline in the file's own header comment.
- **CSS**: converted this file's few inline `style={{...}}` blocks
  using the same patterns as batch 32 (which share the `ps-quality-*`
  class family with this file): the summary-tile value color reuses
  the `--tile-color` custom property already added to
  `.ps-quality-summary-tile__value` in batch 32 (no new CSS needed);
  the 2-state delta color and the AI/Manual legend swatch colors
  became new `--good`/`--bad` and `--ai`/`--manual` modifier classes;
  two static (non-computed) values — a badge's `marginRight` and the
  trend chart wrapper's `padding` — became small new classes
  (`.ps-quality-bar-row__code-badge`, `.ps-quality-trend-chart-wrap`).
  Left the progress-bar fill `width` inline (genuine computed
  percentage, matching the established carve-out).

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `aiContributionTab` namespace added this batch —
  **4109 → 4155 leaf keys**, matched exactly across en/fr/de/nl/ko.
  Every `t('aiContributionTab.*')` key referenced in the file was
  cross-checked against the JSON leaves directly.

### What's in this zip

- `src/components/Contribution/AIContributionTab.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### What's in this zip

- `src/components/Contribution/AIContributionTab.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## `Config/System/ContributionSettingsSection.tsx` — file-by-file sweep, batch 35

### Files swept this batch

- `src/components/Config/System/ContributionSettingsSection.tsx`

135 lines — the admin settings page for the Contribution Dashboard
area: a facility-timezone select (feeding the real monthly/YTD
metric bucketing in `ProductivityTab.tsx`) and the peer-comparison
visibility toggle.

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `contributionSettings` namespace — 17 leaf keys ×
  5 locales. Covers the page title/description, the facility-timezone
  label/hint and all 9 timezone option labels, the peer-comparison
  label/toggle-text/hint, and the "✓ Saved" confirmation.
- **Inline CSS removed — real class reuse**: this file previously used
  one-off inline `style={{...}}` throughout despite this app already
  having a rich, established `.ps-conf-*` Config-page class family
  (used by 5 other Config/System files already converted before this
  sweep, and by the earlier CSS-only cleanup pass documented in
  `pathscribe.css` itself). Reused `.ps-conf-select`,
  `.ps-conf-section-title`, `.ps-conf-section-subtitle` (with its
  existing `--top-gap` modifier, an exact match for this file's
  `marginTop: 4`), `.ps-conf-label`, `.ps-conf-desc`, and
  `.ps-conf-hint--success` directly, since their sizing matched this
  file's own values. Added a small number of new
  `.ps-contrib-settings__*` classes only for the spacing that didn't
  match an existing `.ps-conf-*` rule exactly (the page's own
  max-width, the boxed-card padding/margin shape, and the toggle
  row/text sizing) — following this same discipline used in earlier
  batches (reuse an exact match, add a new class only where the
  values genuinely differ).
- **Business logic / dead code**: none found — this file is a small,
  already-clean settings page with no dead code or extractable
  business logic; `TIMEZONE_OPTIONS` stayed a module-level constant,
  with only its label swapped for a `labelKey` resolved via `t()` at
  render time (the same "keep static config at module scope, resolve
  only the translatable field live" pattern used for
  `ENABLED_TAT_TYPES` in batch 32 and `WorkflowDataset` in batch 34).

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `contributionSettings` namespace added this
  batch — **4155 → 4172 leaf keys**, matched exactly across
  en/fr/de/nl/ko. Every `t('contributionSettings.*')` key referenced
  in the file, including the dynamic `t(tz.labelKey)` lookup, was
  cross-checked against the JSON leaves directly.

### What's in this zip

- `src/components/Config/System/ContributionSettingsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### What's in this zip

- `src/components/Config/System/ContributionSettingsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

## `Config/System/VoiceSection.tsx` — file-by-file sweep, batch 36

### Files swept this batch

- `src/components/Config/System/VoiceSection.tsx`

80 lines — the admin toggle for enabling/disabling voice commands and
dictation deployment-wide, plus a staff-facing note about the
environment-variable hard-disable.

### What changed

- **i18n**: added `useTranslation()`/`Trans` and converted every
  on-screen string to a new `voiceSection` namespace — 8 leaf keys ×
  5 locales. Covers the section title/description, the toggle row's
  field title/description and On/Off state text, and the staff note
  — the note's embedded `<code>VITE_VOICE_ENABLED=false</code>`
  snippet is kept as a real, untranslated environment-variable
  expression via `<Trans>` with a `components={{ code: <code /> }}`
  mapping (same pattern `WorklistTable.tsx` established in batch 31
  for embedded `<em>`/`<strong>` tags), rather than being folded into
  translatable prose or split across several interpolated pieces.
- **Inline CSS — new reusable class family, not a forced reuse**: this
  file hand-rolls a teal-accented toggle switch (40×22px track,
  `#0891B2` on-color, `translateX(18px)` thumb travel) entirely from
  inline styles. This app already has an established toggle-switch
  class family (`.ps-toggle-track`/`.ps-toggle-thumb`/
  `.ps-toggle-label`), but it's a different size and a different
  color (green, not teal) — reusing it here would have silently
  changed this toggle's actual appearance, not just refactored it.
  Instead, added a new `.config-toggle-*` class family (matching this
  file's own `.config-section-*` naming) that reproduces the exact
  current look. Confirmed via grep that `FontsSection.tsx` hand-rolls
  the identical pattern (same colors, same dimensions) and hasn't
  been converted yet, so these new classes are ready for it rather
  than needing to be redefined again when its turn comes. Also reused
  the existing `.ps-conf-field-title`/`.ps-conf-field-desc` classes
  directly (close enough — 1px/0.1-line-height differences from the
  literal inline values, same as earlier batches' tolerance for
  effectively-identical sizing) and added a small `.config-staff-note`
  box class plus a `.ps-form-row` padding modifier for the one
  genuinely different spacing value.
- **Business logic / dead code**: none found — a small, already-clean
  admin toggle page.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `voiceSection` namespace added this batch —
  **4172 → 4180 leaf keys**, matched exactly across en/fr/de/nl/ko.
  Every key referenced in the file (both `t()` calls and the
  `i18nKey`/`components` on `<Trans>`) was cross-checked against the
  JSON leaves directly.

### What's in this zip

- `src/components/Config/System/VoiceSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

68 of `Config/System/`'s 74 files remain unconverted.
`FontsSection.tsx` is a natural next pick — it shares this batch's
exact hand-rolled toggle pattern, so it can reuse the new
`.config-toggle-*` classes directly instead of needing its own.
Beyond `Config/`: `TemplateBuilder/`, `QualityAssurance/`, `Common/`,
and `AppShell.tsx`. `SynopticReportPage` is unchanged and still
pending. Real, separate gaps noticed but not fixed, worth picking up
when their own files come up: the pre-existing triplicated
`.ps-idf-*`/`.ps-body-modal-*` CSS block (batch 30);
`resolveWorklistDpBadges.ts`/`poolGrouping.ts`/`amendmentGrouping.ts`/
`autopsyGrouping.ts`'s own generated display strings inside
`WorklistTable.tsx` (batch 31); `QualityTab.tsx`'s
`formatWeekLabel()` hardcoded `'en-US'` locale (batch 32);
`productivityCalculations.ts`'s `computeRvuSummary()` "YTD" text
baked into computed data (batch 33); and the illustrative-diagnosis
mock content in `AIContributionTab.tsx`'s `synopticDataset`,
deliberately left in English (batch 34).

## Config/System/FontsSection.tsx — file-by-file sweep, batch 37

### Files swept this batch

- `src/components/Config/System/FontsSection.tsx`

251 lines — the admin page for approving/disabling fonts available in
the PathScribeEditor toolbar font picker. Second file swept in the
wider `Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `fontsSection` namespace — 12 leaf keys × 5 locales.
  Font names/family values themselves (`Times New Roman`, `Garamond`,
  `Consolas`, etc.) are real proper nouns/CSS values and correctly
  stay untranslated. Category labels (`Serif`/`Sans-Serif`/
  `Monospace`) follow the established "data key stays English,
  display label is translated" pattern from `AIContributionTab.tsx`'s
  `SUBSPECIALTY_LABELS` (batch 34): a new `CATEGORY_LABEL_KEY` map
  resolves each internal category id to an i18n key at render, while
  `FontEntry.category` itself stays an English grouping id used for
  filtering logic. The `Toggle` sub-component's `aria-label` and
  disabled-tooltip text are now computed via `t()` in the parent and
  passed down as props, rather than hardcoded in the child.
- **Inline CSS — correcting batch 36's claim**: batch 36's README
  asserted, from a shallow grep match, that this file "hand-rolls the
  identical [toggle] pattern" as `VoiceSection.tsx` and that its new
  `.config-toggle-track*` classes were "ready for it". That turned
  out to be wrong once this file was actually read: this Toggle
  shares VoiceSection's 40×22px size and `#0891B2` on-color, but adds
  a third disabled/greyed state VoiceSection's doesn't have, uses an
  18px thumb (not 14px), and a solid `#475569` off-color (not
  translucent). Rather than force a mismatch by reusing batch 36's
  classes, this batch gives the toggle its own small
  `.config-toggle-btn*` family, and the VoiceSection CSS comment has
  been corrected in place to record why. Everything else on the page
  — header, count badge, search box, category groups, per-font cards
  — was hand-rolled inline `style={{...}}` and is now a new
  `.config-fonts-*` class family (following this file's own
  `.config-section-*` naming, matching batch 36's convention), with
  the existing `.ps-conf-input`/`.ps-conf-hint`/`.ps-conf-hint--warning`
  classes reused directly for the search box and the "last font"
  warning. The one inline style kept: `style={{ fontFamily: font.name }}`
  on each font's name — a genuine per-row dynamic value and the whole
  point of the font-picker UI, not a hardcoded magic value.
- **Business logic / dead code**: none found — a small, already-clean
  admin toggle list.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `fontsSection` namespace added this batch —
  **4180 → 4192 leaf keys**, matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/FontsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

67 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx`).
No file so far has flagged a specific "next" candidate the way
FontsSection did for VoiceSection, so the next pick will be chosen by
file size/complexity when that batch starts. Beyond `Config/`:
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. `SynopticReportPage` is unchanged and still pending.
Real, separate gaps noticed but not fixed, worth picking up when
their own files come up: the pre-existing triplicated
`.ps-idf-*`/`.ps-body-modal-*` CSS block (batch 30);
`resolveWorklistDpBadges.ts`/`poolGrouping.ts`/`amendmentGrouping.ts`/
`autopsyGrouping.ts`'s own generated display strings inside
`WorklistTable.tsx` (batch 31); `QualityTab.tsx`'s
`formatWeekLabel()` hardcoded `'en-US'` locale (batch 32);
`productivityCalculations.ts`'s `computeRvuSummary()` "YTD" text
baked into computed data (batch 33); and the illustrative-diagnosis
mock content in `AIContributionTab.tsx`'s `synopticDataset`,
deliberately left in English (batch 34).

## Config/System/SessionSecuritySection.tsx — file-by-file sweep, batch 38

### Files swept this batch

- `src/components/Config/System/SessionSecuritySection.tsx`

86 lines — the org-wide default idle-session-timeout setting (Phase 1
of the Inactivity Timeout & Draft Recovery spec). Third file swept in
the wider `Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `sessionSecurity` namespace — 7 leaf keys × 5
  locales (5 plain strings plus a `minutesOption_one`/`_other` plural
  pair for the timeout `<select>`'s "N minutes" options, following the
  established `_one`/`_other` i18next plural-suffix convention used
  elsewhere in the app).
- **Inline CSS**: this file's layout (page wrapper, header, title,
  card, field label, hint, "Saved" confirmation) was entirely
  hand-rolled inline `style={{...}}`. It sits close to but not exactly
  on the established `.ps-conf-section-title`/`.ps-conf-card` classes
  — a 22px/`#fff` title vs. those classes' 20px/`var(--ps-conf-text)`
  (`#e2e8f0`), and a 12px-radius/24px-all-round card vs. those classes'
  10px-radius/`0 24px` card — different enough on several values at
  once that reusing them would have visibly changed the page, so this
  batch gives it its own small `.ps-session-security*` family instead,
  reproducing the exact current appearance. The one genuine reuse: the
  timeout `<select>` keeps the existing `.ps-conf-select` base class,
  combined with a new `.ps-session-security__select` width modifier
  for its fixed 240px width (the base class itself only sets a 160px
  min-width).
- **Business logic / dead code**: none found — a small, already-clean
  settings page.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `sessionSecurity` namespace added this batch —
  **4192 → 4199 leaf keys**, matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/SessionSecuritySection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

66 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx`). Small remaining files worth picking up
next for quick wins: `useSpecimenDictionary.tsx` (101 lines),
`FootPedalSection.tsx` (120 lines), `CancerRegistrySettingsSection.tsx`
(126 lines). Beyond `Config/`: `TemplateBuilder/`, `QualityAssurance/`,
`Common/`, and `AppShell.tsx`. `SynopticReportPage` is unchanged and
still pending. Flagged-not-fixed gaps carried forward from batches
30–34 (triplicated CSS block, untranslated generated strings in
grouping files, `'en-US'` chart-axis locale, "YTD" baked into computed
data, illustrative-diagnosis mock content).

## Config/System/FootPedalSection.tsx — file-by-file sweep, batch 39

### Files swept this batch

- `src/components/Config/System/FootPedalSection.tsx`
- `src/types/footPedal/FootPedalConfig.ts` (labels/description text,
  not just the section component itself — see below)

`useSpecimenDictionary.tsx` (101 lines, checked first this batch) was
looked at and skipped: it's a pure hook/context/provider wrapper with
no on-screen strings, no inline CSS, and no dead code — nothing for
this sweep to do there. `FootPedalSection.tsx` (120 lines) was swept
instead — the per-workstation foot-pedal binding page. Fourth file
swept in the wider `Config/System/` directory (74 files total).

### What changed

- **i18n — including a shared-file fix**: `FootPedalSection.tsx`'s own
  on-screen text now goes through a new `footPedalSection` namespace —
  15 leaf keys × 5 locales. The real find this batch: the 3 pedal
  action labels and the "what's bound" description text
  (`describeFootPedalInput()`) were hardcoded English strings living in
  `types/footPedal/FootPedalConfig.ts`, not this component — but a
  grep across the codebase confirmed both are only ever actually
  *rendered* here (`MicrotomyWorkstationPage.tsx` and
  `EmbeddingStationPage.tsx` only reference them in doc comments, not
  code), so converting them was in-scope rather than a cross-file
  expansion of this batch. `FOOT_PEDAL_ACTION_LABELS` (raw strings) is
  now `FOOT_PEDAL_ACTION_LABEL_KEYS` (i18n keys, resolved via `t()` at
  the one real render site) — the same "data key stays English,
  display label is translated" shape used for
  `AIContributionTab.tsx`'s `SUBSPECIALTY_LABELS` (batch 34) and
  `FontsSection.tsx`'s `CATEGORY_LABEL_KEY` (batch 37), just applied to
  action-key labels instead of category labels. `describeFootPedalInput()`
  now takes a `t()` function and returns translated text, following the
  established `t: (key, options?) => string` utility-function pattern
  already used by `BillingLogsSection.tsx`'s `summarizeFilters()`. No
  other real callers of either export exist (confirmed via grep, no
  test file references them directly), so this was a safe, contained
  change. Two doc-comment references to the old `FOOT_PEDAL_ACTION_LABELS`
  name (in `MicrotomyWorkstationPage.tsx` and `EmbeddingStationPage.tsx`)
  and two README mentions (`components/Config/System/README.md`,
  `types/footPedal/README.md`) were corrected to stay accurate.
- **Inline CSS**: the per-row wrapper reuses the existing `.ps-form-row`
  class directly (its border-bottom matches exactly) combined with a
  new `.config-footpedal-row` padding-only modifier — the same
  override-via-cascade approach used for `.config-toggle-row`/
  `.ps-form-row` in `VoiceSection.tsx` (batch 36). The footer note
  reuses the existing `.config-staff-note` class (batch 36) combined
  with a margin-top modifier; its `strong` sub-selector already
  matched this note's label styling exactly, so no extra class was
  needed there. Everything else (row text/label/status, capturing-vs-
  idle status color, action-button row) is a new small
  `.config-footpedal-*` family, following this file's own
  `.config-section-*` naming.
- **Business logic / dead code**: none found beyond the shared-file
  i18n fix above.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for either changed file.
- All five locale files verified programmatically to have identical
  key sets across the `footPedalSection` namespace added this batch —
  **4199 → 4214 leaf keys**, matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/FootPedalSection.tsx`
- `src/types/footPedal/FootPedalConfig.ts`
- `src/types/footPedal/README.md`
- `src/pages/MicrotomyWorkstationPage/MicrotomyWorkstationPage.tsx`
- `src/pages/EmbeddingStationPage/EmbeddingStationPage.tsx`
- `src/components/Config/System/README.md`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

65 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx` + `FootPedalSection.tsx`).
`CancerRegistrySettingsSection.tsx` (126 lines) is next in line by
size. Beyond `Config/`: `TemplateBuilder/`, `QualityAssurance/`,
`Common/`, and `AppShell.tsx`. `SynopticReportPage` is unchanged and
still pending. Flagged-not-fixed gaps carried forward from batches
30–34 (triplicated CSS block, untranslated generated strings in
grouping files, `'en-US'` chart-axis locale, "YTD" baked into computed
data, illustrative-diagnosis mock content).

## Config/System/CancerRegistrySettingsSection.tsx — file-by-file sweep, batch 40

### Files swept this batch

- `src/components/Config/System/CancerRegistrySettingsSection.tsx`

127 lines — the enterprise-default/facility-override cascade for which
national cancer registry a facility's confirmed surgical pathology
diagnoses report to. Fifth file swept in the wider `Config/System/`
directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `cancerRegistrySection` namespace — 19 leaf keys × 5
  locales. The 9 selectable registry options follow the established
  "data key stays English, display label is translated" pattern
  (`REGISTRY_LABEL_KEY`, same shape as `AIContributionTab.tsx`'s
  `SUBSPECIALTY_LABELS` from batch 34 and `FontsSection.tsx`'s
  `CATEGORY_LABEL_KEY` from batch 37): each registry's real acronym
  (NAACCR, CPAC, COSD, INCa, ADT/GEKID, AIHW, KCCR) is a proper noun
  and stays as-is inside the translated string, matching how real
  names are kept untranslated elsewhere (e.g. font names in
  `FontsSection.tsx`) — only the surrounding country name, and the
  "None" option's description, are actually translated per locale.
- **Inline CSS**: none needed — this file already used the established
  `.ps-conf-*` class family throughout, with no hand-rolled
  `style={{...}}` anywhere.
- **Business logic / dead code**: none found — a small, already-clean
  two-tier settings cascade. (`useSpecimenDictionary.tsx`, checked in
  batch 39, remains the one skipped file this sweep has found with
  nothing to convert.)

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the 3 existing
  `services/cancerRegistry/*.test.ts` files cover the service layer,
  untouched by this batch).
- All five locale files verified programmatically to have identical
  key sets across the `cancerRegistrySection` namespace added this
  batch — **4214 → 4233 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/CancerRegistrySettingsSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

64 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx` + `FootPedalSection.tsx` +
`CancerRegistrySettingsSection.tsx`). `DpVendorDictionarySection.tsx`
(127 lines) and `MigrationFieldMappingsSection.tsx` (128 lines) are
next in line by size. Beyond `Config/`: `TemplateBuilder/`,
`QualityAssurance/`, `Common/`, and `AppShell.tsx`. `SynopticReportPage`
is unchanged and still pending. Flagged-not-fixed gaps carried forward
from batches 30–34 (triplicated CSS block, untranslated generated
strings in grouping files, `'en-US'` chart-axis locale, "YTD" baked
into computed data, illustrative-diagnosis mock content).

## Config/System/DpVendorDictionarySection.tsx — file-by-file sweep, batch 41

### Files swept this batch

- `src/components/Config/System/DpVendorDictionarySection.tsx`

128 lines — the admin dictionary of digital-pathology/AI vendors this
lab may order screening results from (list + add/edit modal +
deactivate/reactivate). Sixth file swept in the wider `Config/System/`
directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  chrome string to a new `dpVendorSection` namespace — 18 leaf keys ×
  5 locales. The vendor/product-name/modality values themselves
  (`DpVendorEntry.name`/`.productName`/`.modality`) are real free-text
  dictionary content admins type in, not app UI — left untouched, same
  as every other dictionary in this app.
- **Inline CSS**: two small hand-rolled `style={{...}}` uses (the
  "(vendor name)" suffix color, and the modality/status meta line)
  became a new `.ps-dpvendor__*` family; the "Show inactive" row's
  `marginBottom: 12` inline style became a `.ps-dpvendor__toggle-row`
  modifier combined with the existing `.ps-conf-toggle-label-row`
  base class. Everything else already used the established
  `.ps-conf-*` family, per this file's own header comment ("Real,
  named CSS classes throughout, no inline styles" — true except for
  those three spots this batch found and fixed).
- **Business logic / dead code**: none found — a small, already-clean
  dictionary editor.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `dpVendorSection` namespace added this batch —
  **4233 → 4251 leaf keys**, matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/DpVendorDictionarySection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

63 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx` + `FootPedalSection.tsx` +
`CancerRegistrySettingsSection.tsx` + `DpVendorDictionarySection.tsx`).
`MigrationFieldMappingsSection.tsx` (128 lines) is next in line by
size. Beyond `Config/`: `TemplateBuilder/`, `QualityAssurance/`,
`Common/`, and `AppShell.tsx`. `SynopticReportPage` is unchanged and
still pending. Flagged-not-fixed gaps carried forward from batches
30–34 (triplicated CSS block, untranslated generated strings in
grouping files, `'en-US'` chart-axis locale, "YTD" baked into computed
data, illustrative-diagnosis mock content).

## Config/System/MigrationFieldMappingsSection.tsx — file-by-file sweep, batch 42

### Files swept this batch

- `src/components/Config/System/MigrationFieldMappingsSection.tsx`

129 lines — the admin dictionary mapping a legacy LIS's source field
names to this app's migration target fields (list + add/edit modal,
filterable by source system). Seventh file swept in the wider
`Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  chrome string to a new `migrationFieldMappingsSection` namespace —
  28 leaf keys × 5 locales. The 7 migration-field categories follow
  the established "data key stays English, display label is
  translated" pattern (`CATEGORY_LABEL_KEY`, same shape as
  `AIContributionTab.tsx`'s `SUBSPECIALTY_LABELS` from batch 34 and
  `FontsSection.tsx`'s `CATEGORY_LABEL_KEY` from batch 37). Left
  untouched: real dictionary content admins type in
  (`sourceSystemName`, `sourceFieldName`, `transformNote`), and
  `targetField`/`MIGRATION_TARGET_FIELDS_BY_CATEGORY`'s options — the
  latter confirmed via its own type signature to be literal
  `keyof MigrationCaseDraft` internal schema field identifiers, not
  UI text, so translating them would break the actual mapping values
  being stored.
- **Inline CSS**: two small hand-rolled `style={{...}}` uses (the
  source-system filter's `marginBottom`/`maxWidth`, and the
  category/inactive meta line) became small `.ps-mfm__*` modifiers,
  combined with the existing `.ps-conf-select`/base classes; the rest
  of the page already used the established `.ps-conf-*` family.
- **Business logic / dead code**: none found — a small, already-clean
  dictionary editor.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the one migration-related
  test file, `resolveMigrationFieldMapping.test.ts`, covers a service
  function, untouched by this batch).
- All five locale files verified programmatically to have identical
  key sets across the `migrationFieldMappingsSection` namespace added
  this batch — **4251 → 4279 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/MigrationFieldMappingsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

62 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx` + `FootPedalSection.tsx` +
`CancerRegistrySettingsSection.tsx` + `DpVendorDictionarySection.tsx` +
`MigrationFieldMappingsSection.tsx`). `OrSuiteTerminalsSection.tsx`
(134 lines) is next in line by size. Beyond `Config/`:
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. `SynopticReportPage` is unchanged and still pending.
Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content).

## Config/System/OrSuiteTerminalsSection.tsx — file-by-file sweep, batch 43

### Files swept this batch

- `src/components/Config/System/OrSuiteTerminalsSection.tsx`

135 lines — the admin dictionary of per-OR "Station Identity" terminal
displays for the Intraoperative Dashboard, each bound to a facility →
location cascade (list + add/edit modal + deactivate). Eighth file
swept in the wider `Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  chrome string to a new `orSuiteTerminalsSection` namespace — 21 leaf
  keys × 5 locales. Real dictionary content (terminal name, facility
  name, location `pointOfCare`/`room`) stays as typed/stored, same
  convention as `DpVendorDictionarySection.tsx` (batch 41) and every
  other dictionary in this app.
- **Inline CSS**: the same two small hand-rolled `style={{...}}` uses
  seen in `DpVendorDictionarySection.tsx` (toggle-row margin, status
  meta line) became small `.ps-orterm__*` modifiers, combined with the
  existing `.ps-conf-*` base classes — the rest of the page already
  used that established family.
- **Business logic / dead code**: none found — a small, already-clean
  dictionary editor.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the one related test file,
  `mockOrSuiteTerminalService.test.ts`, covers the service layer,
  untouched by this batch).
- All five locale files verified programmatically to have identical
  key sets across the `orSuiteTerminalsSection` namespace added this
  batch — **4279 → 4300 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/OrSuiteTerminalsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

61 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx` + `FootPedalSection.tsx` +
`CancerRegistrySettingsSection.tsx` + `DpVendorDictionarySection.tsx` +
`MigrationFieldMappingsSection.tsx` + `OrSuiteTerminalsSection.tsx`).
`WsiViewerVendorDictionarySection.tsx` (135 lines) is next in line by
size. Beyond `Config/`: `TemplateBuilder/`, `QualityAssurance/`,
`Common/`, and `AppShell.tsx`. `SynopticReportPage` is unchanged and
still pending. Flagged-not-fixed gaps carried forward from batches
30–34 (triplicated CSS block, untranslated generated strings in
grouping files, `'en-US'` chart-axis locale, "YTD" baked into computed
data, illustrative-diagnosis mock content).

## Config/System/WsiViewerVendorDictionarySection.tsx — file-by-file sweep, batch 44

### Files swept this batch

- `src/components/Config/System/WsiViewerVendorDictionarySection.tsx`

136 lines — the admin dictionary of whole-slide-image viewer vendors
and their launch URL templates (list + add/edit modal + deactivate).
Ninth file swept in the wider `Config/System/` directory (74 files
total).

### What changed

- **i18n**: added `useTranslation()`/`Trans` and converted every
  on-screen chrome string to a new `wsiViewerVendorSection` namespace
  — 18 leaf keys × 5 locales. The hint/warning text that references
  the literal `{{wsiUniqueId}}` placeholder syntax needed care: since
  i18next itself uses `{{ }}` for interpolation, putting that literal
  string directly in a translation value would have been
  re-interpolated as an (undefined) variable. Fixed by passing it as
  a `values={{ placeholder: '{{wsiUniqueId}}' }}` prop on `<Trans>`
  instead — i18next substitutes it once, as a plain string, with no
  second interpolation pass. Real dictionary content (vendor/product
  name, the launch URL template itself — a real, admin-entered
  technical value) stays as typed/stored, same convention as
  `DpVendorDictionarySection.tsx` (batch 41).
- **Inline CSS — real consolidation, not just conversion**: the same
  "toggle-row margin"/"meta line" inline-style pair that got one-off
  `.ps-dpvendor__*` (batch 41) and `.ps-orterm__*` (batch 43) classes
  showed up here a third time — real enough repetition to converge
  into two new SHARED classes on the base `.ps-conf-*` family
  (`.ps-conf-toggle-label-row--gap-below`, `.ps-conf-row-meta`)
  instead of adding a fourth one-off pair. The two earlier files' own
  per-file classes are left as-is (unchanged, out of this batch's
  scope) — any future file hitting this same pattern should reach for
  the new shared ones directly. Separately, the hint paragraph's
  `marginTop: 4` inline style turned out to be an exact match for the
  already-existing `.ps-conf-section-subtitle--top-gap` modifier —
  reused directly, combined with a new `--danger` color modifier for
  the warning state.
- **Business logic / dead code**: none found — a small, already-clean
  dictionary editor.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `wsiViewerVendorSection` namespace added this
  batch — **4300 → 4318 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/WsiViewerVendorDictionarySection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

60 of `Config/System/`'s 74 files remain unconverted (5 pre-converted
before this sweep segment + `VoiceSection.tsx` + `FontsSection.tsx` +
`SessionSecuritySection.tsx` + `FootPedalSection.tsx` +
`CancerRegistrySettingsSection.tsx` + `DpVendorDictionarySection.tsx` +
`MigrationFieldMappingsSection.tsx` + `OrSuiteTerminalsSection.tsx` +
`WsiViewerVendorDictionarySection.tsx`). Any future dictionary-shaped
file (list/add-edit-modal/deactivate) should check for the new shared
`.ps-conf-toggle-label-row--gap-below`/`.ps-conf-row-meta` classes
before adding another one-off pair.
`GrossImagingVendorDictionarySection.tsx` (already converted, one of
the 5 pre-converted) established the `.ps-conf-*` family this whole
sub-family builds on; `ConcordanceReviewSettingsSection.tsx` (153
lines) is next in line by size among the unconverted files. Beyond
`Config/`: `TemplateBuilder/`, `QualityAssurance/`, `Common/`, and
`AppShell.tsx`. `SynopticReportPage` is unchanged and still pending.
Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content).

## Config/System/ConcordanceReviewSettingsSection.tsx — file-by-file sweep, batch 45

### Files swept this batch

- `src/components/Config/System/ConcordanceReviewSettingsSection.tsx`

154 lines — the org-wide default toggles for preliminary-vs-final
concordance review: automatic comparison, and the optional mandatory
review screen at sign-out. Tenth file swept in the wider
`Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `concordanceReviewSettingsSection` namespace — 7
  leaf keys × 5 locales. Toggle `aria-label`s are computed once from
  the same translated row labels used for on-screen text, rather than
  duplicated separately.
- **Inline CSS — a file with zero existing classes**: this file had no
  CSS classes anywhere, entirely hand-rolled `style={{...}}`,
  including its own local `Toggle` sub-component (a pattern its own
  header comment already flags as repeated across
  `ReleaseBufferSection.tsx`/`FontsSection.tsx`, each keeping their own
  copy). That toggle shares `FontsSection.tsx`'s `.config-toggle-btn*`
  (batch 37) 3-state colors and 18px thumb, but its track is a
  genuinely different size (44×24px + 12px radius vs. 40×22px + 11px)
  with a different thumb inset/travel (3px/23px vs. 2px/20px) — too
  many small differences at once to force a reuse, so it gets its own
  `.ps-concordance-toggle*` family. Its title, though, turned out to
  be an exact match for the existing `.config-fonts-title` class
  (18px/700/#f1f5f9/margin 0 0 4px) and is reused directly instead of
  duplicating it. Everything else (header spacing, subtitle, setting
  rows + indented variant, row text/label/description, saved
  confirmation) is a new `.ps-concordance__*` family.
- **Business logic / dead code**: none found — a small, already-clean
  two-toggle settings page.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the one related test file,
  `mockConcordanceReviewSettingsService.test.ts`, covers the service
  layer, untouched by this batch).
- All five locale files verified programmatically to have identical
  key sets across the `concordanceReviewSettingsSection` namespace
  added this batch — **4318 → 4325 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/ConcordanceReviewSettingsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

59 of `Config/System/`'s 74 files remain unconverted. This batch's
header comment flags `ReleaseBufferSection.tsx` (232 lines) and
`FontsSection.tsx` (already converted, batch 37) as keeping their own
local copy of the same small toggle pattern — worth checking when
`ReleaseBufferSection.tsx` comes up, though its own exact dimensions
haven't been confirmed yet. `DocumentStyleSection.tsx` (169 lines) is
next in line by size among the unconverted files. Beyond `Config/`:
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and `AppShell.tsx`.
`SynopticReportPage` is unchanged and still pending. Flagged-not-fixed
gaps carried forward from batches 30–34 (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content).

## Config/System/DocumentStyleSection.tsx — file-by-file sweep, batch 46

### Files swept this batch

- `src/components/Config/System/DocumentStyleSection.tsx`

170 lines — the org-wide default text style (font family/size/weight/
underline/transform) for report header/body/footer, with a live
preview. Eleventh file swept in the wider `Config/System/` directory
(74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `documentStyleSection` namespace — 15 leaf keys × 5
  locales. `FONT_FAMILY_OPTIONS` values are real font-family names —
  proper nouns, stay untranslated, same convention as
  `FontsSection.tsx` (batch 37). The header/body/footer category tabs
  and the preview sentence's embedded category word both resolve
  through one shared `CATEGORY_LABEL_KEY` map, so translators only
  write each category name once.
- **Inline CSS — 3 exact cross-file matches found**: the header title,
  subtitle paragraph, and "✓ Saved" badge markup turned out to be
  EXACT style matches for `FontsSection.tsx`'s own
  `.config-fonts-title`/`.config-fonts-description`/
  `.config-fonts-count-badge` classes (batch 37) — reused directly
  rather than duplicated a fourth time (following batch 45's same
  discovery of an exact `.config-fonts-title` match). Everything else
  (page padding, header/tabs spacing, active/inactive tab styling,
  stack width, toggle-row spacing) is a new `.ps-docstyle__*` family.
  The style-preview box's dynamic font properties
  (fontFamily/fontSize/fontWeight/textDecoration/textTransform) stay
  inline — a genuine per-render value showing the admin's live style
  selection, the whole point of this page, the same exception already
  used for `FontsSection.tsx`'s per-font `style={{fontFamily}}` — only
  its static box styling (margin/padding/border/background/color)
  moved to a new `.ps-docstyle__preview` class.
- **Business logic / dead code**: none found — a small, already-clean
  style editor.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All five locale files verified programmatically to have identical
  key sets across the `documentStyleSection` namespace added this
  batch — **4325 → 4340 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/DocumentStyleSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

58 of `Config/System/`'s 74 files remain unconverted.
`SnomedCervicalHistologySeverityMappingSection.tsx` (170 lines) and
`RuleModal.tsx` (173 lines) are next in line by size. Any future file
should check first for exact matches against `FontsSection.tsx`'s
`.config-fonts-*` header/badge classes and `ConcordanceReviewSettingsSection.tsx`'s
`.ps-concordance-toggle*`/`FontsSection.tsx`'s `.config-toggle-btn*`
toggle families before adding another one-off copy — two batches in a
row (45, 46) have now found exact matches there. Beyond `Config/`:
`TemplateBuilder/`, `QualityAssurance/`, `Common/`, and `AppShell.tsx`.
`SynopticReportPage` is unchanged and still pending. Flagged-not-fixed
gaps carried forward from batches 30–34 (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content).

## Config/System/SnomedCervicalHistologySeverityMappingSection.tsx — file-by-file sweep, batch 47

### Files swept this batch

- `src/components/Config/System/SnomedCervicalHistologySeverityMappingSection.tsx`

170 lines — the cyto-histologic correlation admin screen mapping a
SNOMED CT code (real, licensed terminology the admin types in) to a
severity rank on the same 0–5 scale cytology's own Bethesda categories
already use. An inline add-form plus an inline-editable table, not a
modal. Twelfth file swept in the wider `Config/System/` directory (74
files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `snomedCervicalHistologySeverityMappingSection`
  namespace — 18 leaf keys × 5 locales (title, subtitle, table column
  headers, loading/empty states, Save/Cancel/Edit/Remove/Add button
  labels, the "Add Mapping" card title, field placeholders, the
  remove-confirmation dialog text, and the required-fields error
  message).
- **Real data left untranslated, per this sweep's established
  convention**: `entry.snomedCode`, `entry.description`, and
  `entry.createdBy.userName` — real, licensed SNOMED CT terminology
  and a real person's name the admin/customer enters, not UI chrome.
  The file's own header comment documents this decision directly,
  matching the same "empty until a confirmed license" honesty already
  established elsewhere in this codebase (`Case.ts`'s
  `syntheticAbnormalCoding` comment, `resolveEmbeddedCoding.ts`'s own
  default).
- **Inline CSS**: no exact cross-file matches found this time (checked
  against `FontsSection.tsx`'s and `DocumentStyleSection.tsx`'s header/
  subtitle classes and the recent toggle families — this file has no
  toggle and its own title/subtitle sizing differs). New
  `.ps-snomed-severity__*` family: `title`, `subtitle`, `table-wrap`,
  `rank-input` (60px, inline-edit table cell), `rank-input-wide` (80px,
  add-form field — kept separate since the two inputs sit in visually
  different contexts and happened to want different widths), `added-
  cell`, `add-card`, `add-title`, `add-row`, `desc-field`, `desc-input`,
  `error`. The table itself reuses the existing `.ps-conf-table*`
  family already used throughout `Config/System/`.
- **Business logic / dead code**: none found — a small, already-clean
  CRUD screen; its handlers are thin wrappers around
  `mockSnomedCervicalHistologySeverityMappingService`, already the
  established pattern.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component (the adjacent
  `mockSnomedCervicalHistologySeverityMappingService.test.ts` covers
  the service layer only, untouched by this pass).
- All 18 `t()` keys used in the file cross-checked directly against
  the 18 leaf keys added to the locale files — exact match, no orphaned
  or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the `snomedCervicalHistologySeverityMappingSection`
  namespace added this batch — **4340 → 4358 leaf keys**, matched
  exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/SnomedCervicalHistologySeverityMappingSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

57 of `Config/System/`'s 74 files remain unconverted. `RuleModal.tsx`
(173 lines) is next in line by size among the unconverted files. Any
future file should check first for exact matches against
`FontsSection.tsx`'s `.config-fonts-*` header/badge classes and the
recent toggle families before adding another one-off copy. Beyond
`Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/` (15
files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note that
`ReleaseBufferSection.tsx` (232 lines) keeps its own local copy of a
similar small toggle pattern, worth checking when that file comes up.

## Config/System/RuleModal.tsx — file-by-file sweep, batch 48

### Files swept this batch

- `src/components/Config/System/RuleModal.tsx`

173 lines — the add/edit modal for a case-routing rule (pool
assignment by specimen-description keyword match), extracted from
`RoutingRulesSection.tsx` to sidestep an OXC/rolldown parser issue.
100% inline `style={{}}` before this pass, zero pre-existing CSS
classes of its own (it did already reuse `.ps-conf-backdrop`/
`.ps-conf-select`/`.ps-conf-btn-teal-accent` and the `fm-*`/
`.ps-sub-toggle-*` shared modal/toggle families). Thirteenth file
swept in the wider `Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `ruleModal` namespace — 20 leaf keys × 5 locales
  (eyebrow, add/edit titles, pool/keywords/priority/note labels and
  hints, the no-active-pools warning, keyword placeholder/empty state,
  a new translated `aria-label` on the per-keyword remove control, the
  priority hint, the note placeholder, both Save button variants, and
  all 4 validation error messages, two of them interpolated
  (`{{keyword}}`, `{{priority}}`)). No real/persisted data in this
  file to keep in English — every string is UI chrome. Reused 4
  existing `common.*` keys instead of adding duplicates: `common.add`,
  `common.cancel`, `common.active`, `common.inactive`. The removable-
  keyword "x" glyph itself stays as a plain symbol (not real language
  text, same as elsewhere in this app) but now carries the new
  translated `removeKeywordAriaLabel` for screen readers, which it
  never had before.
- **Inline CSS — no exact cross-file match found this time**: checked
  the file's own `INPUT`/`LABEL` style objects against `.ps-input-dark`
  (10px/14px padding, 8px radius, `var(--ps-navy-input)` background,
  Inter font-family) and `.ps-label` (12px, `#94a3b8`) — every value
  differed (8px/12px padding, 7px radius, `#0f0f0f` background,
  `inherit` font-family, 11px/`#9ca3af` label), so this file gets its
  own new `.ps-rulemodal__*` family instead of a forced reuse. Also
  checked `.ps-required-marker` (`#f87171`) against this file's own
  required-asterisk color (`#ef4444`) — different reds, kept separate.
  Everything converted: modal width, title size, label, required-mark,
  input (plus flex/number width modifiers), the no-pools warning box,
  the keywords hint/row/add-button, the empty-keywords box, the
  keyword-chip list and its remove control, the priority row/hint, the
  active/inactive toggle row and its on/off label color, the error
  text, and the footer button row.
- **Business logic / dead code**: none found — the file's own handlers
  (`addKeyword`, `handleSave`) are already thin, form-local validation
  logic with no UI-embedded business rule worth extracting.
- **Flagged, not fixed**: the parent file this was extracted from,
  `RoutingRulesSection.tsx` (275 lines), remains unconverted — out of
  scope for this batch under the sweep's per-file boundary; worth
  sweeping together with (or immediately after) this file given how
  tightly coupled they are.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('ruleModal.*')` keys used in the file cross-checked directly
  against the 20 leaf keys added to the locale files — exact match.
- All five locale files verified programmatically to have identical
  key sets across the `ruleModal` namespace added this batch —
  **4358 → 4378 leaf keys**, matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/RuleModal.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

55 of `Config/System/`'s 74 files remain unconverted (one of those,
`useSpecimenDictionary.tsx`, was already checked in batch 39 and found
to be a pure hook/context wrapper with nothing to convert).
`RoutingRulesSection.tsx` (275 lines, this batch's own parent file) or
`JurisdictionPaymentMappingSection.tsx` (178 lines, next smallest) are
the leading candidates. Beyond `Config/`: `TemplateBuilder/` (10
files), `QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from batches 30–34 (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/RoutingRulesSection.tsx — file-by-file sweep, batch 49

### Files swept this batch

- `src/components/Config/System/RoutingRulesSection.tsx`

275 lines — the specimen → subspecialty-pool routing-rules admin
screen (built-in + custom keyword rules, a live routing test box, the
rules table with inline priority/keyword/note/status columns). Swept
together with its own child modal, `RuleModal.tsx` (batch 48), per
that batch's own flagged note. Fourteenth file swept in the wider
`Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()`/`Trans` and converted every
  on-screen string to a new `routingRulesSection` namespace — 25 leaf
  keys × 5 locales (page title/subtitle, Add Rule button, the Test
  Routing box's label/placeholder/button and its matched/no-match
  result text, the search placeholder and filter `aria-label`/options,
  all 5 table column headers, the built-in badge, the "+N more"
  keyword overflow text, the empty-filter row, the footer's
  auto-save note and interpolated active/total/custom counts, and the
  delete-confirmation modal's title/message). Real, admin-entered data
  stays untranslated — pool/subspecialty names (`poolName()`), rule
  keywords, and rule notes are all live user data, not UI chrome.
  - The "✓ Routes to **{{pool}}**" result line uses `<Trans>` with a
    `strong` component mapping (same pattern established in batch 44
    for `WsiViewerVendorDictionarySection.tsx`), since the pool name
    inside it is real, dynamic data that needs to render bold, not
    plain interpolated text.
  - Reused 3 existing `common.*` keys instead of adding duplicates:
    `common.active`/`common.inactive` (filter dropdown options — exact
    text match) and `common.edit`/`common.delete` (row action buttons
    and the delete-modal's confirm label).
- **Inline CSS — 100% inline before this pass, all converted**: new
  `.ps-routingrules__*` family covering the page shell, header, test
  box, filters, table (headers/rows/cells), the per-row active toggle,
  action buttons, footer, and result banners. Reused `.ps-section-
  add-btn`/`.ps-conf-btn-primary`/`.ps-conf-select` directly (exact
  matches, already shared classes). Checked the row toggle (36×20)
  against the shared `.ps-sub-toggle-track` (44×24) and the row's Edit
  button against `.ps-sub-edit-btn` (5px/16px padding vs. this file's
  4px/12px) — both close but not exact, kept as this file's own sizes
  rather than resizing an existing table row to fit a shared class.
  Same reasoning for the keyword chip vs. `RuleModal.tsx`'s own pill-
  style chip (dense table cell vs. modal input chip).
- **Real, redundant imperative code removed**: every row's
  `onMouseEnter`/`onMouseLeave` handlers writing directly to
  `element.style.background` were replaced with a plain CSS `:hover`
  rule on the new `.ps-routingrules__tr:hover` class — same visual
  result, no JS event handlers needed per row.
- **Business logic / dead code**: none found — `persist`/`handleSave`/
  `handleDelete`/`handleToggle`/`handleTest`/`filtered` are already
  clean, form-local state logic with no UI-embedded rule worth
  extracting further.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('routingRulesSection.*')`/`Trans` keys used in the file
  cross-checked directly against the 25 leaf keys added to the locale
  files — exact match.
- All five locale files verified programmatically to have identical
  key sets across the `routingRulesSection` namespace added this
  batch — **4378 → 4403 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/RoutingRulesSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

54 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`JurisdictionPaymentMappingSection.tsx` (178 lines) is next in line by
size. Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from batches 30–34 (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/JurisdictionPaymentMappingSection.tsx — file-by-file sweep, batch 50

### Files swept this batch

- `src/components/Config/System/JurisdictionPaymentMappingSection.tsx`

178 lines — the per-country local payment-scheme → Master Payment Type
admin CRUD screen (Outside Client Support & International Financial
Class Architecture Specification, §3.2). Fifteenth file swept in the
wider `Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `jurisdictionPaymentMappingSection` namespace — 27
  leaf keys × 5 locales (loading state, page title/subtitle, country
  filter/show-inactive toggle, Add Mapping button, all 6 table column
  headers, the empty-filter row, and the full add/edit modal — title
  with interpolated real scheme code on edit, all 6 field labels, 4
  placeholders with real-world example text, the "— Select —" option,
  and both Save button variants). Also added one new, generically
  reusable `common.create` key (this file's own "Create" button had no
  existing shared equivalent — `common.save`/`common.add` both cover
  different verbs). Reused 6 existing `common.*` keys instead of
  adding duplicates: `showInactive`, `active`, `inactive`, `edit`,
  `deactivate`, `reactivate`, `cancel`.
- **Real, admin-entered data left untranslated, per this sweep's
  established convention**: `countryCode`, `localSchemeCode`,
  `localDisplayTerminology` (real local-language payment-scheme
  names), `primaryOutboundFormat`, `notes`, and the resolved
  `masterTypeName()` display — all real dictionary content the
  admin/customer enters or a real Master Payment Type's own stored
  `displayName`, not UI chrome. The file's own header comment
  documents this decision directly.
- **Real bug found and fixed while converting**: the modal's Master
  Payment Type `<select>` used `masterTypes.filter(t => t.active)
  .map(t => ...)`, which would have silently shadowed the newly-added
  `useTranslation()`'s own `t` the moment a translated string was
  needed inside that scope. Renamed the loop variable to `t2` before
  it could cause a real bug (caught while writing the conversion, not
  by `tsc`, since nothing inside that particular callback needed `t()`
  itself).
- **Inline CSS**: a handful of real inline `style={{}}` blocks found
  and removed — the toolbar row's flex/gap/justify-content layout, the
  toggle label's `cursor: pointer`, the per-row `opacity` for inactive
  entries, the scheme-code `<code>` tag's `fontSize: 12`, and the
  actions cell's `textAlign: 'right'`/edit-button `marginRight` —
  converted to a new small `.ps-jpm__*` family. Everything else in the
  file already used shared `.ps-conf-*`/`.ps-defic-*`/`.ps-macro-
  import-modal`/`.ps-ose-quicktext-*` classes, confirmed via grep
  before starting and reused directly.
- **Business logic / dead code**: none found — `refresh`/`handleSave`/
  `toggleActive`/`canSave` are already thin, well-scoped service calls
  and form-local validation.

### Validation

- `npx tsc --noEmit -p .`: clean (including the `t`-shadowing fix
  above, verified before it ever reached the compiler).
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the adjacent
  `mockJurisdictionPaymentMappingService.test.ts` covers the service
  layer only, untouched by this pass).
- All `t('jurisdictionPaymentMappingSection.*')` keys used in the file
  cross-checked directly against the 27 namespace leaf keys added —
  exact match.
- All five locale files verified programmatically to have identical
  key sets across the new namespace plus the one new `common.create`
  key — **4403 → 4431 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/JurisdictionPaymentMappingSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

53 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`RetentionSection.tsx` (183 lines) is next in line by size. Beyond
`Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/` (15
files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/RetentionSection.tsx — file-by-file sweep, batch 51

### Files swept this batch

- `src/components/Config/System/RetentionSection.tsx`

183 lines — the data-retention policy editor (AI suggestions, audit
logs, case snapshots, report archive — each a min/max-bounded numeric
field persisted to `localStorage`). 100% inline `style={{}}` before
this pass, using only `.ps-conf-btn-primary`/`.ps-conf-btn-secondary`
as pre-existing shared classes. Sixteenth file swept in the wider
`Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` to both the main component and
  its local `Row` sub-component, converting every on-screen string to
  a new `retentionSection` namespace — 20 leaf keys × 5 locales (page
  title/subtitle, all 4 field label/note/unit triples, the composed
  `aria-label` on each numeric input, the governance note, both Save
  button states, the Reset button, and the post-save confirmation
  message). No real/persisted data in this file — every string is UI
  chrome; the `Row` component receives already-translated strings as
  props from its parent rather than calling `useTranslation()` for its
  own lookups redundantly at each of the 4 call sites, while still
  needing its own hook instance for the composed `aria-label`.
- **Inline CSS**: fully converted — the shared field-card style
  (`fieldStyle`/`labelStyle`/`noteStyle`/`inputStyle`/`unitStyle`
  module-level constants) became a new `.ps-retention__*` family, with
  the dirty-state border-color override (previously an inline
  `style={{ ...fieldStyle, borderColor: dirty ? ... }}` spread) now a
  `--dirty` modifier class. No exact cross-file match found or
  expected — this screen's own editable-numeric-field card design is
  specific to this file.
- **Business logic / dead code**: none found — `load`/`set`/
  `handleSave`/`handleReset` are already clean, well-scoped
  `localStorage` read/write helpers with no UI-embedded logic worth
  extracting further.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('retentionSection.*')` keys used in the file cross-checked
  directly against the 20 leaf keys added to the locale files — exact
  match.
- All five locale files verified programmatically to have identical
  key sets across the `retentionSection` namespace added this batch —
  **4431 → 4451 leaf keys**, matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/RetentionSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

52 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`ActionGroupsSection.tsx` (185 lines) is next in line by size. Beyond
`Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/` (15
files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/ActionGroupsSection.tsx — file-by-file sweep, batch 52

### Files swept this batch

- `src/components/Config/System/ActionGroupsSection.tsx`

185 lines — the Action Group admin CRUD screen (named, reusable
bundles of Action Registry command ids, referenced by Workstation
Group default/allowed action groups) plus its own add/edit modal
(`ActionGroupModal`, co-located in the same file). Already almost
entirely built from shared `.ps-conf-*`/`.ps-ms-*`/`.ps-batch-reagent-
lot-*` classes before this pass — only 4 small inline `style={{}}`
overrides needed extracting. Seventeenth file swept in the wider
`Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` to both the main component and
  `ActionGroupModal`, converting every on-screen string to a new
  `actionGroupsSection` namespace — 21 leaf keys × 5 locales (loading
  state, page title/subtitle, Add button, search placeholder, table
  headers, empty-filter row, the interpolated "+N more" bundled-action
  overflow text, both validation error messages, and the full add/edit
  modal — interpolated edit title with the real group name, name/
  actions field labels and placeholders, the no-actions-match message,
  and both Save button variants). Real, admin-entered data stays
  untranslated — the group's own `name`, and `actionLabel()`'s
  resolved Action Registry display text, both live user/registry data.
  `g.status`/`draft.active` remain the real, internal `'Active' |
  'Inactive'` values still used for the file's own logic and CSS
  modifier classes — only their on-screen text now resolves through
  `common.active`/`common.inactive`, reused directly rather than
  duplicated. Also reused `common.cancel`/`common.edit`/
  `common.deactivate`/`common.reactivate` for the row and modal action
  buttons.
- **Inline CSS — 4 small overrides extracted, no exact cross-file
  match needed**: the actions-search input's `marginBottom: 8` reused
  the existing `.ps-mb-8` utility class directly; the action-list's
  `maxHeight: 220`, the per-action category suffix's color/font-size,
  and the no-actions-match message's `padding: 8` became a new, small
  `.ps-actiongroups__*` family. Checked the category suffix against
  the existing `.ps-conf-row-meta` (batch 44) — that class also
  carries a `margin-left: 8px` this file's own inline usage (natural
  text flow right after the action label) doesn't need, so kept
  separate rather than shifting this file's spacing to fit.
- **Business logic / dead code**: none found — `handleSave`/
  `handleToggleStatus`/`filteredActions` are already clean, thin
  service calls and form-local filtering.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('actionGroupsSection.*')` keys used in the file cross-checked
  directly against the 21 leaf keys added to the locale files — exact
  match.
- All five locale files verified programmatically to have identical
  key sets across the `actionGroupsSection` namespace added this
  batch — **4451 → 4472 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/ActionGroupsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

51 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`BillingTypeTriggerSection.tsx`/`CytologyQcSettingsSection.tsx` (188
lines each) are next in line by size. Beyond `Config/`:
`TemplateBuilder/` (10 files), `QualityAssurance/` (15 files),
`Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/BillingTypeTriggerSection.tsx — file-by-file sweep, batch 53

### Files swept this batch

- `src/components/Config/System/BillingTypeTriggerSection.tsx`

188 lines — the Charge Release Triggers admin screen (per-billing-type
override of which clinical event releases a charge to outbound
dispatch, with an Enterprise-Wide / per-site scope selector). Already
100% class-based before this pass, zero inline `style={{}}` — pure
i18n, no CSS work needed. Eighteenth file swept in the wider
`Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `billingTypeTriggerSection` namespace — 17 leaf keys
  × 5 locales (title/subtitle, the enterprise-wide/per-site scope
  selector text with its "(has override)" suffix, all 3 table column
  headers, the 3 billing-type display labels and 2 trigger display
  labels — both converted from raw `Record<Key,string>` maps to
  `_KEY` maps resolved via `t()`, same pattern established throughout
  this sweep — the two Reset button variants, and the saved-indicator
  message).
- **Real, persisted audit-trail text protected from the locale
  switch — a genuine split found and fixed**: `scopeLabel` (the
  `"Enterprise-Wide"` fallback or a real site name) was previously the
  *same* variable used both in the two `auditService.logEvent()` calls
  and in the on-screen Reset button/saved-indicator text. Translating
  it in place would have silently made a real audit-trail record's
  language shift with whichever locale the acting admin had selected
  at the time — a persisted compliance record changing wording
  depending on UI language is exactly the failure mode this sweep's
  "exported/persisted data stays English" convention exists to
  prevent. Split into two variables: `scopeLabel` (unchanged, raw
  English, feeds only the two audit-log `detail` strings) and a new
  `scopeLabelDisplay` (real site name as-is, or the new translated
  `enterpriseWide` key) used only in the JSX. The audit-log `detail`
  strings themselves also already used the raw, untranslated
  `billingType`/trigger enum values directly (e.g. `"TC"`,
  `"SPECIMEN_GROSSED"`), not the display labels — confirmed unchanged.
- **Inline CSS**: none — the file was already fully built from shared
  `.ps-conf-*` classes, confirmed by grep before starting (zero
  `style={{` matches).
- **Business logic / dead code**: none found — `load`/`handleChange`/
  `handleResetToDefault` are already clean, well-scoped service calls;
  the file's own header comments already document its deliberately
  presentation-only role.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the adjacent
  `mockBillingTypeTriggerConfigService.test.ts` covers the service
  layer only, untouched by this pass).
- All `t('billingTypeTriggerSection.*')` keys used in the file
  cross-checked directly against the 17 leaf keys added to the locale
  files — exact match.
- All five locale files verified programmatically to have identical
  key sets across the `billingTypeTriggerSection` namespace added this
  batch — **4472 → 4489 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/BillingTypeTriggerSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` changes this batch — no inline styles existed to
extract.)

### Next up

50 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`CytologyQcSettingsSection.tsx` (188 lines) is next in line by size.
Beyond `Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/CytologyQcSettingsSection.tsx — file-by-file sweep, batch 54

### Files swept this batch

- `src/components/Config/System/CytologyQcSettingsSection.tsx`

188 lines — the Cytology QC Random Selection Rates screen: a 3-tier
cascade (Enterprise default → Facility override → Staff Member
override) for two independent rates (Negative / Non-Negative GYN
random-selection percentages). 100% inline `style={{}}` before this
pass. Nineteenth file swept in the wider `Config/System/` directory
(74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `cytologyQcSettingsSection` namespace — 13 leaf keys
  × 5 locales (page title/subtitle, the shared Negative/Non-Negative
  rate-pair labels, the shared "+ Add Override" button and interpolated
  "Neg N% · Non-Neg N%" summary text reused across both the Facility
  and Staff tiers, the Enterprise tier's unsaved-change indicator, and
  each tier's own title/empty-state/hint text). Real, resolved data
  stays untranslated — `facilityName()`/`staffName()` (real
  organization/person names) and the numeric override percentages
  themselves, both live user data, not UI chrome. Reused
  `common.save`/`common.cancel`/`common.remove` for the tier action
  buttons instead of adding duplicates.
- **Inline CSS**: fully converted — the module-level `cardStyle`/
  `rowStyle`/`btnStyle`/`inputStyle` constants and every remaining
  inline `style={{}}` became a new `.ps-cytqc__*` family (page shell,
  card, card header/title, row, rate-pair/field/label, buttons, inputs,
  add-row, empty/unsaved states). No exact cross-file match checked or
  expected — this screen's own 3-tier-cascade card design is specific
  to this file.
- **Business logic / dead code**: none found — `refresh`/
  `saveEnterprise`/the two override create/remove handlers are already
  clean, well-scoped service calls; the file's own header comments
  already document the real product decisions behind the 3-tier
  design.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the adjacent
  `cytologyQcSettingsCascade.test.ts` covers the service-layer cascade
  logic only, untouched by this pass).
- All `t('cytologyQcSettingsSection.*')` keys used in the file
  cross-checked directly against the 13 leaf keys added to the locale
  files — exact match.
- All five locale files verified programmatically to have identical
  key sets across the `cytologyQcSettingsSection` namespace added this
  batch — **4489 → 4502 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/CytologyQcSettingsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

49 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`MasterPaymentTypeDictionarySection.tsx` (191 lines) is next in line by
size. Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from batches 30–34 (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/MasterPaymentTypeDictionarySection.tsx — file-by-file sweep, batch 55

### Files swept this batch

- `src/components/Config/System/MasterPaymentTypeDictionarySection.tsx`

191 lines — the jurisdiction-agnostic Master Payment Type dictionary
admin CRUD screen (Outside Client Support & International Financial
Class Architecture Specification, §3.1) — same table+modal shape as
`JurisdictionPaymentMappingSection.tsx` (batch 50), which references
these entries. Twentieth file swept in the wider `Config/System/`
directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `masterPaymentTypeDictionarySection` namespace — 25
  leaf keys × 5 locales (loading state, page title/subtitle, Add
  button, all 6 table column headers, the empty-filter row, the
  interpolated "Required ({{label}})" subscriber-ID cell text, and the
  full add/edit modal — interpolated edit title with the real display
  name, all field labels, 2 placeholders, both checkbox labels, and
  the Save Changes button). `GUARANTOR_LABELS` converted from a raw
  `Record<GuarantorRequirement,string>` to a `GUARANTOR_LABEL_KEY` map
  — reusing `common.required`/`common.optional` directly for two of
  its three values (exact wording match) and adding one new
  `notRequired` key for the third, rather than duplicating all three.
  Also reused `common.showInactive`/`common.yes`/`common.no`/
  `common.active`/`common.inactive`/`common.edit`/`common.deactivate`/
  `common.reactivate`/`common.cancel`/`common.create` — ten existing
  keys reused in one file, the most of any batch this sweep.
- **Real, admin-entered data left untranslated, per this sweep's
  established convention**: the category `id` (a real, internal
  identifier the admin sets once and which is then locked), the real
  `displayName`, `subscriberIdLabel`, and `notes` — all real dictionary
  content, not UI chrome. `requiresGuarantor` remains the real internal
  `'required' | 'optional' | 'not_required'` value used for logic and
  persisted by the service; only its on-screen text now resolves
  through the new label-key map.
- **Inline CSS**: a handful of real inline `style={{}}` blocks found
  and removed — the toolbar row's flex layout, the toggle label's
  `cursor: pointer`, the per-row `opacity` for inactive entries, the
  category-id `<code>` tag's `fontSize: 12`, the actions cell's
  `textAlign: 'right'`/edit-button `marginRight`, the locked-hint's
  `opacity: 0.6`, and both checkbox `<label>`s' flex layout (one with
  an extra `marginTop: 10`) — converted to a new small `.ps-mptd__*`
  family. Everything else in the file already used shared `.ps-conf-*`/
  `.ps-defic-*`/`.ps-macro-import-modal`/`.ps-ose-quicktext-*` classes,
  confirmed via grep before starting and reused directly.
- **Business logic / dead code**: none found — `refresh`/`handleSave`/
  `toggleActive`/`canSave` are already thin, well-scoped service calls
  and form-local validation, matching `JurisdictionPaymentMapping
  Section.tsx`'s own shape almost exactly.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated component test file exists (the adjacent
  `mockMasterPaymentTypeService.test.ts` covers the service layer
  only, untouched by this pass).
- All `t('masterPaymentTypeDictionarySection.*')` keys and the
  `GUARANTOR_LABEL_KEY` map's own key used in the file cross-checked
  directly against the 25 leaf keys added to the locale files — exact
  match.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **4502 → 4527 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/MasterPaymentTypeDictionarySection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

48 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`DftExportPreviewSection.tsx` (208 lines) is next in line by size.
Beyond `Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

## Config/System/DftExportPreviewSection.tsx — file-by-file sweep, batch 56

### Files swept this batch

- `src/components/Config/System/DftExportPreviewSection.tsx`

208 lines — the Billing Export Preview lookup tool: given a case ID,
shows the real JSON payload PathScribe sends to the interface engine,
the billing-deficiency governance gate, the charge table, and a
preview of the HL7 DFT^P03 message the downstream interface engine
would itself construct from that JSON. Twenty-first file swept in the
wider `Config/System/` directory (74 files total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `dftExportPreviewSection` namespace — 21 leaf keys ×
  5 locales (title/subtitle, the case-ID lookup placeholder and its
  two button states, the not-found warning, the two pluralized status
  messages — "N open billing deficiency/deficiencies" and "N real
  charge/charges", both `_one`/`_other` + `{{count}}` — the no-charges
  message, all 6 charge-table column headers, and the JSON/HL7 preview
  section titles and subtitles). **Real output left untranslated, per
  this sweep's established convention, and the whole reason this
  screen exists**: `result.jsonPayload` and `result.dftMessage` are
  the literal, generated JSON/HL7 text this screen's entire purpose is
  to show unmodified — translating either would defeat the tool. Same
  for every real charge/deficiency field (`sourceLabel`, `cptCode`,
  `cptDescription`, `modifier`, `billingType`, `resolvedAt`,
  `deficiencyType`, `auditorNotes`) and the admin-typed case ID.
- **Inline CSS**: reused 3 exact existing matches directly —
  `.ps-conf-hint--warning`/`--danger`/`--success` (established early
  in this sweep) for the not-found, blocked, and clear-for-export
  states. New, small `.ps-dft-export__*` family for the case-ID
  input's `max-width`, the two spaced section headers, and the JSON/
  HL7 preview textareas — no exact match existed anywhere else in the
  file for a monospace, pre-formatted, fixed-min-height textarea.
- **Business logic / dead code**: none found — `handleLookup` is
  already a single, well-scoped async flow; the file's own extensive
  header comments already document the real product decisions behind
  its JSON-vs-HL7 framing.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('dftExportPreviewSection.*')` keys used in the file
  cross-checked directly against the 21 leaf keys added to the locale
  files (19 direct keys + 2 pluralized pairs resolved via
  `{{count}}`) — exact match.
- All five locale files verified programmatically to have identical
  key sets across the `dftExportPreviewSection` namespace added this
  batch — **4527 → 4548 leaf keys**, matched exactly across
  en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/DftExportPreviewSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

47 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`ParticipationTypesSection.tsx`/`PatientMatchReviewSection.tsx` (210
lines each) are next in line by size. Beyond `Config/`:
`TemplateBuilder/` (10 files), `QualityAssurance/` (15 files),
`Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

---

## Config/System/ParticipationTypesSection.tsx + TypeModal.tsx — file-by-file sweep, batch 57

### Files swept this batch

- `src/components/Config/System/ParticipationTypesSection.tsx`
- `src/components/Config/System/TypeModal.tsx`

211 + 346 lines — the system-level master list of case participation
types (admins define types; roles select which they can serve as) and
its own coupled add/edit modal. Swept together, the same coupled
treatment as `RuleModal.tsx`/`RoutingRulesSection.tsx` in batches
48–49. Twenty-second and twenty-third files swept in `Config/System/`
(74 files total).

### What changed

- **i18n**: added `useTranslation()` to both files and converted every
  on-screen string to a new `participationTypesSection` namespace — 54
  leaf keys × 5 locales, covering the page header, search/filter row,
  table headers, loading/empty states, the 5 `AttrChip` capability
  labels (Finalise/Countersign/Template/Full View/Multi), the
  built-in badge, Active/Inactive status text (reused `common.active`/
  `common.inactive`), the Edit button (reused `common.edit`), the
  footer's "System Live Sync" label and interpolated
  `{{active}} active · {{total}} total` count, and the entire
  `TypeModal.tsx` form (labels, placeholders, capability descriptions,
  the per-lab sign-out-authority override hint and checkboxes, and all
  4 validation-error messages, 2 of them interpolated with the real
  colliding label/abbreviation). Real data stays untranslated:
  `t.label`, `t.abbreviation`, `t.description`, `t.color`, and
  `lab.name` (a resolved real facility name) are shown exactly as
  entered/stored.
- **Inline CSS**: both files were 100% inline before this pass. Reused
  several exact matches already established by the structurally very
  similar `RoutingRulesSection.tsx` (batch 49): `.ps-routingrules__title`/
  `--subtitle`/`--search-input`/`--table-wrap`/`--table`/`--thead-row`/
  `--empty-row`/`--note-clamp`/`--keyword-chips`/`--tr` (+ `:hover`)/
  `--tr--divider`/`--footer-autosave`/`--footer-dot`, plus
  `.ps-rulemodal__modal` (`width: min(600px, 96vw)`) and
  `.ps-rulemodal__footer-actions` for `TypeModal.tsx`'s own shell and
  footer. New small `.ps-participationtypes__*` family for the rest
  (page/header/filters layout, table cell padding, the type/status
  cells, the attribute-chip and abbreviation-chip base styles, the
  edit button, the modal's title/hint/lab-override rows). Per-item real
  hex colours (abbreviation-chip background/border, the status dot,
  the colour-swatch buttons, the colour preview chip) stay inline —
  genuinely dynamic structural values, not stylistic choices, the same
  exception already used for `AttrChip` itself.
- **Business logic / dead code**: the row's and the Edit button's
  `onMouseEnter`/`onMouseLeave` handlers writing directly to
  `element.style.background` are gone, replaced by the same
  `.ps-routingrules__tr:hover`/`.ps-participationtypes__edit-btn:hover`
  CSS rules already used for the identical pattern in
  `RoutingRulesSection.tsx` (batch 49). No dead code found otherwise —
  both files were already tightly scoped.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for either component (the only
  `*ParticipationType*test*` match is the unrelated service-layer
  `resolveClaimParticipationType.test.ts`).
- All `t('participationTypesSection.*')` keys used across both files
  cross-checked against the 54 leaf keys added — exact match.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **4548 → 4602 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/ParticipationTypesSection.tsx`
- `src/components/Config/System/TypeModal.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

45 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
`PatientMatchReviewSection.tsx` (210 lines) is next in line by size.
Beyond `Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

### Progress estimate

Batch 57 of an estimated ~187 batches to clear the currently known/
flagged queue — roughly **30% of known scope** (this batch cleared two
files at once, so the estimate ticked down by one batch rather than
staying flat).

---

## Config/System/PatientMatchReviewSection.tsx — file-by-file sweep, batch 58

### Files swept this batch

- `src/components/Config/System/PatientMatchReviewSection.tsx`

210 lines — the real review queue for the MPI's "ambiguous" match
outcomes (patient records `resolveOrCreatePatient()` couldn't
confidently auto-match or auto-create, routed here for a human
decision). Twenty-fourth file swept in `Config/System/` (74 files
total).

### What changed

- **i18n**: added `useTranslation()` and converted every on-screen
  string to a new `patientMatchReviewSection` namespace — 19 leaf keys
  × 5 locales, including two pluralized messages (`mergedBanner`,
  `possibleMatch`, both `_one`/`_other` + `{{count}}`) and the
  merge-confirmation dialog's title/message/confirm label (reused
  `common.cancel` for the cancel label). The dialog's message keeps
  the real patient names and MRNs — interpolated into the translated
  sentence via `{{provisionalName}}`/`{{provisionalMrn}}`/
  `{{candidateName}}`/`{{candidateMrn}}` — since this is on-screen
  confirmation text, not a persisted/audit record. **Real data stays
  untranslated**: `record.lastName`/`firstName`/`mrn`/`dateOfBirth`/
  `reviewReason`, the same fields on each merge candidate, and each
  resolved organisation's `o.name` are shown exactly as stored;
  `toLocaleDateString()` continues to format via the browser's own
  locale, unchanged.
- **Inline CSS**: the file was 100% inline before this pass. Reused 4
  exact existing matches — `.ps-routingrules__title`/`--subtitle` (page
  heading), `.ps-snomed-severity__add-card` (record-card border/
  radius/padding), `.ps-vs-studies` (gap:12px column list), and
  `.ps-diff-list` (gap:8px column list). New small
  `.ps-patientmatch__*` family for the rest (page/header layout, the
  organisation picker, the merge-success banner, the placeholder/
  empty states, the record card's header/name/meta/badge/reason, and
  the candidate row).
- **Business logic / dead code**: none found — `loadQueue`,
  `handleConfirmNew`, and `handleMergeConfirmed` were already tightly
  scoped; the file's own header comment already documents the real
  patient-safety reasoning behind the screen.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('patientMatchReviewSection.*')` keys used in the file
  cross-checked against the 19 leaf keys added (17 direct keys + 2
  pluralized pairs resolved via `{{count}}`) — exact match.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **4602 → 4621 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/PatientMatchReviewSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

44 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
The next candidates by size have not yet been surveyed in detail;
picking the next-largest unconverted file in the directory is the
plan. Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from batches 30–34 (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines).

### Progress estimate

Batch 58 of an estimated ~186 batches to clear the currently known/
flagged queue — roughly **31% of known scope**.

---

## Config/System/TATConfigSection.tsx — file-by-file sweep, batch 59

### Files swept this batch

- `src/components/Config/System/TATConfigSection.tsx`

1,076 lines — by far the largest file swept so far this sweep. A
full survey of `Config/System/` this batch turned up several much
larger unconverted files than the prior "next up" notes had assumed
(`StainDictionarySection.tsx` 951 lines, `ProtocolDictionarySection.tsx`
939, `BillingDictionarySection.tsx` 874, `SubspecialtiesSection.tsx`
821, `DemoResetTab.tsx` 808, and others in the 250–620 line range) —
the directory's real remaining scope is larger than earlier batches'
size estimates suggested; the progress percentage below has been
revised down accordingly. TAT Configuration itself: turnaround-time
targets per type/urgency/facility/specimen/subspecialty, an 8-level
most-specific-wins resolution hierarchy, a live resolution simulator,
and its own add/edit modal, all in one file (no separate coupled
modal file this time — `TATModal` and `ResolutionSimulator` are
co-located components within the same file).

### What changed

- **i18n**: added `useTranslation()` to all three components in the
  file (`TATModal`, `ResolutionSimulator`, `TATConfigSection`) and
  converted every on-screen string to a new `tatConfigSection`
  namespace — 109 leaf keys × 5 locales. `TAT_TYPE_LABELS`/
  `TAT_TYPE_DESC` became `TAT_TYPE_LABEL_KEY`/`TAT_TYPE_DESC_KEY`
  (the same "`*_LABEL_KEY` resolves to an i18n key" pattern used
  elsewhere this sweep), and the 4 fixed Role values (Resident/
  Fellow/Pathologist/External) got their own `ROLE_LABEL_KEY`/
  `ROLE_GROUP_LABEL_KEY` maps (singular vs. plural role-group
  phrasing for the live preview sentence) — the stored `roleId`/
  `type` values themselves are unchanged. Because
  `getTatTypeLabel`/`getTatTypeDescription`/`formatHours` are plain
  functions called from outside component render scope (including
  from `SYSTEM_DEFAULTS`-adjacent table rows and the simulator), `t`
  is threaded through as an explicit `TFunction` parameter rather
  than called via the hook. The long "Applies To" filter hint (with
  a bolded phrase) uses `<Trans i18nKey=... components={{ strong:
  <strong /> }} />`. **Real data stays untranslated**: every
  resolved facility/lab/specimen/subspecialty name, real QA Activity
  Type names and their admin-authored descriptions, and free-text
  admin notes are shown exactly as stored. **Known limitation,
  documented in the file's own header comment**: the live
  "Applies to …" resolution-preview sentence is built by joining
  several independently-translated fragments in a fixed English
  clause order (e.g. "STAT, Residents, Colon specimens, performed at
  X, ordered by Y") — fully localizing that word order per language
  would need a larger content redesign and was judged out of scope
  for this pass.
- **Inline CSS**: the file already used the shared `.ps-tat-*`/
  `.ps-sub-*`/`.ps-conf-*` class families extensively going in — only
  ~28 small `style={{}}` overrides remained. Reused 5 exact existing
  matches directly (`.ps-participationtypes__modal-title`,
  `.ps-participationtypes__builtin-badge`, `.ps-diff-list`,
  `.ps-tat-hint-text--mt4`, `.ps-rulemodal__footer-actions`,
  `.ps-participationtypes__td--right` — all established in batches
  57–58). New small `.ps-tatconfig__*` family for the rest (modal
  width, the simulator title, the row/badge/urgency/scope
  modifiers, the table's `<colgroup>` column widths, and the filter/
  hierarchy layout blocks).
- **Business logic / dead code**: a genuinely redundant inline
  `style={{ cursor: 'pointer' }}` on the toggle-track (the shared
  `.ps-sub-toggle-track` class already sets `cursor: pointer`) was
  dropped rather than converted to a class. Renamed every `.map(t =>
  ...)`/`.filter(t => ...)` loop variable that would have shadowed
  the new `useTranslation()` `t` (there were 6 such sites — the
  `t`-shadowing bug pattern caught repeatedly earlier in this sweep,
  e.g. batch 50). No other dead code found — the file's own extensive
  header/inline comments already document the real product decisions
  (the roleId uniqueness-guard fix, the Performing Lab vs. Ordering
  Facility distinction, the QA Activity Type registry integration,
  the Facility.status casing bug fix) and remain untouched.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('tatConfigSection.*')` keys used in the file — both literal
  calls and the four dynamic label-key maps
  (`TAT_TYPE_LABEL_KEY`/`TAT_TYPE_DESC_KEY`/`ROLE_LABEL_KEY`/
  `ROLE_GROUP_LABEL_KEY`) plus the one `<Trans>` usage — cross-checked
  programmatically against the 109 leaf keys added — exact match, no
  unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **4621 → 4730 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/TATConfigSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

43 of `Config/System/`'s 74 files remain unconverted (one,
`useSpecimenDictionary.tsx`, is a pure hook with nothing to convert).
A fuller size survey this batch found several much larger files still
pending: `StainDictionarySection.tsx` (951 lines),
`ProtocolDictionarySection.tsx` (939), `BillingDictionarySection.tsx`
(874), `SubspecialtiesSection.tsx` (821), `DemoResetTab.tsx` (808),
`PhysiciansSection.tsx` (616), `GoverningBodiesSection.tsx` (607),
`CasePoolAssignmentSection.tsx` (597), and a long tail down to
~240 lines. `StainDictionarySection.tsx` is next in line by size.
Beyond `Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from batches 30–34
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content), plus batch 45's note on
`ReleaseBufferSection.tsx` (232 lines), and this batch's own note on
the resolution-preview sentence's fixed English word order.

### Progress estimate

The fuller `Config/System/` survey this batch revealed meaningfully
more remaining work than earlier size estimates assumed (several
800–1,000+ line files were not previously on the radar), so this
estimate is revised down. Batch 59 of an estimated ~210 batches to
clear the currently known/flagged queue — roughly **28% of known
scope**.

## Config/System/StainDictionarySection.tsx — file-by-file sweep, batch 60

### Files swept this batch

- `src/components/Config/System/StainDictionarySection.tsx` (951
  lines) — the admin "Diagnostic Catalog" screen: a tabbed section
  (`types`/`protocols`/`macros`/`targets`) plus four modals
  (`StainTypeModal`, `ProtocolModal`, `MolecularTargetModal`,
  `MacroModal`) all defined in the one file.

### What changed

- **i18n**: `useTranslation()` added to all five components in the
  file. Every hardcoded string converted to `t()` calls under a new
  `stainDictionarySection` namespace (129 leaves). Two new generic
  `common.*` keys (`common.duplicate`, `common.export`) were added
  alongside it since "Duplicate" and "Export" buttons recur across
  many dictionary-style screens and are likely to be reused directly
  by future batches rather than re-added per file.
  - `STAIN_CATEGORY_LABEL_KEY: Record<StainCategory, string>` (7
    entries) and `TARGET_TYPE_LABEL_KEY:
    Record<MolecularTarget['targetType'], string>` (3 entries)
    replace the old raw label maps, following the same "data key
    stays English, display label is translated" pattern used for
    `TAT_TYPE_LABEL_KEY`/`ROLE_LABEL_KEY` in batch 59.
  - Consolidated shared modal strings reused verbatim across all
    four modals: `editTitle` ("Edit — {{value}}"), `duplicateTitle`
    ("Duplicate — {{value}}"), `nameLabel`, `descriptionLabel`,
    `statusLabel`, `saveChangesBtn` — matching the original code's
    own pattern of reusing each modal's `addTitle` string for both
    its header (add mode) and its footer Save button text.
  - Renamed a few `.map()` loop variables (`t` → `target`) that would
    have shadowed the new `useTranslation()` `t`, in the Default
    Targets chip list and its dropdown — the same shadowing bug
    caught proactively in every recent batch.
  - **Real data preserved, unchanged**: stain/protocol/macro
    `name`/`description`/`label`, `antibodyClone`, `vendor`,
    `defaultBillingCode`, `defaultControlTissueType`, all CPT/billing
    code fields, and real molecular target `symbol`/`detail` (e.g.
    ERBB2, TP53) — treated like SNOMED codes elsewhere in the sweep:
    real dictionary content, not UI chrome. The CSV export in
    `handleDownloadStainTypes` (headers `Name`/`Category`/
    `Description`/`AntibodyClone`/`Vendor`/`DefaultTurnaroundHours`/
    `Active`, with `Active` rendered as literal `Yes`/`No`) stays
    entirely English, unchanged.
- **Inline CSS**: the file already used the shared
  `.ps-conf-*`/`.ps-ms-*` dictionary/modal class families almost
  everywhere going in. Only one block needed new classes: the
  Molecular tab's "Default Targets" chip-picker (chip list, chip
  remove button, dropdown, dropdown option, and the inline
  add-new-target row). Added 8 new `.ps-staindict__*` classes for
  it; no exact reuse candidates existed for this particular UI
  pattern elsewhere in the codebase.
- **Business logic / dead code**: no dead code found. The file's
  existing structure (per-tab CRUD handlers, CSV import/export,
  duplicate-detection logic) was already reasonably factored and
  left untouched.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('stainDictionarySection.*')` keys used in the file — 119
  literal calls plus the 7 `categories.*` and 3 `targetTypes.*`
  dynamic label-map keys — cross-checked programmatically against
  the 129 leaf keys added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the combined new content (129 `stainDictionarySection`
  leaves + 2 `common.*` leaves) — **4730 → 4861 leaf keys**, matched
  exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/StainDictionarySection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`ProtocolDictionarySection.tsx` (939 lines) is next in line by size.
After that: `BillingDictionarySection.tsx` (874),
`SubspecialtiesSection.tsx` (821), `DemoResetTab.tsx` (808),
`PhysiciansSection.tsx` (616), `GoverningBodiesSection.tsx` (607),
`CasePoolAssignmentSection.tsx` (597), `SpecimenDictionarySection.tsx`
(542), `RvuCodeMapSection.tsx` (516), `SpecimenCategoriesSection.tsx`
(491), `DepartmentsSection.tsx` (488), and the rest of the long tail
down to ~240 lines documented in batch 59's survey. Beyond `Config/`:
`TemplateBuilder/` (10 files), `QualityAssurance/` (15 files),
`Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, and batch 59's note on
TATConfigSection's resolution-preview sentence word order) all
remain unchanged this batch.

### Progress estimate

Batch 60 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **29% of known scope**.

## Config/System/ProtocolDictionarySection.tsx — file-by-file sweep, batch 61

### Files swept this batch

- `src/components/Config/System/ProtocolDictionarySection.tsx` (939
  lines) — the standalone Protocol dictionary editor: a 2-column
  editor modal (protocol-level fields left, independently-scrollable
  Tracks/Steps right), a real search+multiselect for stains, a CSV
  spreadsheet import/export round-trip, and version history/restore.

### What changed

- **i18n**: `useTranslation()` added to `StainMultiSelect`,
  `EditorModal`, and the main `ProtocolDictionarySection` component.
  Every hardcoded UI string converted to `t()` calls under a new
  `protocolDictionarySection` namespace (78 leaves), reusing 7
  existing `common.*` keys (`active`/`inactive`/`cancel`/`edit`/
  `duplicate`/`export`/`remove`/`yes`/`no`) wherever the text matched
  exactly rather than adding duplicates.
  - **`rowsToProtocols`, a plain exported function (not a hook),
    now takes an explicit `t: TFunction` parameter** — the same
    "thread `t` through" pattern used for TATConfigSection's helper
    functions in batch 59. Its `invalidPathwayCounts` warning
    messages (e.g. `"X — Track A: Default Piece Count is only valid
    for a Block track, not Decant"`) are real, on-screen
    import-preview text shown to the admin, not exported/persisted
    data, so they're built from translated, interpolated strings
    now rather than hardcoded English template literals.
  - Two pluralized banners (`importPreview.parsed`/
    `unmatchedStains`/`invalidCounts`, and the modal's
    `usageBanner.used`/`history.label`) use `_one`/`_other` with
    `{{count}}` interpolation.
  - **Real data preserved, unchanged**: all CSV export headers/values
    (`Protocol Name`, `Material Kind` as literal `Block`/`Decant`,
    `Yes`/`No` columns, etc. — see `protocolsToRows`), protocol/
    track/step `name`/`description`/`pathwayName`/`action`, fixative
    and processing-format catalog `name`s, `regulatoryStatus` values,
    lab `name`s, specimen-type `name`s in the usage banner, and
    version-history `savedBy`/`toLocaleString()` timestamps.
- **Inline CSS**: none needed — the file already used only existing
  shared classes (`ps-conf-*`, `ps-ms-*`, `ps-protocol-*`,
  `ps-specdict-*`) throughout; a full scan found zero `style={{}}`
  usages in the file before this pass, so no CSS changes were made.
- **Business logic / dead code**: none found; the file's own header
  and inline comments already document its real product history
  (the 2-column rebuild, the Hybrid materialKind model, the PS-73/
  PS-75 follow-ups) and were left untouched.
- **Test file updated alongside the conversion**: the file's one
  dedicated test, `ProtocolDictionarySection.rowsToProtocols.test.ts`,
  calls `rowsToProtocols` directly and asserts on the real English
  text of its warning messages (`.toContain('Track A')`, `.toContain(
  'only valid for a Block track')`, etc.). Since `rowsToProtocols`'s
  signature changed to require `t`, the test now imports the real
  i18next instance via the same side-effect import convention already
  established in `ExternalConsultAccessModal.test.tsx`
  (`import '@/i18n/config'`) and passes its real, English-resolving
  `t` into every call — preserving the original, meaningful
  assertions rather than weakening them to key-only checks.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**,
  including the updated dedicated test file
  (`ProtocolDictionarySection.rowsToProtocols.test.ts`, 11/11).
- All `t('protocolDictionarySection.*')` key paths used in the file
  — 73 literal calls, with the 5 pluralized ones expanded to their
  `_one`/`_other` pair — cross-checked programmatically against the
  78 leaf keys added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **4861 → 4939 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/ProtocolDictionarySection.tsx`
- `src/components/Config/System/ProtocolDictionarySection.rowsToProtocols.test.ts`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`BillingDictionarySection.tsx` (874 lines) is next in line by size.
After that: `SubspecialtiesSection.tsx` (821), `DemoResetTab.tsx`
(808), `PhysiciansSection.tsx` (616), `GoverningBodiesSection.tsx`
(607), `CasePoolAssignmentSection.tsx` (597),
`SpecimenDictionarySection.tsx` (542), `RvuCodeMapSection.tsx` (516),
`SpecimenCategoriesSection.tsx` (491), `DepartmentsSection.tsx`
(488), and the rest of the long tail down to ~240 lines documented in
batch 59's survey. Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data, illustrative-
diagnosis mock content, `ReleaseBufferSection.tsx` (232 lines) not
yet converted, and batch 59's note on TATConfigSection's
resolution-preview sentence word order) all remain unchanged this
batch.

### Progress estimate

Batch 61 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **29% of known scope**.

## Config/System/BillingDictionarySection.tsx — file-by-file sweep, batch 62

### Files swept this batch

- `src/components/Config/System/BillingDictionarySection.tsx` (874
  lines) — the per-billingCode append-only versioned Billing
  Dictionary admin screen: a tabbed New Version/Duplicate modal
  (Billing & RVU / Coding Rules), a version-history modal, real
  two-tier enterprise/site scoping, and a live RVU Code Map drift
  warning.

### What changed

- **i18n**: `useTranslation()` added to `NewVersionModal`,
  `HistoryModal`, and the main `BillingDictionarySection` component.
  Every hardcoded UI string converted to `t()` calls under a new
  `billingDictionarySection` namespace (116 leaves), reusing 3
  existing `common.*` keys (`cancel`/`close`/`duplicate`/`required`/
  `active`).
  - **`siteLabel`, a plain exported function, now takes an optional
    `t?: TFunction`** — it's also imported and called directly by
    `PendingApprovalSection.tsx`, which hasn't had its own i18n pass
    yet (still queued later in this sweep). Making `t` optional
    (falling back to the same plain English string that untouched
    call site already renders today) avoided forcing an unrelated,
    not-yet-converted file to be touched just to keep this file's
    signature change compiling.
  - **`BILLING_STATUS_LABEL_KEY: Record<BillingRuleStatus, string>`**
    — the real `BillingRuleStatus` enum (DRAFT/PENDING_APPROVAL/
    ACTIVE/REJECTED/RETIRED) keeps its raw value as the data key
    (it also flows into `mockBillingRuleService`/`auditService`);
    only the on-screen status badge text is translated, via the same
    "data key stays English, display label translated" pattern used
    for `TAT_TYPE_LABEL_KEY`/`STAIN_CATEGORY_LABEL_KEY` in batches
    59–60. `ACTIVE` reuses `common.active` rather than adding a
    duplicate key.
  - **`EU_COUNTRY_NAME_KEY: Record<string, string>`** — the 27 EU
    member-state names plus New Zealand shown in the Country dropdown
    are translated the same way; the `EU_COUNTRIES` array itself (its
    English `.name` field and the real ISO `.code` that's actually
    persisted as the rule's `country`) is left untouched as reference
    data, only the rendered `<option>` label now resolves through the
    key map.
  - **Real data preserved, unchanged**: `billingCode`, `cpt`,
    CPT/HCPCS descriptions, RVU numeric values, the persisted
    `country` ISO code, `changeReason`, the free-text `notes` audit
    field, modifier codes/descriptions (from the real CPT modifier
    dictionary), and `toLocaleDateString()` version-history
    timestamps.
  - **`BILLING_TYPE_LABEL` (imported from `codeMapTable.ts`) is left
    untouched** — it's a shared constant owned by another file, not
    this one, consistent with this sweep's convention of not reaching
    into a shared export it doesn't own; its three values (TC/26/
    Global) are interpolated as-is into the translated Component Type
    tooltip.
- **Inline CSS**: the file already used only the shared `.ps-conf-*`/
  `.ps-ms-*`/`.ps-sub-*` families throughout — the one exception was
  the Component Type field's inline-styled info-badge circle (the
  file's only `style={{}}`), replaced with a new
  `.ps-billingdict__info-badge` class.
- **Business logic / dead code**: none found; the file's own detailed
  header comments (the two-tier site-scoping model, the Four-Eyes
  Principle submit-for-approval flow, the Duplicate action's
  cross-scope pre-fill) were left untouched.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('billingDictionarySection.*')` key paths used in the file —
  85 literal calls plus the 28 `countries.*` and 4 `status.*` dynamic
  label-map keys — cross-checked programmatically against the 116
  leaf keys added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **4939 → 5055 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/BillingDictionarySection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`SubspecialtiesSection.tsx` (821 lines) is next in line by size.
After that: `DemoResetTab.tsx` (808), `PhysiciansSection.tsx` (616),
`GoverningBodiesSection.tsx` (607), `CasePoolAssignmentSection.tsx`
(597), `SpecimenDictionarySection.tsx` (542), `RvuCodeMapSection.tsx`
(516), `SpecimenCategoriesSection.tsx` (491), `DepartmentsSection.tsx`
(488), and the rest of the long tail down to ~240 lines documented in
batch 59's survey. Note: `PendingApprovalSection.tsx` (426 lines,
still pending) imports this batch's `siteLabel` and will need its own
`useTranslation()` wired up when its turn comes, so its call site can
start passing the now-optional `t` through. Beyond `Config/`:
`TemplateBuilder/` (10 files), `QualityAssurance/` (15 files),
`Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, and batch 59's note on
TATConfigSection's resolution-preview sentence word order) all
remain unchanged this batch.

### Progress estimate

Batch 62 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **30% of known scope**.

## Config/System/SubspecialtiesSection.tsx — file-by-file sweep, batch 63

### Files swept this batch

- `src/components/Config/System/SubspecialtiesSection.tsx` (821
  lines) — the Subspecialties admin screen: a two-pane Add/Edit
  modal (metadata left, Specimens/Physicians/Facilities assignment
  tabs right), workgroup/pool + catch-all scoping, and inactivate/
  reactivate confirmation flows with dependency-impact warnings.

### What changed

- **i18n**: `useTranslation()` added to `Toggle` and the main
  `SubspecialtiesSection` component (the other small subcomponents —
  `Avatar`, `SearchInput`, `CheckRow`, `ImpactRow` — take their text
  as props from the parent, so they needed no hook of their own).
  Every hardcoded string converted to `t()` calls under a new
  `subspecialtiesSection` namespace (75 leaves), reusing 5 existing
  `common.*` keys (`active`/`inactive`/`cancel`/`save`/`optional`/
  `edit`).
  - Two pluralized counts (`modal.specimenCount`/`physicianCount`,
    used in the "saving will unlink N specimens and/or N physicians"
    warning) use `_one`/`_other` with `{{count}}`; the footer's
    "N subspecialties" line stays a single non-pluralized key, since
    the original text never had a singular form either — kept
    behavior identical rather than introducing a plural distinction
    that wasn't there before.
  - **Real data preserved, unchanged**: subspecialty/specimen/
    facility/lab `name`s, the admin-typed `description` field, and
    `u.roles?.join(', ')` — a physician's actual assigned role values
    (e.g. "Pathologist"), left as real per-user data rather than
    run through a display-label map, same treatment as other real,
    persisted per-record fields elsewhere in this sweep.
- **Inline CSS**: found and converted all 16 `style={{}}` spots — two
  reused `<col>` widths, a header/cell text-align pair reused across
  3 spots, a table empty-row padding override, 3 modal widths (900px/
  500px/460px, one paired with a fixed height), 2 font-size overrides
  (reused across 3 headers total), a 3×-reused footer button-row
  flex/gap, and 2 reused text colors. All new, small `.ps-sub-*`
  modifiers, matching the file's own existing naming convention
  (`.ps-sub-col-name`, `.ps-sub-col-half`, `.ps-sub-th--left/--right`,
  `.ps-sub-td--right`, `.ps-sub-tab-empty--table`, `.ps-sub-modal--
  edit/--confirm-sm/--confirm-xs`, `.ps-sub-title--sm/--xs`,
  `.ps-sub-footer-actions`, `.ps-sub-emphasis`/`--success`) — no
  exact matches existed elsewhere for this file's specific
  combinations, so nothing was reused from other files this time.
- **Business logic / dead code**: none newly removed. The file's own
  header comment already flags a known, pre-existing gap (`_badge`/
  `getBadge()` is computed per row but never rendered) and was left
  as documented, unresolved, out-of-scope-for-this-pass observation
  — not something to silently delete or guess a placement for.

### Validation

- `npx tsc --noEmit -p .`: clean.
- Full suite: **499/499 test files, 4329/4329 tests passing**. No
  dedicated test file exists for this component.
- All `t('subspecialtiesSection.*')` key paths used in the file — 73
  literal calls, with the 2 pluralized ones expanded to their
  `_one`/`_other` pair — cross-checked programmatically against the
  75 leaf keys added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5055 → 5130 leaf keys**,
  matched exactly across en/fr/de/nl/ko.

### What's in this zip

- `src/components/Config/System/SubspecialtiesSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`DemoResetTab.tsx` (808 lines) is next in line by size. After that:
`PhysiciansSection.tsx` (616), `GoverningBodiesSection.tsx` (607),
`CasePoolAssignmentSection.tsx` (597), `SpecimenDictionarySection.tsx`
(542), `RvuCodeMapSection.tsx` (516), `SpecimenCategoriesSection.tsx`
(491), `DepartmentsSection.tsx` (488), and the rest of the long tail
down to ~240 lines documented in batch 59's survey (which also
includes `PendingApprovalSection.tsx`, still pending its own pass —
see batch 62's note on `siteLabel`). Beyond `Config/`:
`TemplateBuilder/` (10 files), `QualityAssurance/` (15 files),
`Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, and batch 59's note on
TATConfigSection's resolution-preview sentence word order) all
remain unchanged this batch.

### Progress estimate

Batch 63 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **30% of known scope**.

---

## Config/System/DemoResetTab.tsx — file-by-file sweep, batch 64

### Files swept this batch

- `src/components/Config/System/DemoResetTab.tsx` (808 lines)

### What changed

- **Scope note — most of the file was already out of scope**: the
  first ~550 of 808 lines are exported localStorage key-name lists
  (`MOCK_PREFIX`, `SESSION_KEY`, `ACTIVE_SESSION_KEY_PREFIX`,
  `DELIBERATELY_NOT_RESET`, `VERSIONED_KEYS`, `SETTINGS_KEYS`,
  `CASE_KEYS`, `FLAG_KEYS`, `STATE_KEYS`) plus `HOSPITAL_MAP`,
  `getCurrentUserId()`, `executeFullReset()`, and `executeUserReset()`
  — all internal schema/business-logic, never rendered to a user.
  Confirmed via grep that `DELIBERATELY_NOT_RESET`'s doc-string
  values are consumed only by the internal
  `DemoResetTab.coverage.test.ts` audit, never displayed. None of
  this needed i18n changes; only the React component itself
  (`DemoResetTab` and its local `ConfirmDialog` subcomponent) was
  converted.
- **i18n**: added `useTranslation()` to `DemoResetTab`. New
  `demoResetTab` namespace, 30 leaf keys (29 distinct call sites,
  with `done.summary` pluralized `_one`/`_other`), reusing
  `common.cancel`. Covers the disabled-backend notice, the
  post-reset "done" state (including the `{{count}}`/`{{countdown}}`
  interpolated summary line), both reset-option cards ("My data
  only" / "Full reset") and their confirmation dialogs, and the
  "Testing & Demo Tools" section (Molecular Order Queue link).
  `{{hospital}}` is interpolated into the "My data only" card's
  label and confirmation text from the pre-existing, untouched
  `hospitalLabel` map.
- **`t`-shadowing fix**: the countdown `useEffect` had its own local
  `const t = setTimeout(...)`, which would have shadowed the new
  `useTranslation()` `t`. Renamed to `const timer = setTimeout(...)`
  / `clearTimeout(timer)`.
- **Real data preserved, unchanged**: `hospitalLabel` (actual names
  of the real people the demo hospital accounts belong to — Pete
  Nimmo, Paul Carter, Amber Fehrs-Battey, J. Mark Tuthill, Rossana
  Babakhani), left in English with an explanatory code comment added;
  the full-reset warning sentence keeps the real tester first names
  "Paul, Amber, and Sarah" embedded in the translated text; the
  cleared-item list renders the raw internal storage-key strings
  (`k`) untouched, as real diagnostic identifiers, not UI copy.
- **Inline CSS**: converted all 17 inline-style spots to new
  `.ps-demoreset__*` classes (`__page`, `__section-header`,
  `__extra-section`, `__extra-section-heading`, `__title`,
  `__subtitle`, `__card-row`, `__btn--nowrap`,
  `__btn-danger-outline`/`--disabled`, `__result-desc`,
  `__cleared-list`, `__confirm-box`, `__confirm-title`,
  `__confirm-desc`, `__confirm-warning`), reusing batch 63's
  `.ps-sub-footer-actions` for one exact `display:flex; gap:10px`
  match in `ConfirmDialog`'s button row.
- **Business logic / dead code**: none found beyond the
  already-documented out-of-scope sections above; no new dead code
  identified in the component itself.

### Validation

- `npx tsc --noEmit -p .`: clean.
- `DemoResetTab.coverage.test.ts` (the dedicated audit test, which
  only reads the untouched key-list array exports) still passes.
  `DemoResetTab.auditTest.ts` is not picked up by vitest's own
  `.test.ts` include pattern and isn't part of the automated suite.
- All `t('demoResetTab.*')` key paths used in the file — 29 distinct
  call sites, with `done.summary` expanded to its `_one`/`_other`
  pair — cross-checked programmatically against the 30 leaf keys
  added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5130 → 5160 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/DemoResetTab.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`PhysiciansSection.tsx` (616 lines) is next in line by size. After
that: `GoverningBodiesSection.tsx` (607), `CasePoolAssignmentSection.
tsx` (597), `SpecimenDictionarySection.tsx` (542),
`RvuCodeMapSection.tsx` (516), `SpecimenCategoriesSection.tsx` (491),
`DepartmentsSection.tsx` (488), and the rest of the long tail down to
~240 lines documented in batch 59's survey (which also includes
`PendingApprovalSection.tsx`, still pending its own pass — see batch
62's note on `siteLabel`). Beyond `Config/`: `TemplateBuilder/`
(10 files), `QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files,
3 converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated CSS block,
untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, and batch 59's note on
TATConfigSection's resolution-preview sentence word order) all
remain unchanged this batch.

### Progress estimate

Batch 64 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **30% of known scope**.

---

## Config/System/PhysiciansSection.tsx — file-by-file sweep, batch 65

### Files swept this batch

- `src/components/Config/System/PhysiciansSection.tsx` (616 lines)

### What changed

- **i18n**: added `useTranslation()` to the main `PhysiciansSection`
  component, the `PhysicianModal`, and the local `Toggle`
  subcomponent. New `physiciansSection` namespace, 67 leaf keys,
  reusing `common.active/inactive/cancel/edit/duplicate/export/
  required`.
- **Data-key-stays-English, label-is-translated maps**: added
  `PREFERRED_CONTACT_LABEL_KEY` (`Email`/`Fax`/`Phone` — the stored
  `Physician.preferredContact` value stays an English data key; only
  the displayed label, used in both the modal's `<select>` and the
  table's "via …" cell, is translated) and `STATUS_LABEL_KEY`
  (`Active`/`Inactive` reuse `common.active/inactive`, `Unverified`
  gets its own key) for the stored `Physician.status` value, used in
  both the status-filter dropdown and the table's status cell.
- **Name-prefix options** (`Mr.`/`Mrs.`/`Ms.`/`Mx.`/`Dr.`) — the
  `<option value="...">` data values stay the literal strings stored
  on `Physician.namePrefix`; only the displayed option text is now
  translated. No existing shared key for these was found elsewhere in
  the codebase (`ClientEditorModal.tsx`, `FacilityEditorModal.tsx`,
  and `AccessionPage.tsx` all have their own untouched, not-yet-
  converted copies of the same five options), so these are new,
  file-scoped keys rather than a reused/shared namespace.
- **Validation error messages**: `physicianCodeCollision` and
  `npiCollision` (both interpolate the colliding record's own real
  `{{code}}`/`{{npi}}` and `{{name}}` — real per-record data, left
  as interpolated variables) now flow through `t()`; the plain
  "Required" messages now reuse `common.required`.
- **CSV-import type-guard alert** (`"{{fileName}}" isn't a CSV
  file...`) converted to `t('physiciansSection.import.
  invalidFileType', { fileName })`. The same literal string exists,
  unconverted, in six other files (`CrosswalkSection.tsx`,
  `ModifierDictionarySection.tsx`, `NcciEditRulesSection.tsx`,
  `RvuCodeMapSection.tsx`, `CytologyCategoriesSection.tsx`,
  `SpecimenDictionarySection.tsx`) — left alone as each is
  out of scope until its own pass.
- **Real data preserved, unchanged**: physician given/family/
  preferred names, `specialty`, `phone`/`fax`/`email`/`npi`/
  `physicianCode` field values, facility names, CSV export headers/
  values (`NamePrefix`, `GivenNames`, `Status`, etc. — untouched).
- **Inline CSS**: none found — this file was already fully migrated
  onto `ps-conf-*`/`ps-ms-*` classes (per its own header comment,
  June 2026), so no CSS work was needed this batch.
- **Business logic / dead code**: none found; `handlePhysicianFileUpload`
  already closed over `physicians`/`facilities` via the component
  closure the same way `nextPhysicianCode` does, so it needed no
  extra `t` parameter threading — it already has `t` in scope.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `physiciansSection.*` key paths referenced in the file — both
  `t()` calls and the `PREFERRED_CONTACT_LABEL_KEY`/
  `STATUS_LABEL_KEY` map values — cross-checked programmatically
  against the 67 leaf keys added: exact match, no unused or missing
  keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5160 → 5227 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/PhysiciansSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`GoverningBodiesSection.tsx` (607 lines) is next in line by size.
After that: `CasePoolAssignmentSection.tsx` (597),
`SpecimenDictionarySection.tsx` (542), `RvuCodeMapSection.tsx` (516),
`SpecimenCategoriesSection.tsx` (491), `DepartmentsSection.tsx` (488),
and the rest of the long tail down to ~240 lines documented in batch
59's survey (which also includes `PendingApprovalSection.tsx`, still
pending its own pass — see batch 62's note on `siteLabel`). Beyond
`Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated CSS block, untranslated generated strings in grouping
files, `'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, and this batch's note on the
duplicated CSV-type-guard alert string across six other still-unconverted
files) all remain unchanged this batch.

### Progress estimate

Batch 65 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **31% of known scope**.

---

## Config/System/GoverningBodiesSection.tsx — file-by-file sweep, batch 66

### Files swept this batch

- `src/components/Config/System/GoverningBodiesSection.tsx` (607 lines)

### What changed

- **i18n**: added `useTranslation()` to `BodyModal`, `RetentionModal`,
  `VersionRow`, `BodyRow`, and the main `GoverningBodiesSection`
  component. New `governingBodiesSection` namespace, 58 leaf keys,
  reusing `common.cancel/edit/close/active`.
- **`<Trans>` usage**: the ID-conflict error message embeds the
  colliding ID in a `<strong>` tag —
  `<Trans i18nKey="governingBodiesSection.bodyModal.idConflictError" values={{ id: derivedId }} components={{ strong: <strong /> }} />`
  — following the same pattern already established by
  `TATConfigSection.tsx`'s own `<Trans>` usage, rather than splitting
  the sentence around the bold span by hand.
- **`t`-shadowing fix**: `RetentionModal` had two `ALL_MATERIAL_TYPES
  .map(t => ...)`/`.every(t => ...)` callbacks whose parameter name
  `t` shadowed the new `useTranslation()` `t` within those callback
  bodies. Harmless today (neither body called the real `t()`), but
  renamed to `mt` pre-emptively — same fix as `DemoResetTab.tsx`'s own
  countdown-timer rename in batch 64.
- **Shared constants left untouched, out of scope**:
  `MATERIAL_TYPE_LABEL` (`RetentionPolicy.ts`) and
  `JURISDICTION_LABELS` (`types/systemConfig.ts`) are both real
  English display-label maps, but each is also imported by several
  other, not-yet-converted files (`SpecimenCategoriesSection.tsx`,
  `DepartmentsSection.tsx`, `DisposalQueuePage.tsx`,
  `PendingBatchQueuePage.tsx` for the former;
  `CytologyQcRulesSection.tsx`, `EnterpriseRollupTab.tsx`,
  `InspectionModeTab.tsx`, `ClientTable.tsx`/`ClientEditorModal.tsx`,
  `FacilityTable.tsx`/`FacilityEditorModal.tsx`, `AccessionPage.tsx`
  for the latter). Converting either is a genuinely cross-cutting
  future initiative, not this file's own scope — left alone, same
  treatment `BILLING_TYPE_LABEL` got in batch 62.
- **Real data preserved, unchanged**: governing-body `label`/
  `fullName`/`region`/`website`, retention-version `sourceNote` (the
  real citation text a super-admin types), `version`/`effectiveDate`/
  formatted day counts (interpolated, generated/real data), and
  `body.jurisdictions.join(', ')` (raw jurisdiction codes, not run
  through `JURISDICTION_LABELS` in the original code either — left as
  the same real data-key list it always was).
- **Inline CSS**: converted all 38 `style={{}}` spots. Reused
  `.ps-sub-footer-actions` (batch 63) for the two exact
  `display:flex;gap:10px` matches. `Toggle`'s dynamic `color` prop
  (only ever `#0891B2` or `#a78bfa` in this file) collapsed to two
  modifier classes, `.ps-gov-toggle--cyan`/`--purple`. Two dynamic
  two-state pairs — the version-history retroactive/prospective badge
  and the jurisdiction-chip active/inactive state — became a base
  class plus a `--modifier`, the same base+modifier shape used
  elsewhere in this sweep for data-driven display state. Everything
  else is new, scoped `.ps-gov-*`/`.ps-govmodal-*` classes — no other
  exact matches existed for this screen's own layout. (This file
  already reuses the shared, pre-existing `.ps-body-modal-*` classes
  for its form fields/inputs — the batch-30-flagged triplication of
  that block is unrelated to this batch and remains unchanged.)
- **Business logic / dead code**: none found.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `governingBodiesSection.*` key paths referenced in the file —
  both `t()` calls and the `<Trans i18nKey=...>` usage — cross-checked
  programmatically against the 58 leaf keys added: exact match, no
  unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5227 → 5285 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/GoverningBodiesSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`CasePoolAssignmentSection.tsx` (597 lines) is next in line by size.
After that: `SpecimenDictionarySection.tsx` (542),
`RvuCodeMapSection.tsx` (516), `SpecimenCategoriesSection.tsx` (491),
`DepartmentsSection.tsx` (488), and the rest of the long tail down to
~240 lines documented in batch 59's survey (which also includes
`PendingApprovalSection.tsx`, still pending its own pass — see batch
62's note on `siteLabel`). Beyond `Config/`: `TemplateBuilder/`
(10 files), `QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files,
3 converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 65's note on the
duplicated CSV-type-guard alert string, and this batch's note on
`MATERIAL_TYPE_LABEL`/`JURISDICTION_LABELS` as shared,
not-yet-converted display-label constants) all remain unchanged this
batch.

### Progress estimate

Batch 66 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **31% of known scope**.

---

## Config/System/CasePoolAssignmentSection.tsx — file-by-file sweep, batch 67

### Files swept this batch

- `src/components/Config/System/CasePoolAssignmentSection.tsx` (597 lines)

### What changed

- **i18n**: added `useTranslation()` to `RoutingDiagram`, `RuleModal`,
  and the main `CasePoolAssignmentSection` component. New
  `casePoolAssignmentSection` namespace, 91 leaf keys (90 distinct
  call sites, with `rulesTable.specimenTypeCount` pluralized
  `_one`/`_other`), reusing `common.active/inactive/cancel/edit/
  duplicate`.
- **Module-scope label array**: `ROUTING_STEPS` (the 7-step "How
  routing works" explainer) lives outside any component, so it can't
  call `useTranslation()` directly — its `label` field was changed to
  `labelKey`, storing a translation key string instead of raw text,
  and `RoutingDiagram`'s own render (where `t()` is in scope) resolves
  it. `step`/`tone` stayed as-is (real layout/data, not display text).
- **`<Trans>` usage**: the test-routing "Would route to X via Y rule
  (Z)" result sentence wraps the pool name in a `<poolSpan>` tag —
  `<Trans i18nKey="casePoolAssignmentSection.testRouting.matchedResult" values={{ pool, via, lab }} components={{ poolSpan: <span className="ps-conf-identity-name" /> }} />`
  — same `<Trans>` pattern already used in `TATConfigSection.tsx` and
  this batch's own `GoverningBodiesSection.tsx` pass.
- **Pluralization**: `{{count}} specimen type(s)` now uses
  `_one`/`_other`, replacing the original manual
  `length !== 1 ? 's' : ''` check.
- **Real data preserved, unchanged**: rule `note`/`keywords` text,
  pool/lab/specimen names, `result.reason` (the service's own
  generated per-case diagnostic text in the "Manual Routing Run"
  results list — left untouched as generated diagnostic/audit
  content, same treatment as other generated-text fields flagged
  earlier in this sweep, e.g. batch 31's grouping-file strings).
- **Inline CSS**: only 2 `style={{}}` spots (both in `RuleModal`'s
  specimen-type picker list) — converted to new
  `.ps-cpa-specimen-list`/`.ps-cpa-specimen-label` classes.
- **Business logic / dead code**: none found.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `casePoolAssignmentSection.*` key paths referenced in the file —
  both `t()` calls and the `<Trans i18nKey=...>`/`labelKey` usages —
  cross-checked programmatically against the 91 leaf keys added:
  exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5285 → 5376 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/CasePoolAssignmentSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`SpecimenDictionarySection.tsx` (542 lines) is next in line by size.
After that: `RvuCodeMapSection.tsx` (516),
`SpecimenCategoriesSection.tsx` (491), `DepartmentsSection.tsx` (488),
and the rest of the long tail down to ~240 lines documented in batch
59's survey (which also includes `PendingApprovalSection.tsx`, still
pending its own pass — see batch 62's note on `siteLabel`). Beyond
`Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated `.ps-body-modal-*` CSS block, untranslated generated
strings in grouping files, `'en-US'` chart-axis locale, "YTD" baked
into computed data, illustrative-diagnosis mock content,
`ReleaseBufferSection.tsx` (232 lines) not yet converted, batch 59's
note on TATConfigSection's resolution-preview sentence word order,
batch 65's note on the duplicated CSV-type-guard alert string, batch
66's note on `MATERIAL_TYPE_LABEL`/`JURISDICTION_LABELS`, and this
batch's own note on `result.reason` as generated diagnostic text)
all remain unchanged this batch.

### Progress estimate

Batch 67 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **32% of known scope**.

---

## Config/System/SpecimenDictionarySection.tsx — file-by-file sweep, batch 68

### Files swept this batch

- `src/components/Config/System/SpecimenDictionarySection.tsx` (542 lines)

### What changed

- **i18n**: added `useTranslation()` to `EditorModal` and the main
  `SpecimenDictionarySection` component. New
  `specimenDictionarySection` namespace, 75 leaf keys, reusing
  `common.active/inactive/cancel/edit/required`.
- **Data-key-stays-English, label-is-translated maps**: added
  `SPECIMEN_CATEGORY_LABEL_KEY` (the 7 fixed `specimenCategory`
  values — `SURGICAL_TISSUE`/`GYN_CYTOLOGY`/`NON_GYN_CYTOLOGY`/
  `AUTOPSY`/`MOLECULAR`/`CONSULT`/`OTHER` — stay the literal data
  keys the app's own Cytology/Autopsy worklist routing switches on;
  only the dropdown's displayed text is translated) and
  `LATERALITY_LABEL_KEY` (`Left`/`Right`/`Bilateral`/`Midline`/`N/A`
  stay the stored `SpecimenEntry.laterality` values; `N/A` displays
  as the translated "Not applicable").
- **Duplicated CSV-type-guard alert**: this file was one of the six
  not-yet-converted files flagged by name in batch 65's
  `PhysiciansSection.tsx` note as sharing the identical
  `"{{fileName}}" isn't a CSV file...` string. Now converted here
  under this file's own `upload.invalidFileType` key — the other five
  (`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
  `NcciEditRulesSection.tsx`, `RvuCodeMapSection.tsx`,
  `CytologyCategoriesSection.tsx`) remain unconverted until their own
  passes.
- **Real data preserved, unchanged**: specimen `name`/`description`/
  `site`/`synonyms`/`processingNotes`/`specimenCode`/
  `defaultBaseCptCode`, subspecialty/department/protocol names (real
  records), and the entire `TEMPLATE_EXAMPLE_ROWS` CSV template
  (headers and example row values) — exported/imported spreadsheet
  data, same convention as every other dictionary's own CSV template
  in this sweep.
- **Inline CSS**: only 1 `style={{}}` spot
  (`style={{ marginTop: 4 }}` on the Base CPT hint paragraph) —
  turned out to be an exact match for the already-existing
  `.ps-conf-section-subtitle--top-gap` class (used elsewhere in this
  same file already), so no new CSS was added.
- **Business logic / dead code**: `handleFileUpload` had an
  unnecessary `t: TFunction` parameter in an early draft of this
  pass — removed once noticed, since the function is defined inside
  the component and already closes over the real `t` from
  `useTranslation()`, the same closure pattern `nextPhysicianCode`
  and `buildEntry` already use for their own captured values.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `specimenDictionarySection.*` key paths referenced in the
  file — both `t()` calls and the two `*_LABEL_KEY` map values —
  cross-checked programmatically against the 75 leaf keys added:
  exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5376 → 5451 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/SpecimenDictionarySection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`RvuCodeMapSection.tsx` (516 lines) is next in line by size. After
that: `SpecimenCategoriesSection.tsx` (491),
`DepartmentsSection.tsx` (488), and the rest of the long tail down to
~240 lines documented in batch 59's survey (which also includes
`PendingApprovalSection.tsx`, still pending its own pass — see batch
62's note on `siteLabel`). Beyond `Config/`: `TemplateBuilder/`
(10 files), `QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files,
3 converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files, `'en-US'`
chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 66's note on
`MATERIAL_TYPE_LABEL`/`JURISDICTION_LABELS`, batch 67's note on
`result.reason` as generated diagnostic text, and the remaining five
not-yet-converted copies of the CSV-type-guard alert string flagged
this batch) all remain unchanged this batch.

### Progress estimate

Batch 68 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **32% of known scope**.

---

## Config/System/RvuCodeMapSection.tsx — file-by-file sweep, batch 69

### Files swept this batch

- `src/components/Config/System/RvuCodeMapSection.tsx` (516 lines)

### What changed

- **i18n**: added `useTranslation()` to `EntryModal` and the main
  `RvuCodeMapSection` component. New `rvuCodeMapSection` namespace,
  62 leaf keys, reusing `common.cancel/edit/duplicate/loading`.
- **`t`-shadowing fix**: the toast-auto-dismiss `useEffect` declared
  `const t = setTimeout(...)`, which would have shadowed the real
  `useTranslation()` `t` once one was added to this component — same
  fix pattern as `DemoResetTab.tsx` (batch 64) and
  `GoverningBodiesSection.tsx` (batch 66). Renamed to `timer`.
- **Duplicated CSV-type-guard alert**: this file was named by batch
  65's `PhysiciansSection.tsx` note as one of six files sharing the
  identical `"{{fileName}}" isn't a CSV file...` string. Now
  converted here under `upload.invalidFileType` — the third of six
  to close out (batch 68 closed `SpecimenDictionarySection.tsx`
  first). `CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
  and `NcciEditRulesSection.tsx` still carry their own unconverted
  copies; `CytologyCategoriesSection.tsx` too.
- **Shared display-label constant left untouched**:
  `BILLING_TYPE_LABEL` (`services/billing/codeMapTable.ts`) is also
  consumed by `BillingDictionarySection.tsx` (batch 62),
  `BillingTypeTriggerSection.tsx`, and `GoverningBodiesSection.tsx`
  (batch 66) — left untouched here too, same precedent, documented
  with a code comment at its one use site (the Component Type
  dropdown and its tooltip).
- **Real data preserved, unchanged**: `TEMPLATE_EXAMPLE_ROWS` (the
  downloadable CSV template's headers and two example rows,
  including the deliberately-synthetic PS-92 description text) and
  the service-generated `levelWarning` advisory text from
  `validateCodeLevel()` — generated diagnostic content, not
  component-owned UI text.
- **Inline CSS**: 25 `style={{}}` spots. One (`Component Type`
  tooltip badge) was an exact match for the existing
  `.ps-billingdict__info-badge` class (batch 62) and was reused
  directly. Three pairs were exact-duplicate style objects and now
  share one class each (`.ps-rvu-muted-sm`, `.ps-rvu-preview-field`,
  `.ps-rvu-preview-field-value`). The remaining 18 spots became new,
  scoped `.ps-rvu-*` classes (`--level-warning`, `-toast-success`,
  `-active-box`(+`-head`), `-active-eyebrow`, `-active-date`,
  `-table-wrap--mt`, `-empty-subtitle`, `-older-wrap`(+`-list`/`-row`/
  `-row-label`), `-preview-box`(+`-title`/`-error`/`-fields`/
  `-scroll`/`-actions`)).
- **Business logic**: none extracted — the component's handlers
  (`handleFileUpload`, `handleApplyUpload`, `handleSaveEntry`,
  `handleDownloadTemplate`) were already thin wrappers around real
  service calls (`mockRvuCodeMapService`, `codeMapTable.ts`); no new
  helper functions were needed for this pass, and no `TFunction`
  parameter mistake (batches 65/68) recurred here — every handler is
  defined inside the component and already closes over the real `t`.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `rvuCodeMapSection.*` key paths referenced in the file (`t()`
  calls, including the `_one`/`_other` pluralized
  `pendingApproval`) cross-checked programmatically against the 62
  leaf keys added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5451 → 5513 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/RvuCodeMapSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`SpecimenCategoriesSection.tsx` (491 lines) is next in line by size.
After that: `DepartmentsSection.tsx` (488), and the rest of the long
tail down to ~240 lines documented in batch 59's survey (which also
includes `PendingApprovalSection.tsx`, still pending its own pass —
see batch 62's note on `siteLabel`). Beyond `Config/`:
`TemplateBuilder/` (10 files), `QualityAssurance/` (15 files),
`Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated `.ps-body-modal-*` CSS block, untranslated generated
strings in grouping files, `'en-US'` chart-axis locale, "YTD" baked
into computed data, illustrative-diagnosis mock content,
`ReleaseBufferSection.tsx` (232 lines) not yet converted, batch 59's
note on TATConfigSection's resolution-preview sentence word order,
batch 66's note on `MATERIAL_TYPE_LABEL`/`JURISDICTION_LABELS`, batch
67's note on `result.reason` as generated diagnostic text, and the
remaining four not-yet-converted copies of the CSV-type-guard alert
string — `CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 69 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **33% of known scope**.

---

## Config/System/SpecimenCategoriesSection.tsx — file-by-file sweep, batch 70

### Files swept this batch

- `src/components/Config/System/SpecimenCategoriesSection.tsx` (491 lines)

### What changed

- **i18n**: added `useTranslation()` to `CategoryModal` and the main
  `SpecimenCategoriesSection` component. New
  `specimenCategoriesSection` namespace, 64 leaf keys, reusing
  `common.active/inactive/cancel/edit/required`.
- **`t`-shadowing fix**: three `.map()`/`.filter()` callbacks used
  `t` as their parameter name (`ALL_MATERIAL_TYPES.map(t => ...)` in
  two places, `GROSSING_TEMPLATES.map(t => ...)`), which would have
  shadowed the real `useTranslation()` `t` in both components.
  Renamed to `mt` (material type) and `gt` (grossing template) —
  same fix pattern as batches 64/66/69.
- **Module-scope translation-key array**: `GROSSING_TEMPLATES` lives
  outside any component and can't call `useTranslation()` itself, so
  its `name` field was replaced with a `labelKey` translation-key
  string, resolved via `t()` at the two real render/lookup sites
  (`CategoryModal`'s template `<select>`, and the main component's
  own `templateName()`) — same pattern established for
  `ROUTING_STEPS` in `CasePoolAssignmentSection.tsx` (batch 67). This
  file's own local `GROSSING_TEMPLATES` copy is not shared with the
  near-identical copies in `DepartmentsSection.tsx` and
  `GrossingRouteOverridesSection.tsx` — each is its own separate,
  unconverted `const`, so this pass doesn't touch those two; they'll
  get their own labelKey conversion whenever their own batch comes
  up, same "each own copy, own pass" precedent as the duplicated
  5-name-prefix `<option>` list (batch 65).
- **Shared display-label constant left untouched**:
  `MATERIAL_TYPE_LABEL` (`services/retentionPolicy/RetentionPolicy.ts`)
  is also consumed by `GoverningBodiesSection.tsx` (batch 66) — left
  untouched here too, same precedent, documented with a code comment.
  `formatRetentionPeriod()` (same module) is a service-layer function,
  not a component, and can't call `useTranslation()` — its returned
  "N years"/"N weeks" text stays English, same as every other
  consumer of it in this app.
- **Real data / audit trail preserved, unchanged**: category
  `name`/`description`/`accessionPrefix`/`numberSeries` (real
  records), lab names, and the audit-log `detail` string passed to
  `mockAuditService.logEvent()` for a below-floor override — a
  persisted audit-trail entry, same convention as every other real
  audit-log detail string in this app.
- **Decorative dashes preserved**: the Performing Lab dropdown's
  `"— All Labs (available to everyone) —"` option kept its literal
  em-dash decoration in the translation string itself, per the
  lesson from batch 67's `CasePoolAssignmentSection.tsx` note.
- **Inline CSS**: 10 `style={{}}` spots. Four were exact matches for
  existing classes and reused directly rather than duplicated:
  `.ps-participationtypes__modal-hint`, `.ps-billing-postsignout-overlay`
  (z-index:9500 only), `.acd-footer-status--error` (color:#f87171
  only), `.ps-ai-review-hint-label` (font-size:11px only), and
  `.ps-gov-jur-hint` (font-size:11px;color:#64748b) — five total
  cross-file reuses, same exact-match-first discipline as
  `.ps-billingdict__info-badge` (batch 69). The remaining 5 spots
  became new, scoped `.ps-speccat-*` classes, including two
  base+modifier pairs for 2-state dynamic colors
  (`.ps-speccat-days-hint`/`--below`,
  `.ps-speccat-retention-row`/`--below`) plus
  `.ps-speccat-belowfloor-modal`, `.ps-speccat-belowfloor-text`, and
  `.ps-speccat-btn-danger`.
- **Business logic**: none extracted — `validate()`,
  `buildRetentionOverride()`, `persistSave()`, and `handleSave()`
  were already thin, focused functions; no new helpers were needed
  for this pass.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `specimenCategoriesSection.*` key paths referenced in the file
  (`t()` calls, the `table.headers.${h}` dynamic lookup, and the
  `GROSSING_TEMPLATES` `labelKey` references) cross-checked
  programmatically against the 64 leaf keys added: exact match, no
  unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5513 → 5577 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/SpecimenCategoriesSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`DepartmentsSection.tsx` (488 lines) is next in line by size —
which, per this batch's own note, also carries its own unconverted
`GROSSING_TEMPLATES` copy and could reuse the same labelKey
conversion approach. After that: the rest of the long tail down to
~240 lines documented in batch 59's survey (which also includes
`PendingApprovalSection.tsx`, still pending its own pass — see batch
62's note on `siteLabel`, and `GrossingRouteOverridesSection.tsx`,
which also carries its own unconverted `GROSSING_TEMPLATES` copy).
Beyond `Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated `.ps-body-modal-*` CSS block, untranslated generated
strings in grouping files, `'en-US'` chart-axis locale, "YTD" baked
into computed data, illustrative-diagnosis mock content,
`ReleaseBufferSection.tsx` (232 lines) not yet converted, batch 59's
note on TATConfigSection's resolution-preview sentence word order,
batch 67's note on `result.reason` as generated diagnostic text, and
the remaining four not-yet-converted copies of the CSV-type-guard
alert string — `CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 70 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **33% of known scope**.

---

## Config/System/DepartmentsSection.tsx — file-by-file sweep, batch 71

### Files swept this batch

- `src/components/Config/System/DepartmentsSection.tsx` (488 lines)

### What changed

- **i18n**: added `useTranslation()` to `DepartmentModal` and the
  main `DepartmentsSection` component. New `departmentsSection`
  namespace, 55 leaf keys, reusing
  `common.active/inactive/cancel/edit/required`.
- **`t`-shadowing fix**: same three-spot pattern as
  `SpecimenCategoriesSection.tsx` (batch 70) —
  `ALL_MATERIAL_TYPES.map()`/`.filter()`/`for...of` and
  `GROSSING_TEMPLATES.map()`/`.find()` all used `t` as their
  parameter name. Renamed to `mt` and `gt`, same fix pattern as
  batches 64/66/69/70.
- **Module-scope translation-key array**: this file's own local
  `GROSSING_TEMPLATES` copy converted to the same `labelKey` pattern
  as `SpecimenCategoriesSection.tsx` (batch 70) — its own separate,
  unconverted copy; `GrossingRouteOverridesSection.tsx` still carries
  the last of the three.
- **Shared display-label constant left untouched**:
  `MATERIAL_TYPE_LABEL`/`formatRetentionPeriod()`
  (`services/retentionPolicy/RetentionPolicy.ts`) — same treatment
  and same code-comment documentation as batch 70.
- **Real data / audit trail preserved, unchanged**: department
  `name`/`description` (real records), and the audit-log `detail`
  string passed to `mockAuditService.logEvent()` for a below-floor
  override — a persisted audit-trail entry, unchanged convention.
- **Left as-is, not "fixed"**: the description placeholder text
  reads "What kinds of specimens fall into this department" — an
  apparent copy-paste artifact from `SpecimenCategoriesSection.tsx`
  (should probably say "departments," not "specimens"). Translated
  verbatim as written; correcting the underlying English copy is a
  product decision outside this i18n/cleanup sweep's scope, not an
  i18n bug.
- **Inline CSS**: 11 `style={{}}` spots. This screen shares the exact
  same retention-override/below-floor-modal layout as
  `SpecimenCategoriesSection.tsx` (batch 70) — 10 of the 11 spots are
  pixel-identical style objects and reused the batch-70
  `.ps-speccat-*`/cross-file classes directly, no duplication. Only 1
  spot was unique to this file (the "Define a Case Mask" link),
  which became a new `.ps-dept-casemask-link` class.
- **Business logic**: none extracted — `validate()`,
  `buildRetentionOverride()`, `persistSave()`, and `handleSave()`
  were already thin, focused functions.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `departmentsSection.*` key paths referenced in the file (`t()`
  calls, the `table.headers.${h}` dynamic lookup, and the
  `GROSSING_TEMPLATES` `labelKey` references) cross-checked
  programmatically against the 55 leaf keys added: exact match, no
  unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5577 → 5632 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/DepartmentsSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

The rest of the long tail down to ~240 lines documented in batch
59's survey, including `PendingApprovalSection.tsx` (still pending
its own pass — see batch 62's note on `siteLabel`) and
`GrossingRouteOverridesSection.tsx` (which carries the last
unconverted `GROSSING_TEMPLATES` copy of the three). Beyond
`Config/`: `TemplateBuilder/` (10 files), `QualityAssurance/`
(15 files), `Common/` (15 files), and `AppShell.tsx` (1,745 lines).
`SynopticReportPage` (54 files, 3 converted) is unchanged and still
pending. Flagged-not-fixed gaps carried forward from earlier batches
(triplicated `.ps-body-modal-*` CSS block, untranslated generated
strings in grouping files, `'en-US'` chart-axis locale, "YTD" baked
into computed data, illustrative-diagnosis mock content,
`ReleaseBufferSection.tsx` (232 lines) not yet converted, batch 59's
note on TATConfigSection's resolution-preview sentence word order,
batch 67's note on `result.reason` as generated diagnostic text, this
batch's note on the "specimens"/"departments" copy-paste wording, and
the remaining four not-yet-converted copies of the CSV-type-guard
alert string — `CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 71 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **34% of known scope**.

---

## Config/System/QAConfigurationCenterSection.tsx — file-by-file sweep, batch 72

### Files swept this batch

- `src/components/Config/System/QAConfigurationCenterSection.tsx` (456 lines)

### What changed

- **i18n**: added `useTranslation()` to `QAConfigurationCenterSection`
  and `ActivityConfigModal`. New `qaConfigurationCenterSection`
  namespace, 47 leaf keys, reusing
  `common.active/inactive/cancel/duplicate/edit/deactivate/reactivate`
  (the latter two previously unused by this sweep — confirmed exact
  text matches in `common.json` before reuse).
- **`t`-shadowing fix**: `handleToggleActive`/`handleSave` used `t`
  as the callback parameter in four `.map()`/`.some()` calls over
  `reviewTypes`/`supervisionTypes`, and `ActivityConfigModal` used
  `t` for its case-mix-target callbacks (`.some()`/`.map()`/closures)
  — all would have shadowed the real `useTranslation()` `t`. Renamed
  to `rt` (record) and `cmt` (case-mix target) — same fix pattern as
  every prior batch's `t`-shadow catches.
- **Data-key-stays-English, label-is-translated map**: added
  `SEVERITY_LABEL_KEY: Record<QaDiscordanceSeverity, string>` — the
  stored `'low'/'medium'/'high'` CAPA-trigger severity values stay
  the literal data keys; only the displayed checkbox text is
  translated.
- **Real data preserved, unchanged**: activity/deficiency-type/
  subspecialty `name`/`description` (real records), and each review
  field's `label`/`type` (`f.label`/`f.type` in the read-only Review
  Fields list) — the real, persisted field-schema definition an
  admin authored when the field was created, same "real dictionary
  content admins type in" convention as every other real record's
  own name/label text; only the wrapping ", required" text around it
  is this component's own UI chrome and was translated.
- **Decorative dashes preserved**: the CAPA-trigger deficiency-type
  `<select>`'s `"— No deficiency type selected —"` option kept its
  literal em-dash decoration in the translation string, per the
  lesson from batch 67's `CasePoolAssignmentSection.tsx` note.
- **Inline CSS**: none — this file had zero `style={{}}` spots to
  begin with; no CSS changes this batch.
- **Business logic**: none extracted — the file's handlers were
  already thin, focused functions; a small unused `tableHeaderKeys`
  array left over from an early draft (the table's `<th>`s are
  written individually since the "Jurisdictions" column is
  conditional on `tab === 'standard'`, so a plain array-map wasn't
  actually used) was caught and removed before finishing.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `qaConfigurationCenterSection.*` key paths referenced in the
  file (`t()` calls plus the `SEVERITY_LABEL_KEY` map values)
  cross-checked programmatically against the 47 leaf keys added:
  exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5632 → 5679 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/QAConfigurationCenterSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

The rest of the long tail down to ~240 lines documented in batch
59's survey: `PrintSettingsSection.tsx` (438), the still-pending
`PendingApprovalSection.tsx` (426, see batch 62's note on
`siteLabel`), `CytologyCategoriesSection.tsx` (424, one of the four
remaining files carrying the duplicated CSV-type-guard alert),
`FlagConfigPage.tsx` (418), `DelegationTypeSection.tsx` (409), and
smaller files down to `ScanStationsSection.tsx`/
`CaseMaskConfigSection.tsx` (347) and below, plus
`GrossingRouteOverridesSection.tsx` (which carries the last
unconverted `GROSSING_TEMPLATES` copy of the three, per batch 71's
note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files,
3 converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, and the remaining four
not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 72 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **34% of known scope**.

---

## Config/System/index.tsx — file-by-file sweep, batch 73

### Files swept this batch

- `src/components/Config/System/index.tsx` (446 lines)

### What changed

- **i18n**: added `useTranslation()` to `SystemTab`. New `systemTab`
  namespace, 65 leaf keys — no `common.*` reuse (this file has no
  status/action-verb text, only the sidebar's own navigation
  labels).
- **Module-scope translation-key array**: this file's central
  `SECTIONS` registry (57 real config-section entries powering the
  sidebar nav, the group tabs, and `renderSection()`'s own routing)
  lives at module scope and can't call `useTranslation()` — its
  `label` field was renamed `labelKey` and resolved via `t()` at the
  one real render site (the sidebar nav button), same pattern as
  `GROSSING_TEMPLATES` (batch 70/71) and `ROUTING_STEPS` (batch 67).
  Confirmed via grep that `.label` had exactly one other read site
  before this change, and that `SECTIONS` itself is private to this
  file (a same-named array in `Cytology/index.tsx` is a separate,
  unrelated registry; `ConfigSearchBar.tsx` keeps its own independent
  list and isn't wired to this one) — safe to convert without
  touching anything else.
- **Data-key-stays-English, label-is-translated map**: added
  `GROUP_LABEL_KEY: Record<string, string>` for the six group tab
  labels (Workstation & Hardware, Lab Materials & Workflows, Clinical
  Lookups, Financial & Revenue Lookups, Administration & Compliance,
  Integrations) — the literal `group` string on each `SECTIONS` entry
  stays unchanged, since `SystemTab`'s own equality checks
  (`activeGroup === g`, the Workstation-facility-banner conditional)
  and the derived `GROUPS` array all key off it directly; only the
  displayed tab-button text is translated.
- **Left as internal, not translated**: each section's `id`
  (`SystemSection` union, e.g. `'print_settings'`) — a real, internal
  routing key consumed by `renderSection()`'s `switch` and the
  `?section=` deep-link URL param, never displayed.
- **Real data preserved, unchanged**: facility `name` in the
  Workstation facility `<select>` (real records).
- **Inline CSS**: none — this file had zero `style={{}}` spots.
- **Business logic**: none extracted — `selectSection`,
  `renderSection`, and the voice-navigation `useEffect` were already
  focused, single-purpose functions; no `t`-shadowing risk found
  (grepped for `t` used as a callback parameter — none in this file).

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `systemTab.*` key paths referenced in the file (the two
  literal `t()` calls, all 57 `labelKey` values, and all 6
  `GROUP_LABEL_KEY` map values) cross-checked programmatically
  against the 65 leaf keys added: exact match, no unused or missing
  keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5679 → 5744 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/index.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`PrintSettingsSection.tsx` (438 lines) is next in line by size. After
that: the still-pending `PendingApprovalSection.tsx` (426, see batch
62's note on `siteLabel`), `CytologyCategoriesSection.tsx` (424, one
of the four remaining files carrying the duplicated CSV-type-guard
alert), `FlagConfigPage.tsx` (418), `DelegationTypeSection.tsx`
(409), and smaller files down to `ScanStationsSection.tsx`/
`CaseMaskConfigSection.tsx` (347) and below, plus
`GrossingRouteOverridesSection.tsx` (which still carries the last
unconverted `GROSSING_TEMPLATES` copy of the three, per batch 71's
note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files,
3 converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, this batch's note that
`ConfigSearchBar.tsx` keeps its own independent, still-unconverted
copy of these same section labels, and the remaining four
not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 73 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **35% of known scope**.

---

## Config/System/PrintSettingsSection.tsx — file-by-file sweep, batch 74

### Files swept this batch

- `src/components/Config/System/PrintSettingsSection.tsx` (438 lines)
  — facility-level print/label configuration: default print
  behavior, guardrails, scan verification, container/requisition
  label sizes and printer profiles, container barcode symbology,
  barcode prefix conventions, GS1 GTIN, and container type codes,
  with a system-default-vs-facility-override banner at the top.

### What changed

- Added `useTranslation()`/`Trans` (react-i18next) to the main
  component; no other component in this file needed its own hook
  (no modal, single component).
- **Data-key-stays-English, label-is-translated map**: replaced the
  pre-existing `SYMBOLOGY_LABEL: Record<LabelBarcodeSymbology,
  string>` with `SYMBOLOGY_LABEL_KEY` — `'code128'`/`'qr'`/
  `'datamatrix'` stay the literal stored config values; the
  `<option>` display text is now translated via
  `t(SYMBOLOGY_LABEL_KEY[s])`.
- Converted every card title, description, hint, placeholder, toggle
  label, and the saving indicator to `t('printSettingsSection.*')`
  calls — default-behavior card, guardrails, scan verification,
  container/requisition label size, all three printer-profile cards,
  container barcode symbology, barcode prefix conventions, GS1 GTIN,
  and container type codes.
- **`<Trans>` with embedded `<strong>`**: the two banner messages
  ("Showing System Defaults. **{facility}** currently inherits
  global print settings." / "Facility override active for
  **{facility}**.") originally wrapped the facility name in
  `<strong>` in the source JSX. A first pass with plain `t(key,
  {facilityName})` interpolation would have lost that bold styling,
  so both were rewritten as `<Trans i18nKey="printSettingsSection.
  banner.inheriting" values={{ facilityName }} components={{ strong:
  <strong /> }} />` (and the `overrideActive` counterpart), matching
  the translation strings' own `<strong>{{facilityName}}</strong>`
  markup — same fix pattern as the decorative-em-dash catch in batch
  67, generalized to embedded markup.
- Reused strings across repeated UI elements rather than duplicating
  keys: `enabledLabel` ("Enabled") for both the Guardrails and Scan
  Verification toggles; `useBrowserDialogOption` ("— Use browser
  print dialog —") across all three printer-profile `<select>`s;
  `qzTrayHint` (the identical QZ Tray hint sentence) under all three.
- **Literal single-brace format tokens preserved, documented**: the
  `barcodePrefixConventions.description` string contains `{TYPE}`,
  `{YYYYMMDD}`, `{XXXX}`, `{NN}` — literal display text describing a
  barcode format, not i18next `{{}}` interpolation syntax. Left as
  single braces with a code comment explaining why, so a future pass
  doesn't "fix" them into double braces.
- **Left untouched, documented**: `LABEL_SIZE_PRESETS` (from
  `types/labels/LabelSizePreset.ts`) — confirmed via grep to be a
  shared, foundational types-module constant (used by this component
  plus two test files), so treated like `MATERIAL_TYPE_LABEL`/
  `BILLING_TYPE_LABEL` in earlier batches rather than converted just
  because this file is currently its only real-component consumer.
- **Real data preserved, unchanged**: `CONTAINER_TYPES` codes/labels
  and each `printerProfiles` option's `p.printerId ({p.model},
  {p.bridgeType})` text — real configured records, not UI copy.
- **Inline CSS**: none — this file had zero `style={{}}` spots (its
  own header comment already noted this as a prior fix); no CSS
  changes this batch.
- **Business logic / dead code**: no extraction or removal needed;
  no `t`-shadowing risk found (grepped explicitly — none).

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `printSettingsSection.*` key paths referenced in the file (43
  literal `t()`/`Trans` calls plus the 3 `SYMBOLOGY_LABEL_KEY` map
  values) cross-checked programmatically against the 43 leaf keys
  added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5744 → 5787 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/PrintSettingsSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` — this batch made no CSS changes.)

### Next up

`PendingApprovalSection.tsx` (426 lines) is next in line by size (see
batch 62's note on `siteLabel`). After that:
`CytologyCategoriesSection.tsx` (424, one of the four remaining files
carrying the duplicated CSV-type-guard alert), `FlagConfigPage.tsx`
(418), `DelegationTypeSection.tsx` (409), and smaller files down to
`ScanStationsSection.tsx`/`CaseMaskConfigSection.tsx` (347) and
below, plus `GrossingRouteOverridesSection.tsx` (still carrying the
last unconverted `GROSSING_TEMPLATES` copy of the three, per batch
71's note) and `ConfigSearchBar.tsx` (its own independent,
still-unconverted copy of the System Config section labels, per
batch 73's note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, and the remaining four
not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 74 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **35% of known scope**.

---

## Config/System/PendingApprovalSection.tsx — file-by-file sweep, batch 75

### Files swept this batch

- `src/components/Config/System/PendingApprovalSection.tsx` (427
  lines) — the real Four-Eyes Principle (dual control) review queue:
  pending billing rule versions and pending whole-table dictionary
  updates (CPT Modifier Dictionary, NCCI Edit Rules, RVU Code Map),
  each with the same drafter/submitter-can't-review-their-own-change
  lockout, approve/reject actions, and an inline rejection-reason
  prompt.

### What changed

- Added `useTranslation()` to the single top-level component (no
  modal or sub-component in this file).
- Converted both section headers/subtitles, both table header rows
  (9 columns for billing rules, 5 for dictionaries), both locked-hint
  messages, both empty-row messages, the loading message, the
  rejection-reason-required error text, the reject-input placeholder,
  and the Approve/Reject/Confirm Reject/Cancel button labels to
  `t('pendingApprovalSection.*')` calls.
- Reused strings across the three dictionary tables (modifier, NCCI,
  RVU) rather than duplicating keys: one shared `dictionaries.
  lockedHint`, one shared `rejectPlaceholder`, one shared
  `confirmReject`/`approve`/`reject`, and one shared
  `rejectionReasonRequired` error string reused across all four
  approve/reject handlers (billing rule, modifier, NCCI, RVU).
- `Cancel` reuses the existing `common.cancel` key rather than adding
  a duplicate local one.
- **New pluralized counts**: the NCCI row's "({{pairCount}} pair/
  pairs)" and the RVU row's "({{entries.length}} code/codes)" were
  hardcoded ternaries (`pairCount === 1 ? '' : 's'`); converted to
  `_one`/`_other` pluralized keys (`pendingApprovalSection.
  pairCount`/`codeCount`) with `{{count}}` interpolation, matching
  the established plural pattern from batch 69's `pendingApproval_
  one`/`_other`.
- **Data-key-stays-English, label-is-translated**: the three
  dictionary "type" labels shown in the first column of the
  Pending Dictionary Updates table ("CPT Modifier Dictionary",
  "NCCI Edit Rules", "RVU Code Map") are display text describing
  which dictionary a row belongs to, not stored data — translated
  via `dictionaries.names.{modifier,ncci,rvu}`.
- Table header arrays (`billingRuleHeaders`/`dictionaryHeaders`),
  previously inline literal-string arrays mapped directly in JSX,
  extracted to small `const` arrays of `t()` results built just
  above the return, keeping the same `.map(h => <th key={h}>...)`
  render shape.
- **Real data preserved, unchanged**: `v.billingCode`/`v.cpt`/
  `v.rvuWork`/`v.createdBy`/`v.submittedForApprovalBy`/
  `v.changeReason`, `v.label`/`v.quarterVersion`, the
  `auditService.logEvent()` audit-trail `detail` strings (all still
  built from real, untranslated identifiers and reasons), and the
  service-layer error text surfaced via `res.error` (a generated,
  diagnostic message from `mockBillingRuleService`/
  `mockModifierDictionaryService`/`mockNcciEditService`/
  `mockRvuCodeMapService`, left as the service's own words per the
  "generated diagnostic text stays as generated" convention from
  batch 67's note on `result.reason`).
- **Inline CSS**: none — this file had zero `style={{}}` spots (it
  already used the shared `ps-conf-*`/`ps-billing-reason-hint`
  classes throughout); no CSS changes this batch.
- **Business logic / dead code**: no extraction or removal needed;
  no `t`-shadowing risk found (no `.map`/`.filter`/`.some` callback
  in this file shadows the `t` translation function).

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `pendingApprovalSection.*` key paths referenced in the file (33
  literal `t()` calls, with the two pluralized `pairCount`/
  `codeCount` base calls expanded to their `_one`/`_other` forms)
  cross-checked programmatically against the 35 leaf keys added:
  exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5787 → 5822 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/PendingApprovalSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` — this batch made no CSS changes.)

### Next up

`CytologyCategoriesSection.tsx` (424 lines) is next in line by size
— one of the four remaining files carrying the duplicated
CSV-type-guard alert string. After that: `FlagConfigPage.tsx` (418),
`DelegationTypeSection.tsx` (409), and smaller files down to
`ScanStationsSection.tsx`/`CaseMaskConfigSection.tsx` (347) and
below, plus `GrossingRouteOverridesSection.tsx` (still carrying the
last unconverted `GROSSING_TEMPLATES` copy of the three, per batch
71's note) and `ConfigSearchBar.tsx` (its own independent,
still-unconverted copy of the System Config section labels, per
batch 73's note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, and the remaining four
not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`, `CytologyCategoriesSection.tsx`) all
remain unchanged this batch.

### Progress estimate

Batch 75 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **36% of known scope**.

---

## Config/System/CytologyCategoriesSection.tsx — file-by-file sweep, batch 76

### Files swept this batch

- `src/components/Config/System/CytologyCategoriesSection.tsx` (425
  lines) — the Bethesda System (and BSCC/RCPath, München III, SFCC,
  PALGA CISOE-A) cytology category dictionary: specimen adequacy,
  general categorization, interpretation/result, and recommendation
  vocabulary, plus a French-translation CSV import/export mechanism
  for the SFCC derived view.

### What changed

- Added `useTranslation()` to both `CategoryModal` and the main
  `CytologyCategoriesSection` component.
- **Full inline-CSS extraction**: this file had 54 `style={{}}` spots
  and used almost no existing classes (only `ps-conf-select`/
  `ps-section-add-btn`), unlike most recently-swept files which
  already leaned on shared `ps-conf-*` classes. All 54 were extracted
  into a new `.ps-cytcat-*` class family (48 classes) inserted into
  `pathscribe.css` right after batch 71's block. Four two-state
  toggles became base+modifier class pairs rather than inline
  ternaries: the section tab's active/inactive state
  (`.ps-cytcat-tab-btn`/`--active`), a category row's last-in-group/
  not-last border (`.ps-cytcat-row`/`--last`), a category row's
  active/inactive opacity (`.ps-cytcat-row`/`--inactive`), and the
  modal Save button's enabled/disabled state
  (`.ps-cytcat-btn-primary--enabled`/`--disabled`). The `Chip` helper's
  per-instance color coding (background/color/border computed from an
  arbitrary hex color prop) was left inline on `.ps-cytcat-chip`'s
  static layout properties, since it's genuinely data-driven rather
  than a fixed 2-state toggle.
- **`t`-shadowing avoided**: the section-tabs render loop originally
  used `SECTION_TABS.map(t => ...)`; renamed the loop variable to
  `tab` before it could shadow the `t` translation function (no other
  callback in this file used `t` as a parameter name).
- **Module-scope translation-key arrays**: `SECTION_TABS` (4 entries)
  and `NOMENCLATURE_SYSTEMS` (5 entries) converted from `label` to
  `labelKey`, resolved via `t()` at each render site — same pattern
  as `GROSSING_TEMPLATES` in batches 70/71 and the `SECTIONS` registry
  in batch 73.
- **Data-key-stays-English, label-is-translated map**: added
  `SEVERITY_LABEL_KEY: Record<'Abnormal'|'Critical'|'Malignant',
  string>` — the three severity values stay the literal stored
  `suggestedAbnormalSeverity` values (and `SEVERITY_COLOR`'s own real
  color-lookup keys), reused for both the modal's `<select>` options
  and the row Chip's displayed label; same pattern as batch 72's
  `SEVERITY_LABEL_KEY` for `QaDiscordanceSeverity`.
- Reused existing `common.*` keys rather than duplicating: `active`,
  `cancel`, `save`, `edit`, `deactivate`, `reactivate`, `inactive`,
  `showInactive`, `loading` (the loading-spinner text was an exact
  match for `common.loading`'s "Loading…").
- **Duplicated CSV-type-guard alert closed out**: the `isCsvFile`
  rejection `alert()` (previously hardcoded, matching the same string
  already converted in `RvuCodeMapSection.tsx`/`SpecimenDictionarySection.
  tsx`/`PhysiciansSection.tsx`/`ProtocolDictionarySection.tsx`/
  `StainDictionarySection.tsx`) now uses this file's own local
  `import.invalidFileType` key with `{{fileName}}` interpolation —
  each file keeps its own local copy of this string rather than a
  shared cross-namespace key, matching the established convention.
  This is the 4th of the originally-flagged 6 files now converted;
  `CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`, and
  `NcciEditRulesSection.tsx` remain.
- **New pluralization-free interpolation**: the footer's
  "{{active}} active · {{total}} total" count line, converted from a
  plain template-literal expression to `t('cytologyCategoriesSection.
  footer.counts', { active, total })`.
- **Real data preserved, unchanged**: `e.label`/`e.abbreviation`/
  `e.description`/`e.group` (real Bethesda/BSCC/München/PALGA
  category records, including the group sub-heading text like
  "Epithelial Cell Abnormality — Squamous"), and the CSV
  export/import column headers (`Id`/`Section`/`EnglishLabel`/
  `EnglishDescription`/`FrenchLabel`/`FrenchDescription`) and
  filename (`BethesdaFrenchTranslations.csv`) — exported/persisted
  data stays English per the established convention.
- **Business logic**: none extracted — `refresh`, `handleSave`,
  `toggleActive`, `handleExportFrenchTranslations`, and
  `handleImportFrenchTranslations` were already focused, single-
  purpose functions.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `cytologyCategoriesSection.*` key paths referenced in the file
  (36 literal `t()` calls, including the `SEVERITY_LABEL_KEY` map
  values and the `SECTION_TABS`/`NOMENCLATURE_SYSTEMS` `labelKey`
  values) cross-checked programmatically against the 36 leaf keys
  added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5822 → 5858 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/CytologyCategoriesSection.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`FlagConfigPage.tsx` (418 lines) is next in line by size. After
that: `DelegationTypeSection.tsx` (409), and smaller files down to
`ScanStationsSection.tsx`/`CaseMaskConfigSection.tsx` (347) and
below, plus `GrossingRouteOverridesSection.tsx` (still carrying the
last unconverted `GROSSING_TEMPLATES` copy of the three, per batch
71's note) and `ConfigSearchBar.tsx` (its own independent,
still-unconverted copy of the System Config section labels, per
batch 73's note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, and the remaining
three not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`) all remain unchanged this batch.

### Progress estimate

Batch 76 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **36% of known scope**.

---

## Config/System/FlagConfigPage.tsx — file-by-file sweep, batch 77

### Files swept this batch

- `src/components/Config/System/FlagConfigPage.tsx` (419 lines) —
  the Case & Specimen Flags dictionary: flag name/description/level/
  LIS code/severity/icon/status, an auto-created-flags review filter
  (fed by `AutoCreatedBanner`), and an add/edit modal with a
  save-confirmation step.

### What changed

- Added `useTranslation()` to both the `Toggle` sub-component and the
  main `FlagConfigPage` component.
- **Inline CSS extraction**: 40 `style={{}}` spots, on top of this
  file's already-heavy reuse of shared `ps-conf-*`/`fm-*` classes.
  Extracted into a new `.ps-flagcfg-*` class family (34 classes)
  inserted into `pathscribe.css` right after batch 76's block. Four
  two-state toggles became base+modifier class pairs: the `Toggle`
  sub-component's on/off track, knob position, and label color
  (`.ps-flagcfg-toggle-track/-knob/-label` + `--on`/`--off`), and the
  table's per-row status dot/text (`.ps-flagcfg-status-dot/-text` +
  `--active`/`--inactive`). Also added one small, generically-
  reusable modifier to the existing `fm-title` family
  (`.fm-title--sm`, 16px) since this file's modal titles override
  `fm-title`'s own 20px default — the first new addition to that
  shared class family rather than a file-scoped one.
- **Data-key-stays-English, label-is-translated maps**: converted
  `SEVERITY_LABELS: Record<number, string>` to `SEVERITY_LABEL_KEY`
  (the 1–5 severity numbers stay the real, stored `Flag.severity`
  values) and added a new `LEVEL_LABEL_KEY: Record<'Case'|
  'Specimen', string>` (the literal stored `Flag.level` values,
  reused consistently across the level filter dropdown, the modal's
  Level radio buttons, and the table's Level column — the same value
  doubles as data key and English display word in the original, so
  one map now drives every display site).
- **Left untranslated, documented**: `ICON_KEY_OPTIONS`
  (`IconKey[]`) — real, internal icon-set identifiers ('ihc', 'fish',
  'molecular', etc.) shown as-is in the Icon `<select>`, technical
  keys rather than natural-language labels, per the "internal
  schema/data-key identifiers stay English" convention.
- Converted the auto-created-flags review banner's hardcoded
  ternary pluralization (`flag{count !== 1 ? 's' : ''}`) to a proper
  `_one`/`_other` i18next plural (`autoCreatedReviewBanner`) with
  `{{count}}` interpolation.
- Reused existing `common.*` keys rather than duplicating: `active`,
  `inactive`, `edit`, `cancel`, `save`, `confirm` (the confirm
  modal's "Confirm" button is the first reuse of `common.confirm` in
  this sweep).
- Converted every remaining hardcoded string: page title/subtitle,
  add-flag button, search placeholder, status/level filter option
  labels, all 6 table headers, the "LIS import" auto-created badge,
  the empty-row message, the shared modal eyebrow text, both modals'
  titles (Edit/Create/Save Changes), every field label/placeholder,
  the client-side "Name is required" validation error, and the
  confirmation prompt text.
- **Business logic / dead code**: no extraction or removal needed;
  no `t`-shadowing risk found (no callback in this file uses `t` as
  a parameter name).

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `flagConfigPage.*` key paths referenced in the file (38
  literal `t()` calls, with the pluralized `autoCreatedReviewBanner`
  base call expanded to its `_one`/`_other` forms, plus the
  `LEVEL_LABEL_KEY`/`SEVERITY_LABEL_KEY` map values) cross-checked
  programmatically against the 40 leaf keys added: exact match, no
  unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5858 → 5898 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/FlagConfigPage.tsx`
- `src/pathscribe.css`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

### Next up

`DelegationTypeSection.tsx` (409 lines) is next in line by size.
After that: smaller files down to `ScanStationsSection.tsx`/
`CaseMaskConfigSection.tsx` (347) and below, plus
`GrossingRouteOverridesSection.tsx` (still carrying the last
unconverted `GROSSING_TEMPLATES` copy of the three, per batch 71's
note) and `ConfigSearchBar.tsx` (its own independent,
still-unconverted copy of the System Config section labels, per
batch 73's note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, and the remaining
three not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`) all remain unchanged this batch.

### Progress estimate

Batch 77 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **37% of known scope**.

---

## Config/System/DelegationTypeSection.tsx — file-by-file sweep, batch 78

### Files swept this batch

- `src/components/Config/System/DelegationTypeSection.tsx` (410
  lines) — the System › Delegation Types dictionary: system types
  (toggle-only) and custom types (full CRUD), with per-performing-lab
  scoping, an auto-derived/editable ID field, an accent-colour picker,
  and a duplicate/delete row-action set.

### What changed

- Added `useTranslation()` to both the `Form` modal and the main
  `DelegationTypeSection` component.
- **`t`-shadowing avoided**: the row-filtering `types.filter(t =>
  ...)` callback used `t` as its parameter name; renamed to `dt`
  (matching the parameter name already used by `renderRow`/
  `handleToggle` elsewhere in this file) before it could shadow the
  `t` translation function.
- No CSS changes — the file's only 2 `style={{}}` spots set CSS
  custom properties (`--swatch-color`, `--del-badge-bg`/`-color`/
  `-border`) from real, per-instance hex color values, consumed by
  this file's own already-existing `.ps-type-color-swatch`/
  `.ps-del-id-badge` classes; genuinely dynamic, not static styling
  to extract, same precedent as `DepartmentsSection.tsx`/
  `CasePoolAssignmentSection.tsx`.
- Converted every hardcoded string: the modal's title (three
  variants — Add/Edit/Duplicate, the latter two interpolating the
  real `{{label}}`), eyebrow, all field labels/placeholders/hints,
  the accent-colour picker's title, all four Options toggle labels,
  and the footer buttons.
- **Uniqueness-collision error messages**: the label/ID duplicate
  checks each had a conditional English suffix
  (`` `already exists${form.performingLabFacilityId ? ' for this
  performing lab' : ''}` ``) appended at runtime; converted to two
  full, separately-translated sentences per field
  (`errors.labelExists`/`labelExistsForLab`,
  `errors.idExists`/`idExistsForLab`) with `{{label}}`/`{{id}}`
  interpolation, rather than concatenating a translated suffix onto
  a translated base sentence — avoids assuming every language builds
  the qualifier the same way English does.
- Reused existing `common.*` keys rather than duplicating:
  `required` (all three "Required" field-validation messages),
  `optional`, `active`, `inactive`, `cancel`, `edit`, `duplicate`,
  `delete`, `yes`, `no`, `loading`.
- **Decorative dash preserved**: the Performing Lab select's
  "— All Labs (available to everyone) —" option kept its exact
  em-dash decoration, matching the established convention (batches
  67/70/71).
- **Left untranslated, documented**: the ID field's own placeholder
  ("CONSULT_REQUEST") — a literal, illustrative example of
  `generateId()`'s upper-case/underscore transform, left in English
  as an ID-format sample rather than translated alongside the Label
  field's own "e.g. Consult Request" example (translating the label
  example didn't need to imply retranslating the derived-ID example
  in lockstep).
- **Two distinct strings for the same concept, both translated
  separately, matching the original's own distinction**: the modal's
  toggle label "Transfers Ownership" (Title Case, an on/off field
  label) vs. the row's small tag text "transfers ownership"
  (lowercase, a compact badge) — same for "Requires Note"/"requires
  note" — kept as separate `modal.toggles.*`/`tags.*` keys rather
  than collapsed into one, since the original intentionally used
  different casing/register in the two contexts.
- **Real data preserved, unchanged**: `dt.label`/`dt.description`/
  `dt.id`/`dt.cptHint` (the actual delegation-type dictionary
  content) and every lab's own `l.name`.
- **Business logic**: none extracted — `load`, `handleToggle`,
  `handleSave`, `handleClone`, and `validate` were already focused,
  single-purpose functions.

### Validation

- `npx tsc --noEmit -p .`: clean.
- No dedicated test file exists for this component.
- All `delegationTypeSection.*` key paths referenced in the file (44
  literal `t()` calls) cross-checked programmatically against the 44
  leaf keys added: exact match, no unused or missing keys.
- All five locale files verified programmatically to have identical
  key sets across the new namespace — **5898 → 5942 leaf keys**,
  matched exactly across en/fr/de/nl/ko.
- Full suite: **499/499 test files, 4329/4329 tests passing**.

### What's in this zip

- `src/components/Config/System/DelegationTypeSection.tsx`
- `src/i18n/locales/{en,fr,de,nl,ko}.json`
- `src/i18n/README.md`

(No `pathscribe.css` — this batch made no CSS changes.)

### Next up

`ScanStationsSection.tsx` (347 lines, tied with
`CaseMaskConfigSection.tsx`) is next in line by size. After that:
`CaseMaskConfigSection.tsx` (347), `DeliveryRulesSection.tsx` (340),
`CassetteRoutingRulesSection.tsx` (338), and smaller files down,
plus `GrossingRouteOverridesSection.tsx` (still carrying the last
unconverted `GROSSING_TEMPLATES` copy of the three, per batch 71's
note) and `ConfigSearchBar.tsx` (its own independent,
still-unconverted copy of the System Config section labels, per
batch 73's note). Beyond `Config/`: `TemplateBuilder/` (10 files),
`QualityAssurance/` (15 files), `Common/` (15 files), and
`AppShell.tsx` (1,745 lines). `SynopticReportPage` (54 files, 3
converted) is unchanged and still pending. Flagged-not-fixed gaps
carried forward from earlier batches (triplicated `.ps-body-modal-*`
CSS block, untranslated generated strings in grouping files,
`'en-US'` chart-axis locale, "YTD" baked into computed data,
illustrative-diagnosis mock content, `ReleaseBufferSection.tsx`
(232 lines) not yet converted, batch 59's note on TATConfigSection's
resolution-preview sentence word order, batch 67's note on
`result.reason` as generated diagnostic text, batch 71's note on the
"specimens"/"departments" copy-paste wording, and the remaining
three not-yet-converted copies of the CSV-type-guard alert string —
`CrosswalkSection.tsx`, `ModifierDictionarySection.tsx`,
`NcciEditRulesSection.tsx`) all remain unchanged this batch.

### Progress estimate

Batch 78 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **37% of known scope**.

---

## Config/System/ScanStationsSection.tsx — file-by-file sweep, batch 79

### Files swept this batch

- `src/components/Config/System/ScanStationsSection.tsx` (347
  lines) — the System › Scan Stations dictionary: the scan-station
  list/table (search, status filter, print-all), and the add/edit
  `ScanStationModal` (name, barcode code, workflow stage, printer
  IP, engraving/printing capability toggles, printer profile,
  facility, active status).

### What changed

- Added `useTranslation()` to both `ScanStationModal` and the main
  `ScanStationsSection` component.
- Converted all 39 on-screen leaf strings under a new
  `scanStationsSection` namespace: the section title/subtitle, the
  Add Station/Print All buttons, the search placeholder and status
  filter, the table's column headers, the modal's title (Add/Edit,
  the latter interpolating the real `{{name}}`), and every field
  label/placeholder/hint/tooltip in the modal.
- No `t`-shadowing risk found; no dedicated test file exists for
  this component.
- **Left untranslated, documented in-code**:
  `SCAN_STATION_WORKFLOW_STAGES` (`Accessioning`, `Grossing`,
  `Processing`, `Embedding`, `Microtomy / Sectioning`, `Staining`,
  `Slide Archival`, `Other`) — per `IScanStationService.ts`'s own
  doc comment, a station's `workflowStage` field is guided free
  text, not a closed enum matched anywhere else against a fixed
  union type. Translating this suggestion list would mean a
  French-locale admin's selection gets persisted as French text
  directly into real data — the same "exported/persisted data stays
  English" reasoning applied throughout this sweep, just triggered
  here by a dropdown of *suggestions* for a free-text field rather
  than a literal export.
- **Barcode placeholder translated as a whole, code kept literal**:
  `"e.g. GROSSING-04"` → translates "e.g." and keeps the illustrative
  code itself untouched, consistent with the batch 77/78 precedent
  for ID/code-format examples.

### Validation

- Locale parity: 5942 → 5981 keys (+39), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 79 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **37% of known scope**.

---

## Config/System/CaseMaskConfigSection.tsx — file-by-file sweep, batch 80

### Files swept this batch

- `src/components/Config/System/CaseMaskConfigSection.tsx` (348
  lines) — the System › Case Mask Configuration screen: every
  currently-defined accession-number mask, grouped by scope
  (Enterprise/Facility/Department), plus the add/edit modal with its
  own live, unsaved-draft preview of the next number a mask would
  produce.

### What changed

- Added `useTranslation()`/`Trans` to both `CaseMaskModal` and the
  main `CaseMaskConfigSection` component.
- **Business-logic extraction, not just this file's own duplicate**:
  the modal's `runPreview` had its own inline copy of the
  `{PREFIX}`/`{YEAR:4}`/`{YEAR:2}`/`{SEQ:N}` token-substitution
  algorithm — and that exact algorithm turned out to already be
  independently duplicated as a private, non-exported `renderMask()`
  in *both* `caseMaskService.ts` (the Firestore implementation) and
  `mockCaseMaskService.ts` (the active one). All three were real
  duplicates of the same logic, not three different things that
  happened to look similar. Extracted the shared piece to a new
  `src/services/caseRegistry/renderCaseMask.ts` (pure, data-only,
  same convention as the existing `resolveCaseMaskScopeCandidates.ts`
  in that folder) and pointed all three call sites at it. The
  component's own copy couldn't just call the existing
  `previewNextCaseNumber` service method instead, though — that
  method resolves against *persisted* masks, and this preview needs
  to render the modal's own live, unsaved draft values.
- **CSS**: 2 inline `style={{}}` spots. `{ marginTop: 20 }}` on the
  per-scope-group wrapper reused the existing `.ps-mt-20` utility
  class directly (no new class needed). `{ fontSize: 14 }}` on the
  scope sub-heading became a new `.ps-conf-section-title--sm`
  modifier next to the existing `.ps-conf-section-title` family —
  the first size modifier for that shared class, added at its own
  definition site (`pathscribe.css`) rather than folded into a
  component-scoped block, since it's a generic, reusable modifier
  the same way `fm-title--sm` (batch 77) was for the `fm-title`
  family.
- Converted every remaining on-screen string: section title/
  subtitle (including the embedded default-scheme example,
  interpolated with the real `DEFAULT_FALLBACK_PREFIX` constant),
  the Add button, per-scope-group headings and empty-state text,
  table headers, the modal's title (Add/Edit, the latter
  interpolating the scope label), every field label/placeholder/
  option, the token-syntax help text, the reset-annually checkbox
  label, the preview button and result line, the current-sequence/
  last-reset/last-updated metadata line, and all four validation
  error messages.
- **`SCOPE_LABELS` replaced with two key-maps, not one**: the
  original `Record<CaseMaskScopeType, string>` fed both Title Case
  uses (dropdown options, table/group headings, modal field labels)
  *and* two `.toLowerCase()` call sites (`` `Select a real
  ${label.toLowerCase()}…` ``, `` `No ${label.toLowerCase()}-level…`
  ``). JS-lowercasing an already-translated string is wrong for a
  language that doesn't lowercase nouns the way English does — German
  keeps "Abteilung" capitalized regardless of sentence position — so
  this is now two separately-authored translation namespaces
  (`scopeLabels`/`scopeLabelsLower`) rather than one map plus a
  runtime `.toLowerCase()`. Documented as a code comment at the
  key-maps' own definition.
- **`<Trans>` used for the one sentence with a styled value embedded
  mid-string** (`Next: <value>{{preview}}</value> — does not
  consume…`), matching the existing precedent in
  `ValidationStudiesSection.tsx` rather than splitting the sentence
  into separate prefix/suffix keys around the styled `<span>`.
- Reused `common.cancel`/`common.save`/`common.yes`/`common.no`/
  `common.edit`/`common.delete` rather than duplicating.
- **Known simplification, documented rather than silently
  approximated**: `selectScopePlaceholder` ("Select a real
  {{scope}}…") is written with one fixed grammatical gender per
  language for French/German (the interpolated scope noun's real
  gender varies: e.g. German "Abteilung"/"Einrichtung" are feminine,
  "Unternehmen" is neuter) — consistent with the level of
  interpolation-gender handling already accepted elsewhere in this
  sweep, not a new gap introduced here.
- **Left as real, persisted-data English, untouched**: the
  `updatedBy: getSessionUser()?.id ?? 'admin'` fallback — an internal
  identifier written to the record, not on-screen text.

### Validation

- Locale parity: 5981 → 6020 keys (+39), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing — including
  `mockCaseMaskService.test.ts`, confirming the `renderMask`
  extraction didn't change behavior for either service.

### Progress estimate

Batch 80 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **38% of known scope**.

---

## Common/PubMedTicker.tsx — file-by-file sweep, batch 81

Out of the usual `Config/System/` size-ordered queue — bumped up
after the user spotted it directly (the dashboard's "From PubMed"
badge and paste-a-PMID field still showing English text against an
otherwise-Korean screen) and asked what to expect there.

### Files swept this batch

- `src/components/Common/PubMedTicker.tsx` (201 lines) — the
  dashboard's literature-feed widget: badge + refresh button, the
  linked article itself, and the "paste a PMID/link to override
  today's article" field.

### What changed

- Added `useTranslation()`.
- Converted every on-screen string: the "From PubMed" badge (shown
  in both the loading skeleton and the live button — one shared
  key), the refresh button's two tooltip states, the paste field's
  placeholder, its Apply/Checking… button states, the "✓ Updated"
  success message, and both paste-validation error messages.
- The one dynamic string, the companion-window `aria-label`
  (`` `Open the PubMed listing for "${article.title}"...` ``),
  converted to interpolation (`{{title}}`) rather than string
  concatenation.
- **Left untranslated, by design — not a gap**: `article.title`,
  `article.source` (journal name), and `article.pubdate` themselves.
  This is real bibliographic data fetched live from PubMed — actual
  published scientific literature, which exists in one real,
  citable, overwhelmingly-English form regardless of the viewer's
  locale. Same "exported/persisted data stays English" reasoning
  this sweep has applied throughout, extended to real external
  sourced content: fabricating a translation of a real journal
  article's title would misrepresent it, not localize it. This is
  the direct answer to why the screenshot that prompted this batch
  showed a fully-Korean dashboard with an English article title and
  journal name sitting inside it — that's the intended, permanent
  end state, not a conversion this sweep will ever "finish."
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6020 → 6030 keys (+10), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 81 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **39% of known scope**. Back to the regular
`Config/System/` size-ordered queue next (`DeliveryRulesSection.tsx`,
340 lines).

---

## Config/System/DeliveryRulesSection.tsx — file-by-file sweep, batch 82

### Files swept this batch

- `src/components/Config/System/DeliveryRulesSection.tsx` (341
  lines) — the System › Delivery Configuration Rules screen: the
  rule table (criteria → action), its add/edit modal, and a live
  test panel that resolves a hypothetical case against the
  configured rules — the same three-part shape as
  `RoutingRulesTab.tsx`, per this file's own header comment.

### What changed

- Added `useTranslation()` to `RuleModal`, `TestPanel`, and the main
  `DeliveryRulesSection` component.
- **CSS**: 9 inline `style={{}}` spots. Two are genuinely dynamic
  (the per-action label/value color, keyed by `DeliveryAction` from
  `ACTION_COLORS`) and stay inline — everything static around them
  moved to new classes. One (`marginTop: 12` on the Resolve button)
  reused a newly-added `.ps-mt-12` utility, extending the existing
  `.ps-mt-8/14/20` family. The remaining six became new classes
  added to the existing `.ps-rr-*` family this file already shares
  with `RoutingRulesTab.tsx` (`ps-rr-modal-hint`, `ps-rr-modal-warn`,
  `ps-rr-test-result-box/-label/-value/-matched`,
  `ps-rr-empty-row`). The row-opacity toggle (`opacity: rule.active
  ? 1 : 0.5`) became a `ps-rr-delivery-row--inactive` modifier class
  instead of inline conditional opacity — a plain two-state
  active/inactive toggle, same base+modifier pattern used throughout
  this sweep rather than left as inline dynamic styling (that's
  reserved for values that genuinely vary across more than two
  fixed states, like the four-way action color).
- Converted every on-screen string: section title/subtitle, the Add
  Rule button, table headers (`Criteria`/`Action`/`Note`, reusing
  `common.active`/`common.inactive`/`common.edit`/`common.delete`
  rather than duplicating), the empty-state row, the modal's
  title/hint/field labels/placeholders/warning/footer buttons, the
  test panel's title/subtitle/fields/result messages, and the
  `describeCriteria()` display-string builder's four field prefixes
  plus its "matches every case" fallback.
- **`ACTION_LABELS`/`REPORT_TYPE_LABELS` replaced with key-maps**
  (`ACTION_LABEL_KEY`/`REPORT_TYPE_LABEL_KEY`), same pattern as
  batch 82's own `SCOPE_LABEL_KEY` and prior batches' similar
  module-level lookup tables — `ACTION_COLORS` stays a plain
  constant since hex codes aren't translatable content.
  `Object.entries(...).map(...)` call sites (used 4 times across
  the modal, test panel, and `describeCriteria`) now call `t(key)`
  per entry instead of using the raw label directly.
- **Two field labels needed both a shared key and a distinct one**:
  "Ordering Facility"/"Report Type" are identical text in the modal
  and the test panel (one shared `fields.*` key each), but "Patient
  Location" is not — the modal's own visible label reads "Patient
  Location (Point of Care)" while its `aria-label` and the test
  panel's visible label both read the shorter "Patient Location";
  kept as a shared `fields.patientLocation` plus a modal-only
  `modal.locationLabel` for the longer form, rather than forcing
  one string to cover both. Same reasoning for the modal's Action
  field: the visible label is "Action *" (required-field asterisk)
  but its own `aria-label` is the bare "Action" — kept distinct.
- Left the physician/facility display lines untouched
  (`` `${p.lastName}, ${p.firstName} — ${p.specialty}` ``,
  `` `${f.name} (${f.assigningAuthority})` ``) — real record data,
  not template text; only the field labels and placeholders around
  them are UI chrome.
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6030 → 6077 keys (+47), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 82 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **39% of known scope**. Next up:
`CassetteRoutingRulesSection.tsx` (338 lines).

---

## Config/System/CassetteRoutingRulesSection.tsx — file-by-file sweep, batch 83

### Files swept this batch

- `src/components/Config/System/CassetteRoutingRulesSection.tsx`
  (353 lines) — the System › Cassette Routing Rules screen: the
  rule table (weight/rule/conditions/color/status) and its add/edit
  modal (Conditions section, Output section, Rule Metadata section)
  — the same real table+modal pattern as `ScanStationsSection.tsx`,
  per this file's own header comment.

### What changed

- Added `useTranslation()` to `RuleModal` and the main
  `CassetteRoutingRulesSection` component.
- **CSS**: 6 inline `style={{}}` spots. Two are genuinely dynamic
  (the color swatch's own fill, sourced from the matched rule's real
  configured cassette color) and stay inline via a `--swatch-hex`
  custom property, same pattern established in batch 78 — the two
  swatch spots (modal hint, table cell) now share one new
  `.ps-cassrr-color-swatch` class instead of duplicating the same
  12px/border/border-radius declaration inline twice. The other four
  became new classes: the modal's `maxWidth: 560` became
  `.ps-ms-modal--medium` (a new width variant alongside the existing
  `.ps-ms-modal--wide`/`--extra-wide`/`--grid`, since widening
  `--wide` itself would also widen the 7+ unrelated modals that
  share it); the priority-checkbox row's `gap: 14` became
  `.ps-conf-toggle-row--gap14`; the priority-checkbox `<label>`'s own
  inline flex/font/color/cursor styling and the two color-hint
  wrapper spans' `display: flex; align-items: center` became
  `.ps-cassrr-priority-label` and `.ps-cassrr-color-hint`
  respectively.
- Converted every on-screen string: section title/subtitle, the
  `+ Add Rule` button, table headers (`Weight`/`Rule`/`Conditions`/
  `Color`/`Status`/`Actions`, reusing `common.active`/
  `common.inactive`/`common.edit` rather than duplicating), the
  empty-state row, the Deactivate/Reactivate toggle buttons, the
  modal's title (add vs. edit, interpolating the rule name),
  field labels/placeholders/dividers/hints, the two validation error
  messages, and the footer buttons.
- **`PRIORITY_OPTIONS` kept as-is** (`['Routine', 'Rush', 'STAT']`)
  — it's the real, persisted `CassetteRuleOrderPriority` union used
  as both React `key`s and the actual condition values sent to
  `mockCassetteRoutingRuleService`. A new `PRIORITY_LABEL_KEY` map
  sits alongside it purely for display, same key-map pattern as
  prior batches' `ACTION_LABEL_KEY`/`SCOPE_LABEL_KEY`.
- `conditionsSummary()`'s five display-string parts (Protocol/
  Priority/Station/Facility/Case type) and its "Any (catch-all)"
  fallback now build through `t()` with interpolation instead of
  template-literal concatenation; the Priority part re-uses
  `PRIORITY_LABEL_KEY` so a rule's priority list renders in the
  active locale rather than the raw `Routine`/`Rush`/`STAT` values.
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6077 → 6130 keys (+53), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 83 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **40% of known scope**. Next up:
`OutboundMessagePreviewSection.tsx` (216 lines) — the next-largest
unconverted file in `Config/System/`. (`useSpecimenDictionary.tsx`,
at 101 lines, is a data-only hook wrapper with no rendered UI
strings, so it's excluded from the sweep.)

---

## Config/System/OutboundMessagePreviewSection.tsx — file-by-file sweep, batch 84

### Files swept this batch

- `src/components/Config/System/OutboundMessagePreviewSection.tsx`
  (216 lines) — the System › Outbound Interface Message Preview
  screen: a standalone tool that previews and downloads the real
  ADT^A08/A40/A47 and ORU^R01 JSON payloads PathScribe builds for the
  interface engine, per this file's own header comment (deliberately
  its own screen, not an extension of `DftExportPreviewSection.tsx`).

### What changed

- Added `useTranslation()` to the component.
- **CSS**: 8 inline `style={{}}` spots, none genuinely dynamic — all
  became classes. Two `color: '#f59e0b'` warning hints and one
  `color: '#ef4444'` error hint reused the existing
  `.ps-conf-hint--warning`/`.ps-conf-hint--danger` classes directly
  (exact matches, same reuse this sweep has applied since batch 56).
  Three `marginTop` spots (`12`, `12`, `20`) reused the existing
  `.ps-mt-12`/`.ps-mt-20` utilities. The toolbar's `flexWrap: 'wrap'`
  became a new `.ps-qa-tab-toolbar--wrap` modifier on the existing
  `.ps-qa-tab-toolbar` class (its default `justify-content:
  space-between` doesn't suit this screen's single-control toolbar,
  and wrapping is real on narrow admin windows). The JSON-preview
  textarea's width/font-family/font-size/white-space reuses
  `DftExportPreviewSection.tsx`'s own `.ps-dft-export__mono-textarea`
  directly (same real JSON-preview posture, per this file's own
  header comment) plus one new `.ps-outbound-preview__mono-textarea--json`
  for its own taller `min-height`.
- Converted every on-screen string: section title/subtitle, both
  warning banners, the four message-type dropdown option labels, all
  nine field placeholders across the four message-type forms, the
  three ORU result-state dropdown options, the Preview/Building/
  Download buttons, and the output section's title/subtitle.
- **`MESSAGE_TYPE_LABELS` replaced with `MESSAGE_TYPE_LABEL_KEY`**,
  same key-map pattern as prior batches — the real HL7 trigger-event
  codes (`ADT^A08`, `ADT^A40`, `ADT^A47`, `ORU^R01`) stay embedded
  literally inside each translated label (they're real wire-protocol
  identifiers, not prose), only the description after the dash
  varies by locale.
- **Six error messages converted with interpolation** for the two
  that carry a real patient/case ID
  (`errors.patientNotFound`/`a40PriorNotFound`/`a47PriorNotFound`,
  each with `{{id}}`); the two "Payload builder returned null" A40/
  A47 messages are byte-identical in the original source, so they
  share one `errors.nullPayloadBothIds` key rather than duplicating
  it. The `catch` block's own `e.message` (a genuine thrown-error
  string from underlying code, not authored UI copy) stays as-is —
  only its own English fallback string became `t(...)`.
- Left `` `${messageType}_${Date.now()}.json` `` (the downloaded
  file's name) untouched — a real, exported filename, not on-screen
  text.
- No dedicated test file; no `t`-shadowing risk (the dropdown's own
  map callback variable was renamed `mt` to avoid colliding with the
  `t` translation function).

### Validation

- Locale parity: 6130 → 6162 keys (+32), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 84 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **40% of known scope**. Next up:
`ResearchFeedSection.tsx` (216 lines) — the next-largest unconverted
file in `Config/System/`.

---

## Config/System/ResearchFeedSection.tsx — file-by-file sweep, batch 85

### Files swept this batch

- `src/components/Config/System/ResearchFeedSection.tsx` (216 lines)
  — the System › Research Feed screen: admin configuration for the
  PubMed literature headline shown on the Home dashboard (search
  query, article URL template, API endpoint), plus a health panel
  surfacing when the feed last succeeded and whether it's gone
  stale.

### What changed

- Added `useTranslation()`/`Trans` to the component. No inline
  `style={{}}` spots existed in this file — it was already fully
  class-based — so this batch is i18n-only, no CSS changes.
- Converted every on-screen string: title/subtitle, the health
  panel's two row labels, the "Never" fallback, the staleness
  warning, the enabled checkbox label, all three field labels/hints,
  the four validation error messages, the saved-confirmation banner,
  and the two footer buttons.
- **`OUTCOME_LABELS` replaced with `OUTCOME_LABEL_KEY`**, same
  key-map pattern as prior batches — `health.lastOutcome` is real
  persisted status data (`'success' | 'empty' | 'rate-limited' |
  'error'`), only its displayed label is translated, with the
  original defensive fallback (show the raw value if it's ever an
  unrecognized outcome) preserved rather than run through `t()`.
- **Two module-level helper functions took new parameters instead of
  gaining `useTranslation()` themselves** (`formatWhen`,
  `stalenessNote`→`stalenessStatus`) — neither is a component, so
  neither has hook access. `formatWhen` now takes an already-`t()`'d
  `neverLabel` string; `stalenessNote` was restructured to
  `stalenessStatus`, returning a `{ key, values? }` translation
  descriptor instead of a rendered string, which the component then
  passes straight to `t()`.
- **`<code>{'{PMID}'}</code>` embedded mid-sentence** in the Article
  URL field's hint converted with a `<Trans>` component
  (`components={{ code: <code /> }}`) rather than string
  concatenation, so the `{PMID}` placeholder token keeps its own
  monospace styling in every locale; `ALLOWED_HOSTS.join(', ')` (the
  real configured host allow-list) is passed through as an
  interpolation value in both this hint and the two "approved host"
  error messages, never translated itself.
- Left the literal `'{PMID}'` substring-match check in
  `handleSave`'s own validation (`config.articleUrlTemplate.includes
  ('{PMID}')`) untouched — a real template-token check against
  admin-entered config, not UI text.
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6162 → 6188 keys (+26), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 85 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **41% of known scope**. Next up:
`AbnormalTriggerRulesSection.tsx` (231 lines) — the next-largest
unconverted file in `Config/System/`.

---

## Config/System/AbnormalTriggerRulesSection.tsx — file-by-file sweep, batch 86

### Files swept this batch

- `src/components/Config/System/AbnormalTriggerRulesSection.tsx`
  (231 lines) — the System › Abnormal Detection screen: the
  high-risk trigger-rule dictionary (same real `ps-defic-*` table/
  badge shape as `DeficienciesSection.tsx`'s own TypeDictionaryTab,
  per this file's own header comment), plus an enterprise-wide kill
  switch for the whole Abnormal Detection capability.

### What changed

- Added `useTranslation()` to the component.
- **CSS**: 5 inline `style={{}}` spots, none genuinely dynamic — all
  became classes. The kill-switch box's border/background is a real
  2-state toggle (per direct PS-105 guidance: disabling it here
  disables Abnormal Detection everywhere, overriding any facility's
  own setting), so it became a base `.ps-defic-enterprise-toggle-box`
  class plus a `--disabled` modifier — same base+modifier pattern
  this sweep has used for other 2-state toggles since batch 77 —
  rather than inline conditional styling. Its label/checkbox/text/
  hint spots became four more new classes in the same family
  (`.ps-defic-enterprise-toggle-label/-checkbox/-text/-hint`, the
  last with its own `--disabled` modifier for the warning-red hint
  color).
- Converted every on-screen string: title/subtitle, the kill-switch
  label and both its enabled/disabled hint messages, the tab
  description and Add button, the two lab-filter dropdown options,
  all seven table headers, the empty-state row, the Edit/Deactivate/
  Activate row buttons, and every modal label/placeholder/option/
  footer button.
- **`SEVERITIES` kept as-is** (`['Abnormal', 'Critical', 'Malignant']`)
  — the real, persisted `AbnormalSeverity` union sent to
  `abnormalTriggerRuleService`. A new `SEVERITY_LABEL_KEY` map sits
  alongside it purely for display, same key-map pattern as prior
  batches; `item.status` (`'Active' | 'Inactive'`) similarly stays a
  real data value, displayed through the existing `common.active`/
  `common.inactive` keys rather than a new local pair.
- **The duplicate-rule error message's conditional suffix**
  (`` already exists${draft.performingLabFacilityId ? ' for this
  performing lab' : ''} ``) became two full, separately-translated
  sentences (`errors.duplicateRuleGlobal`/`duplicateRuleForLab`)
  rather than string-splicing a translated fragment onto a
  translated stem — string concatenation across languages doesn't
  reliably produce grammatical sentences, so each complete sentence
  gets its own key, both taking the real, admin-entered
  `collision.fieldLabel` as an interpolated value.
- `labName()`'s own `'Global'` fallback (shown when a rule has no
  `performingLabFacilityId`) now calls `t()` directly, since that
  helper is itself defined inside the component and already has
  hook access — no restructuring needed, unlike batch 85's
  module-level helpers.
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6188 → 6230 keys (+42), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 86 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **41% of known scope**. Next up:
`ReleaseBufferSection.tsx` (232 lines) — the next-largest
unconverted file in `Config/System/`.

---

## Config/System/ReleaseBufferSection.tsx — file-by-file sweep, batch 87

### Files swept this batch

- `src/components/Config/System/ReleaseBufferSection.tsx` (232
  lines) — the System › Post-Sign-Out Release Buffer screen: the
  org-wide default for the hold window between sign-out and genuine
  external release, extracted from the now-deleted
  `Config/Integrations/LISSection.tsx` per this file's own header
  comment.

### What changed

- Added `useTranslation()` to the component.
- **CSS**: this file was a genuine outlier in the sweep — it never
  used the shared `.ps-conf-*`/`.ps-toggle-*` families at all, only
  raw inline style objects throughout its `Toggle`, `SettingRow`,
  and main component. All ~15 inline `style={{}}` spots became a new
  dedicated `.ps-rbuf-*` class family (title/subtitle/saved-banner,
  the setting-row layout plus its `--indented`/`--dimmed` modifiers,
  the toggle plus its `--on`/`--off`/`--disabled` modifiers and
  thumb `--on`/`--off` positions, and the number/text inputs plus
  their `--enabled`/`--disabled` modifiers) rather than force-fitting
  the existing shared `.ps-toggle-track` (different real colors —
  cyan/slate here vs. that family's green/grey — and this one has a
  genuine third, disabled state the shared toggle doesn't support at
  all).
- Converted every on-screen string: title/subtitle, all five setting
  rows' labels and descriptions (each label reused directly as its
  own toggle's `aria-label`, since duplicating the same text as a
  second literal would only risk them drifting apart across
  locales), the buffer-duration description's interpolated min/max
  values, and the "✓ Saved" confirmation.
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6230 → 6243 keys (+13), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 87 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **41% of known scope**. Next up:
`CytotechCompetencyAssignmentsSection.tsx` (235 lines) — the
next-largest unconverted file in `Config/System/`.

---

## Config/System/CytotechCompetencyAssignmentsSection.tsx — file-by-file sweep, batch 88

### Files swept this batch

- `src/components/Config/System/CytotechCompetencyAssignmentsSection.tsx`
  (235 lines) — the System › New Cytotechnologist Competency
  Assessments screen: the admin UI to create and manage CLIA '88
  Subpart M new-testing-personnel supervision assignments for newly
  hired Cytotechnologists, per this file's own header comment.

### What changed

- Added `useTranslation()` to the component.
- **CSS**: 6 inline `style={{}}` spots, all static spacing/font-weight
  — none genuinely dynamic. Five reused existing utilities directly
  (`.ps-mb-16`, `.ps-mb-8`, `.ps-mt-20`; a new `.ps-mt-32` was added
  to that same `.ps-mt-*` family for the outer wrapper's own
  margin-top, which no existing utility covered). The two repeated
  `fontWeight: 600` banner-label spots became one new
  `.ps-defic-review-banner-label` class alongside the existing
  `.ps-defic-review-banner`; the inline form's own `padding: 20,
  marginBottom: 20` combination became one new file-specific
  `.ps-cytocomp-form-wrap` class (no existing utility covers that
  exact pair).
- Converted every on-screen string: title/subtitle, the lab filter's
  label and "All Facilities" option, the New/Cancel toggle button,
  every form field label/placeholder/option in the inline create
  form, both "Active (n)"/"Completed (n)" banner labels, all table
  headers across both the active and completed tables, the Graduate
  Now button, and the three completed-reason labels.
- **The two "No … assignments" empty-state messages' conditional
  suffix** (`` assignments${facilityFilter ? ' for this facility' :
  ''} ``, appearing once for the active table and once for the
  completed table) became four full, separately-translated sentences
  (`table.noActiveAll`/`noActiveForFacility`/`noCompletedAll`/
  `noCompletedForFacility`) rather than string-splicing a translated
  fragment onto a translated stem — same reasoning as batch 86's
  duplicate-rule message split.
- **`progressLabel()`'s three template-literal branches** (case-count,
  duration-days, and the combined case_count+duration_days shape)
  converted to `t()` calls with interpolation
  (`progress.assessmentsCount`/`dayCount`/`combined`), each taking
  the real computed numbers (`casesReviewedCount`, `threshold`,
  `daysSince`) as interpolation values.
- **"All subspecialties"** (used both as the dropdown's default
  option and as `subspecialtyName()`'s own fallback for an
  unscoped assignment) shares one top-level `allSubspecialties` key
  rather than two, since it's the identical string in both places.
- Reused `common.cancel` for the New/Cancel toggle button's
  "Cancel" state rather than adding a local duplicate.
- No dedicated test file; no `t`-shadowing risk.

### Validation

- Locale parity: 6243 → 6280 keys (+37), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 88 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **42% of known scope**. Next up:
`GrossingRouteOverridesSection.tsx` (235 lines) — the next-largest
unconverted file in `Config/System/`.

---

## Config/System/GrossingRouteOverridesSection.tsx — file-by-file sweep, batch 89

### Files swept this batch

- `src/components/Config/System/GrossingRouteOverridesSection.tsx`
  (235 lines) — the System › Grossing Route Overrides screen:
  per-facility exceptions to which Grossing Route a specimen type
  gets, per this file's own header comment (S0-CF-12).

### What changed

- Added `useTranslation()` to both the `OverrideModal` and the main
  component. No inline `style={{}}` spots existed in this file — it
  was already fully class-based — so this batch is i18n-only, no CSS
  changes.
- Converted every on-screen string: title/subtitle, the Add Override
  button, all five table headers, the empty-state row, the
  Edit/Remove row buttons, every modal label/placeholder/footer
  button, and the "Required" validation message.
- **`GROSSING_TEMPLATES` converted to the same `{ id, labelKey }`
  shape** `DepartmentsSection.tsx` and `SpecimenCategoriesSection.tsx`
  already used for their own identical, independently-hardcoded copy
  of this same three-route list (per this file's own header comment
  — "same pragmatic hardcode-rather-than-fetch call, same reason" —
  and those two files' own conversions from earlier batches). Kept
  as its own per-file namespace
  (`grossingRouteOverridesSection.grossingTemplates.*`) rather than a
  shared one, consistent with how each of those files keeps its own
  independent copy of the list rather than importing a shared
  constant.
- Reused `common.required`/`common.active`/`common.inactive`/
  `common.edit`/`common.remove`/`common.cancel` throughout rather
  than adding local duplicates.
- **Renamed two local variables that collided with the `t` translation
  function**: the datalist's own `.map(t => ...)` callback parameter
  (renamed `st`) and `templateName()`'s own `GROSSING_TEMPLATES.find(t
  => ...)` callback parameter (renamed `gt`, matching the exact
  parameter name the sibling files above already use for this same
  lookup) — both were plain shadowing, not bugs, but avoiding them
  keeps every `t(...)` call in this file unambiguously the
  translation function.
- No dedicated test file.

### Validation

- Locale parity: 6280 → 6302 keys (+22), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 89 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **42% of known scope**. Next up:
`DeficienciesSection.tsx` (242 lines) — the next-largest unconverted
file in `Config/System/`.

---

## Config/System/DeficienciesSection.tsx — file-by-file sweep, batch 90

### Files swept this batch

- `src/components/Config/System/DeficienciesSection.tsx` (242 lines)
  — the System › Specimen Deficiencies screen: one section with two
  tabs (Deficiency Types / Resolution Types) sharing a single generic
  `TypeDictionaryTab` component, per this file's own header comment.

### What changed

- No inline `style={{}}` spots existed in this file — its own header
  comment already states it's "Built with CSS classes (pathscribe.css),
  not inline style objects" — so this batch is i18n-only, no CSS
  changes.
- **`TypeDictionaryTab`'s prop signature changed from `{ service, noun,
  addLabel, showLevel }` to `{ service, tabKey: 'deficiencyType' |
  'resolutionType', showLevel }`.** The original English built every
  sentence from the generic `noun`/`addLabel` strings via unsafe
  template interpolation — `` `Loading ${noun.toLowerCase()}s...` ``,
  `` `No ${noun.toLowerCase()}s match.` ``, `` `Add ${noun}` ``/
  `` `Edit ${noun}` `` — which doesn't translate safely: German
  capitalizes nouns mid-sentence, so a translated noun's lowercase form
  isn't `translatedNoun.toLowerCase()`, and grammatical case/word order
  around an interpolated noun varies by language in ways string
  splicing can't reproduce. Replacing the string props with a typed
  discriminant (`tabKey`) means every sentence in the component is now
  a fully-authored, per-locale lookup
  (`deficienciesSection.${tabKey}.*`) rather than an English template
  plus a noun.
- Converted every remaining on-screen string: the two tab-bar button
  labels, section title/subtitle, the lab filter's "All Labs"/"Global
  only" options, the "Global" fallback in `labName()`, all five table
  headers, the three level-value labels (Case/Requisition, Specimen,
  Both), every modal field label/placeholder/option/footer button, and
  the Active/Inactive status text (now sharing `common.active`/
  `common.inactive`).
- **Noun-independent duplicate-name error split into two full,
  separately-translated sentences** rather than one template with a
  spliced-in conditional fragment — the original was
  `` `"${collision.name}" already exists${draft.performingLabFacilityId
  ? ' for this performing lab' : ''}.` ``, now
  `deficienciesSection.duplicateErrorGlobal` /
  `duplicateErrorForLab`, both taking `{{name}}` via i18next
  interpolation. Kept as a single shared key pair (not scoped under
  either `deficiencyType`/`resolutionType` namespace) since its wording
  never mentions either noun — same two-full-sentence pattern used in
  batch 86 (`AbnormalTriggerRulesSection.tsx`).
- **Added a local `deficienciesSection.activate` key** — `common.
  deactivate` already exists but `common.activate` doesn't (same gap
  hit in batch 86), so "Activate" reuses the same local-key precedent
  rather than adding a `common.activate` this sweep doesn't own.
- Reused `common.required`/`common.active`/`common.inactive`/
  `common.edit`/`common.cancel`/`common.deactivate` throughout rather
  than adding local duplicates.
- Checked for `t`-shadowing: none — every `.map()`/`.find()` callback
  in this file already used `l`/`i`/`item`, never `t`.
- No dedicated test file.

### Validation

- Locale parity: 6302 → 6345 keys (+43: 42 from the new
  `deficienciesSection` namespace, +1 for the `activate` key added
  after the initial merge), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 90 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **43% of known scope**. Next up:
`WorkstationGroupsSection.tsx` (251 lines) — the next-largest
unconverted file in `Config/System/`.

---

## Config/System/WorkstationGroupsSection.tsx — file-by-file sweep, batch 91

### Files swept this batch

- `src/components/Config/System/WorkstationGroupsSection.tsx`
  (251→283 lines) — the System › Workstation Groups screen (PS-289):
  group real ScanStations by discipline and functional area, scope
  them to a facility, and set what loads automatically when a
  technician selects one.

### What changed

- No inline `style={{}}` spot existed except one (the AUTOPSY
  "no functional areas yet" hint, amber-colored) — replaced with a new
  shared modifier class **`.ps-conf-error-text--warning`** (added
  directly next to the existing shared `.ps-conf-error-text` base
  class in `pathscribe.css`, since it's a generic reusable variant of
  a class already used across many `Config/System/` files, not a
  file-specific addition).
- **Real, persisted enum values kept untranslated as data, only their
  display labels translated** — same split established in earlier
  batches:
  - `QcEnforcementMode` ('Enforced'/'Auto-Resolve'/'Hybrid') — added
    `QC_MODE_LABEL_KEY: Record<QcEnforcementMode, string>`, the same
    `{ value, labelKey }` shape `StainDictionarySection.tsx` (batch
    60) already used for this exact type. Applied to both the modal's
    dropdown and the table's QC Mode column.
  - `WorkstationDiscipline` ('HISTOLOGY'/'CYTOLOGY'/'MOLECULAR'/
    'AUTOPSY') and the functional-area values in
    `FUNCTIONAL_AREAS_BY_DISCIPLINE` were **deliberately left
    untranslated on screen** — this file's own header comment states
    Histology "reuses the exact, already-established
    SCAN_STATION_WORKFLOW_STAGES vocabulary... verbatim," and that
    exact vocabulary was already left untranslated as a real schema/
    data-key identifier in `ScanStationsSection.tsx` (batch 79). Since
    it's the identical real data, not independent UI copy, this batch
    keeps that same precedent rather than translating the same values
    two different ways in two different screens.
- Converted every remaining on-screen string: section title/subtitle,
  the Add Workstation Group button (reused for the top button, modal
  header, and modal footer button — identical text in all three
  places), the search placeholder, all six table headers, the
  empty-state row, every modal field label/placeholder/option
  (including the "— Not set —"/"— None —" dropdown placeholders), the
  AUTOPSY hint text, the validation messages, and the Active/Inactive
  toggle (now sharing `common.active`/`common.inactive`).
- **Caught and fixed a real display bug while converting**: several
  em-dash separators in this file were written as a literal
  `—` — six raw characters (backslash, u, 2, 0, 1, 4) — inside
  JSX text content rather than inside a JS string literal, so the
  escape was never actually interpreted and would have rendered
  literally as `—` on screen instead of an em dash. Every
  instance that got routed through a translated string is fixed as a
  side effect (the locale JSON files store real em-dash characters);
  the one instance NOT going through translation (the raw,
  untranslated `{discipline} — {functionalArea}` table-cell
  separator) is fixed directly to a real em-dash character. The one
  instance already inside a genuine JS string literal (`'—'` for
  the QC Mode column's empty-state placeholder) was already correct
  and untouched.
- Reused `common.required`/`common.active`/`common.inactive`/
  `common.edit`/`common.cancel`/`common.deactivate`/
  `common.reactivate` throughout rather than adding local duplicates.
- Checked for `t`-shadowing: none — every `.map()`/`.find()` callback
  in this file already used `d`/`a`/`l`/`g`/`m`, never `t`.
- No dedicated test file.

### Validation

- Locale parity: 6345 → 6379 keys (+34: 33 from the initial
  `workstationGroupsSection` merge, +1 for a `noAreasError` key missed
  on the first pass and added immediately after — a distinct string
  from the placeholder-option text `noAreasAvailable`, caught before
  shipping), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 91 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **43% of known scope**. Next up:
`CassetteLabelLayoutEditor.tsx` (259 lines) — the next-largest
unconverted file in `Config/System/`.

---

## Config/System/CassetteLabelLayoutEditor.tsx — file-by-file sweep, batch 92

### Files swept this batch

- `src/components/Config/System/CassetteLabelLayoutEditor.tsx`
  (259→268 lines) — the cassette-label physical-layout editor with
  live SVG preview and real test-print flow, embedded in
  `PrintSettingsSection.tsx`.

### What changed

- No inline `style={{}}` spots existed in this file — no CSS changes.
- **`resolveCassetteLabelFitWarning.ts` (its only consumer is this one
  component) changed to return a translation descriptor instead of a
  pre-built English sentence** — `CassetteLabelFitWarning.message:
  string` replaced with `{ kind, requiredMm, configuredMm }`, since
  this is a pure, non-hook function with no access to `useTranslation`
  and its caller needs a translatable sentence, not a fixed English
  one. Same "return a descriptor, not English text" pattern
  `ResearchFeedSection.tsx`'s own module-level `stalenessStatus()`
  helper established (batch 85). Its own test file
  (`resolveCassetteLabelFitWarning.test.ts`) only ever asserted on
  `.kind`, never `.message`, so nothing there needed updating.
- `ANGLE_PRESETS` converted to the established `{ id, labelKey }`
  shape (each preset's descriptive button text translated; the
  underlying `widthMm`/`heightMm` values it sets are unaffected real
  data).
- Converted every remaining on-screen string: card title/description,
  the four dimension field labels, both warning sentences (now
  interpolated with `{{required}}`/`{{configured}}`), the "no
  warnings" OK message, the live-preview caption, the test-print
  section's title/description, the "no printer profiles configured"
  placeholder, the test GTIN input placeholder, the Sending…/Send Test
  Print button, and the test-print success message (interpolated with
  the real printer's `{{model}}`/`{{printerId}}`).
- **Deliberately left untranslated, with a code comment explaining
  why**: the test-print *failure* message, which comes from
  `printCassetteLabel`'s own result
  (`utils/labels/printCassetteSlideLabel.ts`) — a shared utility whose
  other real consumers (`EmbeddingStationPage`, `SynopticReportPage`)
  sit well outside this file-by-file `Config/System/` sweep's own
  scope, the same boundary this sweep has kept since batch 79 (leaving
  `ScanStationsSection.tsx`'s shared `SCAN_STATION_WORKFLOW_STAGES`
  vocabulary untouched for the same reason).
- Checked for `t`-shadowing: none — every `.map()`/`.find()` callback
  in this file already used `preset`/`p`/`w`/`i`/`line`, never `t`.
- No dedicated test file for the component itself.

### Validation

- Locale parity: 6379 → 6398 keys (+19), exact match across en/fr/de/
  nl/ko.
- `tsc --noEmit`: clean (confirms the `resolveCassetteLabelFitWarning.ts`
  interface change didn't break its one caller).
- Full suite: 499/499 test files, 4329/4329 tests passing (including
  `resolveCassetteLabelFitWarning.test.ts`, unaffected since it only
  ever asserted on `.kind`).

### Progress estimate

Batch 92 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **44% of known scope**. Next up:
`AssetLocationDictionarySection.tsx` (261 lines) — the next-largest
unconverted file in `Config/System/` (tied with
`FppeAssignmentsSection.tsx`, also 261 lines).

---

## Config/System/AssetLocationDictionarySection.tsx — file-by-file sweep, batch 93

### Files swept this batch

- `src/components/Config/System/AssetLocationDictionarySection.tsx`
  (261→290 lines) — the governed physical/asset-location dictionary
  (mortuary storage, workstations, archive shelves) plus its Mortuary
  Storage Occupancy tab, per this file's own header comment.

### What changed

- No inline `style={{}}` spots existed in this file — no CSS changes.
- `LOCATION_TYPE_LABEL: Record<AssetLocationType, string>` converted
  to the established `{ value, labelKey }` split —
  `LOCATION_TYPE_LABEL_KEY` — so the real, persisted enum values
  (`storage_slot`, `archive_shelf`, etc.) stay as data while their
  display labels translate.
- **Fixed a real `t`-shadowing risk this file already had before this
  batch's own `useTranslation()` was added**: the location-type
  dropdown's own `.map(t => ...)` callback used `t` as its parameter
  name — renamed to `lt`, since a `useTranslation()` `const { t } = ...`
  now exists in the very same component scope.
- **Status text expanded from a 2-way to a correct 3-way translation**:
  `AssetLocationEntry.status` is `'Active' | 'Inactive' | 'Unverified'`
  (the same real shape `DepartmentsSection.tsx`/`PhysiciansSection.tsx`
  already use, per this file's own header comment) — the dictionary
  table's status cell previously rendered the raw `{l.status}` word
  directly; now uses `common.active`/`common.inactive` plus a new
  local `assetLocationDictionarySection.table.statusUnverified` key,
  the same precedent `DepartmentsSection.tsx` already set for this
  exact third status value.
- Converted every remaining on-screen string: section title/subtitle,
  the Add Location button (top button and modal footer share the
  text), both tab-bar buttons, the search placeholder, both tables'
  headers, both empty-state rows, the Verify button, the Auto-created
  note (with/without a trailing timestamp — two keys, matching
  `DepartmentsSection.tsx`'s own `autoCreated`/`autoCreatedWithDate`
  split), the Occupied/Available occupancy status text, both loading
  messages, and every modal field label/placeholder/option/footer
  button.
- **Deliberately kept the schema/data-key identifiers `MaterialLocation`
  and `storage_slot` untranslated inside otherwise-translated
  sentences** (the subtitle and the occupancy empty-state message) —
  real type/field names from this app's own codebase, not display
  copy, consistent with how ticket IDs and PMIDs stay literal inside
  translated text elsewhere in this sweep.
- Reused `common.active`/`common.inactive`/`common.edit`/
  `common.cancel` throughout rather than adding local duplicates.
- No dedicated test file.

### Validation

- Locale parity: 6398 → 6439 keys (+41: 40 from the initial
  `assetLocationDictionarySection` merge, +1 for the
  `statusUnverified` key caught and added right after), exact match
  across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 93 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **44% of known scope**. Next up:
`FppeAssignmentsSection.tsx` (261 lines) — the next-largest
unconverted file in `Config/System/`.

---

## Config/System/FppeAssignmentsSection.tsx — file-by-file sweep, batch 94

### Files swept this batch

- `src/components/Config/System/FppeAssignmentsSection.tsx`
  (261→267 lines) — Focused Professional Practice Evaluation
  proctoring assignments for new hires, with Active/Completed sections
  and a facility filter.

### What changed

- **Six inline `style={{}}` spots removed, all covered by existing
  shared utility classes already in `pathscribe.css` — no new CSS
  needed except one**: `ps-mb-16` (the facility filter row and the
  "+ New FPPE Assignment" button), `ps-mb-8`/`ps-mt-20 ps-mb-8` (the
  Active/Completed section banners), and
  `.ps-defic-review-banner-label` (the bold count text inside each
  banner — the exact class `CytotechCompetencyAssignmentsSection.tsx`
  added in batch 88 for this identical pattern). The one new class,
  **`.ps-fppe-form-wrap { padding: 20px; margin-bottom: 20px; }`**,
  mirrors that same batch's `.ps-cytocomp-form-wrap` for the inline
  "New Assignment" form card — kept as its own class since each file
  keeps its own independent copy of this pattern rather than sharing
  one, consistent with this sweep's established per-file namespace
  convention for duplicated hardcoded patterns.
- Converted every on-screen string: the 🪪-prefixed page title (glyph
  kept literal, "FPPE" kept as a literal acronym inside each locale's
  translated phrase) and subtitle, the facility filter, the New FPPE
  Assignment button, the entire inline form (all seven field labels,
  the three shared "Select…" placeholders, the three end-condition
  radio-style dropdown options, both threshold labels, the Create
  Assignment button), both section banners (interpolated with
  `{{count}}`), both tables' headers, both empty-state rows (the
  optional " for this facility" suffix split into full,
  separately-translated global/for-facility sentence pairs — the same
  two-full-sentence pattern established in batch 86 — rather than
  splicing a translated fragment onto a translated stem), the Graduate
  Now button, and the three completed-reason values.
- **`endConditionLabel()`, a plain helper defined inside the component
  body (not a module-level function), calls `t()` directly through
  closure** — converted its three dynamic progress strings (case-count,
  duration, and the combined "either" form) to interpolated
  `t(...)` calls rather than needing the translation-descriptor
  indirection module-level helpers elsewhere in this sweep have
  required.
- **Reused the same translated string across multiple contexts where
  the English text was already identical**, to avoid local
  duplication: `facilityLabel` ("Performing Lab") serves the filter
  label, the form field label, and both tables' Performing Lab column
  headers; `form.provisionalHireLabel`/`form.proctorLabel` double as
  their own tables' column headers; `form.endConditionCaseCount`/
  `form.endConditionDuration` ("Case count reached"/"Duration
  elapsed") double as two of the three completed-reason values, since
  the original code's own two ternary branches already used the exact
  same English text as the end-condition dropdown options.
- No `t`-shadowing risk — every `.map()`/`.filter()` callback in this
  file already used `u`/`l`/`s`/`a`, never `t`.
- No dedicated test file.

### Validation

- Locale parity: 6439 → 6474 keys (+35), exact match across en/fr/de/
  nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 94 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **45% of known scope**. Next up:
`NcciEditRulesSection.tsx` (263 lines) — the next-largest unconverted
file in `Config/System/`.

---

## Config/System/NcciEditRulesSection.tsx — file-by-file sweep, batch 95

### Files swept this batch

- `src/components/Config/System/NcciEditRulesSection.tsx`
  (263→281 lines) — the NCCI PTP bundling-edit rules screen: quarterly
  CMS spreadsheet import plus a single-pair correction modal, both
  going through the same real Four-Eyes approval process.

### What changed

- Two inline `style={{ color: '#f59e0b' }}` spots replaced with the
  existing shared `.ps-conf-hint--warning` modifier class (already in
  `pathscribe.css` — an exact color match) — no new CSS needed.
- `MODIFIER_LABEL: Record<..., string>` converted to the established
  `{ value, labelKey }` split — `MODIFIER_LABEL_KEY` — so the real,
  persisted modifier-indicator values (`'0'`/`'1'`/`'9'`) stay as data
  while their display labels translate.
- **`ncciEditUtils.ts`'s `parseNcciUploadRows()` (its only consumer is
  this one component) changed to return translation descriptors
  instead of pre-built English sentences** —
  `ParsedNcciUpload.problems: string[]` replaced with a typed
  `NcciUploadProblem[]` (`{ row, kind, columnOneCode?, columnTwoCode?,
  modifierRaw? }`), since this is a pure, non-hook function with no
  access to `useTranslation`. Same pattern
  `resolveCassetteLabelFitWarning.ts` established in batch 92. No test
  file existed for this util, so nothing needed updating there.
- **Pluralized every count-dependent string with i18next's `_one`/
  `_other` key-suffix convention** (`pendingCount`, `currentLabel`,
  `upload.rowsSkipped`, `upload.submitForApproval`) — the same real,
  already-established mechanism this codebase's own
  `pendingApprovalSection.codeCount_one`/`_other` keys use, rather than
  the manual `condition ? '' : 's'` string-splicing the original code
  used (which doesn't generalize to French/German/Dutch/Korean plural
  rules). One of these four (`submitForApproval`) wasn't actually
  pluralized in the original English text (`` `(${length} pairs)` ``
  always said "pairs" regardless of count) — properly pluralized here
  at effectively no extra cost, since the mechanism was already in use
  for the other three.
- **The "Current: `<strong>{quarterVersion}</strong>` — N pairs,
  imported…" sentence converted to a `<Trans>` component** (`import {
  useTranslation, Trans } from 'react-i18next'`, the same import
  `CaseMaskConfigSection.tsx`/`CasePoolAssignmentSection.tsx` already
  use) — `components={{ bold: <strong /> }}` keeps the bold styling
  around the real, interpolated quarter version while the surrounding
  sentence translates, and `count={currentImport.pairCount}` drives
  the `_one`/`_other` plural selection directly.
- Converted every remaining on-screen string: section title/subtitle,
  the pending-approval hint, the synthetic-seed warning, both
  Download Template/Upload Spreadsheet buttons, the Quarter Version
  field label/placeholder, all upload-row problem messages (including
  the `(blank)` placeholder for an empty modifier indicator), both
  tables' four/five headers, the empty-state row, the Edit button, and
  every modal field label/hint/footer button.
- **Deliberately left `TEMPLATE_EXAMPLE_ROWS` (the downloadable CSV
  template's column headers and example row) untouched** — exported
  CSV content stays English per this sweep's standing convention.
- **Deliberately kept the cross-reference "Pending Billing Rule
  Approvals" as ordinary translated prose** (not a shared key tied to
  `PendingApprovalSection.tsx`, which isn't converted yet and uses a
  different nested key shape) — each locale's sentence names that
  other screen naturally in its own words, the same way this sweep has
  handled other plain-text screen references.
- No `t`-shadowing risk — every `.map()` callback in this file already
  used `k`/`p`/`i`, never `t`.
- No dedicated test file for the component or for `ncciEditUtils.ts`.

### Validation

- Locale parity: 6474 → 6510 keys (+36), exact match across en/fr/de/
  nl/ko.
- `tsc --noEmit`: clean (confirms the `ncciEditUtils.ts` interface
  change didn't break its one caller).
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 95 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **45% of known scope**. Next up:
`CassetteColorsSection.tsx` (273 lines) — the next-largest unconverted
file in `Config/System/` (tied with `PrinterProfilesSection.tsx`, also
273 lines).

---

## Config/System/CassetteColorsSection.tsx — file-by-file sweep, batch 96

### Files swept this batch

- `src/components/Config/System/CassetteColorsSection.tsx`
  (274 lines) — the two-layer color-key dictionary + per-color
  fallback-policy settings screen that `CassetteRoutingRulesSection.tsx`
  and `CassetteLabelLayoutEditor.tsx` reference by key.

### What changed

- **Removed every inline `style={{}}` except the one genuinely dynamic
  case** — the table swatch's `background: c.hexCode` — matching this
  exact sweep's own long-standing justified-exception pattern (fixed
  geometry lives in CSS, only real admin-configured color data stays
  inline). All the rest were reused from existing classes:
  - `.ps-flex-row-gap-8` (already in `pathscribe.css`) for both the
    swatch+name table cell and the hex-input modal row.
  - `.ps-cassette-color-swatch` — added for `CassetteColorControl.tsx`
    on `SynopticReportPage`, whose own code comment explicitly says it
    was modeled on "CassetteColorsSection.tsx's own table" — reused
    here for the real thing it was modeled on, for the fixed
    14×14/circle/border swatch geometry.
  - `.ps-conf-radio-group` / `.ps-conf-radio-label` / `.ps-conf-
    option-text` (the same shared radio pattern `PrintSettingsSection.
    tsx` already uses) replacing the file's own one-off inline-styled
    radio row and labels.
  - `.ps-rvu-muted-sm` (`font-size: 12px; color: #94a3b8` — an exact
    match, first defined for `RvuCodeMapSection.tsx`) for the
    fallback-policy table cell.
- **Two small, genuinely reusable additions to `pathscribe.css`**:
  `.ps-conf-input--flex { flex: 1; }` next to `.ps-conf-input--error`
  (any `ps-conf-input` sharing a flex row can reuse this — the same
  "generic modifier lives next to its shared base class" placement
  this sweep used for `.ps-conf-hint--warning` and `.ps-conf-error-
  text--warning`), and a file-specific `.ps-cassclr-color-input`
  (40×34, borderless) under a "batch 96 additions" block, since no
  existing native-color-picker class (`.ps-rd-color-picker`, `.ps-
  type-color-input`) shares this file's sizing.
- Converted every remaining on-screen string: section title/subtitle,
  the Add Color button, the lab filter (`All Labs`/`Global only…`),
  all six table headers, the fallback-policy cell text (`Auto → {{name}}`
  / `Prompt technician`), the empty-state row, Edit/Deactivate/
  Reactivate (via the existing `common.*` keys), the loading state, and
  every modal field label/placeholder/hint/error/button.
- **Two-full-sentence pattern applied to the key/name duplicate-
  collision errors** (`keyCollision`/`keyCollisionForLab`,
  `nameCollision`/`nameCollisionForLab`) — selected by a ternary on
  `draft.performingLabFacilityId` in code, rather than splicing a
  translated `" for this performing lab"` fragment onto the end of an
  already-translated sentence.
- No `t`-shadowing risk — this file's only `.map()` callbacks use
  `c`/`l`/`b`, never `t`.
- No dedicated test file for the component.

### Validation

- Locale parity: 6510 → 6552 keys (+42), exact match across en/fr/de/
  nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 96 of an estimated ~210 batches to clear the currently known/
flagged queue — roughly **46% of known scope**. Next up:
`PrinterProfilesSection.tsx` (273 lines) — the file this batch's own
size-tiebreak deferred.

---

## Config/System/PrinterProfilesSection.tsx — file-by-file sweep, batch 97

### Files swept this batch

- `src/components/Config/System/PrinterProfilesSection.tsx`
  (274 lines) — PS-51 Section 2's printer capability/profile registry:
  add/edit modal plus the filtered profile table.

### What changed

- `VENDOR_LABELS`/`BRIDGE_LABELS: Record<..., string>` converted to
  the established `XXX_LABEL_KEY` split (`VENDOR_LABEL_KEY`,
  `BRIDGE_LABEL_KEY`) — the real, persisted `PrinterVendor`/
  `PrinterBridgeType` enum values stay as data; only their display
  labels translate. `BRIDGE_LABEL_KEY`'s own long, researched labels
  (each with its own parenthetical rationale) translate in full, same
  as every other on-screen string.
- **The one inline style (`style={{ width: 560 }}` on the modal) was
  an exact match for the already-existing `.ps-ms-modal--medium`
  class** (`width: 560px`, defined for other modals in this same
  family) — no new CSS needed, just swapped the inline style for the
  existing modifier class.
- Converted every remaining on-screen string: section title/subtitle,
  the Add Printer Profile button, every modal field label/placeholder/
  hint/tooltip (Bridge Type, Facility, and DataMatrix Module Size all
  keep their explanatory `title` tooltips, now translated), the
  Global-facility option/fallback label, all nine table headers, the
  GS1/DataMatrix support cell's four-way text (`✓ Both` / `DataMatrix
  only` / `GS1 only` / `—`), Edit/Remove (`common.edit`/
  `common.remove`), Active/Inactive (`common.active`/
  `common.inactive`), Cancel (`common.cancel`), and the modal's own
  Add Profile/Save Changes buttons.
- **Two-full-sentence pattern for the empty-state row** (`No printer
  profiles for this facility.` / `No printer profiles yet.`) —
  selected by a ternary on `selectedFacilityId` in code, rather than
  splicing a translated `"for this facility"` fragment into an
  already-translated sentence.
- No `t`-shadowing risk — this file's `.map()` callbacks use `v`/`b`/
  `l`/`p`, never `t`.
- No dedicated test file.

### Validation

- Locale parity: 6552 → 6611 keys (+59), exact match across en/fr/de/
  nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 97 of an estimated ~210 batches to clear the currently known/
flagged queue. **Correction to the size-ordered queue tracking**: a
re-scan of `Config/System/*.tsx` for files still missing
`useTranslation` turned up four files larger than the 273-line
tiebreak batches 96/97 just cleared — they'd fallen out of the
running size list this README was tracking turn-to-turn.  Remaining
in `Config/System/`, largest first: `ModifierDictionarySection.tsx`
(333 lines), `ContainerTypesSection.tsx` (322 lines),
`CrosswalkSection.tsx` (320 lines), `ReagentLotsSection.tsx`
(319 lines), `ExternalResourcesSection.tsx` (276 lines), and the
non-UI `useSpecimenDictionary.tsx` hook (101 lines, to be checked for
on-screen strings when its turn comes rather than assumed empty).
Next up: `ModifierDictionarySection.tsx`.

---

## Config/System/ModifierDictionarySection.tsx — file-by-file sweep, batch 98

### Files swept this batch

- `src/components/Config/System/ModifierDictionarySection.tsx`
  (337 lines) — the BYOL CPT modifier registry: quarterly CSV
  upload/preview/import plus a single-entry correction modal, both
  through the real Four-Eyes approval process. Explicitly mirrors
  `RvuCodeMapSection.tsx`'s own established upload/preview/import
  pattern, so this batch reused that sibling file's own i18n key
  names (`pendingApproval_one/_other`, `toast.entrySubmitted`/
  `uploadSubmitted`, `activeVersion`/`olderVersions`/`upload`
  groupings) wherever the on-screen text matched, rather than
  inventing parallel names for the same shapes.
- `src/services/billing/cptModifierDictionary.ts` — its
  `parseModifierUploadRows()` (sole consumer: this component).

### What changed

- **`cptModifierDictionary.ts`'s `parseModifierUploadRows()` changed
  to return translation descriptors instead of a pre-built English
  sentence** — `ParsedModifierUpload.problems: string[]` replaced
  with `ModifierUploadProblem[]` (`{ row }`), since this is a pure,
  non-hook function with no access to `useTranslation`. Same pattern
  `resolveCassetteLabelFitWarning.ts`/`ncciEditUtils.ts` established
  in batches 92/95. No test file existed for this util.
- **Found and fixed a real `t`-shadowing bug this batch's own
  `useTranslation()` addition would have introduced**: the toast
  auto-dismiss effect declared `const t = setTimeout(...)`, which
  would have silently shadowed the real translation `t` for the rest
  of that closure. Renamed to `const timer = setTimeout(...)` — no
  behavior change, since nothing in that scope calls `t()`.
- Converted every remaining on-screen string: section title/subtitle,
  Download Template/Upload Spreadsheet buttons, the pluralized
  pending-approval hint, the active-version eyebrow and its
  Effective-date-plus-license-status line (two full sentences,
  `effectiveLicensed`/`effectiveSynthetic`, selected by ternary — no
  splicing), both the active-version and upload-preview tables'
  headers, the Show/Hide-older-versions toggle (also two full
  pluralized sentences per direction, `toggleHide`/`toggleShow`, not
  a spliced "▾ Hide"/"N versions" combination), the older-versions
  table's License/Approval-Status cell text (`rejected`/
  `rejectedWithReason` as two full sentences, same no-splicing rule),
  the upload modal's fields/checkbox/disclosure/buttons, the entry
  modal's fields/disclosure/buttons, both submit-toast messages, and
  all four upload-time error messages (invalid file type, no rows
  found, read failure, missing-license confirmation).
- **Deliberately left `TEMPLATE_EXAMPLE_ROWS` and `DEFAULT_CPT_MODIFIERS`
  untouched** — the downloadable CSV template stays English per this
  sweep's standing convention, and `DEFAULT_CPT_MODIFIERS`'s synthetic
  `"Modifier {code}"` placeholder descriptions are real dictionary
  content (a stand-in for real, licensed AMA text), not UI chrome.
  The default upload-label text (`` `Upload — ${file.name...}` ``) was
  also left untouched, matching `RvuCodeMapSection.tsx`'s own
  identical, already-established choice for the same pattern.
- No dedicated test file for the component or for
  `cptModifierDictionary.ts`.

### Validation

- Locale parity: 6611 → 6659 keys (+48), exact match across en/fr/de/
  nl/ko.
- `tsc --noEmit`: clean (confirms the util's interface change didn't
  break its one caller).
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 98 of an estimated ~210 batches to clear the currently known/
flagged queue. Remaining in `Config/System/`, largest first:
`ContainerTypesSection.tsx` (322 lines), `CrosswalkSection.tsx`
(320 lines), `ReagentLotsSection.tsx` (319 lines),
`ExternalResourcesSection.tsx` (276 lines), and the non-UI
`useSpecimenDictionary.tsx` hook (101 lines). Next up:
`ContainerTypesSection.tsx`.

---

## Config/System/ContainerTypesSection.tsx — file-by-file sweep, batch 99

### Files swept this batch

- `src/components/Config/System/ContainerTypesSection.tsx`
  (325 lines) — the Container Type Dictionary's admin CRUD screen,
  same table+modal pattern as `DepartmentsSection.tsx`.

### What changed

- **Found and fixed a second, independent occurrence of the batch-91
  literal-`—` display bug**: `<option value="">— None (dry
  / bench-filled) —</option>` had the literal six-character
  sequence `—` sitting in JSX text (not inside a string
  literal), so it was rendering as literal backslash-u-2014 text
  instead of an em dash. Fixed with a raw-bytes Python script (same
  approach as batch 91), since the Edit tool's own string matching
  silently converts a typed `—` into a real em dash before it
  reaches the file, which makes the literal-backslash text impossible
  to target with a normal old-string/new-string edit.
- **Found and fixed extensive, real `t`-shadowing this batch's own
  `useTranslation()` addition would have introduced**: this file
  independently used `t` as its `ContainerType`-typed loop/parameter
  variable name in six different places (`types.filter(t => ...)`,
  `.map(t => t.id === ... ? res.data : t)`, `handleToggleStatus(t:
  ContainerType)`, and the table's own `filtered.map(t => ...)` row
  renderer, whose body needed real `t()` calls). Renamed every one of
  these to `ct` — this wasn't just the usual precaution (see batch
  93's `lt` rename): the table row renderer's `t` would have
  genuinely broken every `t()` call inside that row once
  `useTranslation()` was added, not merely risked it.
- `CATEGORY_OPTIONS: { id, label }[]` converted to the established
  `XXX_LABEL_KEY` split (`CATEGORY_LABEL_KEY` + a plain `CATEGORY_IDS`
  array for iteration) — the real, persisted `ContainerCategory`
  values stay as data; only their display labels translate.
- Converted every remaining on-screen string: section title/subtitle,
  the Add Container Type button, the search placeholder, both filter
  dropdowns (status and lab), all six table headers, the no-mapping
  em dash, Edit/Reactivate/Deactivate (`common.*`), Duplicate (reused
  the existing `common.duplicate` rather than adding a redundant
  local key — added and then removed a `duplicateButton` key mid-
  batch once the existing common key was found), the empty-state row,
  and every modal field label/placeholder/hint/button, including the
  two-full-sentence pattern for both duplicate-collision errors
  (`nameCollision`/`nameCollisionForLab`,
  `aplisMappingCollision`/`aplisMappingCollisionForLab`).
- No inline styles were present in this file to begin with.
- No dedicated test file.

### Validation

- Locale parity: 6659 → 6709 keys (+50 net, after adding then
  removing the unused `duplicateButton` key), exact match across en/
  fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 99 of an estimated ~210 batches to clear the currently known/
flagged queue. Remaining in `Config/System/`, largest first:
`CrosswalkSection.tsx` (320 lines), `ReagentLotsSection.tsx`
(319 lines), `ExternalResourcesSection.tsx` (276 lines), and the
non-UI `useSpecimenDictionary.tsx` hook (101 lines). Next up:
`CrosswalkSection.tsx`.

---

## Config/Integrations/CrosswalkSection.tsx — file-by-file sweep, batch 100

### Files swept this batch

- `src/components/Config/System/CrosswalkSection.tsx` (its own file
  header names it `Config/Integrations/CrosswalkSection.tsx`, but it
  lives in and was queued from `Config/System/`) (325 lines) — the
  Specimen Code Crosswalk admin screen: CSV import/export, an inline
  add-mapping panel, and two independent review banners (pending
  auto-learned entries in this table vs. upstream unmapped-order-code
  interface exceptions with no entry at all).

### What changed

- Converted every remaining on-screen string: section title/subtitle,
  Export/Import Spreadsheet/Add Mapping buttons, the import-preview
  summary line, both review banners, all four table headers, the
  empty-state row, the Source column's two states, and the inline
  add panel's every field/placeholder/error/button.
- **Two independent, correctly-scoped pluralization jobs, not
  spliced fragments**:
  - The import-preview summary combines a pluralized row count with
    an always-present update/new parenthetical and an optional
    skipped-with-errors clause. Built as two full `_one`/`_other`
    pairs (`summaryNoErrors`, `summaryWithErrors`) selected in code by
    whether any row errored, rather than splicing a translated
    "X skipped..." fragment onto the end of a separately-pluralized
    base sentence.
  - The auto-learned-entries banner's `entry was`/`entries were` verb
    agreement and the unmapped-stub banner's `code`/`codes` — both
    became ordinary `_one`/`_other` pairs instead of the original's
    manual `pendingCount === 1 ? 'y was' : 'ies were'` string
    splicing (which also doesn't generalize to French/German/Dutch/
    Korean plural rules, same reasoning as every prior pluralization
    fix this sweep has made).
  - The `(blank)` placeholder used when a CSV import row is missing
    its facility or code name also translates now, matching the
    precedent from batch 95's `(blank)` placeholder in
    `NcciEditRulesSection.tsx`.
- **A native browser `alert()` call, not JSX, still carries real
  on-screen text the person reads** (the invalid-file-type message on
  a bad spreadsheet upload) — translated like any other user-facing
  string, since the sweep's scope is what the person sees, not how
  it's rendered.
- **Deliberately left `handleDownloadCrosswalk`'s CSV row-building
  object (`{ Facility, ExternalCode, ResolvesTo, Source: 'Auto-
  learned' | 'Admin-confirmed' }`) and `handleXwalkFileUpload`'s CSV
  column-name matching (`get(row, 'Facility', 'Client', ...)`)
  entirely untouched** — both are CSV export/import column-header and
  cell-value identifiers, not on-screen UI text, per this sweep's
  standing convention.
- Passed translated `placeholder`/`noMatchText` props to the shared
  `SearchableCombobox` component at this call site — the component
  itself (used by other, out-of-scope consumers too) keeps its own
  hardcoded English defaults, but a prop this file supplies is this
  file's own on-screen text to convert.
- No `t`-shadowing risk — this file's loop/parameter variables are
  `e`/`c`/`d`/`r`/`i`, never `t`.
- No dedicated test file.

### Validation

- Locale parity: 6709 → 6750 keys (+41), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 100 of an estimated ~210 batches to clear the currently known/
flagged queue. Remaining in `Config/System/`, largest first:
`ReagentLotsSection.tsx` (319 lines), `ExternalResourcesSection.tsx`
(276 lines), and the non-UI `useSpecimenDictionary.tsx` hook
(101 lines). Next up: `ReagentLotsSection.tsx`.

---

## Config/System/ReagentLotsSection.tsx — file-by-file sweep, batch 101

### Files swept this batch

- `src/components/Config/System/ReagentLotsSection.tsx` (320 lines) —
  the Reagent & Solution Lot Registry admin screen: a table +
  add/edit modal for tracking real lot numbers, expiration dates and
  QC status for IHC/special-stain catalog reagents and routine H&E
  line reagents.

### What changed

- Converted every on-screen string: section title/subtitle, Add
  Reagent Lot button, loading text, search placeholder, both filter
  dropdowns, all table headers, the empty-state row, and the full
  add/edit modal (header, reference-mode toggle buttons, every
  field label/placeholder/error, QC-status and performing-lab
  dropdowns, the active/inactive toggle, and the Cancel/Add/Save
  footer buttons).
- `ROUTINE_COMPONENT_LABEL: Record<RoutineStainComponentType, string>`
  → `ROUTINE_COMPONENT_LABEL_KEY` mapping to
  `reagentLotsSection.routineComponentLabels.*`, matching the
  established real-enum-stays-data/only-the-label-translates pattern
  from batches 97/99. The real `RoutineStainComponentType` values
  (`HEMATOXYLIN`, `EOSIN`, etc.) are unchanged as data/keys.
- `QC_STATUS_OPTIONS: ReagentLotQcStatus[]` (real `'Pending'|'Passed'|
  'Failed'` values, unchanged) now render through a parallel
  `QC_STATUS_LABEL_KEY` map for every place they were previously
  displayed raw: the add/edit modal's QC-status `<select>`, the
  section's QC filter `<select>`, and the table's QC Status column.
- The table's Status column and the modal's Active/Inactive toggle
  label both switched from displaying the raw `'Active'/'Inactive'`
  string to `common.active`/`common.inactive`, reusing the existing
  shared keys (same precedent as batches 96 and 99) — the real
  `l.status === 'Active'` comparisons that drive styling and the
  deactivate/reactivate action are untouched.
- Validation error text (`'Required'` on four required fields) now
  reuses the existing `common.required` key instead of adding a
  redundant local one.
- **Fixed 4 real literal-`—`/`…`-in-JSX-text display bugs** —
  the same class of bug first found in batch 91 and again in batch
  99: a 6-character literal backslash sequence sitting directly in
  JSX text (not inside a real JS string/template literal) never gets
  interpreted as a Unicode escape and renders on screen as literal
  text. Confirmed via raw-byte inspection and fixed with a raw-bytes
  Python script (the Edit tool's own string matching silently turns
  a typed `—` into a real em-dash before the call reaches the
  file, making the literal-backslash text impossible to target
  directly):
  - Line 110: `<option value="">Select a stain…</option>` →
    now `{t('reagentLotsSection.modal.stainPlaceholder')}`.
  - Line 120: `<option value="">Select a line reagent…</option>`
    → now `{t('reagentLotsSection.modal.lineReagentPlaceholder')}`.
  - Line 162: `<option value="">— All Labs (shared stock)
    —</option>` → now `{t('reagentLotsSection.modal.allLabsOption')}`.
  - Line 249 (section subtitle `<p>` text): `...line reagents
    — lot number, expiration...` → now
    `{t('reagentLotsSection.subtitle')}`.
  - Two other occurrences (line 89, inside a template-literal modal
    header; line 213, inside a single-quoted string returning a
    reference-label placeholder dash) were confirmed to be valid,
    correctly-interpreted JS escapes, not bugs — left as ordinary
    i18n conversions via the normal Edit tool rather than the
    raw-bytes script.
- No inline styles found; none removed since none existed.
- No `t`-shadowing — this file's loop/parameter variables are `s`/
  `c`/`l`/`x`, never `t`.
- No dedicated test file.

### Validation

- Locale parity: 6750 → 6798 keys (+48), exact match across en/fr/
  de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

Batch 101 of an estimated ~210 batches to clear the currently known/
flagged queue. Remaining in `Config/System/`, largest first:
`ExternalResourcesSection.tsx` (276 lines) and the non-UI
`useSpecimenDictionary.tsx` hook (101 lines, to be checked for
on-screen strings rather than assumed empty). Next up:
`ExternalResourcesSection.tsx`.

---

## Config/System/ExternalResourcesSection.tsx — file-by-file sweep, batch 102

### Files swept this batch

- `src/components/Config/System/ExternalResourcesSection.tsx`
  (277 lines) — the External Resources admin screen: a category-
  grouped list + add/edit modal for enterprise-wide and lab-scoped
  reference links (CAP protocols, WHO classification, internal lab
  systems), plus a delete-confirmation modal.

### What changed

- Converted every on-screen string: page title/subtitle, Add
  Resource button, loading/empty states, the three category-group
  labels, each resource row's scope line ("Enterprise-wide" /
  "Lab: {{labName}}"), the row Edit/Delete buttons, the full add/
  edit modal (header, every field label/placeholder, category/scope/
  performing-lab dropdown options, the three validation error
  messages), and the delete-confirmation `ConfirmModal`'s title/
  message/labels.
- `CATEGORY_LABELS: Record<ExternalResourceCategory, string>` →
  `CATEGORY_LABEL_KEY` + a new `CATEGORY_IDS` array (replacing the
  `Object.keys(CATEGORY_LABELS) as ExternalResourceCategory[]` cast
  used twice), following the same real-enum-stays-data pattern as
  batches 97/99/101. The real `'protocols'|'references'|'systems'`
  values are unchanged.
- Reused three already-existing keys instead of adding redundant
  ones: `common.edit`, `common.cancel`, and (added, then found to
  duplicate `common.save`/`common.delete` and removed again from all
  5 locales before delivery) what would have been a second Save/
  Delete button label — same discovery-and-correction pattern as
  batch 99's `duplicateButton`.
- **This entire file was inline-styled — no shared `ps-conf-*` admin-
  table/card classes were in use at all.** Grepped `pathscribe.css`
  first per the sweep's standing CSS-reuse-first rule: found two
  genuinely reusable generic modifiers already needed by other admin
  screens (`.ps-conf-select--full` for a full-width `<select>`, `.ps-
  conf-label--block` for a block-level form label — both placed next
  to their existing siblings, `.ps-conf-select-wide`/`.ps-conf-
  label`), and confirmed `.ps-conf-input` already has `width: 100%;
  box-sizing: border-box;` by default, so its two redundant inline
  overrides were dropped outright rather than replaced. Everything
  else — the 22 remaining inline `style={{}}` blocks — is this
  screen's own distinctive flex-card list + dark-modal layout, with
  colors and spacing that don't match the shared `.ps-conf-table`/
  `.ps-modal-dark-body`/`.ps-modal-dark-footer` conventions closely
  enough to reuse (different hex literals, no border-top on the
  shared modal footer, etc.), so those became 18 new, file-specific
  `ps-extres-*` classes plus one new `.ps-modal-dark--extres` width
  modifier (`min(480px, 92vw)` — didn't match any of the three
  existing width modifiers, `--sm`/`--narrow`/`--add`).
- No dead business logic found inside this file; its inline URL
  validation is simple, self-contained, and not duplicated anywhere
  else in the codebase (checked — no existing URL-validation util to
  extract to or reuse).
- No `t`-shadowing risk — no local variable/parameter named `t`.
- No dedicated test file.

### Real, unrelated dead-code discovery and fix

While rescanning the wider codebase for files still missing
`useTranslation` (this sweep's queue-tracking hygiene step — same
kind of check that caught the batch-97 drift), found a **second,
separate `CrosswalkSection.tsx`** at `src/components/Config/
Integrations/CrosswalkSection.tsx` — an older, pre-rename copy
(still named its facility field `client`/`clients`, unlike the real,
active, already-i18n'd `Config/System/CrosswalkSection.tsx` from
batch 100) that is never imported anywhere in the app (confirmed by
grepping every possible import path). `Config/Integrations/README.md`
itself already documents that this exact file was supposed to have
been moved back to `Config/System/` and states outright that "this
folder now holds nothing but its own README" — a claim the file's
continued presence on disk contradicted. Deleted the stray file;
`Config/Integrations/` now genuinely holds only its README, matching
what it already claimed. Verified via `tsc --noEmit` and the full
suite that nothing referenced it.

### Validation

- Locale parity: 6798 → 6826 keys (+28 net: +30 new leaf keys, −2
  removed as redundant duplicates of `common.save`/`common.delete`),
  exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean (both after the component conversion and
  again after the dead-file deletion).
- Full suite: 499/499 test files, 4329/4329 tests passing (run twice
  — once after the i18n conversion, once after the dead-file
  deletion).

### Progress estimate

Batch 102 closes out the `Config/System/*.tsx` queue this sweep has
been working through since batch 35: the only file left there
without `useTranslation`, `useSpecimenDictionary.tsx` (101 lines), is
a non-UI hook/context provider — confirmed (not assumed) it renders
no on-screen text at all; its one string is a thrown developer
`Error` for hook misuse, not user-facing UI. A fresh whole-codebase
scan (every `.tsx` file still missing `useTranslation`, excluding
tests) found 151 files remaining outside `Config/System/`, largest
first: `AppShell.tsx` (1745 lines), `SynopticReportPage/components/
RightSynopticPanel.tsx` (1668), `SynopticReportPage/modals/
BlockStainEditorModal.tsx` (1378), `SynopticReportPage/components/
BillingReviewPanel.tsx` (1255), and `SynopticReportPage/components/
OrchestratorSectionEditor.tsx` (1019), continuing on through
`components/QualityAssurance/`, `components/TemplateBuilder/`,
`components/Config/{Templates,Protocols,Staff,Macros,Actions,
Terminology,AI}/`, `contexts/`, and the rest of `pages/
SynopticReportPage/`. Next up: `AppShell.tsx`.

---

## AppShell.tsx — file-by-file sweep, batch 103

This batch leaves the `Config/System/*.tsx` queue (closed out in
batch 102) and moves into the broader whole-codebase queue described
in batch 102's progress note above — this sweep's original scope,
per this file's own history, before it narrowed to `Config/System/`
at batch 35.

### Files swept this batch

- `src/components/AppShell/AppShell.tsx` (1746 lines) — the global
  authenticated-app layout shell: top nav, the internal-messaging
  drawer (list/compose/thread panes), the secure-email modal, the
  About modal, and the app's confirmation dialogs. The largest
  remaining file in the broader queue.

### What changed

- Converted every on-screen string across all five locally-defined
  sub-components (`UserSearchOverlay`, `ComposePanel`,
  `MessageListPanel`, `ThreadPanel`, `SecureEmailModal`) and the main
  `AppShell` component itself: titles, button/label text,
  placeholders, aria-labels/titles, empty/loading states, the About
  modal, and all four `ConfirmModal` instances at the end of the
  file.
- `PAGE_LABELS` (the breadcrumb-title lookup keyed by route path)
  converted to `t('appShell.pageLabels.*')` calls; the real route-
  path keys (`/`, `/worklist`, `/search`, etc.) are unchanged.
- Two counted messages converted from manual `"message(s)"` string
  splicing to real `count`-driven `_one`/_`other` key pairs
  (`confirmModals.emptyDeletedMessage`,
  `confirmModals.bulkDeleteMessage`); the `UserSearchOverlay`'s add-
  recipient button needed a third state (a "no recipients selected
  yet" case, distinct from singular/plural), handled with a separate
  `addButtonEmpty` key alongside the `addButton_one`/`_other` pair
  rather than forcing that case through the plural rules.
- The `SecureEmailModal`'s "Delivered to X via NHSMail secure relay."
  sentence needed the recipient email bolded mid-sentence — used
  `<Trans i18nKey="appShell.secureEmailModal.deliveredTo" values=
  {{ to }} components={{ strong: <strong /> }} />` with `<strong>
  {{to}}</strong>` embedded directly in each locale's string, matching
  the existing `Trans` precedent in `ValidationStudiesSection.tsx`/
  `WsiViewerVendorDictionarySection.tsx`, rather than splicing a
  separate `<strong>` element after a fully-resolved `t()` string
  (which would have put the bold text after the sentence, not inside
  it — caught and fixed before running any validation).
- Real person/proper-name fallback display values (`'Dr. Sarah
  Johnson'`, `'Dr. Paul Carter'`) left untranslated as data, per this
  sweep's standing convention; the `'Pathologist'` role-fallback text
  next to them, being UI chrome rather than a name, was translated
  (new `aboutModal.roleFallback` key).
- **CSS**: this file had 69 inline `style={{}}` blocks and zero
  reuse of shared classes — every one eliminated. Extended two
  existing shared rules in place, confirmed sole-consumer via grep
  before editing them directly rather than overriding locally:
  `.ps-user-search-footer` (added `gap: 8px`) and `.ps-thread-body`
  (added `position: relative`, replacing an inline override).  Added
  one small reusable generic utility, `.ps-flex-1`. Converted three
  JS hover-effect handlers (`onMouseEnter`/`onMouseLeave` mutating
  `e.currentTarget.style`) in the About modal's menu items, plus
  several more in `ThreadPanel` (the ⋯ menu trigger/items, the
  "＋ Create Template" button, the reply input's focus ring), into
  real CSS `:hover`/`:focus-within` pseudo-class rules on named
  classes — removing the JS handlers entirely rather than converting
  them fact-for-fact. Everything else specific to this screen became
  roughly 60 new file-scoped classes (`ps-user-search-*`,
  `ps-compose-*` already existed and needed no new classes,
  `ps-msg-*`, `ps-thread-*`, `ps-sem-*` for `SecureEmailModal`,
  `ps-about-*`, `ps-app-outlet-wrap`/`--nav-hidden`), all following
  each sub-component's own existing naming convention.
- **Dead code removed**: `const [secureEmailToast, _setSecureEmailToast]
  = useState<string | null>(null);` and its entire JSX toast block.
  Confirmed via `grep -rn "secureEmailToast" src` that the setter is
  never called anywhere in the codebase, meaning that state can never
  become non-null and the toast could never render — removed rather
  than converted.
- **Real functional bug found and fixed, not just a display issue**:
  two voice-command handlers matched DOM inputs by literal placeholder
  text — `document.querySelector('.ps-msg-drawer input[placeholder=
  "Search"]')` in `msgSearch`, and `input[placeholder*="Subject"]` in
  `msgGotoSubject`. Translating those placeholders via `t()` would
  have silently broken both selectors in every non-English locale.
  Fixed by giving both target inputs stable classes instead
  (`ps-msg-search-input`, newly added; `ps-compose-field-input`,
  already present and confirmed to be the Subject field's only
  consumer) and matching on those classes instead of placeholder
  text. The Subject-field selector turned out to have **already been
  broken before this batch**: its capital-S `"Subject"` substring
  never matched the real, all-English placeholder text
  (`"Enter subject…"`, lowercase), so `msgGotoSubject` was silently a
  no-op even pre-conversion — this fix corrects that pre-existing bug
  as a side effect, not something this sweep set out to change.
- Checked this file's `avatarInitials` helper against the
  structurally similar one in `RequestReview/RequestReviewModal.tsx`
  (this sweep's standing duplicate-logic check). The two behave
  differently for 3+-word names (`AppShell`'s takes first-plus-last
  of ≥2 name parts with a `'?'` fallback; `RequestReviewModal`'s
  takes the first letters of the first two parts only) — a genuine
  behavior difference, not just a style difference, so left both in
  place rather than consolidating; consolidating would have been an
  out-of-scope behavior change for either caller.
- Noted, not changed: the breadcrumb-push `useEffect` that reads
  `PAGE_LABELS` depends only on `[location.pathname]` (an existing,
  differently-justified `eslint-disable-next-line` already guards
  this). `PAGE_LABELS` is now built from `t()` calls and recomputes
  every render, but the effect only re-fires on navigation — so a
  live language switch with no navigation won't update an
  already-pushed breadcrumb label until the next navigation. This is
  a pre-existing effect-dependency limitation unrelated to i18n
  correctness, not something a mechanical string-conversion pass
  should change.
- No `t`-shadowing — confirmed via `grep` for bare `\bt\b` outside
  `t('...')` calls; all matches were comment text or unrelated
  identifiers (`toInput`, `toDropdown`, `caseNumber`, etc.).
- No dedicated `AppShell.test.tsx`; confirmed no other test file
  imports or exercises this component.

### Validation

- Locale parity: 6826 → 6916 keys (+90 new leaf keys under a new
  `appShell` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 149 files remaining
after this batch, largest first: `SynopticReportPage/components/
RightSynopticPanel.tsx` (1668 lines), `SynopticReportPage/modals/
BlockStainEditorModal.tsx` (1378), `SynopticReportPage/components/
BillingReviewPanel.tsx` (1255), `SynopticReportPage/components/
OrchestratorSectionEditor.tsx` (1019), `QualityAssurance/
CytologyQaTab.tsx` (983), continuing on through `SynopticReportPage/
components/MaterialTreePanel.tsx`, `TemplateBuilder/`, `Config/
{Templates,Protocols,Staff}/`, `contexts/`, and the rest of `pages/
SynopticReportPage/`. Next up: `RightSynopticPanel.tsx`.

---

## SynopticReportPage/components/RightSynopticPanel.tsx — file-by-file sweep, batch 104

### Files swept this batch

- `src/pages/SynopticReportPage/components/RightSynopticPanel.tsx`
  (1669 lines) — the schema-driven synoptic field renderer: the dark-
  navy `FieldRow` field editor (AI confidence badges, Confirm/
  Override/undo, below-threshold and not-found indicators), the
  `TemplatePicker` empty-state screen, and the main panel (header,
  jump-to bar, tab/page view toggle, section tabs). The largest
  remaining file in the broader queue after `AppShell.tsx`.

### What changed

- Converted every on-screen string across all three components
  (`FieldRow`, `TemplatePicker`, the main `RightSynopticPanel`):
  badge labels, Confirm/Override/undo buttons, the dropdown "— Select
  —" placeholder, AI-source notes, the not-found/below-threshold/
  manual-entry tooltips, the template picker's title/subtitle/empty-
  state/group labels, the header's assignment badge and Orchestrator
  button, the progress badge, the jump-to bar's four buttons, the
  tab/page view toggle, and the section tabs' unverified-count
  indicator.
- The two count-driven "N AI suggestion(s) awaiting review" tooltips
  (shown on both the tabs-mode tab button and the page-mode section
  header) converted from manual `${n === 1 ? '' : 's'}` string
  splicing to a real `count`-driven `_one`/`_other` key pair
  (`sectionTabs.unverifiedTitle`).
- A synthetic, non-schema UI message this component builds itself —
  `validateRequired()`'s "This synoptic is assigned to {{name}} — they
  must finalise it" (shown when the signed-in pathologist isn't the
  assignee) — was translated, since it's chrome text this component
  authors, not template content. By contrast, every `field.label`/
  `section.title`/option `label` used throughout the file is real
  template-schema content (author-defined field and section names)
  and was left untranslated as data, consistent with how schema-
  driven content has been treated everywhere else in this sweep.
  Real person names (`inst.assignedToName`) stay interpolated as
  data too.
- **`t`-shadowing found and fixed before any conversion**: this file
  used `t` as a local parameter name in four places unrelated to
  translation — `TemplatePicker`'s `renderTemplateButton = (t:
  TemplateOption) =>` and three `.filter()`/`.map()` callbacks
  (`templates.filter(t => ...)`, `suggested.map(t => t.id)`), plus
  the main component's `onSelect` handler
  (`availableTemplates.find(t => t.id === id)`). All renamed (`tpl`,
  `opt`) before adding `useTranslation()`, rather than shadowing the
  real `t` function once introduced.
- **CSS**: this file had 69 inline `style={{}}` blocks (a distinct
  dark-navy theme, not the shared `ps-conf-*` admin-screen family)
  and zero existing class reuse — grepped `pathscribe.css` first per
  the standing CSS-reuse-first rule and found nothing in this file's
  own idiom to reuse, so all 69 became roughly 90 new `ps-syn-*`
  classes and BEM-style modifiers. Two multi-condition dynamic style
  objects (`FieldRow`'s row border/background, driven by 4
  independent boolean flags; the AI confidence badge's background/
  color, driven by verification status and confidence tier) became
  small className-selection helpers in the component instead of
  computed `React.CSSProperties` objects, so the actual color/border
  values live in the stylesheet rather than in JS. Five JS hover
  handlers (`onMouseEnter`/`onMouseLeave` mutating
  `e.currentTarget.style`) — the Confirm/Override/undo buttons, the
  template-picker button, and the section-tab buttons — converted to
  real CSS `:hover` rules (the section-tab hover is scoped with
  `:not(.ps-syn-section-tab--active):hover` so an already-active tab
  never gets the hover treatment, matching the original JS guard).
  One inline style was deliberately kept: the progress bar's `width:
  ${pct}%` is a genuinely continuous, per-render computed value, not
  a describable finite set of classes — the same judgment call this
  sweep has made for other true percentage-width bars.
- No dead code found in this file. No dedicated test file; confirmed
  no other test imports this component.

### Validation

- Locale parity: 6916 → 6968 keys (+52 new leaf keys under a new
  `rightSynopticPanel` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 148 files remaining
after this batch, largest first: `SynopticReportPage/modals/
BlockStainEditorModal.tsx` (1378 lines), `SynopticReportPage/
components/BillingReviewPanel.tsx` (1255),
`SynopticReportPage/components/OrchestratorSectionEditor.tsx`
(1019), `QualityAssurance/CytologyQaTab.tsx` (983),
`SynopticReportPage/components/MaterialTreePanel.tsx` (929),
continuing on through `TemplateBuilder/`, `Config/{Templates,
Protocols,Staff}/`, `contexts/`, and the rest of `pages/
SynopticReportPage/`. Next up: `BlockStainEditorModal.tsx`.

---

## CRITICAL FIX — `src/pathscribe.css` malformed comments broke ~77% of the stylesheet

Not an i18n batch. Reported by the user as a broken dashboard
(unstyled flat list instead of the card grid, oversized/overlapping
header logo) that reproduced identically in incognito, then
confirmed to also affect the Navbar's language dropdown, which had
vanished. Root-caused directly in this sandbox by reproducing the
app in a real Chromium instance and bisecting `document.styleSheets`
rule counts against the source file.

### Root cause

Eight separate `/* ── FileName.tsx — batch NN additions ── */`
documentation comments added to `pathscribe.css` over the course of
this sweep used a `.prefix-*/.other-*` shorthand to list multiple
class-name prefixes, e.g.:

```
Nearly the whole file already reused established .ps-conf-*/.ps-ms-*/
.ps-batch-reagent-lot-* classes — only 4 small inline style={{}} overrides
```

The wildcard `*` sitting directly against the following `/` forms a
literal `*/` — a CSS comment terminator. CSS comments don't nest and
have no escape mechanism, so the browser's real parser closes the
comment at that *first* `*/`, not at the sentence's intended closing
`*/` further down. Everything between the accidental early close and
the real one is then parsed as CSS. The **first** occurrence of this
(the batch-52 `ActionGroupsSection.tsx` comment, line 9367) happened
to contain a literal `{{` from `style={{}}` in its prose; the
browser's block-consumption error recovery treated that as the start
of a rule body and kept consuming subsequent real `{`/`}` pairs
looking for a matching close that never resolved before EOF. Net
effect: only 1,818 of the file's 7,854 top-level rules ever made it
into the live CSSOM — everything from source line ~9367 onward
(roughly 77% of the file, including `.ps-home-cards-grid`, `.ps-page`,
the Navbar's language-dropdown styling, and effectively every class
added in batch 52 onward) silently never applied, with no console
error, because the file remains brace-balanced by any naive
structural check — only a real CSS tokenizer's comment-termination
rule exposes the defect.

The other 7 occurrences (batches 59, 60, 62, 66, 71, 77, and the much
earlier `PoolClaimModal.tsx` comment) were the same authoring mistake
in isolation; with the first one fixed they'd each have gone on to
corrupt parsing again from their own position onward, so all 8 were
fixed together rather than just the one causing the reported symptom.

### Fix

All 8 comments rewritten to join prefixes with `, `/`and` instead of
`/`, so no wildcard's `*` is ever immediately followed by `/`. No
selectors, rules, or class names changed — comment text only.
Rebuilt and verified in this sandbox: `document.styleSheets` now
reports all ~7,890 rules parsed (small variance from the 7,854 count
is normal — that figure was a naive top-level-rule count, not a
CSSOM rule count, which also counts things like individual
`@media`-nested rules differently), `.ps-home-cards-grid` and the
other previously-missing selectors are confirmed present via
`getComputedStyle`, and a fresh login → dashboard screenshot shows
the correctly styled card grid and header.

**Delivered separately from the i18n batch cadence, as its own
urgent zip containing only the corrected `src/pathscribe.css`** —
apply it on top of whatever batch you're currently at; it doesn't
touch any locale JSON or component file, so it's safe to layer in
regardless of which i18n batches you've already applied.

---

## SynopticReportPage/modals/BlockStainEditorModal.tsx — file-by-file sweep, batch 105

### Files swept this batch

- `src/pages/SynopticReportPage/modals/BlockStainEditorModal.tsx`
  (1379 lines) — the bench-side block/stain hand-editor: status,
  priority override, pieces/tissue description, block face photos,
  block comments, stain multi-select with LIS pending/rejected
  badges, CPT ancillary-code suggestions, block cancellation, and
  stain restain ordering. Six sub-components plus the main modal.

### What changed

- Converted every on-screen string across all six sub-components
  (`StainMultiSelect`, `BlockCptSuggestion`, `BlockCommentComposer`,
  `StainCommentControl`, `CancelBlockControl`, `RestainControl`) and
  the main `BlockStainEditorModal`: field labels/placeholders, the
  status/priority dropdowns, the exception-note (Lost/Damaged)
  label+placeholder pairs, photo/comment section labels, print-label
  buttons, the embed-count confirmation prompt, empty states, and the
  footer Done button.
- **Persisted-enum labels**: added `BLOCK_STATUS_LABEL_KEY: Record<...,
  string>` (Pending/Grossed/Embedded/Exhausted/Lost/Damaged/Cancelled)
  and `PRIORITY_LABEL_KEY: Record<CasePriority, string>`
  (Routine/Rush/STAT) mapping each real, persisted enum value to a
  translated-label key — the value itself never changes, only its
  on-screen label, consistent with how other true enums have been
  handled throughout this sweep.
- **Deliberately left untranslated**: `CANCEL_REASONS` and
  `RESTAIN_REASONS`, the freeform reason picklists shown when
  cancelling a block or ordering a restain. Unlike a true enum, the
  selected value here becomes the permanently-persisted audit-trail
  record itself (block.cancelReason / stain.restainReason, per the
  CAP ANP.11600 / CLIA 493.1105 / ISO 15189:2012 §5.8 citations
  already in the source). Translating the picklist would make the
  same audit choice persist as different text depending on which UI
  language was active at the moment of selection, so both lists —
  and the reason text a user types into the "Other" free-text field —
  stay English. Documented this reasoning directly in new source
  comments above both constants so it doesn't need re-deriving on a
  future pass.
- Two count-driven strings converted from manual pluralization
  splicing to real `count`-driven `_one`/`_other` key pairs:
  `embedCountPrompt.question` (the "embed N block(s)?" confirmation)
  and `stainMultiSelect.targetCount` (the molecular-target chip
  count).
- Reused existing shared keys (`common.close`, `common.confirm`,
  `common.cancel`) where they matched exactly. Confirmed `common.done`
  does **not** exist yet, so the footer Done button uses a new
  file-scoped `blockStainEditorModal.doneButton` key rather than
  adding to the shared namespace unprompted.
- **`t`-shadowing found and fixed, more extensively than any prior
  batch**: `t` was used as a loop/callback parameter name in over
  half a dozen places — `StainMultiSelect`'s `add()`, its target-chip
  render, its target-search filter/map chains, and an `aria-label`
  template literal, plus the main component's
  `mockMolecularTargetService.getAll().then(res => res.data.filter(t
  => t.active))`. All renamed to `tgt` before introducing the real
  `t` from `useTranslation()`, then verified clean with a final
  `grep '\bt\b'` sweep reviewed line-by-line.
- **CSS**: this file had 71 inline `style={{}}` blocks and no
  existing class family of its own. Checked `MatrixBlockEditorModal.tsx`
  first (referenced in this file's own comments as having "identical"
  patterns) for reusable classes to consolidate onto, but found it
  not yet converted either (no `useTranslation`, no matching classes)
  — so no consolidation was possible, and all 71 inline styles became
  roughly 60 new file-scoped `ps-blockstain-*` classes and modifiers
  instead. No JS hover-effect handlers existed in this file (confirmed
  via grep before starting), so — unlike `AppShell.tsx` and
  `RightSynopticPanel.tsx` — no JS-hover-to-CSS-hover conversion was
  needed here.
- A stray `Trans` import (`import { useTranslation, Trans } from
  'react-i18next'`) was added during conversion but never actually
  used in the file — caught and removed before validation, leaving a
  plain `useTranslation` import.
- No dead code found. No dedicated test file; the one test that
  mentions this component by name
  (`productivityCalculations.test.ts`) does so only in comment text
  describing current CPT-code behavior, not as an import or render.

### Validation

- Locale parity: 6968 → 7049 keys (+81 new leaf keys under a new
  `blockStainEditorModal` namespace), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 147 files remaining
after this batch, largest first: `SynopticReportPage/components/
BillingReviewPanel.tsx` (1255 lines), `SynopticReportPage/components/
OrchestratorSectionEditor.tsx` (1019), `QualityAssurance/
CytologyQaTab.tsx` (983), `SynopticReportPage/components/
MaterialTreePanel.tsx` (929), `TemplateBuilder/
TemplateAssemblyPage.tsx` (922), continuing on through
`Config/Templates/`, `Config/Protocols/`, `Config/Staff/`,
`TemplateBuilder/`, `contexts/`, and the rest of `pages/
SynopticReportPage/`. Next up: `BillingReviewPanel.tsx`.

---

## SynopticReportPage/components/BillingReviewPanel.tsx — file-by-file sweep, batch 106

### Files swept this batch

- `src/pages/SynopticReportPage/components/BillingReviewPanel.tsx`
  (1256 lines) — the AI-suggested ancillary billing code review tab:
  a specimen/block/stain tree on the left with pending/applied count
  badges, a detail panel on the right for Confirm/Override/Reject-only
  actions and manual code search, and a Biopsy Array "Evaluated Cores"
  checklist section for shared MatrixBlocks. Five components in one
  file (`StatusDot`, `SpecimenTree`, `DetailPanel`,
  `MatrixArrayCoverageSection`, `PendingRow`, `AppliedRow`, plus the
  main `BillingReviewPanel`).

### What changed

- Converted every on-screen string across all six sub-components and
  the main component: the header title/count/Confirm All button, the
  specimen/block tree's expand/collapse controls and base-code line,
  the detail panel's section headings and empty-state notes, the
  manual-add-a-code control, the Biopsy Array section's title/intro/
  checklist copy/Save Evaluation button, each pending suggestion row's
  Confirm/Override/dismiss controls and "AI source: …" line, the
  override-replacement mini-form, and each applied-code row's
  correct/remove tooltips.
- **Real, externally-sourced dictionary content left untranslated, as
  established convention**: `describeCode()`'s CPT/billing-code
  descriptions (looked up from `CODE_MAP_TABLE`, the real billing
  dictionary) are real reference content, not UI chrome, so they stay
  English exactly like every other dictionary lookup in this sweep.
  Real, persisted CPT code values themselves (`item.code`,
  `applied.code`, `resolveRealCptCode()`'s output) are data and were
  never touched.
- **Computed display-status tooltip labels**: the tree's stain-row
  tooltip used a `DOT_STATUS_LABEL` object keyed by a UI-only derived
  status (`complete`/`partial`/`empty`/`rejected` — not itself a
  persisted field). Renamed to `DOT_STATUS_LABEL_KEY` and converted to
  the same label-key indirection this sweep uses for real persisted
  enums, even though this one is a computed display value rather than
  a stored one — the tooltip text is still UI chrome that should
  translate.
- The default `contextLabel` prop value ("sign-out") moved from a
  destructuring default to a `t()`-resolved fallback inside the
  component body (`contextLabel ?? t('billingReviewPanel.
  defaultContextLabel')`), since a destructuring default runs before
  `useTranslation()` is available. Callers that pass their own
  `contextLabel` are unaffected.
- Reused `common.confirm`/`common.cancel` for the Confirm/Cancel
  buttons inside the override mini-form and the Matrix section's
  per-suggestion Confirm button, consistent with how every other
  batch in this sweep prefers the shared namespace over a duplicate
  local key when the text matches exactly.
- No `t`-shadowing found in this file (verified via a `grep '\bt\b'`
  sweep before and after conversion) — unlike batches 104/105, no
  local variable or callback parameter here was ever named `t`.
- **CSS**: this file had 80 inline `style={{}}` blocks (the tree/
  detail-panel layout, the Biopsy Array checklist section, and the
  pending/applied row cards) plus one small 4-way discrete-color
  `StatusDot` inline style. Checked `pathscribe.css` first for
  existing reuse — `ps-status-dot`, `ps-btn-primary`, `ps-btn-icon`,
  `ps-btn-icon-danger`, `ps-status-dot-wrap`, `fm-eyebrow`, and
  `ps-billing-applied-row-actions` were already shared classes and
  were reused directly. `StatusDot`'s own `background` inline style
  (4 fixed colors, not a continuous value) was converted to four
  `ps-billing-status-dot--{status}` modifier classes rather than kept
  as the progress-bar-width style of exception, since a small finite
  set of colors is exactly the kind of thing a modifier class
  expresses cleanly. The remaining ~79 inline styles became roughly
  75 new file-scoped `ps-billing-*` classes and modifiers, following
  the same `ps-billing-*` prefix already established in this billing
  feature area (`PostSignoutBillingChangeModal.tsx` and several
  `Config/System/*` billing-adjacent sections). No JS hover-effect
  handlers existed in this file.
- No dead code found. No dedicated test file; confirmed no test
  imports this component (one unrelated test file mentions it only in
  a comment describing current CPT-code behavior).

### Validation

- Locale parity: 7049 → 7092 keys (+43 new leaf keys under a new
  `billingReviewPanel` namespace, including nested `dotStatus` and
  `matrixSection` sub-namespaces and one `count`-driven
  `codesNeedReview_one`/`_other` pair), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 146 files remaining
after this batch, largest first: `SynopticReportPage/components/
OrchestratorSectionEditor.tsx` (1019 lines), `QualityAssurance/
CytologyQaTab.tsx` (983), `SynopticReportPage/components/
MaterialTreePanel.tsx` (929), `TemplateBuilder/
TemplateAssemblyPage.tsx` (922), `Config/Templates/
TemplateRenderer.tsx` (921), continuing on through `Config/Protocols/`,
`Config/Staff/`, the rest of `TemplateBuilder/`, `contexts/`, and the
rest of `pages/SynopticReportPage/`. Next up:
`OrchestratorSectionEditor.tsx`.

---

## SynopticReportPage/components/OrchestratorSectionEditor.tsx — file-by-file sweep, batch 107

### Files swept this batch

- `src/pages/SynopticReportPage/components/OrchestratorSectionEditor.tsx`
  (1027 lines) — the section-based narrative editor for Orchestration
  (CoPilot) mode: sticky header (jurisdiction badge, Tabs/Page toggle,
  Jump-to bar, section pills, portalled toolbar), per-section editor
  cards with status badges and Accept/Insert-Specimen/Quick-Text
  controls, the spell-check review popover, the pending-AI-draft
  banner, the empty state, and the Personal Quick Text modal.

### What changed

- Converted every on-screen string: the section status badges (Empty/
  AI generated/AI Confirmed/Manual entry), the Required/Locked badges
  and their tooltips, the Insert-Specimen and Save-Quick-Text button
  tooltips, the Accept-section button and its "Checking"/"Accept"
  states, the locked-section read-only note, the spell-check popover
  (title, counter, Skip/Keep original/Apply fix buttons and their
  tooltips, cancel-review link), the jurisdiction badge and its two
  tooltip variants, the Tabs/Page view toggle, the Jump-to bar (Next
  Empty / Next Required) and their disabled-state tooltips, the
  generating/generated-at badges, the sections/required count badges,
  the Regen All / Accept All buttons and tooltips, the pending-draft
  banner and its two actions, the entire empty-state block (title,
  "Generate Report" call-to-action, the manual-entry alternative, the
  hint line), and the Personal Quick Text modal (title, name/facility
  meta line, Voice Trigger label/placeholder, Cancel/Save buttons).
- **Real, persisted document content left untranslated, as
  established convention**: `insertSpecimens()` builds the literal
  `<p>Specimen {{label}}: [{{description}}]</p>` HTML that gets
  inserted directly into the narrative and becomes part of the signed
  report — this is exported/persisted report body text, not UI
  chrome, so it stays English exactly like every other document-body
  string in this sweep. `section.hint` (a real per-template hint
  string) and `flag.reason`/`flag.suggestion`/`flag.original` (the
  spelling service's own generated content) were likewise left alone
  as real template/AI-generated content, not fixed UI strings — only
  the *fallback* placeholder text ("Begin {{sectionLabel}}…", used
  when a section has no author-supplied hint) was translated, since
  that fallback is chrome this component authors itself.
- **Computed display-status labels**: `STATUS_META`'s `title` field
  (a UI-only computed section status, not itself persisted) was
  renamed to `titleKey` and resolved via `t()`, the same label-key
  indirection this sweep uses throughout for computed and persisted
  status displays alike.
- Reused `common.required` (exact text match) for the Required badge,
  and `common.cancel`/`common.save` for the Quick Text modal's
  buttons — no new file-scoped duplicates added where the shared
  namespace already had an exact match.
- The "specimen(s)" Insert-Specimen tooltip converted from manual
  `specimen(s)` splicing to a real `count`-driven `insertSpecimensTooltip_one`/`_other` key pair.
  Korean's `_one`/`_other` pair holds the identical string (Korean
  doesn't inflect for plural count), consistent with the same choice
  made for every other Korean plural pair in this sweep.
- No `t`-shadowing found in this file (verified via a `grep '\bt\b'`
  sweep before and after conversion).
- **CSS**: this file already used an extensive, pre-existing
  `ps-ose-*` class family (140 selectors already in `pathscribe.css`
  before this batch) with only two small inline `style={{}}` blocks
  remaining: the section-card status badge's `color: meta.color` and
  the section-pill dot's `color: activeId === s.id ? 'currentColor' :
  meta.color`, both driven by the same 4-way discrete `STATUS_META`
  color set. Converted both to `ps-ose-section-card-status--{status}`
  and `ps-ose-pill-dot--{status}` modifier classes (plus a
  `.ps-ose-pill--active .ps-ose-pill-dot { color: currentColor; }`
  override rule for the active-pill case), and a third, trivial
  `style={{ marginTop: 4 }}` became a new `ps-ose-empty-text--tight`
  modifier. `labelStyle(documentStyle?.body)` — a real, per-document
  computed style function applied to per-specimen section titles —
  was left as a dynamic inline style, since it resolves the actual
  template's configured header/body/footer typography and isn't a
  finite, describable set of classes. No JS hover-effect handlers
  existed in this file.
- No dead code found. Two test files import this file's
  `OrchestratorSection` type only (not the component itself), so no
  dedicated component test exists and none needed updating.

### Validation

- Locale parity: 7092 → 7156 keys (+64 new leaf keys under a new
  `orchestratorSectionEditor` namespace, including nested `status`,
  `spellCheck`, `quickText`, `jurisdiction`, and `emptyState`
  sub-namespaces and one `count`-driven `insertSpecimensTooltip_one`/
  `_other` pair), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 145 files remaining
after this batch, largest first: `QualityAssurance/CytologyQaTab.tsx`
(983 lines), `SynopticReportPage/components/MaterialTreePanel.tsx`
(929), `TemplateBuilder/TemplateAssemblyPage.tsx` (922),
`Config/Templates/TemplateRenderer.tsx` (921), `Config/Protocols/
SynopticEditor.tsx` (862), continuing on through the rest of
`TemplateBuilder/`, `Config/Staff/`, `contexts/`, and the rest of
`pages/SynopticReportPage/`. Next up: `CytologyQaTab.tsx`.

---

## QualityAssurance/CytologyQaTab.tsx — file-by-file sweep, batch 108

### Files swept this batch

- `src/components/QualityAssurance/CytologyQaTab.tsx` (983 lines) —
  the cytology QA dashboard tab: 17 report tiles across random/
  high-risk/CT-path/peer-review aggregate rescreening, CT statistical
  comparison, ASC-US/HPV reflex, workload tracking, registry
  transmission audit, secondary-screening audit, histology
  correlation, unscreened backlog, UK HPV failsafe, EU compliance,
  HPV positivity, molecular QC failure rate, molecular lot-to-lot
  trend, and APAC proficiency testing — each with its own table
  sub-component, plus the aggregate `ReportCard` and its nested
  `ComparisonDetailTable`.

### What changed

- Converted every on-screen string across all 16 table
  sub-components and the main tab shell: every table's column
  headers, empty-state messages, status/outlier/level/category
  badges, the report-card stat labels and breakdown line, the six
  disclaimer paragraphs (UK failsafe, EU compliance, HPV positivity,
  molecular QC failure, molecular lot trend, APAC PT), the scope
  label, the registry `<select>` label and its six jurisdiction
  option labels (Australia/South Korea/England/Ireland/Netherlands/
  Northern Ireland — the registry acronym suffixes NCSR/KNCSP/KCCR/
  CSMS/CervicalCheck/PALGA/NICSP are real proper-noun identifiers and
  stay untranslated), the loading message, and the report-tile grid
  (icon + label + view tooltip for all 17 tiles).
- **Standardized Bethesda System cytology nomenclature left
  untranslated**: `Unsat %`, `NILM %`, `ASC-US %`, `ASC-H %`,
  `LSIL %`, `HSIL+ %`, `ASC-US:LSIL`, `ASC-US HPV+ %`, `HR-HPV+ %`,
  `HPV16 %`, `HPV18/45 %`, and `Δ Ct` are fixed, internationally
  recognized clinical/molecular-QC vocabulary, treated the same as
  CPT codes and other real technical nomenclature left alone
  elsewhere in this sweep — each left with an explanatory code
  comment at its point of use for future-sweep continuity.
- **`REPORT_TILES` restructured** from `{ key, label, color }[]`
  (where `label` embedded an emoji and text as one string) to
  `{ key, icon, labelKey, color }[]`, because the original render
  loop used `t` as its own map-callback variable name
  (`REPORT_TILES.map(t => ...)`), shadowing the `t()` translation
  function — the loop variable was renamed to `tile` and the render
  now composes the icon and `t(tile.labelKey)` separately.
- **`ReportCard` prop shape changed** from a single `title: string`
  to `titleKey: string` plus an optional `titleCode?: string` (the
  parenthetical report-code suffix, e.g. "(CYT-QA-02)"), so its four
  call sites in the main component now pass a translation key and,
  where applicable, the untranslated report code separately rather
  than a single pre-formatted English string.
- **Computed display-status/category/level/outlier labels**: five
  separate `Record<..., { text, color }>` maps in this file
  (`LEVEL_LABEL`, `CATEGORY_LABEL`, `OUTLIER_LABEL` in
  `AscusHpvReflexTable`, `INDICATION_LABEL` → `INDICATION_LABEL_KEY`,
  and a new `TRANSMISSION_STATUS_LABEL_KEY` extracted from
  `TransmissionAuditTable`'s local `STATUS_LABEL`) were all converted
  to the `textKey`/`labelKey` indirection pattern used throughout
  this sweep, translating only the displayed label while the
  underlying computed/enum value stays the lookup key.
- **CSV export stays English, per established convention**: the
  Histology Correlation table's Download button builds
  `exportQaReportRows()` rows whose column headers (`Patient MRN`,
  `Cyto Accession`, `Cyto Date`, `Cyto Diagnosis`, `Hist Accession`,
  `Hist Date`, `Hist Diagnosis`, `Days to Biopsy`, `Correlation
  Category`) are left in English exactly as before. The row values
  needed the correlation-category *text*, not its i18n key, so a new
  `CATEGORY_LABEL_EXPORT_TEXT: Record<string, string>` constant
  (English only, used solely by this export path) was added
  alongside the display-facing `CATEGORY_LABEL` map, rather than
  calling `t()` on export data.
- No dead code found. No dedicated test file imports this component
  (confirmed via search), so none needed updating.
- No `t`-shadowing remains (verified via a `grep '\bt\b'` sweep after
  conversion — the one instance found, `REPORT_TILES.map(t => ...)`,
  is the shadowing case fixed above).

### CSS

Added a new `ps-qa-*` class family (`pathscribe.css`, batch 108
block) covering the page shell (`ps-qa-tab-page`, `ps-qa-tab-header`,
`ps-qa-tab-scope-label`, `ps-qa-registry-picker`, `ps-qa-loading`),
a shared color-driven badge (`ps-qa-badge`, blending its color
through a `--qa-badge-color` custom property via `color-mix()` —
the same established pattern as `.ps-tpal-*`/`.ps-node-*` elsewhere
in this stylesheet — plus `ps-qa-badge--success`/`--danger`
modifiers for the two-color pass/fail cases), the report card
(`ps-qa-report-card` and its stat/breakdown sub-classes), the
histology-correlation summary row, and the disclaimer/APAC-summary
text blocks. The tile grid's per-tile `--tile-bg`/`--tile-border`/
`--tile-label-color`/`--tile-count-color` custom-property styles and
each badge's `--qa-badge-color` value were kept as dynamic inline
`style` objects — legitimate exceptions, since each is driven by an
arbitrary per-item hex color rather than a small finite set of
variants, consistent with this sweep's established exception for
that pattern.

### Validation

- Locale parity: 7156 → 7329 keys (+173 new leaf keys under a new
  `cytologyQaTab` namespace, including nested `registry`, `tiles`,
  `level`, `category`, `headers`, `comparisonTable`, `reportCard`,
  `ctStatsTable`, `ascusHpvTable` (with a nested `outlier`
  sub-namespace), `workloadTable`, `secondaryScreeningTable`,
  `histologyTable`, `unscreenedBacklogTable`, `ukFailsafeTable`,
  `euComplianceTable`, `indication`, `hpvPositivityTable`,
  `molQcFailureTable`, `molLotTrendTable`, `apacPtTable`, and
  `transmissionTable` (with a nested `status` sub-namespace)
  sub-namespaces, plus three interpolated keys — `scopeLabel`,
  `tileViewTooltip`, and `apacPtTable.satisfactorySummary`), exact
  match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 144 files remaining
after this batch, largest first: `SynopticReportPage/components/
MaterialTreePanel.tsx` (929 lines), `TemplateBuilder/
TemplateAssemblyPage.tsx` (922), `Config/Templates/
TemplateRenderer.tsx` (921), `Config/Protocols/SynopticEditor.tsx`
(862), `TemplateBuilder/TemplateInspector.tsx` (787), `Config/
Protocols/protocolShared.tsx` (727), `TemplateBuilder/
TemplateCanvas.tsx` (725), continuing on through the rest of
`TemplateBuilder/`, `Config/Staff/`, `contexts/`, and the rest of
`pages/SynopticReportPage/`. Next up: `MaterialTreePanel.tsx`.

---

## SynopticReportPage/components/MaterialTreePanel.tsx — file-by-file sweep, batch 109

### Files swept this batch

- `src/pages/SynopticReportPage/components/MaterialTreePanel.tsx`
  (929 lines) — the visual, clickable material tree (Specimen →
  Block/Decant → Slide), its three hand-drawn icon components
  (container/block/decant), the slide chip, the exception/status/
  location badges, the Biopsy Array section, and the add-specimen/
  add-block/add-decant/create-Biopsy-Array controls.

### What changed

- Converted every on-screen string: the empty-case message, the View
  Tracking History button, the Entirely Submitted badge and its
  tooltip, the specimen/block location badges' "Reported by … on …"
  tooltip, the Narrative/Template suggestion badge (both tooltip
  variants and both badge texts), the Pending Base Code badge and its
  tooltip, the Assign Code button and its tooltip, the "no blocks or
  decants" empty note, the piece-count badge/tooltip, the Partial
  Submission badge and its tooltip, the Tissue Discrepancy badge and
  its tooltip, the CANCELLED text, the Exhausted/Lost/Damaged
  exception badges and their tooltips, the Pending LIS / LIS Rejected
  / Awaiting Scan badges and their tooltips, the "no slides yet"
  notes (block and decant variants), the "Part of Biopsy Array …"
  link line, the Request block/recut and Add decant/fluid links, the
  Residual Fluid / Cell Block menu items, the Biopsy Arrays heading
  and its per-row Edit button and tooltip, the Add specimen link, the
  LIS-locked note and its tooltip, the Create Biopsy Array link, the
  slide chip's "Ready for review" tooltip, and the stained/
  held-unstained legend.
- **Real, persisted enum values displayed via the established
  `XXX_LABEL_KEY` pattern**: `block.status` (`BlockStatus`) and
  `stain.status` (`StainOrderStatus`, see `types/case/Specimen.ts`)
  are shown only inside this file's own tooltips — added
  `BLOCK_STATUS_LABEL_KEY`/`STAIN_STATUS_LABEL_KEY` maps covering
  every value in each real union type, translating only the
  displayed label while the comparisons this file already does
  against the raw value (`status !== 'Coverslipped'`, `block.status
  === 'Cancelled'`) are untouched. `decant.decantType`
  (`'residual_fluid' | 'cell_block'`) is shown raw in one tooltip in
  the original code (unlike the human-friendly Residual Fluid/Cell
  Block menu labels) — left as-is, since it's a raw internal value
  the original UI already displayed without humanizing, not new
  scope for this pass. `block.cancelReason`/`block.exceptionNote`
  (real operator-entered reasons) and `loc.source`/`loc.location`
  (real location/source data) stay untranslated as data, interpolated
  into their surrounding translated sentences.
- **Count-driven pluralization**: the piece-count badge/tooltip and
  the Tissue Discrepancy tooltip (which combines a `count`-driven
  noun with a second, independent `embeddedCount` number) now use
  `count`-driven `_one`/`_other` key pairs, the same pattern used
  throughout this sweep — Korean's pairs hold the identical string
  in both forms, since Korean doesn't inflect for count.
- **JS hover handlers replaced with CSS `:hover`**: three links
  (Request block/recut, Add decant/fluid, Add specimen) previously
  swapped their own text color via `onMouseEnter`/`onMouseLeave`
  handlers that just set `e.currentTarget.style.color` — this is
  exactly what CSS `:hover` already does natively, so all three
  handlers were removed and replaced with `:hover` rules on their
  new classes (`ps-material-tree-add-block-link:hover`, `--add-
  decant-link:hover`, `--add-specimen-link:hover`).
- No dead code found. No dedicated test file imports this component
  (confirmed via search), so none needed updating.
- No `t`-shadowing found (verified via a `grep '\bt\b'` sweep before
  and after conversion).

### CSS

This file was unusually inline-style-dense — three hand-drawn icon
components built entirely from nested `style={{}}` div trees, plus
the slide chip and the whole panel/specimen/block/decant layout.
Added a new `ps-material-tree-*` class family (`pathscribe.css`,
batch 109 block) covering all of it: the three icons and their
sub-parts, the slide chip (with `--body--ready`/`--body--highlighted`
and `--name--ready` modifiers replacing the previous conditional
inline styles), the panel/toolbar/specimen/block/decant layout
classes, and the link/badge/legend rows. Unlike CytologyQaTab's
batch (108), none of this file's colors are per-item arbitrary
values — every color is one of a small, fixed, already-known set —
so plain modifier classes were used throughout instead of CSS custom
properties. Two of this file's own exception badges (Partial
submission, Tissue Discrepancy) previously set their color via an
inline `style={{ background, color }}` layered on the pre-existing
shared `.ps-material-exception-badge` base class; these became two
new modifiers, `--partial` and `--discrepancy`, alongside that
existing family's `--exhausted`/`--lost`/`--damaged`. Nothing dynamic
(no per-item hex colors) remained, so zero inline `style={{}}`
attributes remain in this file (verified via `grep 'style={{'`).

### Validation

- Locale parity: 7329 → 7398 keys (+69 new leaf keys under a new
  `materialTreePanel` namespace, including nested `blockStatus` and
  `stainStatus` sub-namespaces and three `count`-driven `_one`/
  `_other` key pairs), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 143 files remaining
after this batch, largest first: `TemplateBuilder/
TemplateAssemblyPage.tsx` (922 lines), `Config/Templates/
TemplateRenderer.tsx` (921), `Config/Protocols/SynopticEditor.tsx`
(862), `TemplateBuilder/TemplateInspector.tsx` (787), `Config/
Protocols/protocolShared.tsx` (727), `TemplateBuilder/
TemplateCanvas.tsx` (725), `SynopticReportPage/modals/
CaseTeamModal.tsx` (715), `Config/Staff/StaffTab.tsx` (711),
continuing on through the rest of `TemplateBuilder/`, `Config/
Staff/`, `contexts/`, and the rest of `pages/SynopticReportPage/`.
Next up: `TemplateAssemblyPage.tsx`.

---

## TemplateBuilder/TemplateAssemblyPage.tsx — file-by-file sweep, batch 110

### Files swept this batch

- `src/components/TemplateBuilder/TemplateAssemblyPage.tsx`
  (922 lines) — the report-template assembly page: the Part Picker
  modal, the persistent Part Library sidebar, the slot row and
  add-slot button, the document-style editor, and the two-page
  (Page 1 / Pages 2+) canvas with its header/body/footer zones.

### What changed

- Converted every on-screen string: the Part Picker modal (title,
  "Adding to slot:" label, search placeholder, loading/empty states,
  Cancel button), the Part Library sidebar (title, both hints, search
  placeholder, the "All Labs" option, the group tooltips), the slot
  row's Enable/Disable/Edit/Remove tooltips and Edit-part button, the
  Add-slot button's "Add {{role}}" text, the document-style editor
  (all labels, the three text-transform options, the preview
  sentence), the topbar (Back/Rename tooltips, the specialty/standard
  fallback text, the Saving/Saved indicator, Style/Preview/Publish
  buttons), the style-category description paragraph, the drag-to-
  reorder hint, the Page 1 / Pages 2+ labels, the zone headers'
  "{{count}} active · drag to reorder" and "same as Page 1" meta
  text, the empty-body notices, the body-continuation note, and the
  "Assembly issues:" banner heading.
- **Real, persisted/shared enum values via the established
  `XXX_LABEL_KEY` pattern**: `ReportPartStatus` (`published`/`draft`/
  `archived`, shown both in `StatusBadge` and the Part Picker's row
  status column) got a new `STATUS_LABEL_KEY` map local to this file.
  `AssemblyRole`'s own shared `ASSEMBLY_ROLE_LABELS` constant — defined
  in `types/reportPart.ts`, not this file — was renamed to
  `ASSEMBLY_ROLE_LABEL_KEY` at its definition (a repo-wide search
  confirmed this file is its only real consumer, so the rename is
  safe) and every usage site here now calls `t(ASSEMBLY_ROLE_LABEL_KEY[role])`
  instead of reading the raw English string directly.
- **Reused "Header"/"Body"/"Footer" consolidated into one
  `ZONE_LABEL_KEY` map**: the original file spelled these three words
  out in five different places (the style-category tabs, the Page-1
  zone headers, the Page-2+ zone headers, the body-row badge, and the
  Page-2+ body-reference zone) via ad hoc ternaries
  (`role.startsWith('header') ? 'Header' : 'Footer'`) and a literal
  `'Body'`. Consolidated into one `Record<'header'|'body'|'footer',
  string>` map reused at every site — one set of three translations
  instead of five independently-typed literals that could drift.
  `PART_TYPE_CONFIG`'s three `label` strings (Header/Body/Footer
  Parts) became `labelKey`s the same way.
- Reused `common.cancel` (exact text match) for the Part Picker's
  Cancel button — no new file-scoped duplicate.
- **Left untouched, out of this file's scope**: `validateAssembly()`'s
  own hardcoded English validation messages (e.g. "Template has no
  body part — report will have no content.") live in the shared
  `types/reportPart.ts` utility, not this component, and are consumed
  by more than just this page's own error banner in principle —
  translating them would mean converting that shared, non-component
  utility's return shape (or threading a translator into it), which
  is a bigger cross-cutting change than a single file's sweep. Flagged
  here for whoever eventually sweeps `types/reportPart.ts` itself.
- No dead code found. No dedicated test file imports this component
  (confirmed via search), so none needed updating.
- No `t`-shadowing found — one instance had to be fixed:
  `PartPicker`'s own `validTypes` computation used `.map(([t]) => t)`
  to destructure each `Object.entries()` pair's key, shadowing the
  new `t()` translation function for that one line. Renamed the
  destructured variable to `partType`.

### CSS

This file already had an extensive, pre-existing `ps-tmpla-*` class
family, so only a handful of small additions were needed: the
style-category tab row and its description paragraph (previously two
inline `style={{}}` objects) became `ps-tmpla-style-tabs`/`ps-tmpla-
style-desc`, and the style-preview box's static chrome (border,
background, padding, color) became `ps-tmpla-style-preview`, leaving
only its genuinely dynamic parts (font-family/size/weight/decoration/
transform, driven by the user's own style picks — the same "real
per-document computed style" exception established for
OrchestratorSectionEditor.tsx's `labelStyle()` in batch 107) as an
inline `style` object. A third, trivial `style={{ marginTop: 4 }}`
on the Bold/Underline toggle row became a new `ps-tinsp-row--tight`
modifier on the shared `TemplateInspector.tsx` `.ps-tinsp-row` class
(that class's own default margin-top is 6px). The removed
`textTransform: 'capitalize'` inline style on the style-category
buttons is no longer needed at all, since the buttons now render
already-capitalized translated labels instead of the raw lowercase
`cat` string.

### Validation

- Locale parity: 7398 → 7464 keys (+66 new leaf keys under a new
  `templateAssemblyPage` namespace, including nested `role`,
  `status`, `zoneLabel`, and `partType` sub-namespaces and one
  `count`-driven `_one`/`_other` key pair), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 142 files remaining
after this batch, largest first: `Config/Templates/
TemplateRenderer.tsx` (921 lines), `Config/Protocols/
SynopticEditor.tsx` (862), `TemplateBuilder/TemplateInspector.tsx`
(787), `Config/Protocols/protocolShared.tsx` (727), `TemplateBuilder/
TemplateCanvas.tsx` (725), `SynopticReportPage/modals/
CaseTeamModal.tsx` (715), `Config/Staff/StaffTab.tsx` (711), `Config/
Staff/RoleDictionary.tsx` (709), continuing on through the rest of
`TemplateBuilder/`, `Config/Staff/`, `contexts/`, and the rest of
`pages/SynopticReportPage/`. Next up: `TemplateRenderer.tsx`.

## Batch 111 — `Config/Templates/TemplateRenderer.tsx`

Full-page renderer for reviewing/actioning a protocol in the review
queue (the `/template-review/:templateId` route). Unlike most files
swept so far, it had almost no pre-existing dedicated CSS class
family — nav bar, breadcrumb, lifecycle action bar, template
sections/fields, and all three modals were written entirely as raw
inline `style={{}}` objects — and its lifecycle/terminology logic
lives partly outside the component, in plain (non-hook) helper
functions that needed their own translation architecture.

### Source-aware terminology architecture

The trickiest part of this file: the words used for the "sign off"
and "go live" lifecycle transitions (and the state labels shown in
the tracker) vary by the template's governing body — CAP says
"Accept"/"Release", RCPath says "Ratify"/"Publish", ICCR/Custom say
"Approve"/"Publish" — via `SOURCE_TERMS` and `SOURCE_STATE_LABEL_KEY`
(renamed from `SOURCE_STATE_LABELS`), and `getTerms()`/
`getTransitionActions()`/`getStateLabelKey()`, which pick the right
set for a given `template.source` string. These are plain functions,
not components or hooks, so they cannot call `useTranslation()`
themselves. Rather than duplicating translation logic or threading a
context through them, `SOURCE_TERMS` and `SOURCE_STATE_LABEL_KEY` now
hold translation **keys** instead of raw English strings, and
`getTransitionActions(source, t)` takes the `t` function from the
component's own `useTranslation()` call as a parameter, resolving
labels and building interpolated `confirmMsg` strings (e.g.
`"{{signOff}} this protocol? Once {{signOffVerb}} it can be
{{goLiveVerb}} to the reporting workflow…"`) at call time. This keeps
the same call-site shape (`getTransitionActions(template.source, t)`)
while making every source-specific word real i18n. `getStateLabelKey`
now returns a key (an override or the generic
`templateRenderer.state.<state>` fallback) rather than raw text; both
`LifecycleBadge` and the main component resolve it with `t()`.

The file's pre-existing local `const t = getTerms(source);` inside
`getTransitionActions` collided with the translator parameter of the
same name once introduced, so it was renamed to `terms` — the only
`t`-shadowing risk found in this file, fixed before any JSX changes
began.

### Other conversions

- All on-screen strings converted: loading/error states, nav bar/
  breadcrumb, the "Unsaved annotations" indicator, the lifecycle
  action bar (transition button labels/tooltips, the published
  banner, the Reset button, the linear flow-hint states), the empty
  state (no content authored yet), the "Select…"/"Enter value…"
  placeholders shared by the 5 field-input types, and all three
  modals (transition-confirm, reset-confirm, leave-warning) including
  their Cancel/Confirm/Stay/Leave-Anyway buttons. `common.cancel` is
  reused for every "Cancel" button.
- `section.title` and `field.label` are real authored protocol
  content (persisted data from the template author, not UI chrome)
  and were deliberately left untranslated, per this sweep's
  "exported/persisted data stays English" convention — same posture
  as every other real-authored-content field swept so far.
- The `SCT`/`ICD` prefixes in `CodingBadges` are fixed coding-system
  nomenclature, left untranslated — same posture as the Bethesda/CPT/
  SNOMED/ICD codes treated as fixed technical vocabulary elsewhere in
  this sweep.
- No dead code found. No dedicated test file imports this component
  (confirmed via search), so none needed updating.
- No UI business logic worth extracting beyond what's already in
  `getTerms`/`getStateLabelKey`/`getTransitionActions` (all already
  factored out of the JSX before this batch).

### CSS

New `ps-tmplr-*` class family (this file had almost nothing to build
on — only `ps-overlay`/`ps-modal-dark`/`ps-conf-btn-secondary`/
`ps-btn-danger-solid` were reused from elsewhere). Static styling
(padding, radius, font sizing, layout) moved to the new classes;
genuinely dynamic per-state/per-item colors (lifecycle-state
background/color/border on the badge, transition buttons, and flow-
hint steps; selected-option border/background on radio/checkbox rows)
stay inline, consistent with every other batch in this sweep. Roughly
8 separate `onMouseEnter`/`onMouseLeave` JS hover-color-swap handlers
(back button, both breadcrumb links, each transition button, the
Reset button, the modal confirm button, the Leave Anyway button) were
all replaced with real CSS `:hover` rules on the new classes.

### Validation

- Locale parity: 7464 → 7528 keys (+64 new leaf keys under a new
  `templateRenderer` namespace, including nested `terms`/`stateLabel`
  sub-namespaces per governing body and several `{{interpolated}}`
  confirm-message strings), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 141 files remaining
after this batch, largest first: `Config/Protocols/
SynopticEditor.tsx` (862 lines), `TemplateBuilder/
TemplateInspector.tsx` (787), `Config/Protocols/protocolShared.tsx`
(727), `TemplateBuilder/TemplateCanvas.tsx` (725), `SynopticReportPage/
modals/CaseTeamModal.tsx` (715), `Config/Staff/StaffTab.tsx` (711),
`Config/Staff/RoleDictionary.tsx` (709), `PatientHistory/
PatientHistoryModal.tsx` (707), continuing on through the rest of
`TemplateBuilder/`, `Config/Staff/`, `contexts/`, and the rest of
`pages/SynopticReportPage/`. Next up: `SynopticEditor.tsx`.

## Batch 112 — `Config/Protocols/SynopticEditor.tsx`

The full synoptic template builder (add/reorder sections and fields,
6 field types, per-field/per-option SNOMED+ICD coding, visibility
conditions, a live preview modal, submit-for-review). At 862 lines
this was the largest single-file conversion in the sweep so far, and
unlike most files it had no CSS classes at all — it used a lightweight
in-file design-token approach instead (a `T` color-token object plus
shared `inputStyle`/`labelStyle` TS constants spread into `style={{}}`
everywhere). Every static use of those tokens/constants moved to a new
`ps-syned-*` CSS class family; genuinely per-instance dynamic values
(field-type color, selected/expanded/enabled state, coverage-bar
percentages, per-coding-system focus color) stay inline, same
convention used throughout this sweep. The `T` token object itself
was trimmed from 9 entries to the 5 still referenced for dynamic
inline values — the rest (`bg`/`surface`/`card`/`text`) were dead
once their static usages moved into CSS.

### Business-logic extraction

Semantic-version bumping was implemented three separate times with
three slightly different inline computations: a `bumpPatch` closure
on template load, a duplicated inline IIFE doing the same patch bump
in the fallback-load catch block, and a fuller major/minor/patch
computation inline in the version-bump button handlers. Consolidated
into one `bumpVersion(version, part)` helper used at all three call
sites — a real, in-scope duplication fix, not just a style change.

### i18n

- `field.type` (a real persisted `EditorField.type` enum) and
  `template.category` (a real persisted enum) now display through
  translation-key maps — `FIELD_TYPES[*].labelKey`/`abbrKey` and a new
  `CATEGORY_LABEL_KEY`, the same `XXX_LABEL_KEY` pattern used
  throughout this sweep — while the raw enum values passed to
  `onChange`/stored on the template are untouched.
- `SOURCE_OPTIONS` (CAP/RCPath/ICCR/RCPA/Custom — standardized
  pathology governing-body abbreviations, persisted as
  `template.source` and substring-matched elsewhere, e.g.
  TemplateRenderer.tsx's `getTerms()`) are treated as fixed
  vocabulary, same posture as CPT/SNOMED/ICD codes elsewhere in this
  sweep, and left untranslated.
- "SNOMED CT"/"ICD-10/11" coding-input labels and the SCT/ICD badge
  prefixes are likewise fixed nomenclature and were kept as literal
  text rather than translation keys — the shared `CodingInput`
  component takes a `label` prop (not a `labelKey`) for exactly this
  reason, while its placeholder text (`"e.g. 413448000"` etc.) *is*
  translated, since only the sample code itself is fixed and the
  "e.g." prefix is real prose.
- The readiness checklist's "SNOMED ≥ 80%" item is almost entirely
  fixed vocabulary plus a numeric threshold with no natural-language
  content to translate, so it keeps a plain (untranslated) label
  alongside its four sibling items, which are real UI prose and are
  translated normally — a small, explicit `labelKey`-vs-`label`
  branch in the readiness array rather than force-fitting it through
  `t()`.
- A new blank section's title used to default to the literal text
  "New Section", pre-filled into the title input. Since `blankSection()`
  is a plain module-level function (not a component or hook) called
  from a lazy `useState` initializer with no hook context available,
  giving it a translated default value isn't a natural fit. Instead a
  new section now starts blank with a translated placeholder
  ("Section title…") shown until the reviewer types one — a small,
  deliberate UX change over a static default value, not an oversight.
- Every other on-screen string converted: nav bar/breadcrumb (including
  the duplicate/new/untitled breadcrumb variants), the template-request
  banner, the "Changes Requested" note (the reviewer's name stays
  bold — split into a `byPrefix` key plus a literal `<strong>` wrap,
  rather than losing the bold to a single interpolated sentence, same
  fix applied to TemplateRenderer's "Draft" word in batch 111), the
  metadata card (name/source/version/category), every section/field/
  option row control and tooltip, the condition picker, the full
  preview modal, and both confirm modals.
- `section.title` and `field.label`/option labels (the actual authored
  template content) are untouched as real persisted data, per this
  sweep's established convention.
- Two bugs caught and fixed while converting, not present in the
  original's rendered output but easy to introduce during this kind
  of rewrite and verified against the original before validation: the
  section header's `borderBottom` was conditionally `'none'` when a
  section is collapsed (to avoid a stray bottom border with nothing
  below it) — this is genuinely dynamic and was kept inline rather
  than folded into the new static CSS class; and the preview modal's
  dropdown needed its own `color`/`background` on top of the shared
  `ps-syned-preview-input` base (the original `<select>` had explicit
  light-theme colors that plain `<input>`/`<textarea>` siblings never
  set) — given its own `ps-syned-preview-select` modifier class.
- No dead code beyond the `T` token trim described above. No dedicated
  test file exercises the component's rendered output — the existing
  `SynopticEditor.test.ts` only unit-tests the pure, unchanged
  `isVisible()` export — so nothing needed updating there.

### CSS

New `ps-syned-*` family (~120 classes) replacing every static inline
style in the file. JS `onFocus`/`onBlur` border-color handlers and
`onMouseEnter`/`onMouseLeave` hover-color-swap handlers are replaced
by real CSS `:focus`/`:hover` rules wherever the color involved is
static. The few genuinely dynamic-color inputs keep their original JS
handlers: `ConditionPicker`'s two "trigger" selects, whose border
color depends on both focus state AND whether a value is set yet (a
persisted inline `border` style can't be overridden by a CSS `:focus`
rule), and `CodingInput`, whose focus color varies by coding system
(SNOMED blue vs. ICD purple) — passed in via a `--syned-focus` CSS
custom property rather than a JS handler, so only the color varies
per instance while the rest of the focus behavior is real CSS.

### Validation

- Locale parity: 7528 → 7660 keys (+132 new leaf keys under a new
  `synopticEditor` namespace — the largest single-batch addition in
  this sweep so far), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean (including after the `T` token trim).
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 140 files remaining
after this batch, largest first: `TemplateBuilder/
TemplateInspector.tsx` (787 lines), `Config/Protocols/
protocolShared.tsx` (727), `TemplateBuilder/TemplateCanvas.tsx` (725),
`SynopticReportPage/modals/CaseTeamModal.tsx` (715), `Config/Staff/
StaffTab.tsx` (711), `Config/Staff/RoleDictionary.tsx` (709),
`PatientHistory/PatientHistoryModal.tsx` (707), `SynopticReportPage/
components/HeaderBar.tsx` (657), continuing on through the rest of
`TemplateBuilder/`, `Config/Staff/`, `contexts/`, and the rest of
`pages/SynopticReportPage/`. Next up: `TemplateInspector.tsx`.

## Batch 113 — `TemplateBuilder/TemplateInspector.tsx`

Right-panel inspector for the Template Builder — full property editors
for all 18 `TemplateNode` types, plus the shared conditional-expression
builder and AI-generation config panel used across several of them.

### First use of `<Trans>` in this codebase

Three hint boxes (`ParagraphEditor`, `RichTextBlockEditor`,
`ExpressionValueEditor`) mix translatable prose with inline `<strong>`/
`<code>`/`<br>` formatting spanning full multi-clause sentences. This
sweep's usual pattern — split a labeled string into separate pre/bold/
post translation keys and reassemble them in JSX — works well for a
single bolded word or short phrase, but chunking a full sentence that
way breaks word order once translated: German verb-second position and
Korean SOV order don't line up with English clause order, so the
reassembled sentence reads as broken grammar in those locales. Instead,
these three hints use react-i18next's `<Trans>` component for the
first time anywhere in this codebase, with the tags themselves passed
as a `components={{ strong: <strong/>, code: <code/>, ... }}` map, so
each locale's translator writes one coherent, correctly-ordered
sentence with the formatting tags placed wherever that language's
grammar puts them.

### Schema-syntax-stays-English, generalized

This file's placeholders and default values are overwhelmingly internal
binding-key/expression syntax — the literal dot-notation, `{{...}}`,
and `key|value` strings a template author actually types, which the
app's data layer parses regardless of UI language. Translating these
would actively mislead the author about what syntax to use, so — same
posture as this sweep's existing "internal schema/data-key identifiers
stay English" rule, but applied far more broadly than in any prior
batch — every one of the ~20 such placeholders across the 18 editors
was left untranslated: binding-key examples (`synoptic.tumorType`,
`diagnostic.grossDescription`, `institution.logoUrl`, …), expression/
template-string examples (`{{patient.name}}, {{patient.age}} years
old`, `context.field`), the common-binding-keys reference list, and
`RepeatGroupEditor`'s `iterateOver` option values/labels (`specimens`,
`synopticReports`, `diagnoses` — real context-array identifiers, not
UI prose). One of these, `FooterEditor`'s `pageNumberFormat` default
(`Page {{page.number}} of {{page.total}}`), is not just a placeholder
but a real default *value* that gets saved and parsed by the rendering
engine if the author doesn't change it — translating it would have
broken template rendering, not just looked odd, making this a
correctness issue rather than only a style choice. `node.type` (the
inspector header's raw type tag, e.g. `"text-field"`, `"if-block"`) is
the same kind of internal schema identifier — a developer-facing tag
shown verbatim — and was likewise left untranslated.

### Other conversions

- All 18 per-type editors (`TextFieldEditor` through `ImageEmbedEditor`)
  plus `ExpressionBuilder`, `AiConfigEditor`, `LabelConfigEditor`, and
  the main `TemplateInspector` component converted to `useTranslation`/
  `t()` — every field label, toggle label, dropdown option, section
  divider, and plain-word placeholder (e.g. "Optional", "Auto",
  "Institution logo") now translated, while schema-syntax examples stay
  English per the rule above.
- The module-level `OPERATORS` array (used by `ExpressionBuilder`)
  became a `useOperators()` hook, since its labels ("equals", "is
  empty", "contains", …) need `t()`. `HeaderEditor` and `FooterEditor`
  had byte-identical inline page-scope dropdown options ("All pages"/
  "Page 1 only"/"Pages 2+ only"); factored into a shared
  `usePageScopeOptions()` hook rather than duplicating the same three
  `t()` calls in both editors.
- `LabelConfigEditor`'s `POSITION_OPTIONS` moved from module scope into
  the component body, since it now needs `t()` from the component's own
  `useTranslation()` call.
- `SwitchBlockEditor`'s new-case default label (previously a raw
  `` `Case ${n}` `` template literal) now reuses the same
  `templateInspector.switchBlock.caseLabel` key used to render each
  existing case's title, via `t(..., { n })` — possible here (unlike a
  similar case in batch 112's `SynopticEditor.tsx`) because the default
  is built inline inside the component's own click handler, which has
  `t` in scope.
- The generic primitive wrappers (`Label`, `TextInput`, `Textarea`,
  `Toggle`, `Sel`, `Div`, `Row`) were left untouched — they're plain
  string-in/string-out components with no strings of their own; every
  caller already passes pre-translated text.
- No dead code found; no UI business logic worth extracting beyond
  what was already factored into the per-type editor components. No
  dedicated test file exercises this component's rendered output
  (confirmed via search), so none needed updating.

### CSS

No new CSS needed. This file already had an extensive `ps-tinsp-*`
class family from earlier work on the Template Builder (`ps-tinsp-row`,
`ps-tinsp-toggle-track`, `ps-tinsp-expr-box`, `ps-tinsp-hint-box`, and
~50 others), and every className used in the rewrite — including the
three template-literal-composed toggle/select/button variants — was
cross-checked against `pathscribe.css` and already exists there.

### Validation

- Locale parity: 7660 → 7839 keys (+179 new leaf keys under a new
  `templateInspector` namespace, including two `_one`/`_other` plural
  pairs and three `<Trans>`-formatted hint strings), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 139 files remaining
after this batch, largest first: `Config/Protocols/protocolShared.tsx`
(727 lines), `TemplateBuilder/TemplateCanvas.tsx` (725),
`SynopticReportPage/modals/CaseTeamModal.tsx` (715), `Config/Staff/
StaffTab.tsx` (711), `Config/Staff/RoleDictionary.tsx` (709),
`PatientHistory/PatientHistoryModal.tsx` (707), `SynopticReportPage/
components/HeaderBar.tsx` (657), continuing on through `contexts/`,
the rest of `Config/Staff/`, and `pages/SynopticReportPage/`. Next up:
`protocolShared.tsx`.

## Batch 114 — `Config/Protocols/protocolShared.tsx`

Shared data registry, types, style maps, and two upload/build modals used
by `ActiveProtocolsSection`, `ReviewQueueSection`, and `AllProtocolsSection`
(none of which are part of this batch). No pre-existing CSS class family;
almost everything was raw inline `style={{}}`.

### Persisted data vs. cross-file comparison keys vs. UI chrome

Three different categories of "leave it alone" text showed up in this file,
worth distinguishing:

- `PROTOCOL_REGISTRY`'s ~30 entries (protocol `name`, `type`, `owner`,
  `reviewNote`, …) are persisted mock data, same posture as `section.title`/
  `field.label` in earlier batches — left untouched.
- `protocolGroup()`'s return values (`'Surgical Pathology'`, `'Non-GYN
  Cytology'`, `'GYN Cytology'`, `'Grossing'`) are *not* rendered by this
  file at all, but are consumed by `ActiveProtocolsSection.tsx` (confirmed
  via grep, not part of this batch) as literal filter-comparison keys
  (`protocolGroup(p) === groupFilter`) and almost certainly also rendered
  there as tab labels directly. Translating them here would silently break
  that file's filtering without touching a single line of it — worse than
  leaving them alone. Left as English data identifiers; when
  `ActiveProtocolsSection.tsx` is swept, its own rendering of these values
  needs a `LABEL_KEY` map, same pattern as below.
- `LifecycleState` (`draft`/`in_review`/`needs_changes`/`approved`/
  `published`) is also a persisted enum, but *is* rendered directly by this
  file's own `LifecycleBadge` component (used by all three consumer
  sections plus indirectly elsewhere) — the enum value itself is untouched,
  but the label `LifecycleBadge` renders now goes through a new
  `LIFECYCLE_LABEL_KEY: Record<LifecycleState, string>` map and `t()`,
  same `XXX_LABEL_KEY` pattern established in earlier batches for
  block-status/case-priority-style persisted enums. (Note: `TemplateRenderer.
  tsx` from batch 111 has its own separately-defined `LifecycleBadge` for
  `TemplateLifecycleState` — confirmed via grep this is a different,
  unrelated component that happens to share a name, not a shared import.)

### Other conversions

- `UploadProtocolModal` and `BuildCustomiseModal` (`AddToLibraryModal`/
  `ImportModal` are aliases of the latter, no separate strings) fully
  converted: headers, subtitles, section labels, drop-zone states, the
  review-required warning banner, search placeholder/empty-state (with
  `{{search}}` interpolated back into the message), and both buttons.
  `common.cancel` reused for both modals' Cancel buttons.
- `GOVERNING_BODIES` (CAP/RCPath/ICCR/RCPA/Other picker in the upload
  modal) became a `useGoverningBodies()` hook. The four real abbreviations'
  `label`s stay literal fixed vocabulary (same posture as source badges
  elsewhere in this sweep); only `'Other'` (an ordinary word, not an
  abbreviation) and all five `desc` tooltip strings go through `t()`.
- `p.source` badge text (`CAP`/`RCPath`/`ICCR`/`PathScribe`/`Custom` in the
  template picker) is the same fixed-vocabulary source identifier treated
  as literal everywhere else in this sweep — left untranslated.
- No dead code found; no UI business logic worth extracting beyond what
  was already factored into `protocolGroup()`/`isDiagnosticProtocol()`.
  No dedicated test file exercises this component's rendered output
  (confirmed via search), so none needed updating.

### CSS

New `ps-pshare-*` class family (49 classes) replacing every inline
`style={{}}` object in both modals and the `LifecycleBadge`/`CoverageBar`
micro-components; dynamic per-state colors (lifecycle badge background/
color/border, coverage-bar fill color, per-source badge color) stay
inline. Two JS-driven hover/focus handlers converted to real CSS: the
"Start from Scratch" card's `onMouseEnter`/`onMouseLeave` border-color
swap became a `:hover` rule, and the template-search input's `onFocus`/
`onBlur` border-color swap became a `:focus` rule — both were static
single-color swaps with no other state involved.

### Validation

- Locale parity: 7839 → 7868 keys (+29 new leaf keys under a new
  `protocolShared` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 138 files remaining
after this batch, largest first: `TemplateBuilder/TemplateCanvas.tsx`
(725 lines), `SynopticReportPage/modals/CaseTeamModal.tsx` (715),
`Config/Staff/StaffTab.tsx` (711), `Config/Staff/RoleDictionary.tsx`
(709), `PatientHistory/PatientHistoryModal.tsx` (707),
`SynopticReportPage/components/HeaderBar.tsx` (657), `contexts/
VoiceProvider.tsx` (645), continuing on through the rest of
`TemplateBuilder/`, `Config/Staff/`, and `pages/SynopticReportPage/`.
Next up: `TemplateCanvas.tsx`.

## Batch 115 — `TemplateBuilder/TemplateCanvas.tsx`

The drag-and-drop canvas for the Template Builder — node cards, drop
zones, header/footer page zones, and the 12-column grid layout engine.
Already had a complete `ps-tc-*` CSS class family from earlier work, so
this batch was i18n-only with no CSS changes.

### Conversions

- `NodeCard`'s property chips (the small badges surfacing otherwise-
  invisible toggle state on the canvas — Logo, Accession #, Patient,
  page-scope, column count/width, etc.), the "Remove" and "Drag to
  resize column width" tooltips, and the "AI"/"IF" node badges all
  converted to `t()`.
- The column-layout container's flow indicator (`{{numCols}} col ·
  flows ↓→`) and empty-state hint, the 12-column grid's empty-state
  hint, the free-slot label (`{{free}}/12 free`), and the body's
  drag-and-drop empty state (idle vs. actively-dragging text, plus the
  instructional sub-line) all converted with interpolation where
  needed.
- The eight `PageZone` label/hint string pairs (Page 1/Pages 2+ ×
  Header/Footer) are now built with `t()` in the main `TemplateCanvas`
  component and passed down as already-translated props, and the
  header/footer `ZoneChip` labels ("Logo", "Accession #", "Patient
  name", "Page numbers") converted in `PageZone`. Two pairs of near-
  duplicate strings were kept as distinct keys rather than merged,
  matching the original's own (slightly inconsistent) wording: `NodeCard`'s
  property chip says "Patient" while the zone chip says "Patient name";
  the footer property chip says "Page #" while the zone chip says "Page
  numbers".
- `repeat-group`'s `↺ {iterateOver}` chip and `expression-value`'s
  template-snippet chip both surface raw internal schema identifiers
  (context-array names, `{{...}}` expression syntax respectively) and
  were left untranslated, per this sweep's established convention —
  same posture as `RepeatGroupEditor`'s `iterateOver` options and
  `ExpressionValueEditor`'s template field in batch 113's
  `TemplateInspector.tsx`.
- The "AI" and "IF" badges are ordinary UI chrome, not fixed clinical
  vocabulary, so — unlike SNOMED/CPT-style codes — they were translated
  (`IA`/`KI` for AI, `SI`/`WENN`/`ALS`/조건 for IF), matching the
  precedent set by translating the AND/OR logic-operator labels in
  batch 113.
- No dead code found; no UI business logic worth extracting (the tree-
  manipulation helpers — `insertNode`/`removeNode`/`updateNode` — were
  already factored out before this batch). No dedicated test file
  exercises this component's rendered output (confirmed via search), so
  none needed updating.

### CSS

None needed — this file's `ps-tc-*` class family already existed in
full before this batch; every className used was already present.

### Validation

- Locale parity: 7868 → 7899 keys (+31 new leaf keys under a new
  `templateCanvas` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 137 files remaining
after this batch, largest first: `SynopticReportPage/modals/
CaseTeamModal.tsx` (715 lines), `Config/Staff/StaffTab.tsx` (711),
`Config/Staff/RoleDictionary.tsx` (709), `PatientHistory/
PatientHistoryModal.tsx` (707), `SynopticReportPage/components/
HeaderBar.tsx` (657), `contexts/VoiceProvider.tsx` (645),
`SynopticReportPage/modals/MaterialTrackingHistoryModal.tsx` (602),
continuing on through the rest of `Config/Staff/`, `contexts/`, and
`pages/SynopticReportPage/`. Next up: `CaseTeamModal.tsx`.

## Batch 116 — `SynopticReportPage/modals/CaseTeamModal.tsx`

Drag-and-drop case-team assignment modal — participation-type lanes on
the left (drop targets), staff directory on the right (draggable cards),
plus three small confirmation dialogs (self-removal blocked, replace-
confirm, discard-changes). Already had an extensive `ps-ctm-*` CSS
family from three prior refactor passes documented in the file's own
header comment; this batch's CSS work was mainly mopping up the last
handful of inline `style={{}}` objects those passes had left behind.

### Data vs. chrome, and the replace-confirmation `<Trans>`

Role names (`staff.roles`), participation-type labels/abbreviations
(`type.label`/`type.abbreviation`), and subspecialty display strings are
real admin-configured data (from `roleService`/`mockParticipationTypeService`/
`subspecialtyService`), not UI chrome — left untranslated throughout,
consistent with this sweep's convention. The role-ineligible rejection
message (`"{{role}} cannot be assigned as {{type}}."`) keeps the data
values as interpolation and only translates the sentence scaffolding;
the English-specific `${roleName}s` pluralization is still computed in
code (unavoidable given the role name itself is untranslated data) and
passed through as one interpolated value rather than baked into the
translated string.

The replace-confirmation dialog's body sentence
(`<strong>{{existingStaffName}}</strong> is currently the {{typeLabel}}.
Replace with <strong>{{newStaffName}}</strong>?`) has two separate bold
data interpolations inside one sentence — a clean fit for `<Trans>`
(introduced in batch 113), used here for the second time in this
codebase. The self-removal-blocked dialog's two sentences (each with a
single bolded word — "Primary", "Delegate") also use `<Trans>` for
consistency within the same file, even though either could have used
the simpler pre/bold/post key-split pattern from earlier batches.

### Other conversions

- Every literal UI string converted: staff-card "on case" badge; drop-
  zone preview labels (role-ineligible/occupied/eligible hover states),
  SINGLE/countersign/finalise badges, empty-state hint, "(you)"/"· auto"
  participant tags, Undo/Delegate/Remove buttons and tooltips; header
  eyebrow/subtitle/close label; body loading/empty states, search
  placeholder; footer team-member count (`_one`/`_other` plural) and
  Save/Saving/Cancel buttons; the discard-changes warning dialog.
- Four `t`-shadowing sites fixed: `StaffCard`, the main component, and
  two inline `.find()` callbacks all had a local variable or arrow
  parameter named `t` for a `ParticipationType` — all renamed to `pt`
  now that each of those scopes also has the translator `t` from
  `useTranslation()`.
- Save button's conditional inline styles (dirty/not-dirty colors,
  saving-state opacity, pointer/default cursor) replaced with two
  modifier classes (`ps-ctm-save-btn--dirty`, `--saving`) plus a native
  `:disabled { cursor: default }` rule — the cursor logic exactly
  matched the button's own `disabled` condition, so no JS was needed to
  reproduce it.
- No dead code found; no UI business logic worth extracting (the drag-
  eligibility/replace/save logic was already well-factored before this
  batch). No dedicated test file exercises this component's rendered
  output (confirmed via search), so none needed updating.

### CSS

New small set of classes closing out the gaps left by this file's three
earlier CSS-extraction passes: `ps-ctm-modal` (the modal's own width/
height, previously inline), `ps-ctm-overlay--z9000`/`--z9500` (z-index-
only overlay modifiers, following the same per-file-overlay-class
convention already used elsewhere in the sheet, e.g.
`.ps-billing-postsignout-overlay`), `ps-ctm-modal-icon`, `ps-ctm-
dropzone-empty-hint`, `ps-ctm-staffdir-head`/`-eyebrow`, `ps-ctm-search-
input`, `ps-ctm-staff-list`, `ps-ctm-types-eyebrow`, and the save-button
modifiers above. The pre-existing `.ps-modal-dark--sm` class (`width:
min(460px, 90vw)`) was reused as-is for both small dialogs rather than
duplicated. One small cross-file addition: a `.ps-modal-dark-body
strong, .ps-modal-dark-hint strong { color: #e2e8f0; }` descendant-
selector rule replaces four repeated per-instance inline `<strong
style={{color:'#e2e8f0'}}>` tags — scoped to the shared dark-modal
classes, so any other file's dark modal gets this styling for free
without needing its own inline style or one-off class.

### Validation

- Locale parity: 7899 → 7947 keys (+48 new leaf keys under a new
  `caseTeamModal` namespace, including one `_one`/`_other` plural pair
  and two `<Trans>`-formatted strings), exact match across en/fr/de/nl/
  ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan (every `.tsx` file still missing
`useTranslation`, excluding test files) confirms 136 files remaining
after this batch, largest first: `Config/Staff/StaffTab.tsx` (711
lines), `Config/Staff/RoleDictionary.tsx` (709), `PatientHistory/
PatientHistoryModal.tsx` (707), `SynopticReportPage/components/
HeaderBar.tsx` (657), `contexts/VoiceProvider.tsx` (645),
`SynopticReportPage/modals/MaterialTrackingHistoryModal.tsx` (602),
`SynopticReportPage/components/BottomActionBar.tsx` (592), continuing
on through the rest of `Config/Staff/`, `contexts/`, and `pages/
SynopticReportPage/`. Next up: `StaffTab.tsx`.

## Batch 117 — `Config/Staff/StaffTab.tsx` (711 lines)

### Scope

Staff directory: the add/edit modal (`StaffModal`), the list/table view
grouped by role (`StaffMembers`), the small `Toggle` and
`SignatureUpload` helper components, and the `StaffTab` shell with its
three sub-tabs (Staff Members / Role Dictionary / Credentialing
Review).

### Data vs. chrome

- **`StaffUser.status: 'Active' | 'Inactive'`** is a persisted enum
  rendered at two separate sites — `Toggle`'s own label and the
  `StaffMembers` table's status cell (`{u.status}`, direct). Introduced
  a `STATUS_LABEL_KEY: Record<'Active' | 'Inactive', string>` map
  (`staffTab.status.active`/`.inactive`), the same indirection pattern
  as `protocolShared.tsx`'s `LIFECYCLE_LABEL_KEY` from batch 114,
  applied consistently at both render sites. Every `u.status ===
  'Active'` *comparison* (driving dot color, label color, the
  `Toggle`'s own `draft.active` boolean) is untouched — only the
  displayed text changed.
- Role names (`Role.name` / `StaffUser.roles`), subspecialty names
  (`Subspecialty.name`), and the `VOICE_PROFILES` catalog's own labels
  (a shared accent/language dictionary defined in
  `constants/voiceProfiles.ts`, not chrome authored in this file) are
  all persisted/configured data and stay untranslated, per the
  established convention. The `'Physician'`/`'Or Staff'` role-name
  string comparisons that drive filtering and the Quick Auth PIN
  section's visibility are also untouched.
- Real person names (`fullName(u)`, already `data-phi`-marked) stay
  untranslated as data, as always.
- Two static, non-data-driven inline chip colors (`#8AB4F8` for
  subspecialty chips — `Subspecialty` carries no `color` field, unlike
  `Role`) were reclassified from "looks dynamic" to "actually a fixed
  constant" and extracted into `ps-st-role-chip--subspecialty` /
  `ps-st-role-chip-x--subspecialty` modifier classes. The genuinely
  per-role and per-error dynamic colors (role chips/badges, group
  headers, validation border colors) stay inline as `style={...}`,
  same as every prior batch.
- `common.required`, `common.cancel`, `common.close`, and
  `common.edit` reused as-is for the two "Required" validation
  messages, the Cancel button, the modal's Close aria-label, and the
  table's Edit button — confirmed via lookup rather than re-derived,
  same discipline as previous batches.

### Code changes

- Added `useTranslation()` to `Toggle`, `SignatureUpload`, `StaffModal`,
  `StaffMembers`, and `StaffTab` — every component in the file that
  renders on-screen text now sources it through `t()`.
- The three `borderColor: errors.X ? '#ef4444' : undefined` inline
  styles (first name / last name / email) were replaced with a
  conditional `ps-conf-input--error` class — an exact pre-existing
  match found in `pathscribe.css` (`border-color: var(--ps-conf-red)`),
  so no new CSS was needed there.
- `style={{ marginTop: 16 }}` → the pre-existing `ps-mt-16` utility;
  `style={{ marginTop: 4 }}` → a new `ps-mt-4` utility, extending the
  existing `ps-mt-8`/`-12`/`-14`/`-16`/`-20`/`-32` scale (it had a gap
  at 4); `style={{ padding: 16 }}` on the "No staff match" empty state
  → a new, file-scoped `ps-st-empty-hint` class; the hidden file-input's
  `style={{ display: 'none' }}` → a new `ps-st-file-input-hidden`
  class.
- No `t`-shadowing found (swept for a bare `t` arrow-function parameter
  or variable; this file has none — its comparably-risky short names
  are `r`/`rName`/`sub`, none of which collide).
- No dead code found; no UI business logic worth extracting into a
  service — the save/diff logic for subspecialty membership
  (`handleSave`'s add/remove reconciliation) was already well-factored
  before this batch. No dedicated test file exercises this component's
  rendered output.

### CSS

Small addition on top of the file's large pre-existing `ps-st-*`
family: `ps-st-file-input-hidden`, `ps-st-empty-hint`,
`ps-st-role-badge--neutral` (the "No Matching Role" defensive-bucket
badge — an exact color match for `.ps-st-multirole-badge`, reused as a
modifier instead of a duplicated inline style),
`ps-st-role-chip--subspecialty`/`-x--subspecialty`, plus the new
generic `ps-mt-4` utility (cross-file-reusable, added to the existing
`ps-mt-*` scale rather than scoped to this file).

### Validation

- Locale parity: 7947 → 8017 keys (+70 new leaf keys under a new
  `staffTab` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 135 files remaining after this
batch, largest first: `Config/Staff/RoleDictionary.tsx` (709 lines),
`PatientHistory/PatientHistoryModal.tsx` (707), `SynopticReportPage/
components/HeaderBar.tsx` (657), `contexts/VoiceProvider.tsx` (645),
`SynopticReportPage/modals/MaterialTrackingHistoryModal.tsx` (602),
`SynopticReportPage/components/BottomActionBar.tsx` (592),
`Config/Macros/MacroPanel.tsx` (577), continuing on through the rest of
`Config/`, `contexts/`, and `pages/SynopticReportPage/`. Next up:
`RoleDictionary.tsx`.

## Batch 118 — `Config/Staff/RoleDictionary.tsx` (709 lines)

### Scope

The role editor modal (`RoleModal`, with its Permissions / Facility
Access / Case Participation / Action Reference tabs), the small
`TriCheckbox`/`DivCheckbox` helper components, and the main
`RoleDictionary` list/table view.

### Data vs. chrome

- `DEFAULT_ROLES`' own `name`/`description` strings are persisted seed
  data (written through `roleService` on first load — same posture as
  `protocolShared.tsx`'s `PROTOCOL_REGISTRY` from batch 114) and stay
  untranslated, as do `ACTION_GROUPS`' `title`/`label`/`description`
  fields and everything sourced from `mockActionRegistryService`
  (`action.label`, `.description`, `.shortcut`, `.voiceTriggers`,
  `.internalKey`, `.id`, `.requiredRole`) — all configured/catalog data
  imported from outside this file, not chrome authored here, the same
  posture as `VOICE_PROFILES` in batch 117. Voice trigger phrases in
  particular are real functional speech-recognition strings, not UI
  text.
- `auditService.logEvent()`'s `event`/`detail` strings (Pediatric
  Access Granted/Revoked) are persisted audit-trail text and stay
  English by established convention.
- Role names, participation-type names/descriptions/colors, and
  facility names are all persisted/configured data and stay
  untranslated, consistent with every prior batch's treatment of role
  and participation-type data.
- `action.groupTitle` ("Worklist" / "Synoptic Report") is computed
  once from `action.category` and used both for display *and* for the
  cheat-sheet's own live text search (`cheatSearch` matches against
  it). Rather than translating the field itself — which would make the
  search only match the current UI language — it's kept as an English
  internal string for search matching (same rationale as
  `protocolGroup()`'s cross-file comparison key from batch 114), and a
  new `CHEAT_GROUP_LABEL_KEY: Record<'WORKLIST' | 'SYNOPTIC', string>`
  map translates only the *rendered* tag, keyed off `action.category`
  directly.
- `common.cancel`, `common.edit`, `common.yes`, and `common.no` reused
  as-is (the "✓ Yes"/"— No" access-column badges, the Edit button, and
  the modal's Cancel button) — confirmed via lookup before use, same
  discipline as prior batches.

### Code changes

- Added `useTranslation()` to `RoleModal` and `RoleDictionary` — both
  components in the file that render on-screen text.
- Two `<Trans>` sentences (the Facility Access tab's intro paragraph
  and the Case Participation tab's intro paragraph), each with one
  embedded `<strong>` span — the second use of `<Trans>` with
  `components={{ strong: <strong /> }}` mapping in this codebase.
- Three `t`-shadowing sites fixed: a `voiceTriggers.some(t => …)`
  filter predicate, an `allTypes.map(t => …)` block (the participation-
  type row renderer, spanning ~35 lines), and an
  `action.voiceTriggers.map(t => …)` chip renderer — all renamed to
  `vt` (voice trigger) or `pt` (participation type, matching batch
  116's precedent) now that their enclosing scopes also hold the
  translator `t`.
- The participation-type row's four attribute labels ("Can Finalise",
  "Countersign Req.", "Template Assign.", "Full Case View") were
  hoisted out of the inline array-literal into a small `attrs` array
  built from `t()` calls, so the per-row `.map()` renders already-
  translated labels rather than re-deriving them inline.
- The `RoleModal` outer div's `style={{ width: 'min(1080px, 96vw)',
  minHeight: 600, maxHeight: '90vh' }}` and several other fully-static
  inline styles (a description input's `flex`/`minWidth`, a repeated
  `flex: 1; min-width: 0` wrapper, the cheat-sheet tab's shortcut-row/
  shortcut-code/voice-chip styling, two "info tag" styles for the
  cheat sheet's "No permission mapping"/"Disabled" badges) were
  extracted into new classes — all confirmed static (no per-render
  variance), unlike the adjacent per-role/per-participation-type/
  per-permission colors and sizes, which stay inline as before.
- The Save button's `opacity: !draft.name.trim() ? 0.5 : 1` (dimming
  an invalid, unsaved form) became a conditional
  `ps-rd-btn-apply--invalid` class rather than a real `disabled`
  attribute — the click handler already self-guards on an empty name,
  and adding `disabled` would also pull in this button's own
  pre-existing `.fm-btn-apply:disabled` background/color rule,
  changing its look beyond the original inline-opacity-only behavior.
- Table header keys switched from `key={h}` (header text) to
  `key={i}` (index) now that header text is a translated, non-literal
  value — avoids a duplicate-key risk from the trailing blank header.
- No dead code found; no UI business logic worth extracting — the
  permission/facility/participation-type toggle logic was already
  well-factored before this batch. No dedicated test file exercises
  this component's rendered output.

### CSS

New small set of classes on top of the file's large pre-existing
`ps-rd-*` family (141 pre-existing rules): `ps-rd-modal-size`,
`ps-rd-desc-input`, `ps-rd-flex-1-minw0`, `ps-rd-part-empty-hint`,
`ps-rd-part-abbr-pad`, `ps-rd-part-abbr-badge`, `ps-rd-cheat-tag--nomap`,
`ps-rd-cheat-tag--disabled`, `ps-rd-cheat-shortcut-row`,
`ps-rd-cheat-shortcut-code`, `ps-rd-cheat-voice-wrap`,
`ps-rd-cheat-voice-chip`, `ps-rd-btn-apply--invalid`, and
`ps-rd-row-actions`. The pre-existing generic `.ps-flex-row-gap-8`
utility was reused as-is for the footer's Cancel/Save button row.

### Validation

- Locale parity: 8017 → 8082 keys (+65 new leaf keys under a new
  `roleDictionary` namespace, including two `_one`/`_other` plural
  pairs and two `<Trans>`-formatted strings), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 134 files remaining after this
batch, largest first: `PatientHistory/PatientHistoryModal.tsx` (707
lines), `SynopticReportPage/components/HeaderBar.tsx` (657),
`contexts/VoiceProvider.tsx` (645), `SynopticReportPage/modals/
MaterialTrackingHistoryModal.tsx` (602), `SynopticReportPage/
components/BottomActionBar.tsx` (592), `Config/Macros/MacroPanel.tsx`
(577), `SynopticReportPage/modals/AmendmentModal.tsx` (573), continuing
on through the rest of `pages/SynopticReportPage/`, `Config/`, and
`contexts/`. Next up: `PatientHistoryModal.tsx`.

## Batch 119 — `PatientHistory/PatientHistoryModal.tsx` (707 lines)

### Scope

The Patient History modal: the split list view (prior pathology cases
+ AI-matched cases + related-patients cross-reference), the full-case
report view, and the inline compose-a-message-to-the-pathologist
panel.

### Data vs. chrome

- All clinical/report field *values* (diagnosis, site, procedure,
  physician, receptor status, Ki-67, margins, lymph nodes, gross/
  microscopic descriptions, comments, tags, dates, case/accession IDs)
  are real, persisted patient case content, not chrome authored in
  this file — left untranslated throughout, same posture as case
  content everywhere else in this codebase. Field *labels* ("Case ID",
  "Site", "Gross Description", etc.) are UI chrome and are translated.
- The outbound message's `subject`/`body` passed to
  `mockMessageService.send()` is a message body to another user and
  stays English per established convention — only the compose panel's
  own surrounding UI (placeholder, warning text, Send/Sending/Sent
  states) is chrome and gets translated.
- Patient names, MRNs, and dates of birth (already `data-phi`-marked)
  stay untranslated as data; the "MRN {{mrn}}" / related-patient row
  sentence structure around them is chrome.
- `setCrumbs()`'s breadcrumb labels (Home / Case Report / Patient
  History / Case Search) are real on-screen breadcrumb-bar text (per
  `BreadcrumbContext.tsx`), so they're translated too — the "Patient
  History" one reuses the same key as the modal's own header label.
  (This codebase's only other `setCrumbs()` caller,
  `QualityAssurancePage.tsx`, hasn't been swept yet, so there was no
  established precedent here; this batch sets one for later `setCrumbs`
  callers to follow.)
- Which patient identifier is missing (MRN, date of birth, both, or no
  patient index identity at all) is itself chrome text, not data —
  resolved to one of four translated fragments and interpolated into
  the parent "Cannot safely retrieve patient history…" sentence, the
  same nested-interpolation technique used for StaffTab's role-
  ineligibility message in batch 116.

### Code changes

- This file previously held almost all of its layout/typography as a
  single `S: Record<string, React.CSSProperties>` object applied via
  `style={S.xxx}`, plus several further one-off inline `style={{...}}`
  blocks — a different pattern from every other batch so far, which
  have mostly been className-based files with a handful of leftover
  inline styles. All of it (the entire `S` object and every ad-hoc
  inline style) was extracted into a new `ps-ph-*` CSS class set;
  nothing in this file remains as a `style={{...}}` prop. A small,
  already-existing `ps-ph-*` family (`ps-ph-grid-2col`,
  `ps-ph-compose-header`, etc. — from a prior, partial pass) was
  reused where it already matched exactly, including one full inline
  style block (the compose panel's header) that matched the
  pre-existing `.ps-ph-compose-header` byte-for-byte.
- `CaseCard`'s hover-state background swap — previously a
  `useState(false)` + `onMouseEnter`/`onMouseLeave` pair driving an
  inline `background` — was replaced by a plain `:hover` CSS rule,
  removing the JS state entirely (same native-CSS-over-JS-state
  precedent as CaseTeamModal's Save button in batch 116).
- The Message-pathologist button's `opacity`/`cursor` pair, previously
  computed in JS from `view !== 'report'`, was replaced by a
  `.ps-ph-message-btn:disabled` rule — the button already carries a
  `disabled={view !== 'report'}` attribute, so no JS was needed to
  reproduce the dimmed/not-allowed look.
- Incidental fix: the "Related Patients" divider's inline
  `borderTop: \`1px solid ${border}\`` concatenated a width onto an
  already-complete border shorthand (`border` itself was `'0.5px solid
  rgba(255,255,255,0.1)'`), producing an invalid, silently-dropped CSS
  value — the divider never actually rendered. The new
  `.ps-ph-related-section` class gives it a single, valid `border-top`
  matching this file's own border convention.
- Also removed a redundant inline `<style>{\`@keyframes spin {...}\`}
  </style>` tag injecting a duplicate of the `@keyframes spin` rule
  pathscribe.css already defines globally — the spinner's animation
  now just references the existing global keyframe.
- Added `useTranslation()` to `CaseCard`, `FullReport`, and the main
  component (the three components in the file that render on-screen
  text); no `t`-shadowing found except one `.map(t => ...)` tag
  renderer inside `FullReport`, renamed to `tag`.
- No further dead code found beyond the two items above; no UI
  business logic worth extracting — the identifier-sufficiency gate,
  AI-match fetching, and physician-lookup-by-name logic were already
  well-factored. No dedicated test file exercises this component's
  rendered output.

### CSS

The file's former `S` object (30 entries) plus roughly a dozen further
one-off inline styles became a new `ps-ph-*` class set (added onto the
small pre-existing family): full layout/typography classes for the
shell, modal, header, breadcrumb, split body, panels, cards, empty/
loading states, full-report grid, tags, and footer/compose areas, plus
a handful of small modifiers (`--bordered`, `--loose`, `--sent`) for
what were previously inline object-spread style combinations.

### Validation

- Locale parity: 8082 → 8131 keys (+49 new leaf keys under a new
  `patientHistoryModal` namespace, including one `_one`/`_other` plural
  pair), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean (also dropped an unused default `React` import
  left over once every `React.CSSProperties`-typed `S` object usage
  was removed).
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 133 files remaining after this
batch, largest first: `SynopticReportPage/components/HeaderBar.tsx`
(657 lines), `contexts/VoiceProvider.tsx` (645), `SynopticReportPage/
modals/MaterialTrackingHistoryModal.tsx` (602), `SynopticReportPage/
components/BottomActionBar.tsx` (592), `Config/Macros/MacroPanel.tsx`
(577), `SynopticReportPage/modals/AmendmentModal.tsx` (573),
`TemplateBuilder/TemplatePreviewPanel.tsx` (568), continuing on
through the rest of `pages/SynopticReportPage/`, `TemplateBuilder/`,
and `contexts/`. Next up: `HeaderBar.tsx`.

## Batch 120 — `SynopticReportPage/components/HeaderBar.tsx` (657 lines)

### Scope

The synoptic-report page's top header bar: both its compact and full
render modes — case identity strip (accession/patient/DOB/sex/MRN),
breadcrumb + LIS-sync row, case-priority control, per-block status/
priority/deficiency chips, the stepper/confidence status card, and the
AI-review tooltip text.

### Data vs. chrome

- Case/block/patient field *values* (accession number, patient name,
  DOB, sex, MRN, block IDs) stay untranslated as data; the field
  *labels* around them ("Accession", "Patient", "DOB", "MRN", etc.)
  are chrome and are translated.
- `block.status` (a persisted `BlockStatus` value) and case/block
  `priority` ('Routine' | 'Rush' | 'STAT') are real, persisted enum
  values, not chrome authored in this file. Rather than inventing new
  wording, this batch reused two already-established cross-file
  precedents: `BLOCK_STATUS_LABEL_KEY` (first established in
  `MaterialTreePanel.tsx` / `BlockStainEditorModal.tsx`) and
  `PRIORITY_LABEL_KEY` (first established in
  `CassetteRoutingRulesSection.tsx` / `EnhancementRequestModal.tsx` /
  `SearchPage.tsx`), both re-declared locally here
  (`BLOCK_STATUS_LABEL_KEY`, `CASE_PRIORITY_LABEL_KEY`) with the exact
  same translated wording those files use — confirmed against the
  locale JSON that `STAT` stays literal in every locale (fr/de/nl/ko
  all keep "STAT") while `Routine`/`Rush` are translated ("Routine"/
  "Urgent" fr, "Routine"/"Eilig" de, "Routine"/"Spoed" nl, "일반"/
  "긴급" ko) — reusing `materialTreePanel.blockStatus.*`'s exact
  wording for the block-status labels too, so the same status reads
  identically wherever it appears in the app.
- "NHS" (the `hospital.country === 'UK'` fallback label) is left as a
  literal fixed abbreviation, consistent with the established
  CAP/RCPath/ICCR/RCPA governing-body-abbreviation exception.

### Code changes

- Added `useTranslation()`; converted all on-screen chrome across both
  the compact and full render paths: relative-time LIS-sync label
  (`formatSyncLabel`, with `_one`/`_other` for "N min(s) ago" / "N
  hr(s) ago"), stepper stage labels, breadcrumb text, nav-button
  tooltips, block/deficiency/version chip text (with `_one`/`_other`
  plurals), AI-review status/tooltip text, and confidence-card labels.
- Two inline `style={{...}}` blocks replaced with new CSS classes:
  the "Back to Messages" breadcrumb's color/weight/cursor styling
  (`ps-hb-crumb--messages`) and the full header's "Compact view"
  toggle button's `marginLeft: 'auto'` (`ps-hb-compact-nav-btn--ml-auto`).
- No `t`-shadowing found. No dead code or extractable business logic
  found beyond the two inline-style sites above — the file's
  confidence/deficiency computations were already factored into
  helper functions.
- Incidental, **not fixed**: five classNames
  (`ps-hb-compact-conf--neutral`, `ps-hb-compact-conf--warn`,
  `ps-hb-confidence-score--neutral`, `ps-hb-confidence-score--status`,
  `ps-hb-confidence-score--warn`) are referenced in this component but
  were never defined in `pathscribe.css`. Confirmed via the file's
  pre-batch content that this gap predates this batch's edits — it
  isn't something introduced here. Left unfixed because a correct fix
  would mean inventing colors/visual treatment that aren't specified
  anywhere else in the codebase; flagging here for whoever owns the
  visual design to pick up.

### CSS

Two new classes added: `.ps-hb-crumb--messages` (color, font-weight,
cursor — was an inline style on the "Back to Messages" crumb) and
`.ps-hb-compact-nav-btn--ml-auto` (`margin-left: auto` — was an inline
style on the full header's own compact-view toggle button).

### Validation

- Locale parity: 8131 → 8194 keys (+63 new leaf keys under a new
  `headerBar` namespace, including 4 `_one`/`_other` plural pairs),
  exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing. No
  dedicated test file exists for this component.

### Progress estimate

A fresh whole-codebase scan confirms 126 files remaining after this
batch, largest first: `contexts/VoiceProvider.tsx` (646 lines),
`SynopticReportPage/modals/MaterialTrackingHistoryModal.tsx` (603),
`SynopticReportPage/components/BottomActionBar.tsx` (593),
`Config/Macros/MacroPanel.tsx` (578), `SynopticReportPage/modals/
AmendmentModal.tsx` (574), `TemplateBuilder/TemplatePreviewPanel.tsx`
(569), `protocols/ProtocolEditor.tsx` (568), continuing on through the
rest of `pages/SynopticReportPage/`, `TemplateBuilder/`, and
`contexts/`. Next up: `VoiceProvider.tsx`.

## Batch 121 — `contexts/VoiceProvider.tsx` (646 lines)

### Scope

The app-wide voice/dictation context provider: speech-recognition
lifecycle, dictation-segment handling (local punctuation, learned
corrections, voice-macro substitution, AI refinement), the global
keyboard-shortcut dispatcher, and the transient `transcript` status
text surfaced through the voice context while listening/dictating.

### Data vs. chrome

This file is a pure context provider with no JSX render of its own
beyond `<VoiceContext.Provider>` — it has none of the usual
labels/buttons/tables other batches deal with. Its only genuinely
on-screen text is the transient `transcript` string it publishes,
which some other component renders as a live status indicator:
- The "🔤 Literal…" one-shot flag indicator, "✨ Refining…" AI-
  refinement-in-progress indicator, and "✔️ {{label}}" executed-
  voice-command indicator are real UI chrome and are translated (the
  emoji stay identical across locales; only the words move).
  `action.label` (the matched voice command's own display label,
  sourced from the action registry) is interpolated in, not
  hardcoded here.
- `STOP_PHRASES` (`'stop dictation'`, `'done'`, `'finish'`, `'cancel
  dictation'`) are spoken-word trigger phrases matched against
  transcribed English speech, not on-screen text — left as-is. This
  file already has extensive, deliberate language-aware matching for
  voice *commands* (`findActionByTrigger(text,
  getVoiceProfileLanguage(accent))`, per the referenced
  `MULTILANG_VOICE_COMMANDS_PLAN.md`), but the stop-phrase list itself
  isn't wired through that same per-language matching — that's a
  pre-existing functional gap in multi-language stop-phrase support,
  not an on-screen-string translation question, so it's out of scope
  here and left untouched.
- The AI-refinement system prompt (`VOICE_REFINEMENT_SYSTEM`) and the
  `context` fallback string (`'Pathology Report'`) sent to the AI stay
  English per the established AI-prompt-text exception.
  `console.warn(...)` diagnostics stay English as developer-facing
  log output, not on-screen UI text.

### Code changes

- Added `useTranslation()`; converted the three `setTranscript(...)`
  status strings to `t()` calls (one with `{{label}}` interpolation);
  added `t` to the two affected `useCallback`/`useEffect` dependency
  arrays.
- Fixed one `t`-shadowing site: `streamRef.current.getTracks()
  .forEach(t => t.stop())` inside `killMic` renamed to `track =>
  track.stop()`.
- No inline CSS (no styled JSX elements exist in this file at all),
  no dead code, and no further business-logic extraction opportunities
  found — the file's helper functions (punctuation mapping, dictation-
  correction learning, AI refinement, shortcut parsing) are already
  factored out to module scope, not inlined in the component body.
  No dedicated test file exists for this provider.

### CSS

None — no styled JSX in this file.

### Validation

- Locale parity: 8194 → 8197 keys (+3 new leaf keys under a new
  `voiceProvider` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 125 files remaining after this
batch, largest first: `SynopticReportPage/modals/
MaterialTrackingHistoryModal.tsx` (603 lines), `SynopticReportPage/
components/BottomActionBar.tsx` (593), `Config/Macros/MacroPanel.tsx`
(578), `SynopticReportPage/modals/AmendmentModal.tsx` (574),
`TemplateBuilder/TemplatePreviewPanel.tsx` (569),
`protocols/ProtocolEditor.tsx` (568), `TemplateBuilder/
RoutingRulesTab.tsx` (559), continuing on through the rest of `pages/
SynopticReportPage/`, `TemplateBuilder/`, and `protocols/`. Next up:
`MaterialTrackingHistoryModal.tsx`.

## Batch 122 — `SynopticReportPage/modals/MaterialTrackingHistoryModal.tsx` (603 lines)

### Scope

The case's material scan/tracking-history modal: the interactive
split-pane view (compact status tree + per-item vertical timeline),
its live search, the case-level cassette dispatch/exception history
section, and the print-only comprehensive tree.

### Data vs. chrome

- `TYPE_LABELS` (`Specimen`/`Block`/`Slide`/`Decant`/`Aliquot`) is a
  purely internal search-matching key set — it's checked against the
  typed query (`textMatch(TYPE_LABELS.slide, query)`) but never itself
  rendered anywhere; the on-screen item titles are built from separate
  template strings. Left as English internal match keys, same posture
  as `action.groupTitle` (batch 118) and `protocolGroup()` (batch
  114): a cross-file/same-file matching key stays literal while the
  actual displayed text is translated separately. The item-title
  template strings themselves (`` `Specimen ${sp.label}` ``, `` `Block
  ${block.label}` ``, `` `Slide ${block.label}-${level}` ``, etc.) are
  real UI chrome and are translated, with the composed block/level/
  aliquot-label identifier passed through as a single opaque
  `{{id}}`/`{{label}}` interpolation value (that identifier code
  itself stays exactly as constructed — it's a data-shaped ID, not
  natural-language text).
- `DECANT_TYPE_LABEL` (imported from `types/case/Material.ts`) is left
  untranslated, matching the precedent already set for this exact
  constant in `BlockStainEditorModal.tsx` (swept in an earlier batch,
  which also left it as a literal English data label rather than
  converting it to a `LABEL_KEY` map) — kept consistent rather than
  diverging per-file.
- Tracking-event fields (`event.location`, `event.action`,
  `event.performedByName`) are real, persisted audit-trail data —
  left untranslated throughout, both in the interactive timeline and
  the print-only comprehensive tree. `performedByName` is a real
  person's name, staying as data per the established convention.
  `aliquot.aliquotType` is likewise real specimen data, not chrome.
- Fallback subtitle text ("Specimen" when no description exists,
  "Tissue Cassette" for blocks, "Unstained" when no stain name exists)
  is UI chrome, not data, and is translated.

### Code changes

- Added `useTranslation()` to the main component and to the three
  sub-components (`SidebarRow`, `DetailTimeline`, `PrintNode`) that
  render their own on-screen text; `buildFlatTree` (a plain helper
  function, not a component) now takes `t` as an explicit parameter
  (typed via `TFunction` from `i18next`, matching this codebase's
  established typing convention for helper functions that need
  translation outside a hook) so its item titles/fallback subtitles
  are built already-translated.
- Converted the sidebar row's hover/tooltip text (with an existing
  "Ready for review. " variant reused as a full separate translated
  sentence rather than string-concatenated, to keep each locale's
  sentence grammatically self-contained), the detail/print empty
  states, the search placeholder and match-count summary (now a
  proper `_one`/`_other` pair), the modal header/print-button text,
  the no-data print confirmation dialog, and both dispatch-history
  section labels (screen and print).
- Two dynamic inline styles — `paddingLeft: 14 + item.depth * 16` on
  each sidebar row and `marginLeft: item.depth * 14` on each print
  node — were converted to CSS custom properties
  (`--ps-mth-row-depth`, `--ps-mth-node-depth`) consumed via `calc()`
  in `pathscribe.css`, following this codebase's own established
  `style={{ '--x': value } as React.CSSProperties}` pattern for
  per-row data-driven values (seen already in `WorklistTable.tsx`,
  among others) rather than leaving the computed pixel value inline.
- Four further static inline `style={{...}}` blocks (the screen-only
  dispatch-history section's padding/max-height/scroll and its label's
  typography, plus the print-only dispatch wrapper's spacing/border
  and its own label's typography) were extracted into four new CSS
  classes.
- No `t`-shadowing found. No dead code found; the file's search-
  matching predicates (`textMatch`/`eventMatches`/`*Matches`/
  `*SelfMatches`) and tree-flattening logic were already well-factored
  into module-level helper functions, not inlined in JSX. No dedicated
  test file exists for this modal.

### CSS

Two existing classes (`.ps-mth-sidebar-row`, `.ps-mth-node`) gained a
`calc()`-based depth offset driven by a CSS custom property in place
of their previous inline pixel values. Four new classes:
`ps-mth-dispatch-history-section`, `ps-mth-dispatch-history-label`,
`ps-mth-print-dispatch-wrap`, `ps-mth-print-dispatch-label`.

### Validation

- Locale parity: 8197 → 8221 keys (+24 new leaf keys under a new
  `materialTrackingHistoryModal` namespace, including one
  `_one`/`_other` plural pair), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 124 files remaining after this
batch, largest first: `SynopticReportPage/components/
BottomActionBar.tsx` (593 lines), `Config/Macros/MacroPanel.tsx`
(578), `SynopticReportPage/modals/AmendmentModal.tsx` (574),
`TemplateBuilder/TemplatePreviewPanel.tsx` (569), `protocols/
ProtocolEditor.tsx` (568), `TemplateBuilder/RoutingRulesTab.tsx`
(559), `SynopticReportPage/modals/ManageReprintsModal.tsx` (541),
continuing on through the rest of `pages/SynopticReportPage/`,
`TemplateBuilder/`, and `protocols/`. Next up: `BottomActionBar.tsx`.

## Batch 123 — `SynopticReportPage/components/BottomActionBar.tsx` (593 lines)

### Scope

The synoptic report page's bottom action bar: case navigation, the
scrollable secondary-actions row (EMR/Delegate/Team/Review/Consult/
History/Flags/Codes), the case-state-dependent primary action cluster
(Gross Complete/Generate Report/Save/Finalize/Release Preliminary/Sign
Out/Print/Request Amendment), and the pool-claim/print-restriction
confirm dialogs.

### Data vs. chrome

- Every button label, title/tooltip, aria-label, and the hardcopy-
  print restriction confirm dialog are UI chrome and are translated.
- The pool-name label passed to `PoolClaimModal`
  (`` `${hospitalId} Pool` ``) is chrome built around a real facility
  ID — converted to `t('bottomActionBar.pool.nameSuffix', {
  hospitalId })` so the "Pool" word translates while the ID itself
  stays data, following the precedent already set in
  `FullReportPage.tsx` (`t('fullReport.defaultPoolName')`) for this
  same prop.
- `user?.name ?? 'Unknown'` / `'Unknown User'` fallback values passed
  to `RequestReviewModal`/`ExternalConsultAccessModal`/
  `PoolClaimModal` were deliberately left untouched: this exact
  fallback literal is used pervasively across many already-swept files
  (`SynopticReportPage.tsx`, `FullReportPage.tsx`,
  `BatchManagementPage.tsx`, all of which already have
  `useTranslation()`) and none of them converted it either — kept
  consistent with that existing cross-file precedent rather than
  diverging in just this one file.
- Three duplicated "Disabled — Stage 1 synoptic assignment evaluation
  in progress or awaiting review" tooltip strings (Finalize, Finalize
  & Next, Sign Out) were consolidated onto one shared
  `bottomActionBar.common.synopticPendingTitle` key instead of three
  separate copies, since it's the exact same sentence at every site.

### Code changes

- Added `useTranslation()`; converted every on-screen string in the
  file (button labels/titles, aria-labels, the print-restricted confirm
  dialog, the assist-mode-complete status text) — 53 leaf keys in
  total across 12 sub-groups.
- Three static inline `style={{...}}` blocks (the bar's own outer
  container, the right-hand action cluster, and the `Divider`
  sub-component) were extracted into three new CSS classes
  (`ps-bab-bar`, `ps-bab-right-cluster`, `ps-bab-divider`), following
  this file's own existing `ps-bab-`/`ps-bottombar-` naming
  convention.
- **Deliberately left as inline styles**: `ActionButton`'s own
  `baseStyle` object — this is a genuinely per-call-site-parameterized
  style (each of the ~20 call sites passes its own semantic `color`/
  `hoverColor`, e.g. green for Finalize, red for Abort, amber for
  Update Gross), combined with a `useState`-driven hover state and a
  `disabled` state that both affect background/border/opacity/
  transform/shadow together. Converting this to static CSS classes
  would need a `color-mix()`-based hover-background formula (to
  reproduce the current `` `${color}22` `` alpha overlay) plus a
  `:hover`/`:disabled`-pseudo-class rewrite touching all ~20 call
  sites' visual behavior at once — real regression risk for a component
  that isn't otherwise part of this batch's i18n work, so left as-is
  rather than guessing at an equivalent CSS formulation.
- No `t`-shadowing found. No dead code found — the file's existing
  `_closeCompanion`-unused comment already documents that deliberate,
  non-dead retention. No dedicated test file exists for this
  component.

### CSS

Three new classes: `ps-bab-bar`, `ps-bab-right-cluster`,
`ps-bab-divider` (see Code changes above).

### Validation

- Locale parity: 8221 → 8274 keys (+53 new leaf keys under a new
  `bottomActionBar` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 123 files remaining after this
batch, largest first: `Config/Macros/MacroPanel.tsx` (578 lines),
`SynopticReportPage/modals/AmendmentModal.tsx` (574),
`TemplateBuilder/TemplatePreviewPanel.tsx` (569), `protocols/
ProtocolEditor.tsx` (568), `TemplateBuilder/RoutingRulesTab.tsx`
(559), `SynopticReportPage/modals/ManageReprintsModal.tsx` (541),
`SynopticReportPage/components/Sidebar.tsx` (529), continuing on
through the rest of `pages/SynopticReportPage/`, `TemplateBuilder/`,
and `protocols/`. Next up: `MacroPanel.tsx`.

## Batch 124 — `Config/Macros/MacroPanel.tsx` (578 lines)

### Scope

The "My Macros" admin panel: the three-tier (Enterprise/Facility/
Personal) macro list and its editor, plus the "Import from Word"
AutoText/Building-Blocks preview-then-apply flow.

### Data vs. chrome

- Macro `name`/`shortcut`/`content`, imported Word entry `name`/
  `gallery`/`content`, and facility names (`l.name`) are real,
  user-authored or imported data — left untranslated throughout,
  consistent with how macro/role/subspecialty names have been treated
  in every prior batch.
- `Tier` (`'enterprise' | 'facility' | 'personal'`) is this panel's own
  internal visibility-scope identifier, displayed in two different
  shapes: a short tab label ("Facility") and a longer parenthetical
  select-option description ("Facility (one lab only)"). Rather than
  composing the description from the short label plus an interpolated
  fragment (grammatically risky across locales), it got two separate
  `LABEL_KEY` maps — `TIER_LABEL_KEY` and `TIER_OPTION_LABEL_KEY` —
  following this codebase's established "translate only the displayed
  label, keep the underlying value" pattern for enum-like values, with
  each map's own full text handled as a self-contained translated
  string per locale.

### Code changes

- Added `useTranslation()`/`Trans`; converted every on-screen string:
  sidebar header/hint/tier tabs/facility selector/empty states, the
  editor's field labels/placeholders/buttons, the "No Macro Selected"
  empty-state panel (using `<Trans>` for the sentence with an embedded
  `+ New` bold span), and the entire "Import from Word" modal
  (including its `_one`/`_other` "Found N entries"/"Import N Macros"
  pairs).
- Fixed one `t`-shadowing site: the tier-tabs `.map(t => ...)` callback
  parameter renamed to `tier` (it was shadowing the new
  `useTranslation()` `t`, and was also being used both as a loop
  variable AND compared against string literals in a way that read
  ambiguously next to the translation function).
- Incidental copy fix: the "Import from Word" modal's own explanatory
  sentence read "...are shown but not, since they rarely make sense..."
  — a dropped word left the sentence reading as if it were cut off
  mid-thought. Restored the evidently-intended "...are shown but **not
  pre-selected**, since..." while translating it; a small, unambiguous
  wording gap rather than an added/invented clause.
- Reused three already-established shared keys rather than adding
  duplicates: `common.select` (the "— Select —" facility placeholders),
  `common.cancel`, and `common.delete`.
- Roughly 30 inline `style={{...}}` blocks across the sidebar, macro
  list, editor form, empty states, and import modal were extracted
  into a new set of `ps-macro-*` classes, following this file's own
  already-established `ps-macro-` naming convention (it already had
  `ps-macro-tier-*`/`ps-macro-import-*` from an earlier feature build).
  The one genuinely dynamic style (the macro-list-item's selected vs.
  unselected background/border/color) became a conditional
  `ps-macro-list-item--selected` modifier class rather than a CSS
  custom property, since it's a simple binary state, not a continuous
  data-driven value. The hidden file-input's `display: none` reused
  the exact existing `ps-st-file-input-hidden` class from `StaffTab.tsx`
  (batch 117) rather than adding a near-duplicate.
- No further dead code found; the file's tier-filtering/import-flow
  logic was already well-factored into named handlers. No dedicated
  test file exists for this panel.

### CSS

One new small addition (`ps-macro-import-tier-row`) plus a new
~30-rule block covering the panel root, sidebar, macro list (including
the selected-state modifier), the editor form's field/input styling,
the empty states, and the import modal's field row — all under the
existing `ps-macro-` prefix.

### Validation

- Locale parity: 8274 → 8318 keys (+44 new leaf keys under a new
  `macroPanel` namespace, including two `_one`/`_other` plural pairs),
  exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan confirms 122 files remaining after this
batch, largest first: `SynopticReportPage/modals/AmendmentModal.tsx`
(574 lines), `TemplateBuilder/TemplatePreviewPanel.tsx` (569),
`protocols/ProtocolEditor.tsx` (568), `TemplateBuilder/
RoutingRulesTab.tsx` (559), `SynopticReportPage/modals/
ManageReprintsModal.tsx` (541), `SynopticReportPage/components/
Sidebar.tsx` (529), `SynopticReportPage/modals/SpecimenEditModal.tsx`
(493), continuing on through the rest of `pages/SynopticReportPage/`,
`TemplateBuilder/`, and `protocols/`. Next up: `AmendmentModal.tsx`.

## Batch 125 — `SynopticReportPage/modals/AmendmentModal.tsx` (574 lines)

### Scope

The amendment/correction/addendum workflow modal: the baseline-value
delta-selection step (when a report has been amended before), the
main reason/explanation form for all three modes, and the Clinical
Notification Log gate required to release an amendment.

### Data vs. chrome

- `NOTIFICATION_METHOD_LABEL` was converted to
  `NOTIFICATION_METHOD_LABEL_KEY: Record<NotificationMethod, string>`,
  following this codebase's established "translate only the displayed
  label, keep the underlying persisted value" pattern for enum-like
  data. A code comment documents that 4 other files
  (`CriticalFindingsModal.tsx`, `CopilotReportViewModal.tsx`,
  `AmendmentStatusBanner.tsx`, `AmendmentDraftBanner.tsx`) each carry
  their own untranslated duplicate of this exact lookup table and
  should follow the same `LABEL_KEY` pattern when they're swept.
- The version-history labels ("1st Amended", "2nd Amended (Most
  Recent)") used a local `ordinal(n)` helper producing English
  th/st/nd/rd suffixes, which don't transfer to other locales. Since
  no existing cross-file precedent covers locale-correct ordinals
  (two other files — `AmendmentStatusBanner.tsx` and
  `PreFinalisationModal.tsx` — have their own duplicate copies of this
  same logic but aren't swept yet), this batch introduces a new
  `formatOrdinal(n, lang)` helper with per-locale forms (French "1er"
  then "{{n}}e", German "{{n}}.", Dutch "{{n}}e", Korean "{{n}}번째",
  English keeping the existing suffix-array logic) and interpolates
  the result as an opaque `{{ordinal}}` value into the translated
  sentence — the number itself is never further translated.
- `formatDateTime`'s hardcoded `'en-US'` locale argument to
  `toLocaleString` was left untouched — it's technical timestamp
  formatting, not an on-screen translatable string, and making it
  locale-aware is a separate concern from this sweep's scope.
- "CAP/RCPath" in the notification gate note stays literal, per the
  established governing-body-abbreviation exception.

### Code changes

- Added `useTranslation()`/`Trans`; converted every on-screen string:
  the delta-selection step (header, explanation, table, empty-delta
  message, Confirm & Continue), the amending/correcting banner, the
  AMENDED/CORRECTED/ADDENDUM header label, the three mode tabs, the
  amended/corrected-by summary box, the "Changed Items Summary"
  toggle (a single `_one`/`_other` pluralized sentence rather than
  composed fragments), the three mode-specific description paragraphs,
  the addendum title/reason form fields and their three placeholder
  variants, and the entire Clinical Notification Log block (staff
  search, method select, date/time, gate note).
- Two sentences that mix translated prose with an inline `<strong>`
  span (the delta-step explanation and the "Applies to **Title**"
  line) use the self-closing `<Trans i18nKey="..." values={{...}}
  components={{ strong: <strong className="..." /> }} />` form — the
  established codebase convention (confirmed via `CaseTeamModal.tsx`)
  where the translation string itself carries a literal `<strong>`
  tag, rather than the children-based positional-tag form used in
  batch 124's `MacroPanel.tsx`.
- `formatValue` and the new `versionLabel` are module-level helper
  functions outside the component body, so they take `t: TFunction`
  (imported from `'i18next'`, not `'react-i18next'`) as an explicit
  parameter, following the pattern established in batch 122's
  `buildFlatTree`.
- No `t`-shadowing sites found. No inline styles existed in this file
  to begin with — it was already fully class-based — so no CSS work
  was needed this batch.
- No dedicated test file exists for this modal.

### CSS

None — the file had zero inline styles before this batch.

### Validation

- Locale parity: 8318 → 8369 keys (+51 new leaf keys under a new
  `amendmentModal` namespace, including one `_one`/`_other` plural
  pair), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 127 files remaining, largest first:
`TemplateBuilder/TemplatePreviewPanel.tsx` (568 lines), `protocols/
ProtocolEditor.tsx` (567), `TemplateBuilder/RoutingRulesTab.tsx`
(558), `SynopticReportPage/modals/ManageReprintsModal.tsx` (540),
`SynopticReportPage/components/Sidebar.tsx` (528), `SynopticReportPage/
modals/SpecimenEditModal.tsx` (492), `SynopticReportPage/modals/
PreFinalisationModal.tsx` (477), continuing on through the rest of
`pages/SynopticReportPage/`, `TemplateBuilder/`, and `protocols/`.
Next up: `TemplatePreviewPanel.tsx`.

## Batch 126 — `components/TemplateBuilder/TemplatePreviewPanel.tsx` (568 lines)

### Scope

The Word-style paginated print preview for report templates: page-size/
margin toolbar, an auto-paginating "printed page" render of a template's
node tree against a built-in mock clinical context, and a toggleable
raw-JSON view of that mock context.

### Data vs. chrome

- `MOCK_CTX` — the entire built-in demo clinical dataset (patient
  "Eleanor Whitmore", specimen gross/microscopic descriptions,
  diagnosis, synoptic answers, accession numbers, etc.) — was left
  completely untranslated. It's synthetic stand-in *data* for what a
  real case's clinical narrative/patient record would contain, exactly
  the kind of content this sweep's "persisted diagnostic text" and
  "real person name used as fallback/display data" exceptions cover,
  not UI chrome.
- The `case 'header':`/`case 'footer':` render cases hardcode
  "PathScribe Laboratory" / "Department of Anatomic Pathology" and a
  patient-name/DOB/accession footer line unconditionally. These mirror
  the exact same default institution-name/department fallback values
  already seeded in (not-yet-swept) `mockReportPartService.ts`
  (`e('Institution', '{{institution.name}}', 'PathScribe Laboratory')`)
  — mock/demo institution data for the preview, not UI chrome — so left
  untranslated for the same reason as `MOCK_CTX`, with a comment linking
  the two.
- `humanizeKey()` (turns a bindingKey like `lymphovascularInvasion` into
  "Lymphovascular Invasion" for the ad-hoc synoptic-answers table) stays
  untouched — it's a generic identifier-to-label transform driven by
  arbitrary internal data-key strings, not a fixed list of UI text.
- The `'—'` placeholder character used throughout `resolveField`/
  `FieldTable` for missing values is a symbol, not language-bound text,
  so it's left as-is everywhere it appears.
- Paper size names (A4, US Letter, US Legal, A3, B5) are standardised
  international nomenclature and stay literal, consistent with how
  governing-body abbreviations and clinical nomenclature are treated
  elsewhere; only each size's descriptive "where it's used" region text
  ("UK · EU · International", "Japan · Smaller clinical", etc.) is
  translated, via a new id-keyed `PAGE_SIZE_REGION_KEY` map (the
  `region` field was removed from the `PageSize` data shape itself).
- The margin-side labels (Top/Right/Bottom/Left), previously derived
  by capitalising the `Margins` key at render time, became a
  `MARGIN_SIDE_LABEL_KEY: Record<keyof Margins, string>` map — the
  same "translate the displayed label, not the underlying key" pattern
  used for every other enum-like lookup in this sweep.

### Code changes

- Added `useTranslation()` to `ContentNode`, `PageCard`, and the main
  `TemplatePreviewPanel` component; converted every genuine UI string:
  the toolbar (page-size region text, page-count, Margins/Hide/Context
  JSON/Close buttons), the margins panel heading and side labels, the
  "Mock Context — …" panel title (the patient/diagnosis descriptor
  itself stays as an interpolated, untranslated data value, same
  rationale as `MOCK_CTX`), the "Page N of M" indicator (shared between
  the page-card badge and the optional footer page-number line), and
  the four empty-state placeholders ("No synoptic data recorded", "No
  content" — shared between the paragraph and rich-text-block cases,
  "No items", "Image").
- `renderSynopticBlock`, a plain function (not a component) called
  directly rather than rendered as JSX, takes `t: TFunction` as an
  explicit parameter — the same pattern used for module-level render
  helpers since batch 122 — since it can't call `useTranslation()`
  itself.
- No `t`-shadowing sites found.
- All existing inline `style={{...}}` blocks in this file are already
  computed, per-instance layout values (page width/height from the
  selected paper size and scale, per-node `colSpan`-derived grid
  columns, per-node `fontSize`/`columnCount`/image dimensions) and were
  already individually commented as intentionally inline before this
  batch — left untouched, no static CSS to extract.
- No dead code found; no dedicated test file exists for this panel.

### CSS

None — every inline style in the file is a genuinely dynamic,
per-instance computed value (already documented as such), not a static
value that could move to a class.

### Validation

- Locale parity: 8369 → 8391 keys (+22 new leaf keys under a new
  `templatePreviewPanel` namespace, including one `_one`/`_other`
  plural pair), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 126 files remaining, largest first:
`protocols/ProtocolEditor.tsx` (567 lines), `TemplateBuilder/
RoutingRulesTab.tsx` (558), `SynopticReportPage/modals/
ManageReprintsModal.tsx` (540), `SynopticReportPage/components/
Sidebar.tsx` (528), `SynopticReportPage/modals/SpecimenEditModal.tsx`
(492), `SynopticReportPage/modals/PreFinalisationModal.tsx` (477),
`SynopticReportPage/components/AddSynopticModal.tsx` (469), continuing
on through the rest of `pages/SynopticReportPage/`, `TemplateBuilder/`,
and `protocols/`. Next up: `ProtocolEditor.tsx`.

## Batch 127 — `protocols/ProtocolEditor.tsx` (567 lines)

### Scope

The full-page editor for a clinical protocol definition (CAP/RCPath/
Custom questionnaire templates): section/question list editing,
reordering, required-flag toggling, and save with an audit-log diff.

### Extracted to a service

`save()`'s ~60-line diff-building block (comparing the original and
edited `ProtocolDefinition` to produce a human-readable list of what
changed, for the audit log) was pulled out into a new
`src/protocols/protocolChangeSummary.ts` exporting
`buildProtocolChangeSummary(orig, protocol): string[]` — pure
data-diffing logic with no React/UI dependency, a natural fit for
extraction. Its output strings ("Name: "X" → "Y"", "Added section:
...") are written verbatim into the audit log via `useAuditLog`'s
`log("save_protocol", { changes })` — persisted audit-trail text, so
per this sweep's established convention they stay in English
regardless of locale; the new file documents that explicitly.

### Data vs. chrome

- `protocol.source` (`"CAP" | "RCPath" | "Custom"`) is a persisted
  field. CAP/RCPath are governing-body abbreviations and stay literal
  per the established exception; only `"Custom"` is genuine UI copy,
  so it's translated with a plain ternary rather than a full
  `LABEL_KEY` map (documented inline).
- `protocol.lifecycle` (`draft/validated/published/archived`) and
  `question.type` (`choice/text/number/boolean`) are both persisted
  enum values — converted to `LIFECYCLE_LABEL_KEY`/
  `QUESTION_TYPE_LABEL_KEY: Record<..., string>` maps, the established
  "translate the displayed label, keep the underlying value" pattern.
  The existing 2-color (validated/draft) + default lifecycle styling
  became `ps-pe-lifecycle-value--validated`/`--draft` modifier classes.
- The default title/text seeded when a new section or question is
  added ("New Section", "New question") were translated — they're
  UI-generated placeholder starting values the pathologist immediately
  edits, not real content sourced from anywhere, so they're treated as
  on-screen chrome rather than persisted data.

### Code changes

- Added `useTranslation()`; converted every on-screen string: both
  "Back to Configuration" buttons, the not-found state, the header
  title/source/version/lifecycle line, Add Section/Add Question,
  Required checkbox label, the "Choice options editing can be added
  next…" hint, and Save Protocol. Cancel reuses the shared
  `common.cancel` key.
- No `t`-shadowing sites found.
- This file previously had no CSS classes at all — every element used
  an ad hoc `React.CSSProperties` object, including three small local
  style-builder consts (`inputStyle`, `selectStyle`, `arrowBtn(disabled)`)
  reused across the file. All ~35 style objects were extracted into a
  new `ps-pe-*` class set (a dedicated prefix for this file, distinct
  from the unrelated staining-`ps-protocol-*` and shared `ps-conf-*`
  prefixes already in use elsewhere). The two remaining "different
  look when disabled" cases (arrow buttons, Save Protocol) use the
  buttons' own native `disabled` attribute with a CSS `:disabled`
  selector instead of a JS-computed style object or a manual modifier
  class, since the component already passes `disabled={...}` to each.
  The one true conditional layout property (`marginBottom` on the
  question header row, present only when `q.type === "choice"`) became
  a `ps-pe-question-header-row--spaced` modifier class.
- No dead code found beyond the diff-logic extraction above; no
  dedicated test file exists for this editor.

### CSS

New `ps-pe-*` block (~35 rules) covering the not-found state, page
shell/nav bar, header/meta row, section cards, the shared input/select/
arrow-button styles, question cards, and the save/cancel footer row.

### Validation

- Locale parity: 8391 → 8413 keys (+22 new leaf keys under a new
  `protocolEditor` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 125 files remaining, largest first:
`TemplateBuilder/RoutingRulesTab.tsx` (558 lines), `SynopticReportPage/
modals/ManageReprintsModal.tsx` (540), `SynopticReportPage/components/
Sidebar.tsx` (528), `SynopticReportPage/modals/SpecimenEditModal.tsx`
(492), `SynopticReportPage/modals/PreFinalisationModal.tsx` (477),
`SynopticReportPage/components/AddSynopticModal.tsx` (469), `Config/
Actions/ActionsTab.tsx` (427), continuing on through the rest of
`pages/SynopticReportPage/`, `TemplateBuilder/`, and `Config/`. Next
up: `RoutingRulesTab.tsx`.

## Batch 128 — `components/TemplateBuilder/RoutingRulesTab.tsx` (558 lines)

### Scope

The admin UI for report-template routing rules: facility overrides,
physician preferences, and protocol mappings (add/edit modal + list),
a resolution-priority reference chain, and a live test panel that
traces how a given case would resolve to a template.

### Data vs. chrome

- `RoutingRuleType` (`client`/`physician`/`protocol`) drives the
  modal's dynamic "Facility"/"Physician"/"Protocol" label throughout
  (title, field label, `aria-label`, placeholder) — converted to an
  `ENTITY_LABEL_KEY: Record<RoutingRuleType, string>` map, the
  established persisted-enum label pattern.
- The resolution-pass identifiers (`client-override`,
  `physician-preference`, `protocol`, `subspecialty`, `gold-standard`,
  `client-override-enterprise`) are internal trace keys, not on-screen
  text. Two new module-level maps — `PASS_NUMBER` (language-independent
  "0"/"0a"/"0b"/"1"/"2"/"3") and `PASS_CORE_LABEL_KEY` (the translated
  label) — replace the old hardcoded `PASS_LABELS` object; the
  "Resolution priority" list and the test-result pass badge both
  compose from the same core label instead of each hardcoding their
  own copy of the same six phrases.
- The eight subspecialty option codes (`breast`, `gi`, `thoracic`, …)
  in the Test Panel are rendered as their own value *and* label at
  once — i.e. they're shown as the literal identifier, not a friendly
  translation — so they stay untranslated like other internal data-key
  identifiers, with a comment explaining why.
- A protocol/template's `status` suffix (e.g. "(draft)") shown in two
  option lists is an open `string` field with no fixed enum in this
  file's types, so it's left as a literal passthrough rather than a
  guessed `LABEL_KEY` map.

### Code changes

- Added `useTranslation()` to `RuleModal`, `RuleRow`, `TestPanel`, and
  the main tab; converted every on-screen string across all three
  sections, the add/edit modal, and the test panel. Reused five
  existing shared `common.*` keys (`cancel`, `edit`, `delete`, `yes`,
  `no`, `active`, `optional`) instead of adding duplicates.
- Fixed three `t`-shadowing sites: `templates.find(t => ...)` (×2) and
  `templates.filter(t => ...).map(t => ...)` all renamed to use `tpl`
  now that each surrounding component calls `useTranslation()`.
- No inline styles existed in this file — it already used the
  established `ps-rr-*`/`ps-conf-*`/`ps-modal-dark` class vocabulary —
  so no CSS work was needed.
- No dead code found; no dedicated test file exists for this tab.

### CSS

None — the file was already fully class-based.

### Validation

- Locale parity: 8413 → 8469 keys (+56 new leaf keys under a new
  `routingRulesTab` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 124 files remaining, largest first:
`SynopticReportPage/modals/ManageReprintsModal.tsx` (540 lines),
`SynopticReportPage/components/Sidebar.tsx` (528),
`SynopticReportPage/modals/SpecimenEditModal.tsx` (492),
`SynopticReportPage/modals/PreFinalisationModal.tsx` (477),
`SynopticReportPage/components/AddSynopticModal.tsx` (469), `Config/
Actions/ActionsTab.tsx` (427), `SynopticReportPage/modals/
MatrixBlockEditorModal.tsx` (421), continuing on through the rest of
`pages/SynopticReportPage/` and `Config/`. Next up:
`ManageReprintsModal.tsx`.

## Batch 129 — `SynopticReportPage/modals/ManageReprintsModal.tsx` (540 lines)

### Scope

The cascading 4-column reprint manager (Requisition → Specimen →
Block → Slides), with per-column Select All, grouped sections, per-
card exception badges/tooltips (Lost/Damaged/Exhausted/Entirely
Submitted), and per-column "Print X (N)" actions.

### Shared util fix (cross-file)

`entirelySubmittedBlockRangeText()` in `src/utils/blockExceptionStates.ts`
— shared by this modal and the already-swept `MaterialTreePanel.tsx` —
returned a hardcoded English sentence ("Entirely submitted in block(s)
…") with no way to translate it, evidently missed when
`MaterialTreePanel.tsx` was swept in an earlier batch. Converted it to
take `t: TFunction` explicitly (it's a plain function, not a component)
and updated both call sites to pass `t`, using a `_one`/`_other` plural
pair under a new shared `blockExceptionStates` namespace so both
surfaces stay in sync going forward.

### Data vs. chrome

- `exceptionNote` (a tech's real, free-text note on a Lost/Damaged
  block, settable through the Block/Cassette editor) stays untranslated
  everywhere it's interpolated — it's real user-authored data, not UI
  copy. Only the fixed sentence fragments around it (tooltip text,
  "Reported {{date}}") are translated; the conditional " {{date}}"/
  " — {{note}}" inclusion logic itself stayed in JS so an absent date
  or note produces no stray punctuation, unchanged from before.
- "STAT" stays literal per the established case-priority exception.
- Section-group headers ("SPECIMEN A", "BLOCK A1 (LOST)", "SPECIMEN B
  (CONSUMED — 2 BLOCKS)") are visually upper-cased with no CSS
  `text-transform` backing it — translated in natural case via `t()`
  and upper-cased in JS afterward, the same approach this file's own
  `Column` component already used for its own title.

### Code changes

- Added `useTranslation()` to `SelectAllPill`, `CheckCard`, and the
  main modal component; converted every on-screen string: column
  titles, the header, all five empty-state messages, every exception
  badge and tooltip, the damaged-block banner (with its real
  `exceptionNote` fallback text), the per-column "Print X (N)" footer
  buttons and their batch-disabled tooltips, and the busy indicator.
  "Clear"/"Select All" reuse a new shared `common.clear` key alongside
  a dedicated `manageReprintsModal.selectAll`.
- No `t`-shadowing sites found. No inline styles existed in this file
  — its own header comment already documents the "real CSS classes,
  no inline styles" convention it was built to — so no CSS work was
  needed.
- No dead code found beyond the shared-util fix above; no dedicated
  test file exists for this modal.

### CSS

None — the file was already fully class-based.

### Validation

- Locale parity: 8469 → 8513 keys (+44 new leaf keys: 39 under a new
  `manageReprintsModal` namespace, a shared `blockExceptionStates`
  namespace with one `_one`/`_other` pair, and `common.clear`), exact
  match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 123 files remaining, largest first:
`SynopticReportPage/components/Sidebar.tsx` (528 lines),
`SynopticReportPage/modals/SpecimenEditModal.tsx` (492),
`SynopticReportPage/modals/PreFinalisationModal.tsx` (477),
`SynopticReportPage/components/AddSynopticModal.tsx` (469), `Config/
Actions/ActionsTab.tsx` (427), `SynopticReportPage/modals/
MatrixBlockEditorModal.tsx` (421), `Config/Terminology/
TerminologyServicesSection.tsx` (411), continuing on through the rest
of `pages/SynopticReportPage/` and `Config/`. Next up: `Sidebar.tsx`.

## Batch 130 — `SynopticReportPage/components/Sidebar.tsx` (528 lines)

### Scope

The case sidebar: collapsed rail (per-specimen dots with hover
title/pending-change indicator), Case Comment / Retention Hold / Case
Hold summary blocks, and the expanded specimen/report tree (specimen
rows with LIS sync badges and unverified-AI-suggestion tooltips,
grossing/microscopic/synoptic report-type rows, add-report buttons,
and the delete-report confirm dialog).

### Data vs. chrome

- `DotStatus` (complete/partial/empty), `SpecimenLisStatus`
  (pendingSync/syncSent/syncRejected), and the grossing/microscopic/
  synoptic report-type discriminator are all persisted enum-style
  values — converted via the established `XXX_LABEL_KEY: Record<T,
  string>` mapping pattern (`DOT_STATUS_LABEL_KEY`,
  `REPORT_TYPE_LABEL_KEY`, and a `labelKey` field added to the
  existing `LIS_BADGE` map) so the underlying value stays literal and
  only the displayed label translates.
- The "N AI suggestion(s) still unverified across this specimen's M
  report(s)" tooltip needed two independent plural counts in one
  sentence — i18next's `count` only drives one plural selection per
  key, so it's split into two separately-pluralized fragments
  (`specimenRow.unverifiedCount` for the suggestion count,
  `specimenRow.acrossReports` for the report count), each with its
  own `_one`/`_other` pair, concatenated in JS. Same two-fragment
  approach used for the instance-row unverified-count badge.

### Code changes

- Added `useTranslation()` to `StatusDot`, `LisStatusBadge`, and the
  main `Sidebar` component; converted every on-screen string: rail
  titles, both collapse/expand toggle titles, the Case
  Comment/Retention Hold/Case Hold block labels, the section header,
  specimen-row titles/tooltips/badges, instance-row report-type
  labels and status text, the add-report buttons, and the
  delete-report confirm dialog's title/message/buttons.
- Extracted 21 inline `style={{...}}` occurrences into ~15 new
  `ps-syn-*` classes (status dots, rail dot/pending-indicator, flex-
  fill wrappers, comment icon/check-alert, unverified/review badges,
  instance-type-label with per-type color modifiers, instance-meta
  unverified state, add-microscopic button) plus one modifier added
  to an existing class, `.ps-specimen-comment-btn--active` (default
  dimmed state moved onto the base rule).
- Caught and fixed a duplicate-`className` slip introduced mid-edit
  on the rail button (two `className` props on one element) before
  it ever reached `tsc`; removed the now-unused `dotColor` const as
  dead code once its only use was replaced by the new CSS classes.
- No `t`-shadowing found; no dedicated test file exists for this
  component.

### Validation

- Locale parity: 8513 → 8567 keys (+54 new leaf keys under a new
  `sidebar` namespace, including 7 `_one`/`_other` plural pairs),
  exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 122 files remaining, largest first:
`SynopticReportPage/modals/SpecimenEditModal.tsx` (493 lines),
`SynopticReportPage/modals/PreFinalisationModal.tsx` (478),
`SynopticReportPage/components/AddSynopticModal.tsx` (470), `Config/
Actions/ActionsTab.tsx` (428), `SynopticReportPage/modals/
MatrixBlockEditorModal.tsx` (422), `Config/Terminology/
TerminologyServicesSection.tsx` (412), continuing on through the rest
of `pages/SynopticReportPage/` and `Config/`. Next up:
`SpecimenEditModal.tsx`.

## Batch 131 — `SynopticReportPage/modals/SpecimenEditModal.tsx` (493 lines)

### Scope

The add/edit-specimen modal: a searchable Specimen Dictionary panel on
the left, and an editable form (label, description, complexity,
site/laterality, collection method/container type, SNOMED codes,
referral-client foreign ID with on-blur collision detection) on the
right.

### Data vs. chrome

- `Laterality` (Left/Right/Bilateral/Midline/Not applicable) and
  `ContainerCategory` (histology/cytology/special_media) are real,
  matched/persisted tokens — laterality specifically feeds
  `inferLateralityFromText.ts`'s own English word-boundary matching —
  so both get the established `XXX_LABEL_KEY: Record<T, string>`
  treatment: the stored/compared value stays literal, only the
  displayed option/optgroup label translates.
- Real dictionary content (`e.name`, `e.site`, `e.laterality`,
  `e.procedure`, the selected entry's name, container-type names from
  `containerTypeService`) stays untranslated everywhere it's
  interpolated or listed — it's admin-authored data, not UI copy. The
  dictionary's own `type` grouping key stays as its literal English
  fallback (`'Other'`) for stable map-keying, but only translates at
  render.
- Reused five exact-match translated strings already established
  elsewhere in the app for the identical English source text
  (`AccessionPage.tsx`'s own specimen-detail fields and this app's
  `searchPage` specimen-dictionary search): `Anatomic Site`, `Select
  container type…`/`Container Type`, the five laterality option
  labels, `Search specimen dictionary…`, and the referral-client
  label/placeholder/collision-warning sentence — kept verbatim so the
  same concept reads identically wherever it appears.

### Code changes

- Added `useTranslation()`; converted every on-screen string: header
  title/subtitle, both dictionary-search empty states, the dictionary
  hint (`<Trans>`, since a bolded entry name sits inside the
  sentence), every field label/placeholder, the three validation
  error messages, the Gross Only/Gross + Micro complexity toggle and
  its two conditional hint sentences, and the foreign-ID collision
  warning.
- Extracted 7 inline `style={{...}}` blocks into 7 new
  `ps-specedit-*` classes (complexity-row/-btn/-btn--active,
  collision-warning/-warning-text, plus two `ps-specedit-hint`
  modifiers) — including defining `.ps-specedit-hint` itself, which
  the file already referenced by class name but had never actually
  had a CSS rule backing it.
- No `t`-shadowing found; no dedicated test file exists for this
  modal.

### Validation

- Locale parity: 8567 → 8616 keys (+49 new leaf keys under a new
  `specimenEditModal` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 124 files remaining, largest first:
`SynopticReportPage/modals/PreFinalisationModal.tsx` (478 lines),
`SynopticReportPage/components/AddSynopticModal.tsx` (470), `Config/
Actions/ActionsTab.tsx` (428), `SynopticReportPage/modals/
MatrixBlockEditorModal.tsx` (422), `Config/Terminology/
TerminologyServicesSection.tsx` (412), continuing on through the rest
of `pages/SynopticReportPage/` and `Config/`. Next up:
`PreFinalisationModal.tsx`.

## Batch 132 — `SynopticReportPage/modals/PreFinalisationModal.tsx` (478 lines)

### Scope

The full-screen pre-finalisation review: a draggable specimen/synoptic
reordering panel on the left, a live Q&A-format report preview (as
transmitted to LIS) on the right, and a biometric-or-password signing
panel at the bottom.

### Shared util extraction (cross-file)

`formatOrdinal(n, lang)` — a real per-locale ordinal-number formatter
(1st/2nd/... in en, 1er/2e in fr, 1./2. in de, 1e/2e in nl, 1번째/2번째
in ko) — previously lived only as a private function inside
`AmendmentModal.tsx` for its version-history labels ("1st Amended").
This batch's specimen transmission-order label ("Transmits 1st") needs
the exact same real, correct ordinal forms, so it's extracted to a new
shared `src/utils/formatOrdinal.ts`, and `AmendmentModal.tsx` is
updated to import it instead of keeping its own copy. This also
retires `PreFinalisationModal.tsx`'s own previous English-only,
6-entry word-ordinal array (`['First','Second',...]`, falling back to
a not-quite-correct `${i+1}th` past index 5) in favor of the shared,
locale-correct numeric-ordinal formatter.

### Data vs. chrome

- `reportingMode` ('assisted' | 'pathscribe') is a real, persisted
  case-level mode — converted via the established `XXX_LABEL_KEY`
  pattern. "Orchestration" itself is treated as the fixed PathScribe
  module name (matching this app's own existing, never-translated
  "PathScribe Orchestration" usages elsewhere, e.g. Staff's own
  Orchestration Access strings) and stays literal in every locale,
  while "mode" translates around it; "Assist mode" translates
  normally (precedent: `addCodeModal.assistModeNote`).
- "LIS" stays literal everywhere, matching its established fixed-
  abbreviation treatment throughout the app.
- Reused several exact-match translated strings already established
  for the identical English text: "Password" (`login.password`),
  "Verified" (`qualityAssurance.common.verified`, adjusted to the
  gender-neutral French form for this standalone badge context), and
  "Synoptic Report" wording (`rightSynopticPanel.templatePicker.title`)
  for the plural "synoptic(s) transmitted" sentence.
- Real per-field labels/answers (`fieldLabels`, `answers`, the raw
  field-key fallback humanization) stay untranslated as data,
  unchanged from before.

### Code changes

- Added `useTranslation()` to `ReportPreview`, `SigningPanel`, and the
  main modal; converted every on-screen string: header title/mode
  badge/hints, both preview empty states, the biometric/password
  signing flow (failure message, validation errors, "Signing as",
  the pluralized transmitted-count line, Verified/Verifying…, the
  Finalise buttons), the specimen name/transmission-order line, the
  synoptic fields-count line, and the required/optional-field warning
  banners (both newly pluralized on their own counts).
- Extracted 3 inline `style={{...}}` blocks (two drag-opacity states,
  one `whiteSpace: nowrap`) into new CSS modifier classes
  (`.ps-prefin-specimen-card--dragging`, `.ps-prefin-synoptic-row--
  dragging`, `.ps-prefin-nowrap`).
- No `t`-shadowing found; no dedicated test file exists for either
  this modal or the new `formatOrdinal.ts` util.

### Validation

- Locale parity: 8616 → 8647 keys (+31 new leaf keys under a new
  `preFinalisationModal` namespace, including 3 `_one`/`_other`
  plural pairs), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 123 files remaining, largest first:
`SynopticReportPage/components/AddSynopticModal.tsx` (470 lines),
`Config/Actions/ActionsTab.tsx` (428), `SynopticReportPage/modals/
MatrixBlockEditorModal.tsx` (422), `Config/Terminology/
TerminologyServicesSection.tsx` (412), `SynopticReportPage/components/
LeftReportPanel.tsx` (387), continuing on through the rest of
`pages/SynopticReportPage/` and `Config/`. Next up:
`AddSynopticModal.tsx`.

## Batch 133 — `SynopticReportPage/components/AddSynopticModal.tsx` (470 lines)

### Scope

The two-panel "Flag Manager style" add-synoptic-report modal:
specimen multi-select on the left, protocol search/filter/select with
AI-suggestion badges on the right, a "Request a template" link, and a
"Learn this pairing" opt-in that records real suggestion-acceptance
signals.

### Data vs. chrome

- The filter pills (`All`/`CAP`/`RCPath`/`BREAST`/`COLON`/`PROSTATE`/
  `LUNG`) double as literal search keywords matched against real
  protocol name/source/category text — translating their *displayed*
  text without decoupling it from the value used for matching would
  have silently broken the filter in every non-English locale. Kept
  the underlying `FILTER_TAGS` values in English (governing-body
  abbreviations `CAP`/`RCPath` render literally, per the fixed-
  vocabulary rule) and added a separate `ORGAN_TAG_LABEL_KEY` map so
  only the four organ pills' *displayed* label translates.
  `p.name`, `p.source`, `match.reason` (the AI's own advisory
  explanation text) all stay untranslated as real data, unchanged.
- Reused four exact-match translated strings already established
  elsewhere for identical English text: "Synoptic Reporting" for
  French/German/Dutch (`cytologyScreening.synopticDrawer.title` — its
  own Korean translation looks like a pre-existing mistranslation, so
  Korean was translated fresh here rather than propagated) and the
  three organ names already translated in this app's own
  `TemplateRequestModal.tsx` (rendered from this very file's "Request
  a template" link).

### Code changes

- Added `useTranslation()`; converted every on-screen string: header
  eyebrow/title/selected-count badge (pluralized), the specimen list's
  "Report exists" hint, the protocol search placeholder and filter
  pills, the empty-search state, the AI-suggestion and Applied badges,
  the "Request a template" link, the "Learn this pairing" opt-in
  title/description, and the footer's pluralized adding-status line
  and Add Report button.
- This file had **zero** CSS classes of its own before — nearly every
  element used an inline `style={{...}}` object, including two
  JS-driven hover handlers (`onMouseEnter`/`onMouseLeave`) toggling
  colors by hand. Rewrote the whole file (`Write`, not incremental
  `Edit`, since almost every line changed) with a new `ps-addsyn-*`
  class family (~35 rules) covering the modal shell, both panels,
  checkboxes, pills, protocol/specimen rows, badges, and the footer;
  replaced the two JS hover handlers with real CSS `:hover` rules
  (`:hover:not(.--selected)` to preserve the original "hover has no
  effect on an already-selected row" behavior) and the Add Report
  button's disabled styling with a native `:disabled` selector, since
  the button already carries a real `disabled` attribute.
- No `t`-shadowing found; no dedicated test file exists for this
  modal.

### Validation

- Locale parity: 8647 → 8669 keys (+22 new leaf keys under a new
  `addSynopticModal` namespace, including 2 `_one`/`_other` plural
  pairs), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 122 files remaining, largest first:
`Config/Actions/ActionsTab.tsx` (428 lines), `SynopticReportPage/
modals/MatrixBlockEditorModal.tsx` (422), `Config/Terminology/
TerminologyServicesSection.tsx` (412), `SynopticReportPage/components/
LeftReportPanel.tsx` (387), `SynopticReportPage/components/
SequencerPanel.tsx` (382), continuing on through the rest of
`pages/SynopticReportPage/` and `Config/`. Next up: `ActionsTab.tsx`.

## Batch 134 — `Config/Actions/ActionsTab.tsx` (428 lines)

### Scope

The admin System Action Registry screen: a searchable/filterable table
of every system action (keyboard shortcut, voice triggers, station
visibility), a CSV export/bulk-import flow with collision detection,
and a per-action edit modal with live shortcut recording.

### Data vs. chrome

- `exportCurrentRegistry()`'s CSV content — column headers, the
  editing-rules instruction comment block, and the `# ^ DISABLED` row
  marker — is exported/persisted file content, so it stays English
  per this app's established convention, unchanged from before.
- By contrast, `handleFileUpload`'s validation `errorLog`/`successLog`
  entries and the post-import `alert()` summary they feed are on-
  screen UI text the admin reads immediately in a dialog after an
  import runs (not file content), so those were translated — even
  though both flows process the same underlying CSV data shape.
  Extracted the summary-building logic into a new module-level
  `buildImportSummary(successLog, errorLog, noChangeCount, t)`
  function taking `t: TFunction` explicitly (from `i18next`, not
  `react-i18next`), matching this session's established pattern for
  helpers that need translated strings outside component scope.
- Category values (`action.category`, `a.category`) and the shortcut/
  voice-trigger/role values themselves all stay untranslated as real,
  persisted action-registry data; only the pseudo-category `'All'`
  filter pill translates, matching batch 133's precedent of
  decoupling a filter pill's *displayed* text from a literal
  matching/data value.

### Code changes

- Added `useTranslation()`; converted every on-screen string: header
  title/subtitle/buttons, the search placeholder, the "All" filter
  pill, table headers, the disabled-action badge and its tooltip, the
  edit-disabled tooltip, the entire edit modal (shortcut recorder's
  three states, hints, conflict/suggestion messages, voice-triggers
  and station-profiles fields, Save/Cancel), and the full import
  validation error/success vocabulary plus the `alert()` report.
- Rewrote the file's ~40 inline `style={{...}}` blocks into a new
  `ps-actionstab-*` CSS class family appended to `pathscribe.css`
  (table, category rows, shortcut-input's default/recording/error
  states, disabled-row dimming, trigger pills, the edit modal's field
  groups and station-profile grid), reusing this app's existing dark-
  theme palette and several already-established shared classes
  (`ps-conf-btn-primary/secondary/row`, `ps-conf-category-btn`,
  `ps-conf-edit-modal(-overlay)`, `ps-conf-shortcut-clear`,
  `registry-search-input`, `fm-btn-cancel`) rather than duplicating
  them under the new prefix. Added a `.ps-actionstab-row--inactive`
  modifier class to replace the disabled-row's own JS-computed
  `opacity` inline style.
- Fixed `t`-shadowing at three sites where a local variable/parameter
  was named `t` (colliding with `useTranslation()`'s own `t`):
  `handleSave`'s trigger-parsing `.map(t => ...).filter(t => ...)`,
  the CSV-import `voiceTriggers` parsing `.map(t => ...)`, and the
  `filteredActions` search filter's `.some(t => ...)` — all renamed
  to `trig`. The table render's `voiceTriggers.map(t => <span
  key={t}>{t}</span>)` was similarly renamed. No dedicated test file
  exists for this component.

### Validation

- Locale parity: 8669 → 8710 keys (+41 new leaf keys under a new
  `actionsTab` namespace, including 4 `_one`/`_other` plural pairs
  for the import-summary's count-driven lines), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 121 files remaining, largest first:
`SynopticReportPage/modals/MatrixBlockEditorModal.tsx` (421 lines),
`Config/Terminology/TerminologyServicesSection.tsx` (411),
`SynopticReportPage/components/LeftReportPanel.tsx` (386),
`SynopticReportPage/components/SequencerPanel.tsx` (381), continuing
on through the rest of `pages/SynopticReportPage/` and `Config/`.
Next up: `MatrixBlockEditorModal.tsx`.

## Batch 135 — `SynopticReportPage/modals/MatrixBlockEditorModal.tsx` (421 lines)

### Scope

The dedicated editor for a MatrixBlock (a shared, multi-specimen
cassette — e.g. a biopsy array/TMA-style block) — a "Details" tab
(status, piece tracking, foreign-id handling, label printing) plus a
"Biopsy Array / Matrix Mapping" tab (the PS-93 Array Mapper: an
interactive core grid for targeting a new ancillary stain order at
specific cores).

### Data vs. chrome

- `matrixBlock.status` (`BLOCK_STATUSES`) is the exact same real,
  persisted `BlockStatus` enum as this file's own sibling
  `BlockStainEditorModal.tsx`. Added a `BLOCK_STATUS_LABEL_KEY` map
  under this component's own `matrixBlockEditorModal.blockStatusLabels`
  namespace, translating fresh with the identical English source text
  (and matching FR/DE/NL/KO translations already established for
  `BlockStainEditorModal.tsx`'s own copy of the same enum) rather than
  cross-referencing that unrelated component's keys — consistent with
  this session's established one-namespace-per-component convention.
- Specimen/participant labels, positions, core coordinates, and stain
  names/categories (real dictionary content from `stainTypeService`)
  all stay untranslated as real, persisted case/dictionary data.

### Code changes

- Added `useTranslation()`; converted every on-screen string across
  both tabs: the header title/subtitle and reprint-label button, the
  tab bar, the participants list and edit-membership link, the
  status/pieces/description fields, the foreign-id field placeholders,
  the secondary-label button, the Array Mapper's instructional text
  and pluralized "targeting N core(s)" action-bar title, the stain
  search placeholder/empty-state, the ancillary-stains list and its
  "targeted: …" / "no core targeted yet" states, and the footer's Done
  button.
- This file had **zero** CSS classes of its own — every element used
  an inline `style={{...}}` object, including a `tabStyle(t)` helper
  computing the tab-underline style by hand and two
  `onMouseEnter`/`onMouseLeave` handlers toggling a stain-search
  result's hover background. Rewrote the whole file (`Write`) reusing
  this folder's already-established shared modal shell
  (`.ps-ms-overlay`/`.ps-ms-modal`, the same system
  `BlockStainEditorModal.tsx` and others in this folder already build
  on) for the outer chrome, plus a new `.ps-matrixblock-*` class family
  (~30 rules) for everything specific to this modal's own layout and
  Array Mapper — including real CSS `:hover`/`:disabled` selectors
  replacing the two JS hover handlers (the button already carries a
  real `disabled` attribute during an in-flight order). The Array
  Mapper's core-grid `gridTemplateColumns`/`maxWidth` are left as
  inline style, since they're genuinely computed per-render from
  `columnsFor(...)`, not fixed values — same precedent as other
  genuinely data-driven inline styles kept elsewhere in this sweep.
- No `t`-shadowing found (this file never used a local variable named
  `t`); no dedicated test file exists for this modal.

### Validation

- Locale parity: 8710 → 8745 keys (+35 new leaf keys under a new
  `matrixBlockEditorModal` namespace, including 2 `_one`/`_other`
  plural pairs), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 120 files remaining, largest first:
`Config/Terminology/TerminologyServicesSection.tsx` (411 lines),
`SynopticReportPage/components/LeftReportPanel.tsx` (386),
`SynopticReportPage/components/SequencerPanel.tsx` (381),
`contexts/AuthContext.tsx` (371), `QualityAssurance/
PatientMatchReviewSection.tsx` (369), continuing on through the rest
of `pages/SynopticReportPage/` and `Config/`. Next up:
`TerminologyServicesSection.tsx`.

## Batch 136 — `Config/Terminology/TerminologyServicesSection.tsx` (411 lines)

### Scope

The super-admin system-config screen that live-checks connectivity to
every coding-system endpoint PathScribe depends on (SNOMED CT,
ICD-10-CM, ICD-11, LOINC, ICD-O, CPT) and shows per-service status,
latency, and (for super admins) the underlying env-var configuration.

### Data vs. chrome

- Every coding-system/standards-body name (SNOMED CT, ICD-10-CM,
  ICD-11, LOINC, ICD-O, CPT, plus NLM/WHO/AMA/OAuth/SNOMED
  International mentioned in the surrounding prose) stays literal in
  every locale, per this app's established convention for
  standardized clinical nomenclature and governing-body-style
  abbreviations — confirmed this reaches beyond the CAP/RCPath/ICCR/
  RCPA/NHS set this sweep has treated as fixed vocabulary so far, to
  the wider set of real, internationally-standardized coding-system
  names this screen exists to monitor.
- `envVar`/`envValue` (the actual `VITE_*` variable names/configured
  URLs) stay literal as internal schema identifiers and real
  configuration data; `docsUrl` hrefs stay literal as real external
  links.
- `status.note` — the raw per-check diagnostic string returned by
  `testTerminologyEndpoints()` in the sibling `terminologyConfig.ts`
  (e.g. "HTTP 404", "Reachable but returned no results", "Health
  check blocked by CORS…") — is treated as diagnostic output, per
  this sweep's established persisted/diagnostic-text carve-out, and
  left untouched: `terminologyConfig.test.ts` pins one of these
  strings verbatim (`expect(results.snomed.note).toBe('Reachable but
  returned no results')`), and that file/function sit outside this
  batch's own file anyway.
- `ServiceStatus` (live/degraded/down/not_configured/license_required/
  checking) is a real, code-driven status enum — split its `label`
  out of the existing `STATUS_STYLES` styling map into a new
  `STATUS_LABEL_KEY`, the same LABEL_KEY pattern used throughout this
  sweep for persisted/enum-like values, even though this one is never
  actually persisted.

### Code changes

- Added `useTranslation()` (plus `Trans` for the two rich callout
  paragraphs that mix translatable prose with an inline monospace env-
  var span and, for the CPT callout, a real external link). Converted
  every on-screen string: the header title/intro/"Last checked" line,
  the overall-status line, the "Show env vars" toggle label, the Test
  All button, the three column headers, each service's `description`/
  `source` text (fixed vocabulary kept literal inline, e.g. "NLM",
  "AMA", "ICD-10-AM", "SNOMED"), and both callout boxes' headings and
  bodies.
- This file had **zero** CSS classes of its own — every element,
  including a small custom `Toggle` and `StatusBadge` sub-component,
  used inline `style={{...}}` objects (one with two
  `onMouseEnter`/`onMouseLeave` handlers on a docs-link anchor).
  Rewrote the whole file (`Write`) onto a new `ps-termsvc-*` class
  family (~35 rules), replacing the doc-link hover handlers with a
  real CSS `:hover` rule. The handful of genuinely per-instance
  dynamic values (the Toggle's on/off/color state, the status badge's
  per-status bg/color/dot) are kept as CSS custom properties set via
  `style`, matching this app's own already-established
  `.ps-status-badge` convention for real, data-driven color values —
  not treated as "inline CSS" to eliminate.
- **Pre-existing gap fixed**: `.ps-conf-btn-teal-accent` — the Test
  All button's own class — turned out to have **no CSS rule anywhere
  in the codebase**, despite being used at 7 real call sites across 6
  other files (`ActiveProtocolsSection`, `SynopticEditor`,
  `protocolShared`, `RuleModal`, `CasePoolAssignmentSection`, plus
  this file), every one silently falling back to unstyled browser
  button defaults on this app's dark background. Same category of
  discovery as `.ps-specedit-hint` (batch 131). Added a real rule
  matching this app's established teal-accent button look.
- No `t`-shadowing found; no dedicated test file exists for this
  component (the sibling `terminologyConfig.test.ts` tests the
  untouched `terminologyConfig.ts` module, not this one).

### Validation

- Locale parity: 8745 → 8778 keys (+33 new leaf keys under a new
  `terminologyServicesSection` namespace), exact match across
  en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing (including
  `terminologyConfig.test.ts`'s own English-string assertion on
  `status.note`, confirming that carve-out held).

### Progress estimate

A fresh whole-codebase scan finds 119 files remaining, largest first:
`SynopticReportPage/components/LeftReportPanel.tsx` (386 lines),
`SynopticReportPage/components/SequencerPanel.tsx` (381),
`contexts/AuthContext.tsx` (371), `QualityAssurance/
PatientMatchReviewSection.tsx` (369), `Common/CodeSearchModal.tsx`
(364), continuing on through the rest of `pages/SynopticReportPage/`
and `Config/`. Next up: `LeftReportPanel.tsx`.

## Batch 137 — `SynopticReportPage/components/LeftReportPanel.tsx` (386 lines)

### Scope

The read-only "Full Patient Report" summary panel on the left side of
the Synoptic Report page — case-level diagnostic text sections
(clinical history, gross/microscopic findings, preliminary diagnosis,
etc.), the compact patient-identifier row, the Internal Notes button
(with its informal-review-waiting pulse effect), and the pending-
release watermark background.

### Data vs. chrome

- The six section titles (Clinical History, Intraoperative Diagnosis,
  Gross Description, Microscopic Findings, Preliminary Diagnosis,
  Ancillary Studies) and the patient-info row labels (Case, MRN,
  Patient, DOB) are UI chrome describing this on-screen summary panel
  — not the actual signed-out report content — so all translate.
  Reused exact-match precedent translations already established
  elsewhere in the app for identical English text: "Gross Description"/
  "Ancillary Studies" (`patientHistoryModal.field.*`), "Clinical
  History" (`accessionPage.cytology.tabClinicalHistory`), "Preliminary
  Diagnosis" (`orSuiteDashboard.preliminaryDiagnosis`, minus its
  trailing colon), "No case loaded." (`rightSynopticPanel.noCaseLoaded`),
  "read-only" (`subspecialtiesSection.readOnlyLabel`), and Case/MRN/
  Patient (`worklistTable.columns.*`) — confirming "MRN" itself is
  already established as translatable UI-label text in this app
  (e.g. French "NDU", German "Patientennr."), not fixed vocabulary
  like the CAP/RCPath-style abbreviations this sweep otherwise leaves
  literal.
- All actual report content (`caseData.order?.clinicalIndication`,
  `diagnostic?.grossDescription`, etc.), the patient's own name/MRN/
  DOB, and `pendingReview.toUserName` (a real colleague's name) all
  stay untranslated as real, persisted case/person data, unchanged.
- "LIS" stays literal per this app's established fixed-abbreviation
  treatment.

### Code changes

- Added `useTranslation()`/`Trans` (the LIS read-only notice mixes
  translatable prose with an inline `<strong>`). Converted every
  on-screen string: the header title, the Internal Notes button (label,
  its pending-review tooltip sentence, the "Review Ready" badge), the
  LIS notice, "No case loaded.", the "(not recorded)" fallback, the
  patient-info row labels, and all six section titles.
  `sections`/`notRecorded` moved from module-level string literals to
  `t()`-built values computed inside the component (they need the
  hook).
- This file mixed ~15 inline `style={{...}}` blocks and a per-render
  `<style>` tag defining two `@keyframes` with a handful of already-
  existing classes (`ps-patient-info-*`, kept as-is). Rewrote the
  file's own markup onto a new `ps-leftreport-*` class family (~15
  rules), replacing the two conditional-background/two-handler-driven
  Internal Notes button states with a `--pending` modifier class and
  real CSS `:hover` rules, and moved the two `@keyframes` definitions
  (`ps-highlight-pop`, `ps-review-waiting-pulse`) out of the per-render
  `<style>` tag into `pathscribe.css` as real global rules — no
  component should be injecting its own `<style>` tag into the DOM on
  every render when the CSS is entirely static. The pending-release
  watermark's `backgroundImage`/`backgroundRepeat`/`backgroundAttachment`
  stay inline, since they're genuinely built at runtime from the org's
  own configured watermark text via `buildWatermarkBackgroundImage()`.
- No `t`-shadowing found; no dedicated test file exists for this
  component.

### Validation

- Locale parity: 8778 → 8795 keys (+17 new leaf keys under a new
  `leftReportPanel` namespace), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 118 files remaining, largest first:
`SynopticReportPage/components/SequencerPanel.tsx` (381 lines),
`contexts/AuthContext.tsx` (371), `QualityAssurance/
PatientMatchReviewSection.tsx` (369), `Common/CodeSearchModal.tsx`
(364), `LabelDesignerPage/LabelDesignerPage.tsx` (356), continuing on
through the rest of `pages/SynopticReportPage/` and `Config/`. Next
up: `SequencerPanel.tsx`.

## Batch 138 — `SynopticReportPage/components/SequencerPanel.tsx` (381 lines)

### Scope

The drag-and-drop "Report Sequencer" modal — reorders specimens and,
within each, their synoptic reports to control transmission order in
the generated report, with a live preview pane on the right.

### Data vs. chrome

- `syn.status` is a real report-instance state (loosely typed as
  `string`, never actually its own enum, but still one of a fixed set
  — `finalized`/`in-progress`/`draft`) rendered directly as literal
  text before this batch. Added a `STATUS_LABEL_KEY` map, same
  LABEL_KEY pattern used throughout this sweep, with a raw-value
  fallback for anything the map doesn't recognize (defensive, since
  the type is a loose `string`).
- `row.label`/`row.description`, `syn.templateName`, and every
  answered-field label/value in the preview pane stay untranslated as
  real, persisted specimen/template/case data, unchanged.

### Code changes

- Added `useTranslation()` to both `SequencerPanel` and its
  `PreviewPane` sub-component. Converted every on-screen string: the
  header title/subtitle, the close button's aria-label, the empty
  states ("No specimens on this case.", "No synoptics for this
  specimen", "No report preview available.", "No fields completed
  yet"), the pluralized synoptic count and "+N more fields" overflow
  link, the "active" badge, the reordering hint paragraph, the Save
  Sequence button (Cancel now reuses `common.cancel`), and the
  preview pane's "Specimen {label} — {description}" heading and "Show
  less" link.
- This file already had an extensive, well-named `ps-seq-*` class
  family from an earlier pass — most of the structural JSX already
  used classes; the remaining i18n-relevant inline styles were the
  status text color, the synoptic progress bar (track + dynamic-width
  fill), and the entire `PreviewPane` sub-component (which had never
  been converted). Reused three classes that turned out to already
  exist, unused, under this same file's naming convention
  (`.ps-seq-preview-specimen`, `.ps-seq-preview-sp-label`,
  `.ps-seq-preview-syn(--active/--default)`, `.ps-seq-preview-syn-title`,
  `.ps-seq-preview-empty`) — apparently written for this exact
  purpose in an earlier, unfinished pass and never wired up, since no
  other file references them. Corrected `.ps-seq-preview-empty`'s
  color (was `#94a3b8`) to match this file's own actual, still-live
  value (`#475569`) before reusing it. Added new
  `.ps-seq-syn-status--{finalized,in-progress,draft}` color modifiers
  and a new `.ps-seq-progress-fill(--complete)` pair (the dynamic
  `width: {{pct}}%` stays inline, since it's a real per-render
  computed value).
- No `t`-shadowing found; no dedicated test file exists for this
  component.

### Validation

- Locale parity: 8795 → 8814 keys (+19 new leaf keys under a new
  `sequencerPanel` namespace, including 2 `_one`/`_other` plural
  pairs), exact match across en/fr/de/nl/ko.
- `tsc --noEmit`: clean.
- Full suite: 499/499 test files, 4329/4329 tests passing.

### Progress estimate

A fresh whole-codebase scan finds 117 files remaining, largest first:
`contexts/AuthContext.tsx` (371 lines), `QualityAssurance/
PatientMatchReviewSection.tsx` (369), `Common/CodeSearchModal.tsx`
(364), `LabelDesignerPage/LabelDesignerPage.tsx` (356), `Config/AI/
AiProviderSettings.tsx` (337), continuing on through the rest of
`Config/` and other pages. Next up: `AuthContext.tsx`.

---
*When this framework's own contents change meaningfully (a new
locale, a structural change to config.ts), update THIS file.*

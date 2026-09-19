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

---
*When this framework's own contents change meaningfully (a new
locale, a structural change to config.ts), update THIS file.*

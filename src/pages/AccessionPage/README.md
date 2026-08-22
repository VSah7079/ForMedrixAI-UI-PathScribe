# pages/AccessionPage/

Orchestration Stage 0 entry point — Stage 0 Requirements §6.1. Captures
patient/case info and specimen list, generates the case ID, evaluates
Grossing Template assignment per specimen, and creates the Case.

## Files

- **`AccessionPage.tsx`** (1,745 lines) — the page itself. Extensively
  self-documented inline (SPECIMEN MODEL, ID generation scheme,
  skeleton-scope notes are all explained in the file's own header and
  section comments) — that documentation wasn't duplicated here.
  Genuinely solid: good error handling throughout (`try`/`catch`/`toast`
  on every async submit path, not silent failures), a real 4-dimension
  access-control-aware case-ID generation scheme with an honestly
  documented limitation (temporary scan-and-increment, not yet wired to
  the real Case Registry — see the file's own "ID generation" comment
  for why), and a self-flagged, deliberately-not-fixed stale-closure
  limitation in the voice-command effect (see its own
  `eslint-disable-next-line` comment).

  **Fixed this review:** 4 unnecessary `as any` casts, verified
  non-load-bearing by removing them and running `npx tsc --noEmit -p .`
  project-wide (zero new errors) — see `DEAD_CODE_TRACKING.md` for the
  specifics of each. A 5th `as any` (a native `<select>`'s `onChange`)
  was narrowed to `as 'M' | 'F' | 'U'` rather than removed, since some
  assertion is genuinely needed there.

  **Correction to this entry:** previously flagged here (and in
  `PRIORITY_FIXES.md` item #19) as "found, not fixed" — using
  `window.confirm()` directly for the unsaved-import-replace gate
  instead of the shared `ConfirmModal`. That was fixed in a later
  session than the one that wrote this entry; the code's own comment
  at the fix site confirms it ("Real fix: was window.confirm() —
  replaced with the shared..."). This README simply never got updated
  to match — corrected now, found while doing an unrelated README pass
  and actually checking the current code rather than trusting what was
  already written here.

  **Real bugs found and fixed in a later session** (`PRIORITY_FIXES.md`
  items #43–45):
  - The Specimens tab label showed a misleading count — the form seeds
    one empty placeholder specimen row, and the label read "Specimens
    (1)" from page load, before any real data existed. Now counts only
    specimens with an actual description entered.
  - The Case-Level Deficiency modal was genuinely broken — its trigger
    button lived on the Case & Patient tab, but the modal itself was
    accidentally written into the Specimens tab's JSX, so clicking it
    did nothing visible at all. Moved to the same tab-independent
    location `CaseCommentModal` already correctly uses.
  - `ReportDeficiencyModal` (below) now takes a `context: 'case' |
    'specimen'` prop and filters which deficiency types are selectable
    accordingly — a type like "Missing Requisition" only makes sense
    case-wide, "Container Damaged" only makes sense per-specimen; both
    used to show up in both contexts.
  - The page had zero connection to the app's shared unsaved-changes
    system (`DirtyStateContext`) — filling in real patient/specimen
    data and navigating away lost everything with no warning at all.
    Wired up fully: reactive dirty-state tracking (reusing the page's
    own existing `hasUnsavedProgress()` check), a `beforeunload`
    handler for browser refresh/tab-close, and — a real gap found only
    by testing live, not obvious from reading the code — a genuinely
    missing confirmation dialog. The shared `DirtyStateContext`
    correctly blocks navigation when dirty, but renders no UI of its
    own anywhere; every page using it has to supply its own dialog
    reacting to `pendingPath`/`confirmNavigate`/`cancelNavigate`, or
    the user just gets silently stuck. Added one, reusing the same
    `ConfirmModal` component already used for the import-replace gate.

  **Facility + Location fields (later session).** The "Submitting
  Client" dropdown was renamed to "Submitting Facility" — a real
  consistency fix, not just cosmetic: internal variable names
  (`clientId`/`clients`/`selectedClient`) were deliberately left
  unchanged (out of scope for this pass — see
  `components/ClientDictionary/README.md`'s own note on the same
  decision), so if you're reading the code rather than the rendered
  page, the naming won't match what a user sees. Right next to it, per
  direct confirmation ("add the Client and Location as fields to be
  seen in the accession page"): a new, facility-scoped **Location**
  dropdown (`services/locations/` — see that folder's own README),
  letting a tech record which ward/room/bed a manually-accessioned
  specimen came from, independent of whether any HL7 message is
  involved at all. Optional; repopulates and resets whenever the
  selected facility changes, so a location never silently carries over
  from a different facility. Sets the new `Case.order.locationId` +
  `locationDisplay` (`types/case/Case.ts`), mirroring the existing
  `clientId`/`clientName` pair exactly.

- **`OrderLookupModal.tsx`** — New file, real feature per direct
  specification: "Order Lookup & Patient Verification" modal for the
  Case & Patient tab's omnibox search. Three real pieces:

  1. **Placeholder updated** to "Search by Order #, MRN, Patient Name,
     DOB, or Client Code…" — with the actual date format shown
     dynamically (`mm/dd/yyyy` or `dd/mm/yyyy`) based on the resolved
     jurisdiction, not hardcoded — see the real, later locale-awareness
     fix below for the full story. `isoDateForSearch` (new, shared
     utility at `src/utils/isoDateForSearch.ts` — standalone rather
     than defined in either file, avoiding a circular import between
     the page and the modal it renders) converts the ISO dates this
     app stores everywhere into the format an accessioner would
     actually type.
  2. **Ambiguity trigger**: Enter or a new search-icon button both run
     the same real check — more than 3 matches, or zero *exact* matches
     among whatever partial matches came back (a new `isExactOrderMatch`
     helper — trimmed query equaling, not just containing, the order
     number/MRN/name/DOB) — opens the modal. 1–3 matches with a genuine
     exact hit stays exactly as it already worked, using the existing
     inline list.
  3. **Explicit "Advanced Search" link** opens the modal directly,
     regardless of the omnibox's current query or result count.

  The modal itself searches two real, genuinely different pools, not
  one: pending LIS orders (this file's own `IncomingOrder[]`, same data
  the inline list already used) *and* the real Master Patient Index
  (`IPatientIndexService.searchPatients()`) — the "& Patient
  Verification" half of its own name. A patient can exist in this lab's
  persistent index with no pending order at all (a walk-in, a manually-
  accessioned specimen for someone already seen before); searching only
  pending orders would silently miss that and risk a duplicate patient
  identity, exactly the real safety problem the MPI exists to prevent
  (see `IPatientIndexService.ts`'s own header comment). Selecting a
  pending order reuses the existing `handleImportOrder` unchanged;
  selecting a known patient is a new, narrower path
  (`handleSelectExistingPatient`) that only pre-fills demographics —
  there's no order-specific data (specimens, client, priority) to
  import for a bare patient-index match.

  A new `mpiScopeOrgId` is now computed once, upfront (near
  `originOrganisation`'s own definition), rather than only deep inside
  the submit handler — the modal's patient search needs a real MPI
  scope the moment it opens, before the accessioner has necessarily
  selected a client/facility on the form at all. The submit handler's
  own, previously-separate `resolveMpiScopeEnterpriseId(originOrganisation)`
  call was consolidated to reuse this same value instead of
  recomputing it a second time.

  Styled with a new `ps-ms-modal--grid` (900px) variant of this exact
  folder's existing dark `ps-ms-*` modal family (used by
  `IntraopMergePromptModal.tsx`/`ReportDeficiencyModal.tsx` already) —
  deliberately not the separate, light-themed `ps-modal-xl` used
  elsewhere in the app, which would be visually jarring against this
  page's consistently dark existing modals.

  Real test coverage added for the new, pure `isoDateForSearch` utility
  (plain ISO, ISO-with-time, leading zeros, undefined/null/empty, and
  malformed input — see the later locale-awareness fix below for its
  full, current test suite after that rewrite). The ambiguity-trigger
  and exact-match logic live inside the page component itself and were
  verified live instead: confirmed a 9-result broad search opens the
  modal, a single exact MRN match stays on the inline list, the
  "Advanced Search" link opens regardless of query state, and both
  selection paths (importing a pending order, loading a seeded Master
  Patient Index record) correctly populate the form and close the
  modal.

- **`IntraopMergePromptModal.tsx`** — Closes the loop from the original
  Intraop spec: "when the formal order finally arrives from the LIS,
  PathScribe should look for a match." A newly-accessioned case is that
  moment. Non-blocking — declining loses nothing, the entry stays in the
  Intraop Queue exactly as if this prompt didn't exist. No structural
  issues. **Fixed this review:** 2 inline `style={{ marginTop }}`
  overrides replaced with new `.ps-intraop-note-group` and
  `.ps-intraop-merge-intro--footer` classes, added next to the rest of
  the `.ps-intraop-*` family in `pathscribe.css`.

- **`ReportDeficiencyModal.tsx`** — Manual deficiency reporting, distinct
  from the auto-detected order-import dictionary mismatch. Raised, not
  raised-and-resolved — actual resolution happens later from the
  dedicated Deficiencies work queue (`pages/DeficienciesPage.tsx`),
  independent of this case's own lifecycle. Clean — no inline styles, no
  dead code, correctly reuses `ps-conf-*`/`ps-ms-*` shared classes.
  **Updated in a later session:** now takes a `context: 'case' |
  'specimen'` prop (see `AccessionPage.tsx`'s entry above) and filters
  its `deficiencyTypes` dropdown to only what's actually applicable to
  that context, always keeping the currently-selected type visible even
  if it wouldn't otherwise match — an admin can reclassify a type's
  level after the fact, and an existing record's own edit dropdown
  shouldn't lose its own selection because of that.

## Notes

All four files in this folder (including the new `OrderLookupModal.tsx`
above) are clean of inline styles — verified via `grep -n "style="`
across the whole folder, zero matches.

**`AccessionPage.tsx`, added for Phase B of the "Interface Exception &
Case-Binding Module," per direct confirmation**: a real, deliberately
de-emphasized checkbox — "This is a temporary/downtime placeholder
identity" — right after the Patient ID field. Reuses the existing,
real `.ps-accession-checkbox-row` class (found and confirmed already
in use elsewhere in this same file) rather than inventing new CSS;
checking it reveals a real reason-code dropdown
(`types/patients/BreakGlassReasonCode.ts`'s standard taxonomy). Sets
`MasterPatientRecord.isDowntimeRecord`/`downtimeReasonCode` at the
moment of creation via `resolveOrCreatePatient()` — the flag a real
downtime record needs before `services/patients/`'s
`breakGlassRebind()` will ever act on it. Verified still zero inline
styles after this addition (re-checked, not just carried forward from
the earlier claim above).

**Real fix, per direct follow-up: "Does the DOB take into account
locality? UK vs. US."** It didn't — the omnibox's new DOB search
(above) hardcoded US-style mm/dd/yyyy in both its placeholder and its
actual matching logic, despite this app explicitly serving UK/IE/CA/
AU/NZ facilities, all of which use day-first dates. A UK accessioner
typing a date the way they naturally would could silently fail to
match, or — worse — match the *wrong patient* if both interpretations
happened to be valid dates, a genuine identification risk in a feature
named "Patient Verification."

Traced to this app's own, already-established
`Facility.jurisdiction`/`SystemConfig.jurisdiction` concept
(`IFacilityService.ts`'s own doc comment: "drives... date/time
locale"). The omnibox runs before a facility is necessarily selected
at all — often the search *is* how the accessioner finds the facility
in the first place — so this uses `config.jurisdiction`, the same
system-level fallback that field's own doc comment names for exactly
this situation, rather than the form's own `selectedClient` (both
frequently empty at search time, and defined later in this file, which
would hit a real TS2448 ordering error).

A real, second finding while building the fix: the natural approach —
reusing `formatDate.ts`'s own `toLocaleDateString(locale, ...)`
mechanism — was tested directly and found unreliable. `en-CA`'s real,
live `toLocaleDateString` output is ISO format (`yyyy-mm-dd`), not the
`dd/mm/yyyy` this app's own `JURISDICTION_LOCALE.CA` table declares —
a genuine disagreement between real ICU locale data and this app's own
configuration. `isoDateForSearch.ts` (renamed from the earlier,
hardcoded `isoDateToMDY.ts`) was built to sidestep that risk entirely:
it takes the explicit `'MM/DD/YYYY' | 'DD/MM/YYYY'` hint this app
already declares (`dateFormatHint()` in `formatDate.ts`) and builds
the string directly, rather than trusting a browser/Node's bundled
locale data to agree with it. 9 real tests added, including one that
directly confirms the two formats produce genuinely different strings
for an ambiguous date (3 April vs. 4 March).

Verified live, both directions: confirmed the placeholder and the
grid's own DOB column header read "mm/dd/yyyy" under the default US
jurisdiction, switched the session to `GB_EW`, confirmed both switched
to "dd/mm/yyyy," and confirmed searching a real patient's DOB in that
UK format ("11/02/1958" for an 11 February 1958 birth date) correctly
found them.

**A real, deeper follow-up fix, per direct question: "if you don't
have a case, how do you know the client?"** — correctly caught a real
gap in the fix above. `config.jurisdiction` is a single, system-wide
setting; this search runs precisely when the client isn't known yet
(finding it is often the point). A lab that only ever deals with one
jurisdiction never notices, but one that receives orders from both a
US and a UK client through the same instance could have the system's
one guess be wrong for whichever client isn't it — silently hiding or
matching the wrong patient, in exactly the feature meant to prevent
that.

Real fix: matching no longer guesses which interpretation to use at
all. A DOB-shaped query is now checked against a candidate's date
formatted *both* as `MM/DD/YYYY` and as `DD/MM/YYYY` — whichever the
accessioner actually typed, it matches, regardless of the system's
current default. If a date-shaped query happens to be a genuine, real
exact match under both interpretations for two different real patients
(e.g. one born 3 April, another genuinely born 4 March, same year),
that's real, existing ambiguity — the already-built ">1 exact match"
trigger surfaces it to the lookup modal for a human to resolve, the
same as any other genuine ambiguity this feature already handles,
rather than the system silently guessing one and hiding the other.
`searchDobFormat`/`config.jurisdiction` remain real and load-bearing
for *display* only now (the placeholder text, the grid's own DOB
column header) — a cosmetic concern where a single, consistent hint is
still the right call, genuinely different from *matching*, where
guessing wrong has real consequences.

Verified live: with the system jurisdiction left at its US default
(unchanged), searching a real patient's DOB in UK format
("11/02/1958") still correctly found them — the exact scenario that
would have failed under the single-guess version above.

**Performance, per direct follow-up question**: measured directly
rather than assumed. `isoDateForSearch` does no `Date` construction or
locale/ICU work at all (a plain regex + string template — see that
file's own header comment for why, a separate, real finding from the
locale-awareness fix above) — checking both interpretations doubles an
already-microsecond-scale operation. Measured at real and stress-test
scale: ~0.4ms/keystroke at this app's actual real-world pending-order
count (15), ~2.6ms/keystroke at 1,000 orders, and even at an
unrealistic 10,000-order stress test (this list is an actively-worked
accession queue, not a growing archive), ~10.7ms/keystroke — under one
60fps render frame, and the dual-format check itself accounts for only
~14% of that total at the extreme end, since base substring filtering
dominates the cost regardless. No perceptible impact at any realistic
scale.

**A second, real, distinct question, same follow-up: "Scotland and
Ireland have different formats for their NHS number, would we do the
same approach there?"** No — deliberately not the same mechanism, and
worth being precise about why. The DOB fix addressed genuine
*ambiguity*: the same digits, two valid ways to read them, with no way
to know which without more context. NHS Number (England & Wales), CHI
Number (Scotland), H&C Number (Northern Ireland), and PPS Number
(Ireland) aren't different interpretations of the same value the way a
date's day/month order is — they're structurally different national ID
schemes (`PATIENT_ID_BY_JURISDICTION` in `types/systemConfig.ts`: NHS
is 10 plain digits, CHI is 10 digits with an embedded birthdate, H&C is
letters-then-digits, PPS is digits-then-letters). A given patient has
exactly one real ID, under exactly one real scheme — there's nothing
to "try both interpretations" of.

What genuinely is comparable: formatting, not interpretation. NHS
Number's own conventional display groups digits with spaces
("999 999 9999") — and this app's own `PATIENT_ID_BY_JURISDICTION`
validation pattern for it already treats spaces and dashes as optional,
interchangeable separators. Confirmed the gap was real: the omnibox's
existing MRN search was a plain, unnormalized substring match, so a
patient's number stored without spaces wouldn't match an accessioner
typing it the way it's conventionally printed (or vice versa) — not
currently reproducible with live seed data (every UK-context pending
order's own `mrn` is empty in the current seed set — genuinely no
real formatted value to test against yet), but a real, forward gap
worth closing regardless.

New, dedicated `src/utils/normalizeIdForSearch.ts` strips spaces and
dashes (and lowercases, for the letter-containing schemes) before
comparing — applied only to the MRN comparison specifically, not
order number, patient name, or client code, each of which has its own,
different formatting conventions this shouldn't disturb. Deliberately
safe in a way the DOB fix's "try both" isn't: stripping formatting
noise can only recover a real match formatting hid, never introduce a
coincidental match with a different, unrelated real ID — no genuine
ambiguity is possible here the way there is with a reinterpreted date,
so there was no need to reach for the ">1 exact match → open the
modal" safety net this time. 6 new tests added. Verified live by
injecting a real, unspaced-stored test number and confirming a search
in the conventional, spaced NHS format found it (and vice versa).

**Real, verified answer plus a real extension, per direct follow-up:
"Do you check the other formats, N. Ireland, EU, Republic of Ireland,
Canada, Australia, New Zealand, S. Korea?"** Checked directly against
the code rather than assumed, three genuinely different findings:

- **N. Ireland (`GB_NIR`), Republic of Ireland (`IE`), Canada (`CA`),
  Australia (`AU`), New Zealand (`NZ`)** — already real, existing
  entries in `Jurisdiction`, all `DD/MM/YYYY`. Already fully covered:
  the dual-format fix checks both permutations universally, regardless
  of which specific jurisdiction is active, so these five needed no
  additional work.
- **EU** — not a real entry in this app's `Jurisdiction` type at all,
  and confirmed empirically it isn't really one format either:
  `toLocaleDateString('de-DE', ...)` and `('fr-FR', ...)` are both
  day-first but Germany uses dots (`23.07.1990`) while France uses
  slashes (`23/07/1990`) — "the EU date format" doesn't describe one
  real thing.
- **S. Korea** — also absent from `Jurisdiction`, and genuinely,
  structurally uncovered by the existing fix, confirmed via
  `toLocaleDateString('ko-KR', ...)`: `"1990. 07. 23."` — year-first,
  dot-separated, not a day/month permutation at all. Neither
  `MM/DD/YYYY` nor `DD/MM/YYYY` would ever match it.

Extended `isoDateForSearch.ts` with two new formats — `YYYY-MM-DD`
(raw ISO-style typing) and `YYYY.MM.DD` (the real Korean convention) —
and consolidated the "try every format" list into two new, shared
helpers (`dobIncludesQuery`, `dobExactlyMatches`) so `AccessionPage.tsx`
and `OrderLookupModal.tsx` each maintaining their own copy of a growing
format list doesn't become its own source of drift. **Scope, stated
plainly**: this fixes *search matching* only. Full South Korea support
— a real `KR` `Jurisdiction` entry, its own patient ID scheme, a
SNOMED/ICD terminology variant — is real, separate, larger work, not
addressed here. 13 new tests added (4 new format cases, plus direct
coverage of both shared helpers). Verified live: a genuine Korean-style
query (`"1958.02.11"`) correctly found the matching patient.

**Real feature, per direct, detailed specification: NHS Number
validation and status indicator.** Three new, separate concerns, each
genuinely different in scope from the DOB/MRN search fixes above (this
one is about *validating and displaying the status of* an ID being
entered, not about *searching* for one):

1. **`src/utils/ukPatientIdValidation.ts`** (new) — real Modulus 11
   checksum validators for NHS Number (England & Wales), CHI Number
   (Scotland), and H&C Number (Northern Ireland). Deliberately three
   separate functions, not one generic "Modulus 11 checker" — CHI's
   own self-validating structure (first 6 digits = a real, syntactically
   checked DDMMYY date; digit 9 = gender parity, read but never treated
   as a validity gate — see that function's own comment for why a real
   patient's recorded sex can legitimately change after CHI issuance
   without invalidating a real, existing number) has no equivalent in
   the other two. 21 tests, using genuinely computed, correctly
   checksummed test values throughout, not plausible-looking fakes —
   one of them (`9434765919`) turned out to exactly match this app's
   own pre-existing `PATIENT_ID_BY_JURISDICTION` example value, a real,
   independent confirmation the algorithm agrees with what was already
   there before this feature existed.

   **A real, separate data-correction found and fixed along the way**:
   `PATIENT_ID_BY_JURISDICTION`'s own `GB_NIR` entry
   (`types/systemConfig.ts`) previously described H&C Number as a
   letters-then-digits format (`AA99999`) — directly contradicted by
   the real, authoritative specification this feature was built from
   (10 all-numeric digits, Modulus 11, allocated only within
   3,200,000,001–3,999,999,999). Fixed at the source rather than
   silently worked around in the new validator; the corrected example
   value (`3201234567`) is genuinely, computedly valid, not fabricated.

2. **`src/utils/patientIdStatus.ts`** (new) — the real, jurisdiction-
   aware status logic ("How to Handle This in Your Application" from
   the specification, followed directly): NHS Number's real HL7-sourced
   status code drives Green (code 01) vs. Amber (02–08) *only* for
   `GB_EW`; format/checksum failure is Red regardless of any status
   code, since a malformed number was never really checked against PDS
   at all. CHI and H&C carry no such code — per direct correction,
   Green/Red is derived entirely, honestly from local validation for
   those two, with tooltip copy that doesn't overclaim "verified" for
   what's genuinely only a local check. Every other jurisdiction this
   app models (US/CA/IE/AU/NZ) gets format-only Green/Red, no Amber
   tier — there's no real "untraced" concept to distinguish from
   "invalid" for schemes with no registry-verification concept modeled
   here at all. A real, honest state the specification's own table
   doesn't explicitly name — a format/checksum-valid NHS Number with no
   real status code known yet (e.g. typed directly at Accession, never
   resolved through an ADT feed) — is deliberately Amber, not Green:
   passing a local checksum is a genuinely weaker claim than PDS
   verification, and this app has no real basis to claim the stronger
   one. 14 tests.

3. **`src/components/Common/PatientIdStatusDot.tsx`** (new) — the real
   "UI Status Indicator Component," a small, presentational dot +
   native-tooltip component (matching this app's own established
   `title`-attribute tooltip convention, used throughout this session's
   other work) deferring all real logic to `computePatientIdStatus`.
   Wired into this page's own "Patient ID" field — shown only once a
   real facility is selected (before that, `patientIdStandard`'s own
   `'US'` default is a guess, not a real jurisdiction worth surfacing a
   status for). Verified live across all four real colors: Amber for a
   valid-but-unverified NHS Number, Red for a checksum failure, Gray
   for empty, and Green for a valid CHI Number — the last confirmed
   with its own, real, jurisdiction-specific tooltip text ("no separate
   PDS-style verification status") rather than reusing NHS Number's
   copy for a jurisdiction that has no such status to begin with.

**Deliberately not built in this pass, flagged rather than guessed
at**: extracting the real, live HL7 status code from an inbound ADT
message. Traced the existing parser (`services/hl7/adtParser.ts`'s own
`parsePID`) and confirmed it already documents the real PID-3 CX
component structure (`ID^checkDigit^checkDigitScheme^
assigningAuthority^identifierTypeCode`) but only extracts two of those
five components today. The real, standard HL7v2 CX data type has no
universally standard sub-component for an NHS-style verification
status across every UK Trust's own interface implementation — even the
specification this feature was built from only says "typically in
PID-3," not a specific component index. Extending the parser to guess
a specific position with false confidence risked being simply wrong
for whichever real Trust's feed didn't happen to match; `hl7StatusCode`
was built as a real, first-class, already-wired parameter throughout
`computePatientIdStatus`/`PatientIdStatusDot` specifically so this
extraction can be added later, once a specific Trust's real interface
spec is known, without needing to touch any of the validation or UI
logic this pass already completes.

**Real fix, per direct UI/UX request**: the Temporary/Downtime
Placeholder Identity toggle and its reason banner moved from a grid
cell sitting between Patient ID and Priority — a system-level footnote
interrupting the demographic fields around it — to a real, top-of-form
position above the entire "Given Name(s)…Sex" grid entirely. Matches a
genuine clinical workflow order an accessioner actually follows: decide
whether this is a downtime/placeholder case *before* entering a real
name, not partway through. Promoted from the previous, deliberately
de-emphasized inline-text treatment to a real, bordered banner
container — reusing this same page's own existing
`ps-accession-warnings` visual pattern (the Import from Order warnings
block, directly above) rather than inventing a second, different
amber-banner look. Verified live in both states: collapsed (banner
sits cleanly above the untouched grid) and checked (the Downtime
Reason dropdown expands within the same banner, not pushed awkwardly
into the grid below).

**Real feature, per direct, detailed specification: "Encounter
Selector & Auto-Fill."** Built on real, substantial pre-existing
infrastructure — `services/encounters/` (`IEncounterService`,
`mockEncounterService`, `Case.encounterId`) already existed in full
before this feature — rather than duplicating it. The existing
consumer (`doImportOrder`'s own `getByEncounterNumber` lookup) only
ever populated `locationId`, and only for orders that already carried
a specific `encounterNumber`; this feature is the real, broader
version the spec asked for — "upon selecting a patient," not only on
order import.

Two real, distinct trigger points, matching this page's own two real
ways a patient gets selected:

1. **Order import** (`doImportOrder`) — the order's own
   `encounterNumber` already names one specific real encounter, never
   an ambiguous set to choose among. Extended from location-only to
   the full `applyEncounterToForm` (Facility, Location, Provider), and
   now applies the same real Safety Safeguards below rather than
   unconditionally trusting the reference — a stale/historical
   encounter tied to an old order must not silently populate today's
   form.
2. **Known-patient selection** (`handleSelectExistingPatient`, the
   Order Lookup & Patient Verification modal's other real path) — a
   real, resolved MPI `patientId` already exists here
   (`patient.id`), so `listForPatient()` runs directly. This is the
   real path where "multiple active encounters" genuinely applies — a
   patient already in the index can have more than one real, current
   encounter on file.

**A real, deliberate deviation from the spec's own Auto-Fill Data
Mapping table**: it lists Clinical Indication
(`encounter.clinicalNotes`/`orderReason`) and ICD-10 Diagnosis Codes
(`encounter.diagnosisCodes`) as encounter-sourced fields. Neither
exists on the real `Encounter` type — confirmed directly, not an
oversight to "fix" by inventing new fields. A real `Encounter` models
PV1 (visit/ADT) data; clinical indication and diagnosis codes are real
OBR/DG1 (order-level) concepts, and this app already, correctly,
sources both from the order itself (`order.clinicalIndication`/
`order.icd10Codes`, already in `doImportOrder`) rather than the
encounter. Left alone here rather than silently populated from a field
that doesn't represent what the table assumed it would. The table's
Patient Demographics row needed no new code either — both real trigger
points already populate demographics before any of this runs.

**Safety Safeguards** (`src/utils/isEncounterActive.ts`, new,
extracted, and unit-tested — 12 tests, including the exact
6-months-ago-Discharged scenario the spec's own worked example names,
a 48-hour boundary case, and a future-timestamp anomaly case): an
encounter only auto-loads, or appears as a selectable candidate at
all, if its status is `'Arrived'` or `'In-Progress'` (the spec's own
"Inpatient/Admitted, In-Procedure/Day Surgery, Active Emergency") AND
its most current real timestamp (`lastEventAt`, falling back to
`admitTime`) is within 48 hours — the wider end of the spec's own
"24–48 hours" range. `'Planned'`/`'Discharged'`/`'Cancelled'` never
qualify.

New `ps-encounter-badge`/`ps-encounter-badge-unlink` (green — a
positive confirmation, not the amber the downtime banner above uses)
and a real `<select>`-based encounter picker
(`accession-encounter-selector`), both positioned directly above the
Facility field per the spec's own instruction, spanning the existing
3-column grid via `ps-accession-field--full` rather than a new,
one-off spanning rule. Each dropdown option renders the spec's own
required metadata (Encounter ID, class, date/time, facility/ward/
room/bed, attending provider). "Create without encounter link (Manual
Entry)" is the dropdown's own last option. "Change / Unlink Encounter"
clears the link without blanking already-populated fields — verified
live.

Verified live end-to-end, all three real scenarios: a single active
encounter (auto-fills, badge, no dropdown), two active encounters (no
auto-fill, dropdown with correct metadata, selecting one applies
Facility/Location/Provider correctly), and a genuinely historical
Discharged encounter from 6 months ago (correctly excluded — a patient
with 1 active + 1 historical encounter shows "1 active," not 2).

**Real, honest limitation, not addressed here**: the spec's own
"Contextual Trigger" also names "manual patient query" as a way to
select a patient. This app's real patient resolution
(`resolveOrCreatePatient`) currently only runs at form submission, not
during form-filling for a freshly, manually-typed patient — there's no
real, resolved `patientId` available yet at the point a manual entry
would need one for this feature. Moving patient resolution earlier
would risk creating premature/orphaned MPI records for cases the
accessioner ends up not submitting — a real, separate design decision,
not a small addition, and deliberately left for a dedicated follow-up
rather than worked around.

**Real, later follow-up, per direct, detailed correction**: the
original spec's own field-mapping table listed ICD-10 Codes as an
encounter-sourced field; this file's own earlier writeup above
declined to build that, since the real `Encounter` type had nowhere to
put it, and the shorthand used to justify that ("OBR/DG1
(order-level)") was itself imprecise — DG1 is its own, dedicated
segment, not part of OBR. Once that gap was closed properly
(`Encounter.diagnoses`, a real inbound DG1 parser, and a new
`updateDiagnoses()` service method — see `services/encounters/
README.md` and `services/hl7/README.md` for the full story),
`applyEncounterToForm()` was extended to use it — strictly additively.
`encounter.diagnoses` only fills the form's ICD-10 field when it's
genuinely still empty; an already-present, order-sourced code (this
page's own, correctly-established source for "why this specimen was
ordered") is never overwritten by an encounter's own, different
concept ("the diagnosis at admission/update time"). Clinical
Indication remains untouched by this — DG1-3.2 describes the
diagnosis *code*, not a free-text reason for a specimen, a genuinely
different thing even now that `Encounter.diagnoses` is real. Verified
live both ways: a real encounter's own diagnosis correctly filled an
empty ICD-10 field with the right code and description, and a
separate test confirmed an order's own, pre-existing ICD-10 code was
never overwritten by a different encounter-sourced one.

**Not yet built**: the same document's "Barcode Listener & Form
Auto-Ingestion" specification — a global scanner-speed keystroke
listener, GS1 DataMatrix/delimited/plain-alphanumeric payload parsing,
and error/ambiguity handling. Deliberately scoped as separate,
follow-up work — different technical shape from the Encounter Selector
above, large enough to deserve its own dedicated pass rather than a
rushed addition here.

**Real feature, per direct, detailed specification: "Barcode Listener
& Form Auto-Ingestion," built.** Found substantial, real, pre-existing
infrastructure before writing anything new — `contexts/
ScannerProvider.tsx` already implements the spec's own "1. Global /
Smart Focus Listener" in full, including the "Bonus UX" tier (real
keystroke-burst timing distinguishing hardware-scanner input from
human typing, working anywhere on the page, not just a focused search
box) — and already dispatches a real `PATHSCRIBE_SCAN` event on every
successful scan. What was genuinely missing, and what this pass built:
the spec's "2. Parser Logic," "3. Form Auto-Populate & Visual
Feedback," and "4. Error/Ambiguity Handling."

- **`src/utils/parseScannedPayload.ts`** (new, tested standalone) — the
  real parser. GS1 (DataMatrix/GS1-128): real, verified Application
  Identifiers (GS1's own published AI table, not assumed) — AI(01)
  GTIN, AI(10) BATCH/LOT, AI(21) SERIAL, AI(17) EXPIRY, tolerant of
  both the real GS/FNC1-delimited wire format and the common
  human-readable parenthesized notation. **A real, honest finding
  worth restating plainly**: the spec asks to extract "GTIN, Serial/
  Accession, MRN" — GTIN and Serial are real, standard GS1 AIs; GS1
  has no standard AI for MRN at all, confirmed directly against GS1's
  own AI table. AI(21) Serial is mapped to the spec's own "Serial/
  Accession" concept — the real, closest standard AI to a lab's own
  per-specimen identifier — and the real AI 90-99 "mutually defined"/
  company-internal range (where a real site would encode something
  like MRN, by bilateral agreement with its own label vendor, not a
  universal standard) is parsed into its own bucket rather than a
  fabricated "AI 91 always means MRN" assumption. Delimited (`^` or
  `|`): real, positional `[FamilyName, GivenName, MRN, DOB,
  Accession]`, tolerant of fewer than 5 real segments. Plain: the
  spec's own fallback. 14 tests.
- **`src/utils/playScanBeep.ts`** (new) — the spec's own "optional
  subtle auditory cue." A real, generated Web Audio API tone (880Hz,
  ~120ms, soft fade-out), not a bundled audio asset — genuinely fails
  silent, never breaks the rest of the scan flow if audio can't play
  (autoplay policy, no Web Audio support).
- **The real orchestrator** (`handleScannedPayload`, `AccessionPage.tsx`)
  reuses this page's own, already-built infrastructure rather than
  duplicating it: `handleImportOrder` for the spec's "Auto-fill
  complete record," `openOrderLookupModal` for "Open Search Fallback
  Modal with the scanned string pre-populated," and `isExactOrderMatch`
  for the same real, exact-match discipline the omnibox search already
  established (a scan resolves confidently or not at all — never a
  loose, ambiguous substring guess). For a delimited scan with no real,
  matching accession but genuine name/MRN/DOB data, populates the form
  directly — this page's own form already *is* the draft accession the
  spec's own "create new draft accession" describes; there's no
  separate real create action needed.

**Two real bugs found and fixed while verifying this live, not just
compiled:**

1. The scan listener was originally registered once with an empty
   effect dependency array (deliberately — re-adding a global window
   listener on every render would be real, unnecessary churn for a
   feature this frequently exercised). But `handleScannedPayload`
   itself is a plain, unmemoized function closing over `pendingOrders`
   fresh each render — the *original* closure, captured once at mount,
   kept being invoked forever, meaning every scan matched against
   whatever `pendingOrders` looked like before its own async load had
   even finished. Fixed with a ref kept current every render
   (`handleScannedPayloadRef`), a real, standard pattern for keeping a
   single, stable listener addressing today's logic without
   re-registering it constantly.
2. A real, pre-existing, simpler `PATHSCRIBE_SCAN` listener already
   lived on this page (missed during initial investigation, found only
   by seeing its actual effect live) — it just dumped a scan's raw text
   into the inline "Import From Order" box's own search field for that
   box's plain substring search to maybe pick up. Left in place
   alongside the new, comprehensive handler, it produced real,
   confusing UX: an unparsed raw GS1 string landing in that box, which
   then honestly (but misleadingly) reported "No pending orders match"
   directly beside a form the new handler had already correctly,
   successfully populated. Removed — the new handler fully supersedes
   it — but its one genuinely useful side effect (switching to the
   Case & Patient tab, since every field a scan can populate lives
   there, not Specimens) was preserved in the new handler.

Verified live, every real path: an exact-match plain scan (correctly
imports and populates the full form), a GS1-encoded scan carrying a
matching AI(21) serial (same real outcome via the parser), a delimited
scan with no matching order but real name/MRN/DOB (populates the form
directly as a new draft, no fallback), and a scan matching nothing at
all (opens the real fallback modal with the scanned string
pre-populated, same modal the omnibox search already uses).

**Real fix, issues spreadsheet #1: "This assumes an order exists, but
it may not... we should update the onscreen title perhaps?"**
Investigated rather than assumed. Manual entry with no order already
worked correctly — `sourceOrderId` stays `null`, submission proceeds
fine, and there's no separate "Order" entity either way (the `Case`
itself is the record, whether its fields came from an import or were
typed by hand). The real gap was the label alone: "Import from Order,"
prominently at the top of the form with no qualifier, could read as a
required first step. Confirmed this section is only hidden entirely
when there are zero pending orders *system-wide* — a walk-in patient
with no order of their own still sees it front and center, since other
patients' real orders exist. Added "— Optional" to the label and a
direct, explicit hint ("No matching order? Skip this and enter the
case details directly below.") — verified live.

**Real feature, per direct follow-up: "Did we want to implement the
[trigger for the] outbound Order Request message to the engine?"**
The real, actual implementation of Category E from the formal
interface specification — not just the documented payload shape. Right
after `caseRouter.createCase()` succeeds in `handleSubmit`, if
`sourceOrderId` is still `null` (a genuine scratch case — no matching
pre-existing order was ever imported), builds and dispatches a real
`OrderCreated` event via the new `services/interfaceEngine/`. See that
folder's own README for the full story, including two real bugs found
specifically by implementing this rather than just speccing it (the
formal spec's own `'ASAP'` priority value doesn't exist anywhere in
this app's real data model — confirmed via this exact file's own
`Case.order.priority` type; and this app's `requestingProvider` is a
single free-text field, never structured into first/last name parts,
so a new, honest `rawName` field was added rather than misleadingly
splitting it). Genuinely fire-and-forget — a real dispatch failure
here never blocks or rolls back an already-created Case. Verified live
both ways: a real scratch-case submission dispatches a correctly-shaped
event; importing and submitting a real, existing pending order
dispatches nothing.

**Real fix, per direct follow-up: "Will the User have to wait 6
seconds? That seems wrong."** Investigated rather than assumed —
traced the real ~6-second delay to `evaluateGrossingTemplateAssignment`
making a genuine AI/LLM network call, not to the intraop check itself
(which was already fast). First tried parallelizing the intraop lookup
with that AI call rather than sequencing it after; live-verified this
was correct but didn't meaningfully move the number (~5.6s vs ~6s),
since the AI call was always the dominant cost. Reported this
distinction honestly rather than overstating a partial fix.

**Real, larger follow-up, per direct confirmation: "The AI call can
happen in the background... not necessarily going to serialize the
accession event with Grossing immediately."** `handleSubmit` no longer
awaits `evaluateGrossingTemplateAssignment` at all. Every specimen's
`GrossingReportInstance` is created immediately with the same real
fallback template `evaluateGrossingTemplateAssignment` itself already
used for a specimen it couldn't confidently route — a genuinely
usable, gross-able Case exists the moment `handleSubmit` returns, not
a placeholder. The real AI call, the template/override lookups it
needs, and the actual refinement now run in a nested
`refineGrossingTemplatesInBackground()`, kicked off right after real
Case creation succeeds, never awaited.

Two real safety properties, both load-bearing:
1. Re-fetches the Case's real, current state via `caseRouter.getCase()`
   right before patching it — never trusts the in-memory snapshot from
   creation time, since real time has passed by the time the AI
   resolves.
2. Never silently swaps a specimen's template out from under someone
   who has already opened the case and started grossing it with the
   default — only a genuinely untouched report (`status: 'draft'`,
   zero real answers) is refined. This safety check is extracted into
   `src/utils/applyGrossingRefinement.ts` as a pure, deterministic
   function specifically so it's independently testable without
   depending on the real AI's own non-deterministic output — 10 tests,
   covering pristine vs. finalized vs. already-answered reports, no
   matching assignment, and a real mixed set where only some specimens
   should refine.

The immediate post-submit toast was also rewritten to stop claiming an
AI outcome that hasn't happened yet ("Case X accessioned with Y
specimen(s). Refining Grossing Template assignments…") — a separate,
later toast reports the real refinement outcome once it completes, but
only if something actually changed (the AI agreeing with the default
is a real, valid outcome, not something worth a second toast).

Verified live, before and after: the blocking part of submit dropped
from ~6s to consistently under 500ms (measured directly), and the
intraop merge prompt — previously waiting on the same AI call — now
appears in well under 1 second too, since it was never really the slow
part to begin with.

**Real feature, per direct follow-up on the same session: "Do we
capture failed template association? That might be a good quality
measure."** Investigated rather than assumed: confirmed the AI's real
routing confidence/reasoning/fallback status for the initial Grossing
Template assignment was never persisted anywhere in the actual data
model — only ever shown transiently (a toast, `lastResult` React
state), gone once the page was navigated away from. The async
refactor above made this more consequential, not less: the
"refined" toast now only fires when the template actually changes, so
a specimen the AI confidently agreed with the default for — a real,
valuable "the AI checked and confirmed" signal — produced no record
at all.

`refineGrossingTemplatesInBackground()` now persists a real, permanent
`templateAssignmentOutcome` on every specimen's `GrossingReportInstance`
(`types/case/Case.ts`) — one of four real outcomes: `'ai'` (a genuine,
confident AI decision), `'fallback'` (the AI ran, confidence was below
threshold), `'override'` (a Pass G0 client override, AI never ran), or
`'failed'` (the real AI call itself errored — network/provider
failure, distinct from a low-confidence result). This is recorded for
*every* specimen with a real, matching AI result, independent of
whether its actual `templateId` was safe to change — a specimen
someone already started grossing with the default still gets its real
outcome recorded, just never has its template swapped underneath them.
A genuine AI/network failure (`catch` block) persists the `'failed'`
outcome to every specimen awaiting evaluation too, via the new
`markGrossingRefinementFailed()` — a failed evaluation is itself a
real, distinct quality signal worth keeping, not just a console log.

Both the safety logic (never touch a non-pristine report's template)
and the new outcome-capture logic live in
`src/utils/applyGrossingRefinement.ts`, still fully pure and
deterministically tested — 16 tests now, covering all four real
outcomes, the mixed-pristine-and-touched case, and the genuine-failure
path.

Verified live: a real, submitted case's specimen came back from the
real AI with `outcome: 'ai'`, `confidence: 98`, and a real, specific
reasoning paragraph — correctly persisted to the real Case even though
the template itself didn't change (the AI confidently agreed with the
default), a case that would have produced zero record before this.

**Real, honest, deliberately out-of-scope follow-up**: this captures
the data; it doesn't yet surface it anywhere (no dashboard/report
reads `templateAssignmentOutcome` today — checked `components/
Contribution/AIContributionTab.tsx` and `QualityTab.tsx` directly,
this app's own existing AI-performance and quality-metric surfaces,
and confirmed neither tracks this today; "grossing" in `QualityTab.tsx`
is turnaround-time outliers, a different metric entirely). Surfacing
this — e.g., a real fallback/failure rate broken down by client or
specimen type — is a genuine, separate UI/reporting decision, not
built speculatively here.


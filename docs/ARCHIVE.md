# Archive

A record of what was purged from the repo, and when, rather than keeping
a `/docs/archive/` directory full of obsolete files around. Full copies
of everything listed here were backed up to physical media before
deletion — see `pathscribe-pre-purge-backup.zip` and
`pathscribe-supplemental-backup.zip` for the actual files if you ever
need one back.

**Commit hash note:** this container's own git history is stale (see
the project's own README history) and doesn't reflect the real,
current state of this repo — the hash column below is left blank for
you to fill in against your own real commit once this change is
actually committed.

## 2026-08-19 — Initial `/docs` restructure and pre-release cleanup

Since this is the initial release with no production deployment yet,
nothing here was legacy debt worth carrying forward. Purged rather
than migrated.

**The entire old `docs/` folder** (~30 files) — superseded by the new
structure (`architecture/`, `developer/`, `quality/`, `ip-and-legal/`,
`product/`, `public/`). Everything in it was dated March–April 2026,
predating nearly everything currently in the app (Retention Hold, Case
Hold, Batch Management, HL7 processing, MPI, and far more). Included a
0-byte corrupted duplicate of `PS-01_Master_Architecture.docx` that the
old index itself pointed to, and a dozen-plus real documents that were
never even added to that index.
- Commit: _____

**`PRIORITY_FIXES.md`** (root) — every genuinely open item it
contained is now a real, tracked Jira ticket (PS-57 through PS-71).
Two items (PS-37, PS-39) were found during reconciliation to already
be fixed and were closed directly rather than re-opened.
- Commit: _____

**`DEAD_CODE_TRACKING.md`** (root) — had zero open items at the time
of review (its own "Deferred / not yet actioned" section said "none
currently"). Ongoing dead-code tracking now lives in Jira alongside
everything else.
- Commit: _____

**`HANDOFF.md`** (root) — already self-marked "retired" in the old
`docs/` index, superseded by content since folded into the real,
per-folder `README.md` tree under `src/`.
- Commit: _____

**`PROJECT_STRUCTURE.md`** (root) — superseded by the root
`README.md`'s own, verified-accurate Project Structure section, which
now genuinely rolls up the real `src/` folder tree.
- Commit: _____

**`MIGRATION_GUIDE.md`** (root) — a completed, one-time CSS refactor
migration guide. The migration it describes is long since finished.
- Commit: _____

**`NETFLIX_SETUP.md`** (was in `src/`) — completed, one-time setup
instructions for an earlier Home page redesign ("Netflix-style card
navigation"). The redesign it describes is already live in `Home.tsx`.
- Commit: _____

**`pathscribe_TesterGuide_v3.docx`** (root) — a stray file sitting
directly at the repo root, dated March 2026, superseded by the same
reconciliation that retired the rest of the old `docs/` folder.
- Commit: _____

**`scripts/DEAD_CODE_TRACKING.md`** — a diverged, abandoned early draft
of the real `DEAD_CODE_TRACKING.md` (confirmed via direct diff, not
identical) — the wrong location for a docs file regardless.
- Commit: _____

**`_session-bundle/`** — a one-time file-delivery installer from an
earlier session's manual sync workaround. Already fully applied; no
ongoing purpose.
- Commit: _____

**`public/help.zip`** — a redundant zipped duplicate of content already
live, unzipped, in `public/help/` (the real, in-app-served Admin/User
Guide PDFs — that folder itself was not touched).
- Commit: _____

**18 confirmed-zero-reference image files in `public/`** — checked
every real source file type before purging, not just component files:
`formedrixlogotemp.png`, `formedrixlogotemp1.png`,
`formedrix-icon-dark.svg`, `formedrix-mark-dark.png`,
`formedrix-transparent.png`, `formedrixlogo.png`,
`formedrix-logo-tagline-dark.png`, `formedrix-logo-light.png`,
`formedrix-icon.svg`, `formedrix-logo-tuck-dark.png`,
`formedrix-logo-notagline-dark.png`, `formedrix-logo-tuck-light.png`,
`pathscribe-logo-clean2.svg`, `models.jpg`, `models.webp`,
`mock-emr-chart.jpg`, `worklist.jpg`, `config.jpg`.
- Commit: _____

**10 more confirmed-zero-reference files in `public/`, found in a
second, complete pass after the folder restructure** — mostly
superseded `.jpg` originals now that the real, used `.webp` versions
are live: `PREVIEW.png`, `formedrix-logo-dark.png`,
`formedrix-logo-dark.svg`, `formedrixlogotemp1.jpg`, `logs.jpg`,
`my_contributions.jpg`, `performance.jpg`, `performance.webp`,
`reverse on blue.png`, `search.jpg`. Every remaining file in `public/`
is now confirmed, individually, to have at least one real reference.
- Commit: _____

## Not purged — moved instead

Two files were real, current content sitting in the wrong location —
moved into the new structure rather than deleted:

- `public/WORKLOAD_AND_CHARGE_CAPTURE_SCOPE.md` → `docs/product/` (was
  sitting in `public/`, which would have gotten it bundled into the
  production build and served publicly — real internal scoping notes,
  not meant for that).
- `src/ACCESS_CONTROL_PLAN.md` → `docs/architecture/` (a real,
  deliberate, forward-looking plan, not stale).

## 2026-08-19 — Root-level loose-file sweep (separate pass, after the docs restructure)

**`MANIFEST.md`** (root) — a genuine delivery manifest from an earlier
session's QZ Tray browser-bridge integration work ("Real QZ Tray
browser bridge integration + printer bridge landscape"), not a stale
scratch file — found loose at the project root, almost certainly from
a zip landing directly in the project instead of somewhere separate
(the same pattern that caused the `scripts\scripts\` nesting and the
earlier README overwrite incident). Before deleting, checked its
content against the real, current documentation and found two
genuinely unique pieces not captured anywhere else — folded into
permanent docs rather than lost:
- The "why QZ Tray over a from-scratch native agent" reasoning and the
  dependency-safety verification steps (`qz-tray` vulnerability check,
  `@types/qz-tray` research, real production `vite build` confirmation)
  → added to `src/utils/labels/README.md`'s `qzTrayBridge.ts` entry.
- A README pointer to `PrinterBridgeType`'s own doc comment in
  `services/printerProfiles/IPrinterProfileService.ts`, which turned
  out to already fully document the tradeoff reasoning for all 6 real
  bridge options — just never linked from the README.

Not preserved, since it's superseded by the current, live state of
things rather than lost: a point-in-time test count (1165/1165 —
superseded by whatever the suite reports now), a plain file list
(redundant with the real, current folder structure), and a Jira
change log for PS-51/52/53/55 (those tickets' own current state is
the real source of truth going forward, not a snapshot of what
changed on one date).
- Commit: _____

**`scripts.zip`** (root) — a stale duplicate delivery of the real,
current `scripts/` folder (confirmed by its own internal listing
matching what's already live) — the source of the `scripts\scripts\`
nesting confusion, not anything from this session's own deliveries.
- Commit: _____

## 2026-08-19 — phi-audit.txt: a routine deletion question that surfaced a real, live gap

Started as "is this old April 7 PHI-scan snapshot safe to delete" —
turned into finding the real, current state was dramatically worse (67
files / 370 hits / only 12 tagged, up from 22 files / 111 hits / 58
tagged in April), and a real, repeatable bug in `scripts/tag-phi.mjs`
itself, the one tool that could fix it.

**The bug, found via direct testing before recommending anything:**
the tool's closing-tag regex matched *any* inline element name from its
own allowed list, not specifically the same tag that opened — so
`<span>{x}</div>` could satisfy the pattern whenever an unrelated
`</div>` for some outer element happened to follow. On `--write`, this
silently consumed and discarded the real closing tag, corrupting valid
JSX. Confirmed by actually running `--write` in a disposable
container first: broke 2 of ~20 touched files with genuine compile
errors. Root cause and fix (a proper backreference so the closing tag
must match the exact tag that opened) verified three separate ways
before recommending it for real: an isolated single-case reproduction,
a 3-in-a-row stress test matching the real file structure it was about
to touch, and a full `tsc`/test-suite run against the real codebase.

**Applied for real, on the real codebase, verified clean afterward** —
confirmed directly, not assumed.

**Not preserved from the old file:** the specific April 7 counts and
file list — fully superseded by the live, current state, itself
verifiable anytime via the same (now-fixed) `node scripts/tag-phi.mjs`.

**Real, remaining work, not resolved by this fix:** the tool's own
conservatism means only the simple, unambiguous cases get auto-tagged
— a substantial number of genuinely PHI-containing locations (complex
JSX, form inputs, template literals) still need manual `data-phi`
tagging, real work this fix doesn't do for you, just makes safe to
attempt at scale.
- Commit: _____

## 2026-08-19 — Inline CSS/business-logic cleanup, wherever encountered while fixing something else

Per direct standing instruction: when a file with inline `style={{...}}`
or embedded business logic is touched for any reason, the whole file
gets straightened out in the same pass — not just the one spot being
worked on — since a scoped fix just perpetuates a file that's
inconsistent with itself.

**`CrosswalkSection.tsx`** — the entire file was originally built with
inline styling throughout (~10 separate `style={{...}}` blocks: the
pending-review banner, the table wrapper spacing, the source-status
labels, the whole "Add a mapping" panel and its form fields). Found
while adding real `clientId` + `externalCode` uniqueness validation to
this same file — rather than route the new error message through yet
another inline style, converted every one to a real, named class
(`ps-xwalk-*`, added to `pathscribe.css`). Values copied exactly from
each original inline style, so this is a pure refactor — confirmed
zero visual change via a live before/after screenshot comparison, not
assumed from reading the CSS.

**`StainDictionarySection.tsx`** — one remaining inline style
(`ps-conf-section-subtitle`'s top margin) found and converted the same
way, while in this file fixing the Duplicate workflow and adding name
uniqueness — see the utils/ and Config/System/ README entries for that
fuller account.

Business-logic side of the same instruction: both fixes' actual
collision-detection logic lives in `utils/validateUnique.ts`, a real
shared utility — never written ad hoc, inline, inside either UI
component.
- Commit: _____

## 2026-08-20 — Modal overlay NavBar-clearing fix, per direct report

Real bug, confirmed live before fixing: "modals are not always
centered within the viewport. They seem a little elevated which seems
to hid the top border." `.ps-overlay` and `.ps-ms-overlay` (both real,
widely-used modal overlay classes — 41 and 26 real `.tsx` files
respectively) used plain `align-items: center` with no allowance for
the fixed NavBar. On a realistic laptop-height viewport (not just a
tall desktop one), vertically centering a moderately tall modal could
land its own top edge under/behind the NavBar — confirmed directly:
77.4px modal top vs. an 80px NavBar, a real, visible overlap, not a
theoretical one.

Fixed by applying the same NavBar-clearing convention already proven
in `.ps-conf-backdrop` (`padding-top: 88px`, `padding-bottom: 32px`,
`overflow-y: auto`) to both classes — `.ps-ms-overlay` fixed in both
of its own duplicate copies (see the still-open, broader
class-duplication finding below), `.ps-overlay` only defined once.
`overflow-y: auto` is a real, additional fix beyond centering:
`.ps-overlay` previously had no overflow handling at all, so a modal
taller than the viewport had no way to reach its own lower content.

Verified live, both classes independently, re-testing the exact
scenario that first proved the bug rather than assuming the fix from
the CSS alone: `.ps-ms-overlay` modal top moved from 77.4px
(overlapping) to 105.4px (clear); `.ps-overlay` modal top confirmed at
80.5px (clear of an 80px NavBar) with its own top border now visibly
rendered, not hidden.

**Real, confirmed remaining scope, now complete**: those two were
the highest-impact, already-measured classes, not the full picture.
A follow-up pass found and fixed 13 more real, applicable overlay
classes across the app — `fm-overlay`, `ps-conf-edit-modal-overlay`,
`ps-modal-overlay`, `ps-user-search-overlay`, `ps-cannot-fin-overlay`,
`ps-seq-overlay`, `ps-specedit-overlay`, `ps-tabswitch-overlay`,
`ps-tmpl-comment-overlay`, `ps-tmpla-picker-overlay`,
`ps-cmnt-overlay`, `ps-prefin-overlay` (adapted — uses
`align-items: stretch`, not `center`; fixed by replacing its uniform
padding with an 88px-top/32px-bottom version), and
`ps-body-modal-overlay` (confirmed duplicated 4x in this file — same
pattern as `.ps-del-*` below; all 4 copies fixed in one pass). Also
fixed for consistency, a related but not identical case:
`ps-case-not-found`, a full-page empty state rather than a bordered
modal. Real, checked exclusions (not fixed on purpose): `ps-drawer-backdrop`
(already NavBar-aware via a different technique), `ps-home-card-overlay`
(a card hover gradient, not a modal), `ps-casebar-modal-overlay`
(already `flex-start` + `padding-top: 80px`, intentionally not
centered), `ps-msg-filter-backdrop`/`ps-synrp-bg-overlay` (not real
modals), `ps-tpp-overlay` (an intentional full-screen takeover tool),
`ps-disposal-redscreen`/`ps-login-page` (not applicable), and
`ps-ctm-drag-overlay`/`ps-ose-locked-overlay-note`/`ps-ose-spellcheck-overlay`
(not full-screen modals). Full account, including the exact
verification performed, now lives on PS-77 itself (transitioned to
Done) rather than duplicated here.
- Commit: _____

## 2026-08-20 — Real dead CSS found and removed, discovered while closing out PS-77

Three separate dead-code discoveries, each confirmed via direct grep
before removal, not assumed:

**`ps-msg-modal-overlay`** (+ 8 sibling classes — the whole "Compose
Modal" section, `ps-msg-modal`, `ps-msg-modal-header`,
`ps-msg-modal-title`, `ps-msg-modal-close`, `ps-msg-modal-close:hover`,
`ps-msg-modal-body`, `ps-msg-form-row`, `ps-msg-form-label`) — zero
live usage anywhere in `src/`. A much broader scan of the full
`ps-msg-*` family (136 classes total) suggested roughly 70 more might
also be dead, but that count came from an initially flawed, too-narrow
search pattern — re-run with a simpler, proven method it still showed
~61 as dead. Given Messages is a real, active feature elsewhere in
this app, and given a boundary mistake already happened once in this
same pass (see below), that much larger claim was deliberately **not**
acted on here — flagged as its own, separate, real finding worth a
dedicated investigation, not rushed through on the strength of a grep
count alone.

**`ps-pool-overlay`** — zero live usage; `PoolClaimModal.tsx` was
refactored at some point to use the shared, already-fixed `.ps-overlay`
instead. The other 11 real `ps-pool-*` classes in the same section are
still genuinely used by that file and were left untouched.

**`ps-rp-overlay`** (+ 21 sibling classes, in two separate,
non-contiguous clusters — the whole "Report Preview Modal" feature,
including a real, historical bug-fix comment for three of its own
classes) and, found in the same investigation, **`ps-profile-modal-*`**
(14 classes, the "User Profile Modal" feature) — both confirmed zero
live usage; `ps-rp-*` superseded by `pages/ReportPreview/ReportPreviewRenderer.tsx`,
`ps-profile-modal-*`'s own real trigger (clicking the nav avatar,
`onProfileClick` in `AppShell.tsx`) confirmed to already use the
shared `.ps-overlay` instead — the same "refactored away, CSS left
behind" pattern as `ps-pool-overlay`.

**A real mistake made and fixed in this same pass, worth recording
honestly**: removing the second `ps-rp-*` cluster via a Python
line-range deletion had a genuine bug — a redundant, leftover second
slice-assignment operated on stale indices after the list had already
been shortened by the first, silently deleting ~117 lines beyond the
intended range, including the entire `ps-profile-modal-*` section.
Caught by live-testing immediately afterward (a broken, orphaned CSS
fragment appeared, and the About modal needed re-verification), not
assumed safe from the diff alone. Diagnosed precisely — confirmed via
`git show HEAD` that the over-deleted content was `ps-profile-modal-*`,
independently re-confirmed that whole family was *also* genuinely
dead (matching, not contradicting, the accidental deletion) — and
resolved by cleanly finishing its removal properly rather than
restoring dead code just to re-delete it. Every subsequent removal in
this same pass used `str_replace` with an exact, pre-viewed text match
instead of line-range deletion specifically because of this — a
mismatch now fails loudly instead of silently corrupting.

**Verified**: `tsc --noEmit -p .` clean, full test suite clean
(1291/1291, same baseline), a whole-file brace-balance check
(6297 open, 6297 close), and a live Playwright test of the real About
modal (`onProfileClick`) confirming it still renders correctly using
the shared `.ps-overlay`. A 6-page smoke test (Home, Worklist, two
Config sections, Integrations, Batch Management) confirmed no
downstream breakage from the cumulative CSS changes in this session.
- Commit: _____


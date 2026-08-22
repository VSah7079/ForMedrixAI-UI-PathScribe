# services/reportRelease/

Real feature, per direct specification: **Post-Sign-Out Release Buffer**. A
temporary, configurable hold window between the moment a pathologist signs
out a report and the moment it becomes genuinely, externally final —
during which the signing pathologist can recall and correct it without
triggering a formal amendment.

**Phase 1** (core state machine + recall), **Phase 2** (Enterprise/
Facility config hierarchy), **Phase 3** (internal safety controls —
watermark, print restriction, status badge countdown), **Phase 4**
(trainee/resident integration), and **Phase 5** (audit-logging polish)
are all complete. This closes the confirmed 5-phase build.

## The one design decision worth understanding before touching this folder

`Case.finalizedAt` already drives real, existing TAT/SLA calculations
(`QualityTab.tsx`'s "Actual TAT" metric, `IFacilityService`'s configurable
per-client TAT target) — confirmed by direct search across every real
consumer before writing a single line here. Deferring when that field gets
written until real, buffer-aware release would silently shift those
metrics by the buffer duration, for every facility, without anyone having
decided that should happen.

Fixed by never touching that field's existing meaning: `finalizedAt` is
still stamped the moment sign-out completes, buffer or not. A new,
separate `Case.releasedAt` field captures the real, buffer-aware "genuinely
final and dispatch-eligible" moment instead — equal to `finalizedAt`
immediately when no buffer applies, or set later, at real expiry, when one
does. See `CaseStatus.ts`'s own `'pending-release'` doc comment and
`Case.ts`'s own `releasedAt` doc comment for the full reasoning.

## Real, honest architectural scope

The specification's own "deferred job scheduling" / "atomic job
cancellation" describes real backend infrastructure (a job queue, workers)
that does not exist in this frontend-only, mock-service-backed app —
confirmed directly: PathScribe has no real backend at all today. What's
built here is the real, correct state machine and its client-side
simulation — `checkAndReleaseIfExpired()`, called from
`ReleaseBufferBanner.tsx`'s own live countdown timer, is genuinely correct
for an open tab, but isn't yet backed by a real, server-side scheduler
that would also release a case nobody has the page open for. Flagged
honestly here and in the component itself, not hidden.

## Files

- **`IReportReleaseService.ts`** / **`mockReportReleaseService.ts`** —
  standard interface/mock pattern.
  - `resolveBufferForCase()` — the real, full resolution: org default,
    overridden by whichever real, performing facility handles this
    case's work (`resolvePerformingLabFacilityId()`) if that facility
    has `releaseBufferOverride.inheritSystemDefault` set to `false`.
    Structurally mirrors `services/session/ISessionTimeoutService.ts`'s
    own, already-proven org-default/per-performing-lab-override
    resolution chain — not a new pattern invented for this feature. A
    real STAT-priority bypass (`Case.order.priority`) is part of the
    resolved config too, so a facility can require STAT cases to still
    buffer even when the org default bypasses them, or vice versa. A
    Frozen Section bypass is also named in the spec but deliberately
    NOT built — frozen status lives at the specimen level
    (`Specimen.frozenCategory`), and a real, correct case-wide rule from
    that (ALL specimens frozen? ANY specimen?) needs a real product
    decision this phase doesn't guess at.
  - `getOrgDefault()` / `setOrgDefault()` — the real, localStorage-backed
    org-wide config, with a real, sensible fallback
    (`FALLBACK_ORG_CONFIG`) matching Phase 1's own prior default
    behavior, so an enterprise that never opens the new config screen
    sees no silent change.
  - `recall()` / `checkAndReleaseIfExpired()` / `startBuffer()` —
    unchanged from Phase 1; see git history or the Phase 1 delivery
    manifest for their own design notes.

- **`mockReportReleaseService.test.ts`** — 17 tests: the original 12
  (state machine, recall, race protection) plus 5 new ones covering
  `getOrgDefault`/`setOrgDefault`, a real STAT case correctly NOT
  bypassing once the org config's own `bypassForStat` is set to
  `false`, a disabled org config making the buffer never apply, and
  both real facility-override paths (genuine override winning over the
  org default; explicit `inheritSystemDefault: true` correctly falling
  through to the org config rather than using its own dormant values).

## New type: `Facility.releaseBufferOverride`

`services/facilities/IFacilityService.ts` — deliberately an explicit
`inheritSystemDefault` flag, not the simpler "`null`/`undefined` means
inherit" shape `idleTimeoutMinutesOverride` uses on the same interface,
per direct specification's own explicit "Inherit System Default: Toggle
(ON/OFF) — Facility Level Only" UI requirement — a facility here overrides
three related values together (enabled/duration/bypass), not one bare
number, so a single clear switch an admin can see and flip is more honest
than an implicit blank-means-inherit convention.

## Real admin UI

**Org-wide default** — `components/Config/Integrations/LISSection.tsx`,
under Configuration → Integrations → LIS Integration, per direct
specification's own stated navigation ("Under Integration sublevel LIS
Integrations"). Reuses that file's own existing `Toggle`/`SettingRow`
components.

**A real, genuine mistake made and caught while building this**: a
second, near-identical `LISSection.tsx` exists at
`components/Config/System/LISSection.tsx` — confirmed, directly, to be
orphaned dead code, never imported anywhere in the app (the real one is
consumed by `components/Config/Integrations/index.tsx`). The org-config
UI was built against the orphaned file first; caught by checking which
file was actually wired into navigation before considering the work
done, reverted cleanly via `git checkout`, and rebuilt against the real
file. Left here as a note in case anyone else reaches for
`Config/System/LISSection.tsx` in the future — it does nothing.

**Per-facility override** — `components/ClientDictionary/ClientEditorModal.tsx`,
on the facility editor's AI & Performance tab, right alongside the
existing idle-timeout override, matching that established split (org
default gets its own config screen; facility override lives on the
facility editor) — confirmed via `SessionSecuritySection.tsx`'s own
header comment before building.

## Real consumer

`pages/SynopticReportPage/hooks/useSignOutWorkflow.ts`'s `finalizeCase()`
— `resolveBufferForCase()` is now `await`ed (a real, async facility
lookup is involved as of Phase 2) but the call site itself didn't
otherwise need to change — the interface was designed in Phase 1 so nothing
calling it would need to when Phase 2 landed.

## Verified

- Full test suite: 773/773 passing (17 in this folder), zero
  regressions.
- Full live browser verification: navigated to the real, correct config
  screen (Configuration → Integrations → LIS Integration), changed the
  buffer duration through the actual UI, confirmed it persisted via a
  direct read-back. Directly verified the full, real resolution chain
  live in the running app (not just in tests): a facility with a
  genuine override correctly won over the org default (a STAT case
  correctly did NOT bypass, using the facility's own 4-minute duration
  instead of the org's 8), and a case with no facility correctly fell
  back to the org default. Zero console errors throughout.
- The Facility Configuration edit modal's own override UI was not
  independently screenshotted (browser-automation tab-navigation proved
  fragile) — compiles clean and is wired to the real, correct
  `FacilityInput` type, but its specific visual rendering is unconfirmed
  relative to the org-level screen above.

## Phase 3: internal safety controls

**Status badge countdown** (spec §13b) — `HeaderBar.tsx`'s real, always-
visible status pill now shows "(MM:SS remaining)" while
`pending-release`, via a new, shared `useReleaseBufferCountdown` hook
extracted from `ReleaseBufferBanner.tsx` (Phase 1) so both share the
exact same live timer rather than a second, separately-maintained copy.
A real, dedicated `pending-release` CSS variant was also added — it
previously silently fell back to the generic `draft` styling, since the
existing `CASE_STATE_CLASS` map had no entry for it. Deliberately teal,
not another shade of `pending-review`'s yellow, so the two distinct
"pending" states aren't visually confused.

**On-screen watermark** (spec §13a) — `PendingReleaseWatermark.tsx`
exports `buildWatermarkBackgroundImage()`, applied to
`LeftReportPanel.tsx`'s real "Full Patient Report" container. **A real,
genuine bug found and fixed while building this**: the first
implementation was a separately-positioned `position: absolute; inset: 0`
overlay — which, placed inside a *scrollable* container, sizes against
that container's own `height: 100%` (the visible viewport) rather than
its taller, scrolled content height. It would have covered only the
initial view and scrolled out of sight, leaving the rest of a long
report genuinely unwatermarked — directly contradicting the spec's own
"any... browser view... renders a... watermark" requirement. Fixed by
applying the pattern as the container's own `backgroundImage` with
`backgroundAttachment: 'local'`, which scrolls WITH the content and
tiles automatically — verified live: scrolled a real report to the
bottom and confirmed the watermark continued tiling across the newly-
revealed content, not just staying at the original position.

**Print restriction** (spec §14) — `BottomActionBar.tsx`'s existing
CoPilot/'assist'-mode Print button now also appears during
`pending-release` (previously gated to `status === 'finalized'` only,
so it never showed at all during the buffer window). When
`restrictHardcopyPrinting` is on, clicking it shows a real confirmation
naming the watermark before proceeding — never a silent block, matching
the spec's own "administrative override... watermarked" language.
**Real, honest scope gap**: this covers the one print entry point in
this file. Orchestration mode's separate print entry point (confirmed
to live inside the full report preview panel — a genuinely different
component, not duplicated here) is NOT yet gated.

**PDF payload** — `generateReportPdfSnapshot()` in
`SynopticReportPage.tsx` now sends a real `watermarkText` field
(genuinely absent, not an empty string, for any case that isn't
`pending-release`) through to the separate, server-side PDF renderer —
same honest, already-established caveat as that function's own
`documentStyle` field: sent so the renderer CAN draw it, not verifiable
from this frontend codebase that it actually does.

**Config additions** — `ReportReleaseOrgConfig` gained `watermarkText`
(default matches the spec's own stated default) and
`restrictHardcopyPrinting` (default `true`, matching the spec's own
"restricted... by default"). Deliberately enterprise-level only, not
part of the facility override — see the type's own doc comment for the
full reasoning. `readOrgConfig()` now merges with the fallback for any
missing fields, so a config saved before Phase 3 stays valid rather than
silently missing the new fields.

## Phase 4: trainee/resident integration

**A real, serious, pre-existing bug found and fixed** — not something
the spec asked me to build so much as something re-reading the spec's
own §15b forced me to actually check. `ReleaseBufferBanner.tsx`'s props
were named `signingUserId`/`signingUserName`, but actually held
`SynopticReportPage.tsx`'s own `useAuth().user` — the CURRENT viewer,
not the pathologist who signed this specific case out. That meant ANY
user viewing a `pending-release` case, including a trainee with no part
in signing it, saw a fully functional "Recall Report" button. Confirmed
by tracing the actual prop wiring, not assumed.

Fixed with two real layers, not just a UI tweak:
- **UI**: renamed the props to `currentUserId`/`currentUserName` (honest
  about what they hold), and gated the actual Recall button to
  `caseData.finalizedBy === currentUserId` — a real, existing field
  (already set unconditionally in `finalizeCase()`'s own patch; no new
  field needed). A non-signer still sees the real countdown/status —
  the spec's own "educational access" — just not an action that was
  never theirs.
- **Service**: `mockReportReleaseService.recall()` itself now refuses a
  mismatched `performedBy.userId` against the case's own `finalizedBy`
  — defense in depth, so a caller that bypassed the UI entirely still
  can't recall someone else's report. Verified live: a direct service
  call as a non-signer was genuinely refused
  (`"Only the pathologist who signed this report out can recall it."`),
  not just hidden from the UI.

**§15a verified, not just assumed** — traced the existing resident/FPPE
countersign gate in `useSignOutWorkflow.ts` directly: its own explicit
`return` (with the comment "does not proceed to reconciliation check or
any finalize logic below") already guarantees a resident's submission
never reaches `finalizeCase()`, so the buffer genuinely never applies.
Strengthened the existing test for this gate with an explicit assertion
that no `caseRouter.updateCase` call it made ever set
`status: 'pending-release'` — a real, durable, testable guarantee now,
not just a comment someone could silently break later.

**§15b verified** — checked `caseAccessControl.ts` directly for any
`Case.status`-based viewing restriction; none exists. Access is governed
entirely by organisation/pool/subspecialty/participant rules, independent
of whether a case happens to be `pending-release` — so "trainees and
attendings can view Pending Release reports" was already true by
architecture, and the countdown/watermark from Phases 1–3 already render
for any viewer with case access, not gated to the signer.

## Phase 5: audit-logging polish

**Two real, app-wide audit-system gaps found and fixed** — not scoped to
this feature alone, since fixing them narrowly would have left the same
bug in place for every other real event in the app.

1. `sign_out_buffered` (logged since Phase 1 via `useSignOutWorkflow.ts`'s
   own `log()` callback) was never registered in the separate
   `useAuditLog`/`AuditEvent` system's own `AuditAction`/`AuditPayload`/
   `buildDetail` — meaning it silently fell through to a raw
   `JSON.stringify(payload)` in the stored `detail` string, unlike every
   other real event in that file, which get a clean, human-readable
   sentence. Fixed by adding it properly, matching `case_finalized`'s
   own already-established pattern exactly.
2. `audit/auditLogger.ts` — the bridge between the `useAuditLog` system
   and the real, shared `mockAuditService` store — hardcoded
   `caseId: null` on *every single event* routed through it, regardless
   of what the real caller's own payload carried. Many real, pre-existing
   payloads already had a genuine case id sitting unused
   (`flag_applied`, `case_search_opened`, `case_finalized`, and others).
   Fixed with a real, generic runtime extraction
   (`(payload as { caseId?: string })?.caseId ?? null`) rather than
   retrofitting each of this file's ~80 individual `AuditPayload` entries
   to formally declare the field — a much larger undertaking than this
   phase's real scope. The same generic pattern was extended to a new
   `facilityId` field too.

**`facilityId` added to the real, shared `AuditLog` type** (spec §18a).
Optional and additive — genuinely absent for the many pre-existing audit
calls across this app that don't populate it, not backfilled. Populated
on all three of this feature's own direct audit events
(`SIGN_OUT_BUFFERED`, `SIGN_OUT_RECALLED`, `RELEASE_BUFFER_EXPIRED`) using
the case's real `originHospitalId`, and on `sign_out_buffered` via the
same generic extraction mechanism described above.

**Client IP address — deliberately not built, and not faked.** Spec §18a
also asks for client IP addresses in every audit entry. This is a real,
honest architectural limitation, not an oversight: a frontend-only,
mock-service-backed app (confirmed repeatedly this session — there is no
real backend anywhere in PathScribe today) has no truthful way to capture
a client's real IP address. The IP a compliance audit actually wants is
the one a real server sees when it receives the request — not something
the client can honestly self-report. Adding a field that would always be
`null`, or worse, populated via an unreliable client-side trick, would be
actively misleading rather than simply incomplete. This requires real
backend infrastructure to close correctly, the same category of gap as
the deferred job queue described earlier in this README.

**Spec §18b ("complete internal version histories... preserved") — a
real, genuine finding, flagged rather than acted on.** Traced where
`ReportVersionRecord`s actually get created during sign-out:
`finalizeCase()` (where this feature's own buffer decision lives) never
creates one itself. Only a separate function, `finalizeSignOut()` (tied
to a different real UI action — confirmed via real call-site tracing,
not assumed), does. Both are real, pre-existing, unrelated-to-this-
feature parts of the sign-out architecture that predate this feature's
own work. Changing that relationship was judged out of this phase's real
scope — audit-logging polish, not a rearchitecture of pre-existing
sign-out/versioning logic this session didn't build and doesn't have
full context on the blast radius of. Flagged here plainly as a real,
open question rather than silently left unmentioned or riskily "fixed"
without that context.

## Verified

- `npx tsc --noEmit -p .` — clean
- Full test suite: 775/775 passing (facilityId now asserted directly in
  an existing, strengthened test), zero regressions from the deeper,
  app-wide audit-system changes — verified across two separate full
  runs after one unrelated Firestore-emulator flake.

## Worklist visibility (added after the pre-push audit)

A real, genuine gap found while auditing before your git push: a
`pending-release` case matched none of `WorklistPage.tsx`'s existing tab
filters (`inprogress`, `draft`, `completed`, etc.) — it was only visible
under "All," easy to lose track of. Per your own direction ("that is
where they would access their [cases]"), added a dedicated
**"Queued for Release"** tile, matching the existing
"Awaiting My Countersign" tile's own established pattern exactly —
including being scoped to the current user's own signed cases
(`caseData.finalizedBy === user?.id`, the same real field Phase 4's
Recall-authorization fix uses), since a system-wide count of every
pending-release case in the org wouldn't be actionable for a viewer who
can't recall someone else's case anyway.

Verified live: the tile renders with a real, correct count in whichever
worklist context (LIS/Outreach) the case actually belongs to, the page
title correctly changes to "Queued for Release" when active
(reusing the existing shared `FILTER_LABELS` map — this codebase's own
fix for a previously-real, separate bug where tile labels and page
titles could silently drift apart), and clicking it correctly filters
the table to just that one case. Zero console errors.

`SearchPage.tsx` and `WorklistTable.tsx` were also found missing
`'pending-release'` from their own status-enumeration lists during the
same audit (a new `CaseStatus` value built while focused on
`SynopticReportPage.tsx` is exactly the kind of thing easy to miss
elsewhere) — both fixed, using the same teal as `HeaderBar.tsx`'s own
dedicated color for cross-page consistency.

## Critical finding — HL7/JSON interface spec review (added after a direct request to check for gaps there)

While reconciling this feature against `pathscribe-json-interface-specification.md`'s
Part D (outbound `ReportFinalized`/`ReportAmended` events, tied to
`ReportVersionRecord` creation), traced exactly where those records get
created — and found a real, serious, previously-undiscovered bug in this
feature itself, not the spec.

**The bug**: `BottomActionBar.tsx` has two real, separate buttons —
"🔒 Finalize" (calls `onFinalize` → `finalizeCase()`, where this
feature's entire buffer decision lives) and "✍️ Sign Out Case" (calls
`onSignOut` → `handleSignOutConfirm()` → `finalizeSignOut()`, a
genuinely separate function this feature never touched). Confirmed live:
both buttons could be visible **simultaneously** once all synoptic
instances are individually finalized — including while a case is
already sitting in `'pending-release'`. `finalizeSignOut()`
unconditionally creates a new `ReportVersionRecord`
(`trigger: 'initial_signout'` or `'amendment'`, for Orchestration mode)
with zero awareness of the release buffer at all. A pathologist could
click "Finalize" (entering the buffer, believing they had a recall
window), then click "Sign Out Case" — which would create a real,
externally-dispatchable report version immediately, completely
bypassing the very protection the buffer exists to provide.

**Why this matters for the JSON spec specifically**: Part D's own
design fires `ReportFinalized` "whenever a report version is created."
If a real backend ever implements that literally, this bug means a case
still inside its own recall window could get dispatched externally
anyway — silently defeating this entire feature's purpose.

**Fixed with two real layers**, matching this session's own established
defense-in-depth pattern (the same shape as Phase 4's Recall
authorization fix):
1. `BottomActionBar.tsx` — "Sign Out Case" no longer renders at all
   while `status === 'pending-release'`.
2. `handleSignOutConfirm()` itself — a real, independent guard at the
   very top of the function, before even the resident-countersign gate,
   refusing outright (toast + close the modal) if the case is already
   pending-release. This isn't redundant with the UI fix — it's what
   actually protects against any entry point the UI-level fix doesn't
   anticipate.

Verified: both real entry points to `onSignOut` in `SynopticReportPage.tsx`
route through the same, single `handleSignOutConfirm`, so this guard
covers both without needing two separate fixes. A new, dedicated test
confirms the refusal is real — not just a toast, but zero
`countersignService.release` calls and zero `caseRouter.updateCase`
calls at all. 776/776 tests passing, zero regressions. Live-verified:
the button is genuinely absent from the real, running page while
pending-release.

## Two known gaps closed (post-push follow-up)

**Orchestration mode's print entry point** — confirmed to be a real,
separate function (`handleOrchPrint` in `SynopticReportPage.tsx`),
genuinely distinct from `BottomActionBar.tsx`'s CoPilot print button
this feature already gated, with its own, separate PDF payload
construction that never got the Phase 3 `watermarkText` field either.
Both closed: the same confirmation-before-print gate (naming the
watermark, never a silent block) now applies here too, and the payload
now carries `watermarkText` the same way `generateReportPdfSnapshot()`'s
does. Live-verified: the button only renders on the "Report Draft" tab
(a real, easy-to-miss UI detail — not visible on the default "Synoptic
Reporting" tab a case first opens to), and clicking it while
`pending-release` correctly triggers the exact same confirmation
message as the CoPilot path.

**Facility Configuration edit modal's override UI** — never
independently screenshotted in Phase 2; only logic-verified via a
direct service call at the time. Now confirmed live: the "Post-Sign-Out
Release Buffer" section renders correctly under the facility editor's
"AI & Performance" tab, and selecting "Override for this lab" correctly
reveals all three real fields (buffer enabled, duration, STAT bypass) —
matching the same design already verified working end-to-end back in
Phase 2's own resolution-chain test.

## Worklist tile color, revisited (real audit finding)

The teal used for "Queued for Release" (`#06b6d4`) turned out to be part
of a real, confirmed color-collision problem across the worklist's
tiles — found during a direct audit against user-reported testing notes,
not guessed at. Computed actual RGB distances: `grosscomplete` and
`completed` were the closest pair (37.2), with `pendingrelease`,
`inprogress`, and `grosscomplete` all clustered in the same teal/cyan
family. Redesigned the seven colliding tiles' colors as a deliberate,
evenly-spaced palette (minimum pairwise distance now 63.1, up from
37.2), verified with an actual rendered swatch before touching any code.

`pendingrelease` is now `#1C8DE3` (a blue), not teal. Updated
everywhere this color appears for cross-page consistency —
`HeaderBar.tsx`'s status pill, `WorklistTable.tsx`'s status column, and
`SearchPage.tsx`'s status filter — including re-deriving the header
pill's light-theme variant with a freshly WCAG-checked text/background
pair (6.16:1, actually better than the 5.15:1 it replaced). Did **not**
touch `#06b6d4` on the login page's submit-button hover state — same
hex, completely unrelated element, verified via its own separate WCAG
comment before leaving it alone.

## Genuinely complete

This closes the confirmed 5-phase build, plus both known gaps above.
Two real, honest gaps remain — client IP address (needs real backend
infrastructure) and the `ReportVersionRecord`/`finalizeSignOut()`
relationship for §18b (needs a real, separate architectural decision) —
both documented above rather than silently left for someone else to
discover.


# components/Worklist/

The case worklist table and its pool-claim workflow.

## Files

- **`WorklistTable.tsx`** (1834 lines, one of the largest single
  components in the app) — The core case list: sorting, filtering,
  responsive card/table switching, divider rows, virtualization. Cleanly
  self-organized into clear internal sections (Types/Constants/Color
  Palettes/Date Helpers/Sorting/Status Styles/Sub-components/main
  component). Own comment documents a real, already-fixed bug worth
  knowing about: `formatDate()` used to be a bespoke local function
  hardcoded to MM/DD/YYYY regardless of jurisdiction — every date in the
  worklist rendered US-format even for UK clients. Fixed by switching to
  the real jurisdiction-aware `utils/formatDate.ts`, which already existed
  fully built but had zero callers anywhere in the app before this. No
  local modal-overlay duplication (checked, per the newly-broadened
  review standard) and no open TODO/FIXME markers at that time.
  **Real fix, found via a direct product review since then:** pool cases used to be
  lumped into one flat "Pool"/"Pool — Urgent" pair regardless of which
  specific pool (GI, Breast, General Pathology, etc.) each case actually
  belonged to — a pathologist had no way to see which pool a case was in
  without opening it. Now sub-groups by real pool name via
  `buildPoolGroupRows()`, extracted to `poolGrouping.ts` specifically so
  this non-trivial sort/group logic is directly testable. Pools the
  viewing pathologist can't claim from (membership restriction on, not a
  member) default collapsed, click-to-expand — sticky, via
  `storageGet`/`storageSet`, keyed per-user, so a manually-expanded pool
  survives a reload instead of silently re-collapsing. Fetches all
  `Subspecialty` records once per worklist load, not per-pool, for the
  restriction check itself.
- **`poolGrouping.ts`** — Pure, extracted pool sub-grouping logic (see above). Groups pool cases by `poolName`, sorts pools containing any urgent case first, alphabetical within each urgency tier, same urgent-then-normal two-tier divider structure as the rest of the worklist, just applied per-pool instead of globally. **Real fix, from direct product feedback:** the worklist previously showed every pool identically regardless of whether the viewing pathologist could actually claim from it — claim-time membership enforcement existed (`services/cases/mockCaseService.ts`), but the display had no awareness of it at all. Divider rows now carry an explicit `restrictedForMe` flag (via new `computeRestrictedPoolKeys()`), and `WorklistTable.tsx` defaults those groups collapsed on first sight — reduces visual clutter without hiding the information, and genuinely skips rendering the case rows underneath (not just CSS-hiding them) for a real DOM-size win, not just a UX one. Same pass also fixed a real regression this file's own earlier version introduced: divider styling used to match on exact label text (`row.label === 'Pool'`), which silently broke the moment labels became dynamic per-pool names — now uses explicit `isPool`/`isUrgent` booleans instead.

  **Grew a new function in a later session** (`PRIORITY_FIXES.md` item
  #55): `splitPoolRowsByUrgency()` — takes `buildPoolGroupRows()`'s own
  output and partitions it into the urgent-tier divider+case groups vs.
  everything else, so `WorklistTable.tsx` can move unassigned-and-urgent
  cases to the top of the whole list. Deliberately built as a separate,
  additive function rather than a change to `buildPoolGroupRows()`
  itself, which already had 19 tests covering its exact current
  ordering/counting/flagging behavior — modifying that function directly
  would have meant either breaking those tests or rewriting a lot of
  already-correct coverage for no real reason. The new function just
  reads the `isUrgent` flag each divider already carries; genuinely
  nothing about how `buildPoolGroupRows()` itself groups, sorts, or
  counts pools needed to change.
- **`poolGrouping.test.ts`** — 19 real tests (grew from 8): the original grouping/sorting/counting coverage, plus the new explicit-flag regression fix, and `computeRestrictedPoolKeys`'s real membership logic (restricted when not a member and restriction is on, unrestricted when a member, unrestricted when restriction is off, matches by both Subspecialty name and id). Re-run and confirmed still passing, unmodified, after `splitPoolRowsByUrgency()` was added above — the additive-function approach was specifically chosen to keep this coverage untouched, and re-running confirmed that held rather than just assuming it.
- **`amendmentGrouping.ts`** (+ `amendmentGrouping.test.ts`) — pure,
  testable extraction of the Worklist's Amendment & Addenda
  sub-grouping logic, same discipline as `poolGrouping.ts` above. Real
  feature, per direct follow-up: "we could segment the filter results
  into those subgroups... Amendment and Correction at the top followed
  by Addenda."
- **`PoolClaimModal.tsx`** — Accept/Pass workflow when a pathologist
  clicks a pool case, case status-locked to `'claimed'` while open. Real,
  clean, wired to `mockCaseService`. Claim-time subspecialty-membership
  enforcement now lives in `mockCaseService.ts`'s `claimPoolCase`/
  `acceptPoolCase` (see `services/cases/README.md`) — this modal itself
  didn't need to change, since it already just calls through to those
  and surfaces whatever error comes back.

## Notes

- Good example of a large file that stays maintainable through clear
  internal section organization rather than being split into many
  smaller files — a reasonable choice given how interdependent the
  sort/filter/responsive-layout logic is.
- One real gap did surface in a later, deeper product review (see
  `WorklistTable.tsx`'s entry above): pool cases weren't sub-grouped by
  their actual pool, and claim-time access had no membership enforcement
  at all (fixed in `services/cases/mockCaseService.ts`, not this folder).
  Worth remembering that "no issues found" from an earlier pass reflects
  what that specific review was checking for, not a permanent guarantee.
- **Three more real bugs found in a systematic bad-data/bad-query audit
  (Aug 2026), all fixed:**
  1. Both "Request Pediatric Access" and "Request Orchestration Access"
     buttons sent their message to a hardcoded `recipientId: 'u3'`,
     `recipientName: 'System Admin'` — but no user with id `'u3'` exists
     anywhere in the real `services/users/mockUserService.ts` directory
     (confirmed directly). `'u3'` was only ever a stand-in id from
     `AppShell.tsx`'s own separate, hand-maintained `INTERNAL_USERS`
     messaging directory — the exact same real ID-collision pattern
     `RequestReviewModal.tsx`'s own header comment documents and fixed in
     July 2026 (`'u3'`/`'u4'` meaning different people in different,
     disconnected lists). These access-request messages were silently
     going nowhere. Fixed by sourcing real, active Admin-role users from
     the canonical `userService`, org-scoped first with an honest
     fallback — see the `sendAccessRequestToAdmins()` helper in
     `WorklistTable.tsx`.
  2. `WorklistTable.tsx`'s own `isUrgentCase` checked `priority === 'STAT'
     || 'Rush'`, while `WorklistPage.tsx` independently, repeatedly
     checked `'STAT'` only, across 7 separate occurrences (the Urgent
     filter tile, its count badge, pool-urgent detection). Confirmed with
     Pete directly: merging Rush and STAT into one "urgent" bucket is the
     correct, deliberate clinical/product decision, not just an
     engineering convenience — see `utils/caseUrgency.ts`'s own header
     comment for the full rationale and the SOP caveat worth knowing
     about. Extracted to that single, shared function so the two files
     can't diverge again.
  3. `WorklistPage.tsx`'s own `filteredCases` used
     `config.facilityTimezone` for its "completed today" check but was
     missing it from that `useMemo`'s dependency array — same bug class
     as the facility-timezone work elsewhere in the app; an admin
     changing the facility timezone while this filter was active wouldn't
     have triggered a recompute.
  Also documented, not fixed (deliberate, not a bug): `WorklistTable.tsx`'s
  own `filteredCases` has no branch for `'accessioned'`/`'grosscomplete'`/
  `'physician'`/`'countersign'` — same intentional pass-through pattern
  already commented for `'amended'`, since `WorklistPage.tsx` (the only
  real caller passing non-`'all'` values) resolves those upstream before
  this component ever sees the cases.

**Real fix in a later session, from a direct product request**
(`PRIORITY_FIXES.md` item #55): unassigned + urgent cases — someone
needs to both notice AND claim them — were still sorting to the very
bottom of the whole worklist, after both the regular Urgent and All
Cases sections, buried under every other pool group regardless of
urgency. The per-pool urgent/normal split described above was already
solid; the gap was one level up, in `displayRows`' own top-level
ordering. Fixed by pulling each pool's own urgent sub-group (already
correctly identified via each divider's `isUrgent` flag) out to the
very top of the list — see `poolGrouping.ts`'s entry below for how
this was done without touching the existing, tested grouping function.
Same request also added a `restrictedCount` to the non-pool Urgent/All
Cases dividers — how many additional cases of that same tier are
sitting unassigned in the pool, shown as "2 Restricted" next to the
divider's own count. One real TypeScript narrowing quirk hit while
building this: `!row.isPool` didn't reliably narrow the `DividerRow`
union when accessing `row.restrictedCount` afterward in this specific
JSX context; extracting `row.isPool === false ? row.restrictedCount :
undefined` into its own `const` right where the divider type is first
narrowed (same place `isCollapsible`/`isCollapsed` already live)
resolved it cleanly and matches this file's own established pattern of
keeping that kind of per-row logic out of the JSX itself.

## Real, critical fix — pool membership enforcement was silently non-functional

Found while investigating a direct report: claiming a case labeled
"Restricted Pooled Case" didn't block or gate access the way a
Pediatric-restricted case does. Traced precisely, and it turned out to
be two real, separate problems, not one.

**The enforcement bug**: `canUserClaimPoolCase()` looked up a case's
pool by `caseData.poolId` alone. Every real, seeded pool case's own
`poolId` uses ad-hoc values (`'GI-UK'`, `'URO-UK'`, `'GYN-MPA'`, plain
numeric strings) that never match any real Subspecialty record's own
`id` (`'gi'`, `'uro'`, `'gyn'`) — only `poolName` (`'Gastrointestinal'`)
ever did. The lookup silently found nothing and fell through to an
"unrecognized pool — allow" branch, meaning workgroup-membership
enforcement never actually blocked anyone, for any pool case in the
app, regardless of `isWorkgroupEnabled`. Fixed by matching on either
identifier against either of a Subspecialty's own `id` or `name` — the
same dual-key match `computeRestrictedPoolKeys` (this file's own
display-layer restriction logic) already used successfully. Two new,
dedicated tests reproduce the exact real shape of this bug in
`canUserClaimPoolCase.test.ts`.

**A second, separate bug found along the way**: the claim modal's own
pool-name display used `case.originHospitalId` (a real hospital/
facility id, e.g. `'HOSP-MFT'`) where the real pool name belonged.
Fixed to use the case's actual `poolName` field — also needed for the
new access-request feature below to display and track the right thing.

## New feature — real request-access path for pool-restricted cases

Real product decision, following directly from the enforcement fix
above: now that pool-membership is actually enforced, a genuinely
restricted pool case needs a real path forward, not a dead end. Rather
than hide restricted-for-me pool cases entirely (the original,
considered alternative — an admin's own membership-list oversight
shouldn't mean a pathologist can't even discover the case exists),
mirrors the existing Pediatric Access modal's own pattern exactly:
still visible (collapsed by default, with a "Restricted" badge — this
part already existed), and clicking through now shows a real "Request
Pool Access" action instead of either a silent no-op or a misleading
"claimed by another pathologist" message.

`PoolClaimModal.tsx` now distinguishes two genuinely different claim
failures using the existing `claimedBy` field on `ClaimResult` — its
presence means a real, temporary concurrent-claim race (existing
"Case Unavailable" UI, unchanged); its absence means
`canUserClaimPoolCase`'s own membership rejection, a new `'access-denied'`
step with a real explanation and a "Request Pool Access" button.

`sendAccessRequestToAdmins()` — previously private to this file, built
for Pediatric access requests — is now shared, at
`src/utils/accessRequests.ts`, so this second, genuinely different
flow reuses the same, already-fixed admin-recipient resolution rather
than a second, duplicated implementation. Access-requested state is
tracked per-pool (not per-case) in `localStorage` — the real thing
being requested is pool membership, so asking once covers every other
case already sitting in that same restricted pool.

**Verified live, full round trip**: enabled real workgroup enforcement
on a real pool, confirmed the claim modal now shows "Pool Access
Required" (not a silent failure) immediately on open, confirmed
clicking "Request Pool Access" actually delivers a correctly-addressed,
correctly-worded message to a real, different admin's real inbox (not
just a UI state change), and confirmed the modal correctly switches to
its pending state afterward.

## Real, confirmed wording fix — the non-pool "X Restricted" badge was misleading

Found via direct report, from a real screenshot: the plain "Urgent"
divider showed "URGENT 2 RESTRICTED 4" directly below a pool section
that also said "2" restricted cases — reasonably read as "2 of these 4
are restricted," which was never true. Traced precisely: this badge's
`restrictedCount` was never a subset of the group it sits on — it's a
real, deliberate cross-reference to a *different*, already-visible
section (`pool.filter(isUrgentCase).length`, the urgent pool cases
shown in their own divider just above), meant to flag "don't miss
these while scanning past." The undifferentiated word "Restricted" —
identical to the real workgroup-membership badge elsewhere on this
same divider — gave no hint it meant something else entirely.

Fixed by rewording only — the underlying computation was already
correct, this was purely a clarity problem. `"{n} Restricted"` is now
`"+{n} in pool ↑"`, with a tooltip stating plainly that these cases
aren't counted in this group's own total. Verified live against the
exact same view from the original report.

## Real, confirmed data-consistency fix — seed pools disconnected from their own admin config

Found via a sharp direct catch: Configuration → Subspecialties showed
"Create Workgroup" **off** for Gastrointestinal, yet the worklist
plainly showed a live Gastrointestinal pool with real cases sitting in
it. Traced precisely, and it wasn't a live-logic bug — the real,
dynamic routing service (`casePoolAssignmentService.ts`) already
correctly checks a Subspecialty's own `isWorkgroup` flag before
routing any *new* case to a pool. The seeded demo cases were simply
hand-authored with `status: 'pool'` and a `poolName` string set
directly, bypassing that service entirely — so they were never kept in
sync with the Subspecialty records' own `isWorkgroup` setting.

**A second, related mismatch found along the way**: two of the four
affected pools also had a genuine *name* mismatch between the seeded
case's `poolName` and the real Subspecialty record's own `name` —
`'Uropathology'` vs. the real `'Urological'`, and `'Gynaecologic
Pathology'` vs. the real `'Gynecological'`. This silently broke
`canUserClaimPoolCase`'s own name-matching fix for these two pools
specifically — confirmed neither typo was a stylistic choice: the
established `'-pathology'`-suffixed names in this same seed list
(Dermatopathology, Neuropathology, Hematopathology) made the case-data
version look plausible at a glance, but the real Subspecialty record
disagreed.

Fixed both: the two `poolName` values in `mockCaseService.ts` now match
their real Subspecialty record's own name exactly, and all four
Subspecialties with real, demonstrated pool cases (Gastrointestinal,
Dermatopathology, Gynecological, Urological) now have `isWorkgroup:
true`, matching the fact that they're genuinely functioning as pools
right now. Verified live: Configuration → Subspecialties' own
Workgroup/Pool indicator (a small green dot) now correctly lights up
for exactly these four, plus the pre-existing Oncology Pool — and no
others.

## Real, critical fix — isWorkgroupEnabled retroactive gap

Direct follow-up report: the access-request modal never appeared when
testing a real pool claim, even after the earlier "default to true"
fix. Traced precisely — that fix only applied going forward, on new
saves through the admin UI. The four real pools already fixed to
`isWorkgroup: true` in an earlier pass were never retroactively given
`isWorkgroupEnabled: true` to match, since at the time that field was
still a separate, deliberately-off concept. Fixed: all four now
correctly carry both flags together in the seed data itself, not just
on future saves. Live-verified: the "Pool Access Required" screen now
correctly appears on the exact same claim attempt that previously
showed nothing unusual at all.

## Real, critical fix — accepting a pool case never actually left "pool" status

Found in the same report, tracing the modal fix above: after a
successful "Claim & Continue," the case still showed "CASE: POOL" and
a live "Claim This Case" button, requiring a confusing second click.
Root cause in `acceptPoolCase()` (`mockCaseService.ts`): the status
transition out of `'pool'` was gated on `reportingMode === 'orchestrator'`
only — a deliberate, documented choice from an earlier pass reasoning
that "CoPilot's diagnostic lifecycle status is LIS-owned." But `'pool'`
itself was never an LIS-owned status to begin with — it's a
PathScribe-internal queue concept the LIS has no visibility into, so
leaving it there after a genuine internal claim doesn't protect
anything, it just leaves the case permanently stuck. Fixed: both
reporting modes now transition to `'in-progress'` on accept — the
same, already-well-wired value Orchestration used, and already the
established status for an actively-worked Assist-mode case elsewhere
in this same file's own seed data. (The alternative, `'accepted'`, was
checked and confirmed dead — zero consuming logic anywhere in the
app — so using it here would have traded one broken display for
another, not fixed anything.) Live-verified: a successful claim now
shows the case as a real, visible, assigned "URGENT" row with genuine
patient data, not stuck showing "Restricted Pooled Case."

## Batch 350: `WorklistTable.tsx` for Search

- **`preserveOrder`** (new prop): shows cases in the order given, without the urgent/pool regrouping, the stored column sort or the section dividers. Search passes it because the case search service has already sorted and paged the results.
- **Status labels** on cards and rows are translated (`utils/caseRevisionDisplay.ts → getCaseStatusLabel(…, t)`); they were the English status code in Title Case, on the Worklist too.
- **Where a case was opened from** is recorded through `utils/search/searchSession.ts` (was direct session storage). The file still uses local storage for its sort, so it stays on the deployment baseline.
- **Inline styles converted** (standing rule 1):
  - the flag chip's colours are now `--ps-hue` with `color-mix` in `.wl-flag-chip`;
  - the container height is `--wl-container-height`;
  - the collapsible dividers' pointer is `.wl-divider--clickable`;
  - the status dot's glow is derived in CSS (it was `hex + '66'` built in JSX).


## Batch 363 (PS-72): patient data tagged for screenshot redaction

- `WorklistTable.tsx`: the case number (card and table views) is tagged. Patient name, MRN and date of birth already were.
- `PoolClaimModal.tsx`: the header's case summary and case number are tagged.

## Batch 367 (PS-74): no inline CSS

`WorklistTable.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

`WorklistTable.tsx`: `getFlagPalette` returns only the flag's hue; the rgba tints it built were never used.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

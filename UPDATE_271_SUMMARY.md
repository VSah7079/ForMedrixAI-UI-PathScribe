# PathScribe Update 271 — first batch from the docx + the "Updated" Jira list

Covers four items from the Issues Report docx (PS-65, item 27) and four of
the 25 "Updated" Jira tickets (PS-61, PS-69, PS-76, PS-71). Each is
independent — safe to review/ship separately if you want to hold any one
back.

## PS-65 — SearchPage.tsx's orphaned Profile/Logout modals removed

Same dead-trigger pattern as the already-fixed `LogoutWarningModal` on
Home.tsx: `isProfileOpen`/`showLogoutModal` state and their modals existed,
but nothing ever set them to `true`. Confirmed via a full-codebase grep that
no real event (`PATHSCRIBE_PAGE_OPEN_PROFILE` or similar) exists anywhere —
unlike the Resources modal in this same file, which *is* correctly wired to
a real `PATHSCRIBE_PAGE_OPEN_RESOURCES` listener and was left untouched.
Removed both dead modals and their state/imports (`useLogout`, `handleLogout`).

## Docx item 27 — redundant "⚡ Urgent" badge removed from Worklist's New Cases tile

*"I think the color alone indicates that some of the new cases are urgent,
so remove the badge + Urgent from that tile."* The tile's color/border/glow
already switch to red when `hasUrgentNewCase` is true — only the text
sublabel was removed. The separate `'urgent'` tile's own sublabel (a real
count, `+N in Pool`) was left alone — that one adds information, it doesn't
just restate the color.

## PS-61 — typed the 22 real `VITE_*` env vars

`vite-env.d.ts` had no `ImportMetaEnv` augmentation, so a typo'd or renamed
env var name compiled clean and silently read as `undefined`. Added the
standard Vite `ImportMetaEnv` interface covering all 22 vars actually read
anywhere in `src/` (confirmed via grep, not assumed — this includes
`VITE_VOICE_ENABLED`, which only shows up via `import.meta.env?.VITE_VOICE_ENABLED`
and is easy to miss). All typed `string | undefined`, matching how every
real call site already reads them (`?? 'default'`, `=== 'true'`, etc.) —
typing them as required would have been dishonest and forced new `!`
assertions instead of reflecting real usage.

## PS-69 — the recurring `ServiceResult<T>` narrowing "quirk"

Investigated directly: reproduced the exact pattern from your own ticket
(a generic function narrowing on `result.ok === false`) against the actual,
current `ServiceResult` type — and it narrows correctly today, even inside
a generic function, because `ok` is already a literal (`true`/`false`)
discriminant, not a widened `boolean`. So no type change was needed. What
*was* missing: the named `ServiceResultSuccess`/`ServiceResultFailure`
types and `isServiceOk()` type guard your own research recommended, plus
the leftover workaround — `mockModelStoreService.ts`'s `getAvailable()`/
`download()` still had `as { ok: false; error: string }` casts papering
over a narrowing failure that isn't actually happening anymore. Added the
named types + guard to `services/types.ts`, removed both now-unnecessary
casts.

## PS-76 — `.ps-del-*` CSS duplication removed (4 of 5 stale copies)

Confirmed and removed: `.ps-del-shell` through `.ps-del-loading` (53
selectors) were duplicated 5 times in `pathscribe.css` — 4 stale, byte-
identical copies (cosmetic formatting aside) plus one live copy with real,
newer classes (`.ps-del-tag`, `.ps-del-empty-cell`, etc.) not present in the
stale ones, confirming which copy `DelegationTypeSection.tsx` actually
uses. Removed 242 lines total (the 4 stale copies + their section-header
comments), left the live copy untouched. Live-verified in the browser —
Delegation Types config page renders identically, no visual regression.

**Found while fixing this, reported separately**: the duplication isn't
isolated to `.ps-del-*` — `.ps-gov-*` (Governing Bodies) has the identical
4x-duplicated-block shape, and a systematic scan found ~160 other class
names repeated 3+ times file-wide (most are probably fine — small,
intentionally-reused utility classes). Opened **PS-294** to track that
separately rather than guessing at a much bigger cleanup in the same pass —
`.ps-gov-*` specifically still needs the same "which copy is actually live"
confirmation PS-76 got from `DelegationTypeSection.tsx`'s own header before
anything there gets deleted.

## PS-71 — concurrency-conflict audit trail + `expectedVersion` gaps

**Audit trail (was completely missing — zero references to
`ConcurrencyConflictError` anywhere in services/auditlog/):**
- `handleConcurrencyConflict()` (`sharedHookTypes.ts`) — the single shared
  choke point all 6 real synoptic-editing hooks already route through —
  now logs a real audit entry the moment a conflict is detected, with
  resolution `blocked` or `shown to user, override available`, covering
  every one of those hooks' conflicts with no per-call-site change needed.
- `handleConcurrencyForceSave()` (`SynopticReportPage.tsx`, the real
  "Save Mine Anyway" handler) — now logs the actual override when a user
  chooses to overwrite.
- **Known, honest gap, not fixed here**: `SynopticReportPage.tsx` also has
  14 *inline* `ConcurrencyConflictError` catch sites that don't route
  through the shared helper at all (a separate, pre-existing duplication
  issue, not part of this ticket) — those aren't covered by this audit log
  yet.

**`expectedVersion` gaps — re-verified against the current code, not just
the ticket's line numbers (several had already shifted or been fixed since
the ticket was written in August):**
- `useOrchestratorDraft.ts` — already correct at both branches. No change.
- `useAmendmentWorkflow.ts` — already correct at all 6 real
  `caseRouter.updateCase` call sites. No change.
- `AccessionPage.tsx`'s post-create follow-up writes — already correctly
  documented as intentional, fail-open, fire-and-forget (never block an
  already-created case). No change.
- **`mockCaseService.ts`'s `updateCaseAnyMode()`** — real gap, fixed: used
  to silently drop `expectedVersion` on the Orchestration-mode delegation
  path even though `mockOrchestratorCaseService.updateCase()` would honor
  it. Now forwards it on both the Orchestration and CoPilot paths.
- **`casePoolAssignmentService.ts`'s `applyPoolRouting()`** — real gap,
  fixed: pool re-assignment writes could race with a pathologist's own
  in-progress edit with zero check. Now passes the case's own version.
  Wrapped its one previously-unguarded caller (`CytologyScreeningPage.tsx`'s
  workload-queue reassignment) in the same non-blocking `.catch()` pattern
  its sibling call in `useGrossingCompletion.ts` already uses, so a rare
  reassignment race can't crash a specimen save.
- **`useLisIntegration.ts`'s material-tree scan simulation** — a dev-only
  tool, so force-writing would have been a legitimate documented choice,
  but since it already re-fetches the case immediately before writing, now
  passes that fresh version for free rather than leaving the gap
  undocumented.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: 476/476 test
  files, 4154/4154 tests passing.
- **Live browser check** (Playwright, fresh dev server): logged in, checked
  Config → System → Administration & Compliance → Delegation Types (the
  PS-76 CSS change), Worklist (the item-27 badge change), and Case Search
  (the PS-65 dead-modal removal) — zero console errors, zero visual
  regressions on any of the three.

## Files changed

- `src/pages/SearchPage.tsx`
- `src/pages/WorklistPage/WorklistPage.tsx`
- `src/vite-env.d.ts`
- `src/services/types.ts`
- `src/services/models/mockModelStoreService.ts`
- `src/pathscribe.css`
- `src/pages/SynopticReportPage/hooks/sharedHookTypes.ts`
- `src/pages/SynopticReportPage/SynopticReportPage.tsx`
- `src/services/cases/mockCaseService.ts`
- `src/services/cases/casePoolAssignmentService.ts`
- `src/pages/CytologyWorklistPage/CytologyScreeningPage.tsx`
- `src/pages/SynopticReportPage/hooks/useLisIntegration.ts`

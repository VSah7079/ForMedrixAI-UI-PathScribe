# PathScribe Update 266 — real logout guard, dead code removed

Direct report, verbatim: *"Home.tsx still only calls setShowWarning(false)
(via the modal's own onClose); nothing anywhere in the file ever calls
setShowWarning(true)."*

## What was actually wrong

Two separate problems, confirmed by direct code inspection before
touching anything:

1. **`Home.tsx`'s own `showWarning`/`setShowWarning`/`<LogoutWarningModal>`
   were dead code.** `setShowWarning(true)` was never called anywhere —
   the modal could never open. Pure decoration.
2. **The real Sign Out button doesn't go through `Home.tsx` at all.**
   It's wired in `AppShell.tsx` (used on every page, not just Home), and
   it called `handleLogout()` unconditionally — no unsaved-changes check
   whatsoever, dirty or not. The app already has a real, working
   unsaved-changes tracker (`DirtyStateContext`'s `isDirty`, fed by
   `AccessionPage.tsx` and `SynopticReportPage.tsx`, the only two real
   `setDirty(true)` callers) and already uses it correctly for other
   navigation (breadcrumb clicks, the logo, via `guardedNavigate`) — Sign
   Out just never checked it. Net effect: a pathologist mid-report could
   click Sign Out and silently lose unsaved work, while `Home.tsx`
   carried a decoy that made it look handled.

## The fix

- **`src/components/AppShell/AppShell.tsx`** — the real, live fix:
  - `useDirtyState()` now also pulls `isDirty` (aliased
    `hasUnsavedCaseData` — this file already has its own, unrelated
    local `isDirty` for the messaging drawer's draft state, a genuinely
    separate concern; aliasing avoids the collision).
  - New `handleLogoutClick()`: if `hasUnsavedCaseData`, shows the real
    `LogoutWarningModal`; otherwise logs out immediately, same as
    before.
  - The Sign Out button (`NavBar`'s `onLogout` prop) and the voice
    "log out" command (`systemLogout`) both now go through
    `handleLogoutClick()` instead of calling `handleLogout()` directly.
  - `LogoutWarningModal` is now rendered here — the one real, live
    instance — gated by real `isDirty`, not a flag nothing ever set.
- **`src/pages/Home.tsx`** — the dead `showWarning`/`setShowWarning`
  state, the `useLogout()` call, and the `<LogoutWarningModal>` JSX are
  all removed, along with their now-unused imports. Nothing else in the
  file referenced any of it.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: 476/476 test
  files, 4154/4154 tests passing.
- **Live browser verification (Playwright, this pass)**, both real
  scenarios:
  - **Not dirty**: clicking Sign Out on a clean session logs out
    immediately — no modal, same as before. Confirmed: URL lands on
    `/login` with no modal ever shown.
  - **Dirty**: typed into Accession's "Given Name(s)" field (no save),
    clicked Sign Out — the real "Unsaved Data" modal now appears and the
    URL stays on `/accession`. "Return to Page" cancels and stays
    logged in. Clicking Sign Out again and confirming "Log Out & Discard
    Changes" completes the logout, landing on `/login`.

## Files changed

- `src/components/AppShell/AppShell.tsx` — real logout guard added.
- `src/pages/Home.tsx` — dead logout-warning code removed.

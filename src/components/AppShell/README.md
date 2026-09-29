# components/AppShell/

## Files

- **`AppShell.tsx`** (1542 lines, the largest single-file folder in
  components/) — Global layout shell wrapping all authenticated pages:
  logo/home nav, breadcrumb slot, Enhancement Request button, user
  initials badge, Quick Links, logout, `<Outlet />`. Owns
  `INTERNAL_USERS` — the real internal user/messaging directory (17
  entries, `u2`–`u17`), **not currently exported**. **See
  `RequestReview/README.md`** — this is the real directory that
  `RequestReviewModal.tsx`'s separately-maintained `REVIEWERS` list was
  supposed to mirror but has drifted from, with 2 real ID collisions
  (`u3`, `u4` mean different people in each list). Not fixed here — needs
  your input on whether `RequestReviewModal.tsx`'s reviewer pool is meant
  to be the same directory or a deliberately separate one.

  **Real, per direct UI-review follow-up ("Fix the root" — background
  inconsistency across pages): the root `<div className="ps-app-root"
  style={{...}}>` had an inline style silently overriding its own,
  already-correct, already-existing `.ps-app-root` CSS class.** Found
  while investigating why several pages' own background colors
  (`var(--ps-navy-base)`, `var(--ps-bg)`) didn't visually match
  Configuration/Quality Assurance's real, plain background — the CSS
  class already defined the right value (`var(--ps-navy-base)`,
  `#0b1120`) but this inline style silently overrode it with a
  different, hardcoded `#020617`, so those other pages' own attempts
  to *match* the app's real background were matching the CSS class's
  intended value, not what the inline style actually rendered.
  Same inline style also overrode `color` (`#f1f5f9` vs. the CSS
  class's own `var(--ps-text-primary)`, `#e2e8f0`) and, most
  consequentially, `font-family` — the inline version dropped
  `'Inter'` from the stack entirely, meaning every AppShell-wrapped
  page had been silently rendering in system fonts instead of this
  app's own intended typeface. Inline style removed entirely; the
  real CSS class (which already had every property correctly,
  including `position`/`width`/`height`, absent from the inline style
  altogether) now genuinely takes effect. Five other pages' own
  competing background overrides/images were also removed in the same
  pass, now correctly falling through to this single, real source —
  see `pages/README.md`'s own entries for `SearchPage.tsx`/
  `AuditLogPage.tsx`, and `pages/WorklistPage/README.md` for
  `WorklistPage.tsx`. `Home.tsx` deliberately kept its own, distinct
  background — not part of this consistency pass, per explicit
  direction.

  **Complete — messaging drawer inline-style extraction + real mobile
  support (Aug 2026).** Requested directly: the messaging feature
  ("Messages" in the nav) was flagged as generally useful but genuinely
  unusable on a phone. Root cause confirmed: `.ps-msg-drawer` was
  hardcoded to `width: 850px` — both in its own CSS class *and*
  redundantly duplicated inline in the JSX — more than double any real
  phone's viewport width, the dominant cause.

  Every inline `style={{...}}` and JS-based `onMouseEnter`/`onMouseLeave`
  hover handler across the entire feature — the outer drawer/top bar,
  `ComposePanel`, `MessageListPanel`, `ThreadPanel`, `SecureEmailModal`,
  and the secure-email toast — replaced with real, named CSS classes and
  proper `:hover`/`:focus-within` rules. `ComposePanel` needed no changes
  at all, already fully class-based. The rest did.

  **Real, worthwhile discovery along the way:** two entire, well-built
  CSS class systems already existed in `pathscribe.css` — one for message
  rows (`.ps-msg-row`, selected/unread/urgent variants, avatars) and one
  for chat bubbles/reply bar (`.ps-msg-bubble`, `.ps-msg-reply-bar`,
  etc.) — both with zero usage anywhere in the app. Genuine dead code.
  Rather than delete either or build new ones, both were wired into
  `MessageListPanel`/`ThreadPanel` respectively, resolving the dead-code
  question by finally connecting what had already been built for this
  exact purpose.

  **Correction (Sep 2026, PS-78):** only the message-row system is still
  wired in. `ThreadPanel` was later moved onto its own `ps-thread-*`
  classes (and the compose and user-search views onto `ps-compose-*` /
  `ps-user-*`), so the `.ps-msg-bubble`/`.ps-msg-reply-bar` system above
  went back to being dead code. It was deleted in Batch 319; see the
  PS-78 entry in `docs/ARCHIVE.md`.

  **One real bug caught during the refactor itself, not after:**
  converting `ThreadPanel`'s outer container from an inline style to a
  class silently dropped `position: relative` along with everything else
  — which the "⋯" menu's absolute positioning depends on to anchor
  correctly. Caught by checking, not assumed; verified the fix directly
  (menu measured at exactly `0,0` relative to its container) before
  moving on.

  A real `ps-msg-drawer--detail-active` class + mobile media query
  collapses the two-column desktop layout (list | thread) into the
  standard mobile "list, then tap into a message" pattern, with a new
  back button. Verified working via real device-independent Playwright
  checks (see the testing-methodology note below) — both computed styles
  and rendered screenshots confirmed correct in both states.

  **Also investigated, confirmed not an issue:** a leftover
  `.ps-secure-email-modal { z-index: 25000 !important }` rule exists but
  is never applied to the actual component — checked whether this masked
  a real stacking bug; it doesn't, since `.ps-overlay`'s own `z-index:
  9000` (from the earlier modal-consolidation pass) is already well
  above the messages drawer's `1200`. Left as harmless, vestigial CSS
  rather than wiring in an unnecessary `!important` override.

  **Real, important correction to this session's own testing method,**
  worth recording here since it could affect how future mobile-CSS work
  in this file gets verified: `chromium.launch()` combined with
  Playwright's packaged `devices['iPhone 13']` profile reports the wrong
  `window.innerWidth` in this sandbox (980px instead of 390px), meaning
  CSS `@media` queries never actually fired in early verification
  attempts, despite screenshots looking visually narrow. Isolated
  precisely: a plain, manually-specified viewport (`{ width: 390, height:
  844 }`, no device-profile spreading) works correctly. All verification
  in this pass used the corrected method.


  real bug found along the way.** Three hand-rolled overlay shells
  converted to shared `ps-overlay`/`ps-modal-dark`/`ps-drawer-backdrop`
  classes: the NHSMail Secure Message compose modal, the account-menu
  drawer's backdrop, and the "About" popup. Found and fixed a genuine
  out-of-range z-index bug in the process — the About popup was hardcoded
  to `zIndex: 3000`, well outside this app's established tiers; now
  correctly `9000` via the shared class. The other two already had
  correct z-index values (`9000`, `1199`) and only needed the class
  conversion for consistency. Two other overlay-looking patterns in this
  file were deliberately left untouched, confirmed to be a different UI
  concept entirely: small invisible "click outside to close a dropdown"
  backdrops (transparent, local z-index, not a modal at all) and a
  bottom-center toast notification.

## Notes

- Naming drift worth knowing: `pages/SynopticReportPage/modals/` also
  had its own `LogoutWarningModal.tsx` — a genuine second implementation
  of the same dialog with a different prop interface, since consolidated
  into `components/Common/LogoutWarningModal.tsx`. Not this folder's
  concern directly, but the same "same-named component, different files"
  risk pattern worth being aware of anywhere in the app.

## PS-78: dead `ps-msg-*` CSS removed (Batch 319)

The live message drawer (this component) uses 63 `ps-msg-*` classes, plus `ps-thread-*`, `ps-compose-*` and `ps-user-*`. The other 70 `ps-msg-*` classes in `pathscribe.css`, 130 rules in all, came from a pasted copy of an earlier Messages UI spec and matched nothing. They were removed.

A computed-style comparison of every element in the drawer, in its list, thread and compose states (653 elements), found no difference between the old and new stylesheet. Full account in `docs/ARCHIVE.md`.

Two classes this component uses have no CSS rule of their own, and never had one:
- `ps-msg-row-meta`: a layout wrapper;
- `ps-msg-search-input`: also used as a `querySelector` hook for focusing the search box.

## Batch 340 (PS-344): safe config links in messages

A message's **config link** (`IMessageService` `configLink`) comes from stored message data, so the thread view only follows it when `utils/safeInternalPath.ts` confirms it is a PathScribe path. React Router 6 would otherwise treat `/\evil.example` as an external site (GHSA-wrjc-x8rr-h8h6). The app moved to React Router 7 in Batch 341, which fixes that; the check stays as a second line of defence. Case links are built from case numbers (`/report/<ref>`) and are unaffected. The file still uses `sessionStorage` (`ps_reopen_messages`) and stays on the deployment baseline for that.

**Batch 350:** the breadcrumb's "returning to Search" mark goes through `utils/search/searchSession.ts → markReturnToSearch()`. The file still uses session storage for the messages drawer, so it stays on the deployment baseline.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`AppShell.tsx`: the case links in the messages drawer (the message's case and case numbers detected in its text) carry `data-phi="accession"`.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*

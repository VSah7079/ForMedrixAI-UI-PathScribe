# PathScribe Update 260 — Foot-Pedal Integration Follow-Up

Direct follow-up to the closed PS-284→285→286→287→288 sequence, per the
user's own earlier standing instruction ("After 288, we will need to
address foot-pedal integration support. These foot pedals are
ubiquitous and we must support them.") and this update's own trigger
message, "Continue with foot pedals."

## Investigation done before building (confirmed, not assumed)

Rather than building new foot-pedal infrastructure, this update started
by checking what already existed:

- `useFootPedal.ts`, `types/footPedal/FootPedalConfig.ts`, and
  `components/Config/System/FootPedalSection.tsx` are all real, already
  working — Gamepad API polling plus a keyboard-emulation fallback, a
  live capture-binding admin UI, `localStorage`-persisted bindings
  scoped per workstation. Built for and wired into exactly one page:
  `SynopticReportPage.tsx`'s voice-dictation controls (Pedal 3 —
  pause/replay).
- PS-284 (Microtomy Workstation) and PS-285 (Embedding Station) — both
  already-built, already-shipped in this same session — **each named
  physical foot-pedal integration in their own Jira spec text**
  ("Print/Etch Next... physical foot pedal integration" for PS-284;
  "hands-free triggers for piece-count confirmation" for PS-285), but
  neither page ever actually called `useFootPedal`.
- Both pages' own header comments contained a stale, now-incorrect
  claim — "no browser API reaches a generic USB pedal without a native
  agent" — written before `useFootPedal.ts` existed and disproved by
  its own real, working use on `SynopticReportPage.tsx`. Confirmed
  false by direct reading, not assumed correct just because it was
  already in the code.
- No standalone Jira ticket exists for foot-pedal integration —
  confirmed via full-text JQL search across the PS project; it is a
  requirement embedded only inside PS-284's and PS-285's own
  descriptions.

This is the entire scope of the gap: wiring, not new architecture.

## What was built

- **`pages/MicrotomyWorkstationPage/MicrotomyWorkstationPage.tsx`** —
  wired `useFootPedal`, Pedal 2 → the page's own existing
  `handlePrintNext()` — PS-284's own named trigger. Corrected the
  stale header-comment claim.
- **`pages/EmbeddingStationPage/EmbeddingStationPage.tsx`** — wired
  `useFootPedal`, Pedal 1 → the page's own existing
  `handleConfirmPieceCount(block.pieceCount)` — PS-285's own named
  trigger. Guarded to no-op when there's no open work item, no known
  expected piece count, or the block is already `'Embedded'`.
  Corrected the stale header comment, which now also explains why the
  sibling action ("advance to next queued cassette") is deliberately
  not wired — this page has no real queue/next-item navigation to
  advance.
- **`types/footPedal/FootPedalConfig.ts`** — regeneralized
  `FOOT_PEDAL_ACTION_LABELS` to name all three real pages a pedal now
  drives, e.g. `'Pedal 1 — Primary Action (Push-to-Talk on Sign-Out ·
  Confirm Piece Count on Embedding)'`. The underlying action keys
  (`pedal1_pushToTalk`, `pedal2_nextField`, `pedal3_pauseReplay`) were
  deliberately **not** renamed, so an already-saved physical pedal
  binding on any workstation keeps working unchanged.
- **`components/Config/System/FootPedalSection.tsx`** — description
  copy and the Pedal 3 note updated to reflect the real multi-page
  scope (Pedal 3 remains sign-out-dictation-only — there is no replay
  concept on the bench pages).

## Deliberate scope cuts

- **No foot-pedal wiring on `GrossingScreenPage.tsx`** — no ticket
  names it, and no clear single analogous action exists there to bind.
- **No fabricated "advance to next cassette" action on
  `EmbeddingStationPage.tsx`** — confirmed via direct grep, not
  assumed, that no real queue/next-item navigation exists on that page
  to trigger; nothing honest to bind a pedal to yet.
- **No new hook/type architecture** — `useFootPedal.ts` and its config
  types are reused exactly as already built and already tested; this
  update is UI wiring plus corrected documentation only.
- **No new tests** — the new code is thin glue (a `useFootPedal` call
  plus a null/status guard) invoking already-tested functions
  (`handlePrintNext`, `handleConfirmPieceCount`) and an already-tested
  hook; nothing new here has behavior of its own to unit-test.

## READMEs updated in the same pass

- `pages/MicrotomyWorkstationPage/README.md`
- `pages/EmbeddingStationPage/README.md`
- `types/footPedal/README.md`
- `hooks/README.md` (Foot pedal & audio section)
- `components/Config/System/README.md` (`FootPedalSection.tsx` entry)

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **471/471
  test files, 4128/4128 tests passing, zero failures** (same harmless
  `ECONNREFUSED 127.0.0.1:3000` stderr noise as every prior run this
  session, unrelated to test pass/fail).

## Next

No further items are currently queued beyond this. The confirmed
PS-284→285→286→287→288 sequence plus this foot-pedal follow-up are
both now closed.

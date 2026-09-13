# services/mockInterfaceEngine/

Real, per direct follow-up: "Is there a way to test the [PS-239] endpoint using
mock data since the back end isn't finished?"

PS-239's own real "Backend Proxy" tier — the actual
`/api/v1/events/molecular-worklist` endpoint `dispatchMolecularWorklist.ts`
already makes a real, honest `fetch()` POST to — does not exist anywhere in
this environment. This is real, separate **dev/demo tooling**. It never
touches `dispatchMolecularWorklist.ts`'s own real code, never touches real
case or batch data, and is not part of this app's own real, clinical
functionality at all. It intercepts the real network call at the browser
level (via [MSW](https://mswjs.io/), Mock Service Worker) so a person can
click "Dispatch Worklist" in the real, running UI and see a real, realistic
response — success, a specific rejection, or a hung connection — without a
real backend existing yet.

## Files

- **`mockInterfaceEngineSettings.ts`** — a real, small, persisted settings
  object (`enabled`, `mode`, `failureStatus`), read fresh by the real MSW
  handler on every real intercepted request — toggling the control panel
  takes effect immediately, no restart needed.
- **`../../mocks/handlers.ts`** — the real MSW request handler for
  `POST /api/v1/events/molecular-worklist`. Reads the current settings and
  responds: HTTP 200 (`always_succeed`), a real, configurable non-2xx status
  (`always_fail`), or never resolves at all (`timeout`, via MSW's own real
  `delay('infinite')`) — since `dispatchMolecularWorklist.ts` has no client-
  side timeout of its own, this genuinely reproduces what an unreachable real
  Interface Engine would look like.
- **`../../mocks/browser.ts`** — wires the handlers into a real MSW browser
  worker (`setupWorker`).
- **`../../pages/MockInterfaceEnginePage/MockInterfaceEnginePage.tsx`** — the
  real control panel: enable/disable, pick a response mode, set the failure
  status. States plainly, every time, that it is a developer tool and not
  real functionality.

## Real, deliberate safety design

- **Double-gated, never active by accident.** `main.tsx` only ever imports
  this mechanism behind `import.meta.env.DEV` (Vite's own real, build-time
  flag — `false` in a real production build, so this whole branch is dead
  code there, never shipped) **and** a separate, explicit, persisted
  `enabled` flag defaulting to `false`. Both must be true for anything to
  actually intercept a real request.
- **Not linked from any real navigation.** No Config tab, no home-page tile.
  Reachable only at its own direct route, `/dev/mock-interface-engine` — told
  to the person who asked for it, not discoverable by a real admin or
  clinical user browsing the app.
- **Never silently masks the real PS-239 gap.** The moment a real backend
  exists, this mechanism does nothing on its own to hide that — it has to be
  explicitly enabled, and its own control panel says plainly what it is.

## Setup note

Requires `public/mockServiceWorker.js` (generated via `npx msw init public/
--save`, already run and committed) — MSW's own real browser interception
mechanism needs this file served alongside the app.

3 tests (`mockInterfaceEngineSettings.test.ts`). Full suite clean: 302/305
files, 2924/2933 tests, 0 failures.

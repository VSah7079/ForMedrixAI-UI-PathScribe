# src/

The application root. Loose files that sit directly here, with no folder of their own — every real subfolder has its own `README.md` (see `pages/README.md`, `services/README.md`, `types/README.md`, `components/README.md`, `utils/README.md`, etc.).

## Application entry & routing

- **`main.tsx`** — real React entry point, mounts `App` and imports the two root stylesheets.
- **`App.tsx`** — the route table (every `<Route path=...>` in the app), lazy-loaded page imports, `ToastContainer`.
- **`ProtectedRoute.tsx`** — auth gate: redirects unauthenticated users, wires idle-timeout and session-supersede detection.
- **`MobileRestrictedRoute.tsx`** — real device-based route restriction for the Intraop Queue mobile/OR workflow (viewport width + `pointer:coarse`, not width alone, plus a `sessionStorage` override escape hatch — see `utils/deviceDetection.ts`'s own header for the full reasoning).

## Stylesheets

- **`pathscribe.css`** — the main, real stylesheet. Very large (20,000+ lines) — every `.ps-*` class family referenced throughout every component's own README lives here.
- **`index.css`** — base/reset styles loaded alongside `pathscribe.css`.
- **`login-brand.css`** — login-page-specific branding styles.
- **`research-ticker.css`** — styles for the PubMed literature feed ticker (`ps-litfeed-*` namespace).

## Type declarations

- **`vite-env.d.ts`** — standard Vite client type reference.
- **`global.d.ts`** — global `Window` interface augmentation (e.g. `window.find`).
- **`talisman.d.ts`** — type declaration for the untyped `talisman/phonetics/double-metaphone` module (used by patient-matching phonetic search).

## Real findings

**`NETFLIX_SETUP.md`** — reads as completed, one-time setup instructions from an earlier Home page redesign ("Netflix-style card navigation"), not ongoing documentation. The redesign it describes is already live in `Home.tsx` (confirmed directly — the card array it references is the same one currently rendering). Left in place rather than deleted as part of this documentation pass, but worth a real decision on whether to remove it — it currently reads as active guidance to anyone browsing `src/` for the first time, when it's actually a historical, already-applied change.

**`css-audit.cjs`** — a CSS completeness checker sitting directly in `src/`, distinct from (not identical to) `scripts/css-audit.js` — different line counts (134 vs. 146), so likely a diverged copy rather than a simple duplicate. Every other similar audit script in this codebase lives in `scripts/`, matching this file's own header comment ("Place anywhere in the project and run..."), which suggests it was designed to be portable and just never got moved. Worth a real decision on whether to consolidate with `scripts/css-audit.js` or confirm they've genuinely diverged for a real reason.

**`ACCESS_CONTROL_PLAN.md`** — a real, deliberate, forward-looking planning document ("Status: PLANNED, not built"), not stale. Covers platform-level, cross-customer admin restrictions (Governing Bodies, and other config no single customer's admin should be able to touch) — tracked here so the reasoning isn't lost before a real multi-tenant deployment approaches, same spirit as `PRIORITY_FIXES.md`.

---
*Subfolder READMEs: [pages/](./pages/README.md) · [services/](./services/README.md) · [types/](./types/README.md) · [components/](./components/README.md) · [utils/](./utils/README.md) · [hooks/](./hooks/README.md) · [contexts/](./contexts/README.md) · [data/](./data/README.md) · [orchestrator/](./orchestrator/README.md)*

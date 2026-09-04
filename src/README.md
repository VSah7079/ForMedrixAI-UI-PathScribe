# src/

The application root. Loose files that sit directly here, with no folder of their own — every real subfolder has its own `README.md` (see `pages/README.md`, `services/README.md`, `types/README.md`, `components/README.md`, `utils/README.md`, etc.).

## Application entry & routing

- **`main.tsx`** — real React entry point, mounts `App` and imports the two root stylesheets.
- **`App.tsx`** — the route table (every `<Route path=...>` in the app), lazy-loaded page imports, `ToastContainer`.
- **`ProtectedRoute.tsx`** — auth gate: redirects unauthenticated users, wires idle-timeout and session-supersede detection.
- **`MobileRestrictedRoute.tsx`** — real device-based route restriction for the Intraop Queue mobile/OR workflow (viewport width + `pointer:coarse`, not width alone, plus a `sessionStorage` override escape hatch — see `utils/deviceDetection.ts`'s own header for the full reasoning).

## Stylesheets

- **`pathscribe.css`** — the main, real stylesheet. Very large (20,000+ lines) — every `.ps-*` class family referenced throughout every component's own README lives here.

  **Real, found-and-fixed accessibility bug across the whole file, per direct report ("occasional text that is dark and pretty much impossible to read")**: systematically audited every plain `color:` declaration for real, computed low luminance (never assumed from a color's name — actually computed relative luminance for every match), then, for each dark match, checked its own real CSS rule block for a genuinely light background before deciding it was actually broken — a dark color is completely correct when its own rule also sets a light/bright background (e.g. dark text on a bright accent-colored button), and several real print-only rules (`@media print`, `#ps-copilot-print-area` and its own real print override for `.ps-copilot-report-diff-current`) are correctly dark-on-white, confirmed directly by tracing them into their real `@media print` block rather than assumed.

  **Root cause, confirmed with two directly-verified examples before fixing anything at scale**: `#0f172a`/`#1e293b` — this app's own darkest background-palette colors — were being used as *text* color in ~75 real places, almost certainly copy-pasted from rules originally written for a light-themed context and never updated for this dark theme. `.rp-shell` (the ReportPreviewPage window's own root container) set `background: #1a2332; color: #1a1a1a;` on the *same rule* — its own default text color was dark while its own background was also dark, so anything inside it without a more specific override was silently invisible. `.ps-orch-chev`/`.ps-orch-hint` sat right between a dozen correctly-light-colored sibling rules using `#1e293b` instead — and `.ps-orch-chev`'s own `:hover` state correctly used `#64748b`, meaning the chevron icon was genuinely invisible until hovered, exactly matching the "occasional" symptom reported.

  **60 real instances fixed**, each replaced by exact line number (never a blanket find/replace, since the same offending color values also appear correctly elsewhere in genuinely fine, bright-background contexts that were deliberately left untouched) — `#0f172a`/`#1a1a1a`/`#0d1117`/`#0b1120` (the darkest, "primary/heading" role in the original mistaken source) mapped to this app's own real primary light text color, `#e2e8f0`; `#1e293b`/`#1f2937`/`#333` (slightly lighter, "secondary/body" role) mapped to this app's own real secondary/muted light text color, `#94a3b8`. One real, selector-informed exception: `.ps-orch-synoptic-lock`'s own `#1e3a2f` (a dark, muted green — clearly intended as a status/badge indicator, per its own class name) mapped to `#34d399`, this app's own already-established success-green (`.ps-orch-badge--done`), rather than the generic primary/secondary mapping. Verified directly, not assumed: re-ran the same detection script afterward and confirmed zero remaining real matches; confirmed brace balance (6,375 open / 6,375 close) wasn't disturbed by the automated, line-targeted edits.

  **Real, deliberately NOT touched, and why**: ~15 instances of dark text on a genuinely bright button/badge background (e.g. `#0f172a` on `.ps-btn-pill`'s own `#0ea5e9` blue) — real, readable, intentional design, confirmed by computing the actual background luminance rather than assuming; the full `.ps-copilot-print-area`/`.ps-copilot-report-diff-current` print-only cluster, confirmed genuinely inside `@media print` by tracing brace depth back to the actual `@media print` line, not assumed from the selector name alone.

  **Real, per direct follow-up ("let's check for inline use too")**: the same systematic, luminance-based search run across every real `.tsx`/`.ts` file for inline `style={{...}}` color declarations. Most of the 30 initial matches turned out to be genuine false positives on closer inspection — standalone print/email/label HTML template strings that correctly render on white outside this app's own UI entirely (`ValidationStudiesSection.tsx`, `printLabels.ts`, `CopilotReportViewModal.tsx`, `enhancementEmailTemplates.ts`), light-background modals/dropdowns with `background: 'white'`/`'#fff'` on their own enclosing container (`SynopticEditor.tsx`, several `PathScribeEditor.tsx` popovers), and tab/filter-configuration objects where a `color:` field is decorative data, not CSS text color at all (`QualityAssurancePage.tsx`, `WorklistPage.tsx`). 5 real bugs confirmed and fixed, documented at each affected component's own README: `components/Editor/README.md` (the most significant one — a real, user-reachable bug where `PathScribeEditor.tsx`'s own dark-mode toggle correctly switched the toolbar chrome but left the actual report text hardcoded to the light theme's own color, found to be a real follow-up gap in an *earlier* theming fix to this same component), `components/Config/Protocols/README.md` (two lifecycle-stepper separator characters), `components/Config/Templates/README.md` (the same separator pattern, independently confirmed), and `components/ClientDictionary/README.md` (a save button, borderline-readable against its own teal background state, matching the exact pattern already fixed in `.ps-login-submit` above).

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

# src/loaders/

One file: `synopticLoader.ts` — a React Router `loader` for the
`/case/:caseId/synoptic` route.

## What was found and fixed

Confirmed genuinely wired up (not dead code) via `App.tsx`, but doing
outdated work: it manually tried `mockCaseService.getCase()` then
`mockOrchestratorCaseService.getCase()` as two separate steps — logic
`services/cases/CaseRouter.ts` has since consolidated into one unified
call that already handles both LIS and Orchestrator lookups
internally.

Also checked whether the loader's returned data is actually used:
confirmed `SynopticReportPage.tsx` never calls `useLoaderData()` — it
does its own separate `caseRouter.getCase()` fetch instead, so the
loader's own return value goes unused on every navigation (though its
redirect-on-not-found behavior still provides real, valid guard value
before the page even renders, so the loader isn't pointless, just not
fully leveraged).

**Fixed:** simplified the loader to use the same unified `caseRouter`
the rest of the app already uses, for consistency and correctness.
**Not attempted:** the larger, riskier change of making
`SynopticReportPage.tsx` consume `useLoaderData()` instead of its own
fetch — smaller, safer fix scope, and mock-service fetches are
near-instant anyway so the duplicate fetch has negligible real cost.
Full detail in `PRIORITY_FIXES.md` item #37.

## React Router 7 (Batch 341, PS-344)

Every file here that used `react-router-dom` now imports the same hooks and components from `react-router` 7 (`react-router-dom` was removed from the project). Nothing else changed: the app had already opted into version 7's behaviour. See `src/i18n/README.md` → Batch 341.

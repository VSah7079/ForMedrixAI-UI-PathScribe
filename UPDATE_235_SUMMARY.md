# PathScribe Update 235 — Summary

Replaces `sendSynopticReportToLis` entirely for orchestration-mode amendments/addenda, routing them through the same real ORU^R01/`buildOruR01Payload` path FINAL already uses — Components A, B, and C now apply uniformly to CORRECTED and ADDENDUM results, not just FINAL and PRELIMINARY.

## What was investigated first, and why this wasn't a simple swap

`dispatchCaseInstances.ts` — confirmed directly — is genuinely, permanently `'FINAL'`-only: it hardcodes `'FINAL'` in its own dedup check, payload build, and enqueue call, all three, and dispatches *every* finalized instance on the case, not the one specific instance that was actually amended. Neither behavior fits a real correction or addendum.

Also confirmed: `sendSynopticReportToLis` (the mechanism being replaced) is only unconditionally called by `useAmendmentWorkflow.ts` — but `useSignOutWorkflow.ts`'s own, separate "re-sign the whole case" path already gates this same function on `reportingMode === 'assist'`, since CoPilot has no real ORU^R01 pipeline of its own (`buildOruR01Payload` returns null for any non-orchestrator case). This meant the real, correct fix had to preserve `sendSynopticReportToLis` for CoPilot specifically, not remove it outright — matching a gate that already existed elsewhere in this app, not inventing a new one.

## What changed

- **New: `dispatchAmendedCaseInstance.ts`** — the real, dedicated electronic dispatch for a genuine CORRECTED or ADDENDUM result. Scoped to one specific instance (never every instance on the case), and deliberately has no dedup at all, same real reasoning as `dispatchPreliminaryCaseInstances.ts`: a case can be corrected more than once over its lifetime, and each is its own, distinct, legitimate event. 7 tests.
- **`publishReportReleasedEvent.ts`**: `ReportReleasedEvent` gained an optional `instanceId` field — required for a real CORRECTED/ADDENDUM dispatch to mean anything (an event with the report type but no instance is a real, honest, silent no-op, never a guess at which instance the caller meant). The switch statement's `CORRECTED`/`ADDENDUM` cases now route to the new function instead of the old, dead `dispatchCaseInstances` branch that was never actually exercised. 3 new tests confirming the routing and the honest no-op.
- **`useAmendmentWorkflow.ts`**: both real release paths (addendum, correction/amendment) now check `reportingMode` before dispatching — CoPilot/assist keeps `sendSynopticReportToLis` completely unchanged; orchestration now calls `publishReportReleasedEvent` instead, with the real `generateReportPdfSnapshot` callback threaded through so Component B (print) can genuinely work for amendments too.
- **`useAmendmentWorkflow.test.ts`**: the 3 existing tests that verified `sendSynopticReportToLis`'s behavior now explicitly set `reportingMode: 'assist'`, matching the real condition that behavior is now scoped to. 2 new tests added confirming the orchestration path correctly publishes `ADDENDUM`/`CORRECTED` events instead and never touches the old mechanism.

## Verification
`tsc` clean throughout. Full suite: 441 files, 3842 tests, all passing (up from 440/3831 — 11 new tests across 3 files). Not verified live in the browser — reaching a genuine amendment-release UI flow through browser automation has proven difficult for prior specialty-wiring updates this session, and the layered, direct unit coverage (dispatch function, event routing, and hook-level mode gating, each tested independently) gives strong confidence in the actual wiring.

## Honest scope
Cytology still has no amendment mechanism at all (confirmed several turns ago), and Autopsy's own dedicated `AutopsyAddendum` type still has no real service or UI built on it — neither of those exist to wire into anything yet. This update only closes the gap for the one, real, already-working amendment mechanism that existed (Surg Path/Autopsy's shared `useAmendmentWorkflow.ts`).

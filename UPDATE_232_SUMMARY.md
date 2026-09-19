# PathScribe Update 232 — Summary

Cytology is now wired into the Report_Released_Event infrastructure (Components A, B, C) — the electronic-dispatch half of it. Investigated the real, existing dispatch logic thoroughly before touching anything, since this was known going in to be a genuinely different data model, not just a different call site.

## What was investigated first

`CytologyScreeningPage.tsx`'s own real sign-out dispatch turned out to be a completely separate, parallel implementation to Surg Path's — its own outbound queue (`mockCytologyOutboundResultQueueService`, not `mockOutboundResultQueueService`), its own payload builder (`buildCytologyOruR01Payload`), keyed by `signOutRecordId` because Cytology has no `SynopticReportInstance` concept at all — it uses `CytologySignOutRecord`. This confirmed wiring Cytology in wasn't a "swap the function call" change; the existing `dispatchCaseInstances.ts` genuinely can't process a Cytology case at all.

Also confirmed directly: Cytology has zero PDF-generation mechanism today (no references to `pdfBase64`/`generateReportPdf` anywhere in that file). This is a real, honest limitation carried forward, not something this update invents a workaround for.

## What changed

- **New: `dispatchCytologyCaseInstances.ts`** — Cytology's own real ORU^R01 dispatch loop, extracted unchanged in behavior from `CytologyScreeningPage.tsx`'s original inline block, now callable from the shared event rather than living only in one page's handler. Iterates every real `CytologySignOutRecord` for the case (a case can have more than one specimen), with the same real, idempotent dedup `dispatchCaseInstances.ts`'s own FINAL path already established. 6 tests.
- **`publishReportReleasedEvent.ts`**: added an explicit `source?: 'SURGPATH' | 'CYTOLOGY'` field to `ReportReleasedEvent` — deliberately caller-set, never inferred from case data, since each real caller already knows definitively which system it belongs to. Defaults to `'SURGPATH'` when omitted, so every existing caller's behavior is completely unchanged. Branches on it for FINAL/CORRECTED/ADDENDUM to call the correct real dispatch function. 3 new tests confirming the routing (explicit Cytology, explicit Surg Path, and the default).
- **`CytologyScreeningPage.tsx`**: its own inline ORU^R01 block replaced with a call to `publishReportReleasedEvent({..., source: 'CYTOLOGY'})`. Two now-dead imports removed as a result (`mockCytologyOutboundResultQueueService`, `buildCytologyOruR01Payload` — both now live only inside the new, extracted function).

## Deliberately left alone

The separate CSMS/national-registry dispatch (`REGISTRY_REPORT`, `mockCytologyRegistryOutboundQueueService`) stays completely untouched, as its own, unchanged call — that's a real, distinct regulatory-reporting obligation to a national registry, never a "deliver this report to the ordering provider" concern the event was ever scoped to cover.

## Real, immediate effect of this change
A Cytology case now genuinely passes through Component B (print) and Component C (delivery rules) for the first time — the delivery-rules gate (Electronic/Print/Dual/Suppress) now applies to Cytology exactly as it already does for Surg Path, which it never did before. Print itself will honestly fail for a Cytology case today (no PDF mechanism exists yet — a known, separate gap, not masked or silently ignored).

## Verification
`tsc` clean throughout. Full suite: 439 files, 3820 tests, all passing (up from 438/3811 — 9 new tests across 2 files, plus `publishReportReleasedEvent.test.ts` extended with the Cytology-routing tests). Not yet verified live in the running browser — that and Autopsy's own wiring are the next steps.

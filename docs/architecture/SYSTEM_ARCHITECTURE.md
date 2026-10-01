# PathScribe — System Architecture Overview

**Last verified:** August 2026, against the real, current codebase.
For exhaustive, file-level detail, every folder under `src/` has its
own `README.md` — this document is the rollup: the real shape of the
system, not a restatement of every file.

## Production backend (decided Sep 2026)

The production database is **Microsoft SQL Server**, behind a **PathScribe API server on ASP.NET Core**. **Live updates** (the OR Suite Live Board and the Intraop Queue first) come from a **SignalR** hub on that server. See [LIVE_UPDATES_SIGNALR.md](LIVE_UPDATES_SIGNALR.md), and the browser side in `src/services/liveUpdates/`. The Firestore sections below predate this decision; the Firestore code is to be replaced.

## The two operating modes

PathScribe runs in one of two modes, decided per-case:

- **CoPilot** — PathScribe is a passive synoptic data-capture layer.
  The host LIS owns the case and the final report; PathScribe feeds
  structured synoptic data back to it.
- **Orchestration** — PathScribe owns the case end-to-end as a
  lightweight LIS, including AI-assisted narrative generation. Used
  for outreach cases with no host LIS.

This split runs through the whole stack: `services/cases/` routes
between `mockCaseService.ts` (LIS/CoPilot-tracked cases) and
`mockOrchestratorCaseService.ts` (Orchestration-owned cases) via
`CaseRouter.ts`; `TemplateRoutingService.ts` resolves which report
template a case uses differently depending on mode; the Synoptic
Report page renders a genuinely different right-hand panel
(`RightSynopticPanel` vs. `OrchestratorSectionEditor`) depending on it.

## The service layer pattern

The great majority of `src/services/`'s 78 domain folders follow one
real, consistent shape:

- `I<Domain>Service.ts` — the interface (contract).
- `mock<Domain>Service.ts` — the real, currently-active implementation,
  backed by `localStorage`.
- `firestore<Domain>Service.ts` — a production Firestore implementation,
  where one exists yet (most domains don't; see the "Firestore
  migration status" section below).

Callers only ever depend on the interface. Swapping mock for real is a
wiring change, not a rewrite — this is deliberate, not incidental; it's
what lets the whole app run convincingly on mock data today while
staying structurally ready for a real backend.

A handful of domains use a genuinely different, equally-valid pattern
where the interface/mock/firestore triplet doesn't fit — e.g.
`services/organisation/` is read-mostly (records are provisioned
directly, not edited through the app), so it's plain exported functions
with inline `// REAL: fetch(...)` markers rather than a class
implementing an interface. See `services/README.md` for the full index
and which domains deviate, and why.

## Firestore migration status

Firestore is real infrastructure, not aspirational — `firestore.rules`
exists and defines real security boundaries (e.g. `organisationId` as
the tenant boundary for cases). But as of this writing, `IS_MOCK_BACKEND
= true` in `services/index.ts`: nearly every domain runs on its mock
implementation. `services/cases/FirestoreCaseService.ts` is the most
complete real implementation (genuine optimistic-concurrency
compare-and-swap inside a real Firestore transaction, cursor-based
pagination, real query-constraint handling) — it's the reference
pattern for what a real Firestore implementation should look like when
other domains get theirs built. Individual "needs a real Firestore
implementation" gaps are tracked as their own Jira tickets (PS-1
through PS-36).

## Concurrency & data integrity

Real optimistic-concurrency conflict detection exists
(`services/cases/ConcurrencyConflictError.ts`, a real `expectedVersion`
parameter on `updateCase()`, a real, visible UI warning when a
conflict is detected) — but it isn't universally applied across every
save path, and detected conflicts aren't currently audit-logged. See
PS-71 for the specific, real gaps.

## AI integration

Two real subsystems, genuinely different in purpose:

- **`services/aiIntegration/`** — the Orchestrator's own narrative
  generation and field-suggestion engine
  (`suggestSynopticFields()` with per-field confidence + source-text
  provenance).
- **`orchestrator/`** — "Layer 2" (context building —
  `contextBuilder.ts`, `narrativeTemplateRegistry.ts`) and "Layer 3"
  (generation — `orchestratorEngine.ts`) of the actual narrative
  assembly pipeline.

Provider abstraction (`services/ai/providers/`) supports multiple real
backends (Anthropic, OpenAI-shape, Azure, Bedrock, Gemini) behind one
interface, named by request/response *shape* rather than vendor, since
some vendors share a wire format.

## Integration seam (LIS / lab middleware)

`services/hl7/` — a standard HL7 v2.x core (ORM/ORU builders, segment
builders) deliberately separated from vendor-specific adapters
(`services/hl7/adapters/`), so the core can be built and tested against
real HL7 semantics without guessing at any one vendor's deviations.
`types/events/` defines the PathScribe-owned internal event contracts
for the outbound half of this seam (label/order dispatch, material
scan tracking) — vendor-agnostic by design; see
`services/hl7/README.md` for the full adapter status.

## Multi-tenancy

`Organisation.enterpriseId` is the real link between the
Enterprise/Hospital feature-flag tier (`types/config/`) and the
Organisation/Site/Lab hierarchy (`services/organisation/`) — these were
two disconnected systems until fixed this session; see
`services/organisation/README.md` for the full history. Still only one
real enterprise exists in demo data — the *link* is real, not yet the
plurality.

## Access control

Real, tenant-aware access control exists
(`services/auth/caseAccessControl.ts`) — this is a client-side-only
control today (a real server-side query-enforcement layer is a
separate, tracked backend requirement, not yet built). A second,
planned-but-not-built layer — platform-level, cross-customer
restrictions no single customer's admin should be able to touch — is
scoped in `ACCESS_CONTROL_PLAN.md` in this same folder.

## Where to go next

- `../developer/` — local setup, coding conventions, testing approach.
- `../product/FEATURE_OVERVIEW.md` — what the app actually does, by
  feature area.
- `src/README.md` and the full `src/` folder tree — exhaustive,
  file-level detail for every domain named above.

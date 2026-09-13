# services/patientHistory/

Real, per direct guidance: rather than a bulk historical-data
migration for Assist-mode deployments (where the LIS remains the
system of record), fetch a patient's prior reports live from the same
real LIS connection Assist mode already establishes
(`FHIRCaseService.ts`), cache them only for the duration a case is
genuinely active, and destroy the cache once that case is truly done.

Real, deliberate split from `services/migration/`'s own bulk,
one-time, permanent-import story: this is the live, per-case,
temporary-cache path for Assist mode; `migration/` is for
Orchestrator-mode customers retiring their old LIS entirely, where no
live connection will exist afterward. Per direct guidance's own "let's
do both" — neither replaces the other.

## Files

- **`types/patientHistory/PatientHistoryCacheEntry.ts`** — the cache
  record. Deliberately stores only real per-report *summaries*
  (accession, date, diagnosis text) — never a verbatim copy of the
  original report; that stays in the real LIS by design.
- **`IPatientHistoryLisService.ts` / `mockPatientHistoryLisService.ts`**
  — the real fetch, reusing `FHIRCaseService.ts`'s own real query
  pattern (FHIR `DiagnosticReport`, filtered by patient, sorted by
  date) and its own real TLS posture — see
  `resolveIsSecureLisEndpoint.ts` below.
- **`IPatientHistoryCacheService.ts` / `mockPatientHistoryCacheService.ts`**
  — the real lifecycle: `ensurePending` → `markFetched`/`markFailed` →
  `destroy`. `destroy` genuinely removes the entry — never a
  soft-delete, per direct guidance's own explicit data-minimization
  requirement.
- **`resolveIsSecureLisEndpoint.ts`** — the one real, enforceable TLS
  gate a frontend function can actually guarantee: refuses before
  ever attempting a fetch against a non-HTTPS-configured endpoint.
  Never a substitute for real TLS version/cipher/certificate
  validation — those are real backend/infra concerns this function
  cannot see or test (see the Backend Needs Log entry this gap is
  tracked under).
- **`resolveCasesNeedingHistoryRefresh.ts`** — the pure nightly-sweep
  decision logic per direct guidance's own "we could schedule the
  process nightly." A case with no cache entry yet, or one that's
  failed fewer than `MAX_HISTORY_FETCH_ATTEMPTS` (3) times, needs a
  real (re)fetch; one already `'fetched'`, or one that has genuinely
  exhausted its retry budget, does not — never retried forever
  against a genuinely unreachable LIS. The real cron/scheduler
  infrastructure itself is a separate, genuine backend need.
- **`ensureHistoryFetchStarted.ts`** — the real orchestration tying
  the cache and live fetch together, wired into
  `services/cases/casePoolAssignmentService.ts`'s own `routeCase()` —
  per direct guidance: "when [a case gets pulled and assigned] is the
  first time PathScribe [is] aware of the case." Fire-and-forget from
  that call site — a slow or failed history fetch must never block or
  fail the real routing decision `routeCase()` exists for. Exports a
  separate `retryHistoryFetch()` for the nightly sweep's own use,
  deliberately not gated behind the same "only if genuinely pending"
  check `ensureHistoryFetchStarted` uses — the sweep has already
  decided a specific case needs a real retry; gating it the same way
  would silently no-op every retry attempt.

## Real, honest scope boundary — sign-out / cache destruction

Confirmed directly: Assist mode has no real "sign-out" *write* action
in this codebase at all — `BottomActionBar.tsx`'s own tooltip says so
explicitly ("Assist-mode cases are completed via Finalize — the LIS
owns official sign-out... not PathScribe"). PathScribe only
*observes* `isFinalized`, computed from the LIS's own reported
status; it never writes it. `destroy()` is therefore **not yet wired
to any real trigger** — the correct real hook is wherever PathScribe's
own LIS-status refresh/poll detects a case has newly become finalized
(a genuinely different real signal from an amendment/addendum notice
arriving on an already-finalized case, which should instead trigger a
fresh `ensureHistoryFetchStarted`, not a destroy). That refresh/poll
mechanism itself was not fully traced within the time available —
tracked as real, remaining follow-up, not silently assumed done.

---
*When this folder's contents change meaningfully, update THIS file.*

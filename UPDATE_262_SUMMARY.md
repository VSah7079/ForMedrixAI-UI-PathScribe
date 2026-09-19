# PathScribe Update 262 — PS-290: External Consult / Second-Opinion Access

Direct follow-up on "PS290" / "Proceed with 290." Before building, this
ticket's own investigation was independently re-checked: its central
premise (PathScribe issuing signed, scoped external authorization tokens)
needs a real, server-side JWT issuance/validation backend that doesn't
exist yet — the ticket's own follow-up comment names PS-291 (PathScribe-
Provided Interface Engine, itself still unbuilt) as the natural home for
that. Rather than build fake cryptographic security or stall entirely, the
scope was put to a direct choice: **mock-first, clearly disclosed** — the
same interface/mock/real triplet pattern every other feature in this app
already uses, but with the "this is not real security" caveat carried
loudly, everywhere, in code, UI, and docs, since this particular mock
models an access-control BOUNDARY rather than just a data shape waiting on
a real backend.

## What was built

### Service layer (`services/consultAccess/`)
- `IConsultTokenService.ts` — `ConsultToken`/`ConsultTokenScope` (case-level
  default, optional `slideIds` narrowing per spec §4), `ConsultOpinion`
  (Phase 1 Hybrid payload — free-text opinion + structured metadata, per
  spec §3), `resolveConsultTokenStatus()` (Active/Expired/Revoked, always
  derived, never a separately stored field). Carries the load-bearing
  header caveat this entire domain depends on.
- `mockConsultTokenService.ts` (+ 9 tests) — issue/resolve/revoke/
  recordAccess/submitOpinion. `resolve()` gives one deliberately uniform
  denial whether a token is unknown, expired, or revoked (same OWASP-
  aligned posture `services/auth/caseAccessControl.ts` already uses for
  internal case access) — but the audit trail underneath still records
  which one, really happened. Every real state change funnels through one
  real audit choke point, matching that same file's "single enforcement
  point" discipline.
- `computeDefaultConsultTokenExpiry.ts` (+ 5 tests) — pure implementation
  of spec §2's own "24-hour default window, 72 hours if spanning a
  weekend" rule, kept separately testable rather than inlined.

### Internal (pathologist-facing) UI
- `components/ExternalConsult/ExternalConsultAccessModal.tsx` — a new
  "🌐 Consult" action on `BottomActionBar.tsx`, alongside the existing
  "🔍 Req. Review." Three views: issued-links list (status badge, revoke),
  an issuance form (consultant identifier/organization/note, Full Case vs.
  Specific Slides scope with a real slide checklist pulled from the open
  case, a live default-lifespan preview), and a post-issuance screen with
  the copyable link. Mirrors `RequestReview/RequestReviewModal.tsx`'s own
  real conventions (`ps-overlay`/`ps-modal-dark`, `ReactDOM.createPortal`)
  rather than inventing a new modal shape.

### External (outside-consultant-facing) UI
- `pages/ExternalConsultViewPage/ExternalConsultViewPage.tsx` — a new
  public, unauthenticated route, `/consult/:token`. Same "public route"
  posture as `OrSuiteDashboardPage.tsx`/`FacilityOpsDashboard/`, added for
  a genuinely different reason: there is no PathScribe login for an
  outside consultant to have at all. Resolves the token, then fetches the
  case **directly via `mockCaseService.getCase()`** — deliberately
  bypassing `caseRouter.getCase()`'s own internal session/tenant
  enforcement (`resolveCaseAccess()`), since a valid token is this route's
  entire, separate authorization. Shows the case scoped to the token
  (full case, or narrowed to the specific slides granted), and a Phase 1
  Hybrid opinion-submission form. Records exactly one real access event
  per page view, separate from the validity check.

## Every view carries the same, loud disclosure

Both the internal modal and the external page show a persistent red
banner: this is an opaque, unsigned bearer string with no server-side
validation, for demo/pilot use only, not to be sent to a real outside
party outside a trusted environment. This isn't a one-time warning at
issuance — it's on every screen, matching the seriousness of what would go
wrong if someone mistook this for production-ready external access.

## Deliberate scope cuts

- **No real JWT/cryptographic issuance or server-side validation** — the
  entire reason this domain is disclosed this loudly; depends on PS-291.
- **No media-proxy layer** (spec §1's vendor-viewer fallback) — moot until
  real JWTs exist to proxy for.
- **Phase 2 (concordance-engine integration)** — the spec's own §3 labels
  this Phase 2; not built this pass.
- **No clinical-history rendering on the external view** — `Specimen.
  clinicalHistory` carries a coded `historyCode`/`unmappedTextFallback`
  shape needing the same crosswalk machinery other real display surfaces
  use; left out entirely rather than showing a raw code or a guess.
- **No real external-identity directory** — `consultantIdentifier` stays
  free text; confirmed by direct search that no "external consultant" or
  "guest reviewer" concept exists anywhere else in this app to attach it
  to instead.

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **473/473 test
  files (+2), 4142/4142 tests (+14) passing, zero failures.**
- Real, project-specific gotcha hit and fixed: this test environment has
  no real `localStorage` global at all (confirmed directly — plain Node
  22 has none), so every storage-backed mock-service test file installs
  its own minimal in-memory polyfill via `beforeEach` — same established
  pattern already used across this app's other mock-service tests
  (confirmed against `mockQaActivityTypeService.test.ts`), applied here
  too once the first version of this domain's own tests failed against
  it.

## READMEs updated/added in the same pass

- `services/consultAccess/README.md` (new), `services/README.md`,
  `services/index.ts` (barrel registration)
- `components/ExternalConsult/README.md` (new), `components/README.md`
- `pages/ExternalConsultViewPage/README.md` (new), `pages/README.md`
- `pages/SynopticReportPage/components/README.md`
  (`BottomActionBar.tsx` entry)
- `App.tsx` (new route, commented with the same explicit caveat)

## Next

This closes PS-290 to the scope confirmed before building. Full, real
external access — actually usable outside a trusted demo/pilot
environment — remains blocked on PS-291's own, still-unbuilt Interface
Engine backend.

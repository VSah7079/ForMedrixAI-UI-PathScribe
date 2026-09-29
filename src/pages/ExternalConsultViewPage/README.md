# pages/ExternalConsultViewPage/

**NEW (Sep 2026)** — PS-290. The outside half of External Consult /
Second-Opinion Access: a public, unauthenticated route (`/consult/:token`)
an external consultant opens directly, with no PathScribe login of their
own. Same "public route" posture as `OrSuiteDashboardPage.tsx`/
`FacilityOpsDashboard/`, added to `App.tsx` for a genuinely different
reason — there is no internal session to gate this behind at all, not a
kiosk/device-identity substitute for one.

## Files

- **`ExternalConsultViewPage.tsx`** — resolves the URL token
  (`consultTokenService.resolve()`), then fetches the case directly via
  `mockCaseService.getCase()` — **deliberately not** `caseRouter.getCase()`,
  since `caseRouter`'s own `resolveCaseAccess()` enforces PathScribe's
  internal session/tenant model, which has no concept of an external,
  token-bearing guest. A valid, Active, unexpired `ConsultToken` is this
  route's entire authorization; see this file's own header and
  `services/consultAccess/IConsultTokenService.ts`'s for the full caveat
  on what that is and is not. Renders the case scoped to the token
  (`scope.slideIds` narrows the shown slides; unset shows the full case),
  and a Phase 1 Hybrid opinion-submission form (diagnostic category,
  Draft/Signed status, free-text opinion) that calls
  `consultTokenService.submitOpinion()`. Records exactly one real access
  event per page view (`recordAccess()`), separate from the validity
  check itself.

## Deliberate scope cuts

- **No clinical-history rendering** — `Specimen.clinicalHistory` entries
  carry a coded `historyCode`/`unmappedTextFallback` shape, not a plain
  display string; resolving that honestly needs the same crosswalk
  machinery other real display surfaces in this app use, which was out
  of scope for this pass. Left out entirely rather than showing a raw
  code or guessing at a label.
- **No real identity check on the consultant submitting an opinion** —
  whoever holds the link can submit as the token's own
  `consultantIdentifier`; there is no separate consultant-side login.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`ExternalConsultViewPage.tsx`: the patient line (name, date of birth) is tagged. The page reads the case through `@/services` (`caseService`), so it came off the mock-import baseline; its test mocks `@/services` accordingly.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

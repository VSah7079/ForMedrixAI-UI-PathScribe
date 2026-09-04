# components/Search/

## Files

- **`CaseSearchBar.tsx`** (490 lines) — Global case search bar (NavBar),
  routes to `/case/${id}/synoptic` on match — confirmed as one of the real
  navigation call sites used when diagnosing the `PatientReportPage.tsx`
  deletion earlier this session. Wired to `caseRouter`, voice context,
  audit log, jurisdiction-aware identifier formats. No issues.

- **`ReassignCasePatientPanel.tsx`** — **NEW.** Real, per direct guidance
  (gap #6 — the proactive `moveCaseToPatient()` trigger, "an Outside/
  Contract Case's own referring EMR has no ADT feed to ever generate
  [ADT^A43] against, making `moveCaseToPatient()` functionally
  unreachable for those cases specifically"). Confirmed directly before
  building: `moveCaseToPatient()` was already reachable via
  `components/QualityAssurance/PatientManagementSection.tsx`'s own "Move
  a Case…" action — but that's a patient-first workflow (search for the
  source patient, see their cases, pick one). This is the genuinely
  complementary, case-first entry point: the realistic way someone
  actually discovers a misattributed case is the opposite — they're
  already looking at *that specific case* (via `SearchPage.tsx`) and
  notice the patient info looks wrong, not proactively searching a
  patient to check whether any of their cases are misattributed.

  Triggered from `SearchPage.tsx`'s own real, existing row-selection
  state (`selectedResultIndex`) — driven by real user click via
  `WorklistTable.tsx`'s own `onRowSelect`, not a new mechanism.
  Deliberately its own small, focused component rather than a change to
  `WorklistTable.tsx` itself, which is shared across multiple pages
  (`WorklistPage.tsx` at least) — adding a new per-row action there
  would have been a much broader, riskier change for something only
  relevant on this one page. Reuses `pages/AccessionPage/
  PatientLinkSearch.tsx` for the target-patient search (the same
  component now shared by `AccessionPage.tsx` and
  `PatientManagementSection.tsx`) and `mockPatientIndexService.
  moveCaseToPatient()` directly — the exact same, already-tested
  operation, no new service logic. `organisationId` for the target
  search is resolved from the real, looked-up source patient record,
  same pattern already established in `Config/System/
  OutboundMessagePreviewSection.tsx`. No new component-level test file
  — same established convention as every other thin UI-over-tested-
  service component this session.

  Real, self-inflicted mistake caught before it compiled: first wrote
  the reassignment-refresh call as `handleSearch()`, a function that
  doesn't exist on this page — the real name is `runSearch()`. Caught
  by grepping for the real function before assuming it existed, not by
  a failed build.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*

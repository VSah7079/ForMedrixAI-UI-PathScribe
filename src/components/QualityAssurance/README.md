# components/QualityAssurance/

QA/compliance aggregate reporting tabs, hosted inside `pages/QualityAssurancePage.tsx`
(renamed from `DeficienciesPage.tsx` — see that page's own README entry)
alongside its own deficiency-tracking tabs. Eight real, distinct reports —
each measures a genuinely different thing, deliberately not merged into
one generic "QA dashboard" (see each file's own header for why it's
separate from its siblings). **This folder never had a README before
this session** — created now rather than left undocumented, following
this codebase's own stated convention of a README per real folder.

**Pattern:** Not the interface/mock/firestore triplet — these are report
views, not data services. Each tab fetches from the real service(s) it
reports on (`countersignService`, `intraoperativeService`,
`reconciliationService`, `fppeAssignmentService`, `auditService`,
`accessRequestService`) plus `caseRouter.getAll()` for case-level
context, and renders real charts/tables client-side.

## Files

- **`CountersignTurnaroundTab.tsx`** — Department-wide countersign
  turnaround (`countersignedAt - releasedAt`), real changed-field-count
  delta, real feedback text. Answers "how long does a resident's released
  case actually sit before an attending reviews it" — genuinely different
  from the Intraoperative Linkage tab's TAT and the Reconciliation tab's
  concordance rate.
- **`IntraopLinkageTab.tsx`** — Frozen-to-permanent merge tracking —
  pending vs. merged intraoperative entries, real merge-log correlation
  via the audit trail (`Intraop Entry Merged` events).
- **`ReconciliationTab.tsx`** — Frozen/permanent diagnostic concordance
  rate — discordance tracking distinct from the above two. **Real,
  current status (PS-113, Stage 4):** migrated to read from the new,
  generic `qaActivityRecordService` (filtered to the real Frozen vs
  Final activity type), not the old `reconciliationService` — every
  field access updated (`fieldValues.frozenCategory`/`finalCategory`,
  `isTeachingOnboardingCase`, `reviewerFeedback`), including the real
  export function and both render tables.
- **`FppeTrackingTab.tsx`** — Department-wide FPPE/Credentialing Review
  oversight (Joint Commission new-hire credentialing verification, not
  ACGME trainee milestones — a genuinely different regulatory context
  from Countersign Turnaround). The one tab in this folder that does NOT
  fetch case data at all (only `fppeAssignmentService`/
  `subspecialtyService`) — not affected by the tenant-isolation fix
  below, since there's no case-level data in it to scope.
- **`DriftCorrectionTab.tsx`** — **NEW.** Post-finalization drift
  detection/correction — a finalized grossing report whose answers were
  edited after sign-out, and the automatic background correction that
  reverts it to draft. Reads from the same real audit log the case
  services already write into (`auditService.getAuditLogs({ search:
  'Drift' })`), filtered to the exact drift event names — no new backend,
  purely a read view over telemetry added in
  `pages/SynopticReportPage/SynopticReportPage.tsx`'s drift-correction
  effect. Surfaces genuinely unresolved cases (a deferred/failed
  correction never followed by a later successful one for the same case)
  as an explicit, actionable list — not just a historical event log.
- **`PatientMatchReviewSection.tsx`** — **NEW.** The real review queue
  for `services/patients/`'s MPI — every patient match the deterministic
  matcher couldn't confidently resolve either way (MRN matched but DOB
  didn't, or name+DOB matched under a different MRN), each shown
  alongside the actual candidate record(s) it might be the same person
  as. Two real actions, not placeholders: confirm as a genuinely new
  patient, or merge into an existing record — which actually repoints
  every case built under the provisional identity, not just relabels the
  review record. **First built in `Config/System/`, then moved here
  after a direct question about whether it belonged in Configuration at
  all** — it isn't a "configure once" settings screen; it's a recurring
  compliance work queue, the same shape as every other tab in this
  folder, not the shape of TAT Configuration or Session Security.
- **`RetentionHoldsTab.tsx`** — real feature, per direct follow-up: "I
  think we will need Management review of Cases On Hold." Before this,
  a real hold only became visible by opening that one specific case's
  own Synoptic Report page — no aggregate view existed for a lab
  director/manager to see every case currently on hold across the
  whole lab, how long each has been sitting, or to confirm a hold is
  still valid. Same real "read view over what already exists" posture
  as `DriftCorrectionTab.tsx` — no new storage; retention holds already
  live directly on `Case` (`types/case/RetentionHold.ts`), this just
  surfaces them in aggregate. "Reviewing" a hold here (`reviewedAt`/
  `reviewedByUserId`/`reviewedByUserName` on `RetentionHold` itself) is
  deliberately separate from releasing one — release stays exactly
  where it already lives (`RetentionHoldModal`, on the case itself);
  this tab links straight there via "Open Case" rather than duplicating
  that action.
- **`PatientManagementSection.tsx`** — **NEW.** Real, per direct
  guidance ("Since we have this PathScribe patient concept we need a
  mechanism to perform Merge, encounter record move or link. Those
  aren't accession activities. Perhaps a new section of Quality
  Assurance maybe Patient Management"). The second half of that
  request — the first half (fixing `mergeIntoExistingPatient()`/
  `moveCaseToPatient()` to also correctly repoint a patient's real
  Encounter records, not just Cases) is already real and done, see
  `services/patients/README.md`. Real, proactive search (reuses
  `mockPatientIndexService.searchPatients()` directly, same real
  cross-tenant scoping `PatientMatchReviewSection.tsx` already uses —
  a standard user searches only their own organisation, a
  cross-tenant-permitted admin searches every real, active one) lets a
  real user find any patient and act on them immediately — Merge,
  Link (either `relationshipType`), or Move a specific case — rather
  than depending on one of this app's three other, real but scattered
  entry points (`PatientMatchReviewSection.tsx`'s own review queue,
  system-flagged only; the inbound A24/A40 HL7 path, also
  system-triggered only; `AccessionPage.tsx`'s own "Check for Existing
  Patient" search, accessioning-time only, `same_person` only). This
  screen doesn't replace any of those three — it's the one, real,
  on-demand place for any real patient at any time. Reuses
  `pages/AccessionPage/PatientLinkSearch.tsx` for every real
  "search for a second/target patient" step across all three actions
  — never a fourth, separate implementation of the same real search.
  Every action gets a real, explicit `ConfirmModal` before executing,
  with action-specific language (Merge is flagged irreversible; Link
  and Move both explicitly state neither identity gets merged or
  retired). No new component-level test file — same established
  convention as `Config/System/DftExportPreviewSection.tsx`/
  `OutboundMessagePreviewSection.tsx`: a thin UI wrapper over
  already-tested service functions (every real action here is already
  covered by `services/patients/mockPatientIndexService.test.ts`'s own
  extensive suite) doesn't need a second, duplicate layer of coverage.
  **Real, known limitation, not silently glossed over**: the
  second/target patient search (via `PatientLinkSearch.tsx`) is scoped
  to the primary patient's own single organisation — that shared
  component takes one `organisationId`, not a list. A genuine
  cross-organisation merge/link (the same real person seen at two
  different facilities within the same lab enterprise) isn't
  reachable from this screen yet; extending `PatientLinkSearch.tsx`
  itself to support multiple organisations would affect its other real
  caller (`AccessionPage.tsx`) too, so it's flagged as real, separate,
  next-step work rather than changed here.
  **Real, per direct follow-up ("Molecular testing across siblings")**:
  the `family_relation` option's own label is now genuinely general —
  "e.g. newborn/mother, or siblings for cascade molecular testing" —
  not narrowly worded around only the one scenario that originally
  motivated the `relationshipType` split. See
  `components/PatientHistory/README.md`'s own entry for the matching
  real fix on the display side — "Related Patients" is now navigable,
  not just plain text, exactly the kind of real, useful capability the
  siblings scenario needs (quickly reaching a sibling's own prior
  molecular finding, not just seeing their name).
- **`AccessRequestResponseTab.tsx`** — real feature, per direct
  follow-up: "Do we Track the request to gain access? ... How long did
  the Admins take?" The department-wide equivalent of what "My
  Contribution" shows one admin at a time. Real turnaround time
  (`resolvedAt - requestedAt`) across all three real request types
  (Pediatric, Pool, Orchestration).
- **`QaScopeSwitcher.tsx`** — Shared scope-filter dropdown used by most
  tabs above (FppeTrackingTab has no case data to scope;
  PatientMatchReviewSection uses its own organisation picker instead,
  since MPI review is scoped by which org's patient index to look at,
  not by case-level client/org like the others). **Real fix this
  session, in two parts:**
  1. Extended `QaScope` with a genuine third `'organisation'` level,
     alongside the existing `'enterprise'` (no filter) and `'client'`
     (referring-provider) levels — these are real, different dimensions:
     a referring client and the lab organisation actually processing
     their case are not the same thing. Added specifically for the Drift
     Correction tab's admin-alert scoping, but benefits all four tabs
     that use this switcher, not just the new one.
  2. The dropdown used to list every organisation/client regardless of
     whether the viewer had any actual data behind them — an
     information-disclosure UX defect (not a data leak — selecting an
     unauthorized option just yielded an empty list — but confusing).
     Now takes an optional `visibleClientIds` prop; each tab derives it
     from its OWN already-scoped case fetch (the real, derivable answer
     to "which clients are relevant to this viewer," since `Client`
     carries no organisation field to filter on directly) and a
     cross-tenant-permitted viewer still sees the full, untruncated list.
- **`qaReportUtils.ts`** — Shared `QaScope` type, `caseMatchesScope()`,
  and `exportQaReportRows()` (the real XLSX export every tab uses).
  `caseMatchesScope()` is where the organisation-level check above
  actually lives — resolves `Case.originHospitalId` through
  `getOrganisationByHospitalId()` (`services/organisation/`), the same
  real chain `services/auth/caseAccessControl.ts` uses as the tenant
  boundary everywhere else in this app, not a separate, second
  definition of "which org owns this case."

## Notes

- **Real tenant-isolation fix, this session — found via a design review,
  not assumed correct beforehand.** All four case-fetching tabs
  (everything above except FppeTrackingTab) were calling
  `bypassAccessControl: true` unconditionally on their `caseRouter.getAll()`
  fetch — real, unscoped multi-tenant PHI reaching the browser before any
  client-side filter ran (CWE-602, not hypothetical: DevTools on any
  standard user's session would show every organisation's case data).
  Fixed: the bypass is now gated behind a real, granular permission
  (`StaffUser.canAccessCrossTenantQa`, or `role: 'superadmin'`) via
  `services/auth/caseAccessControl.ts`'s new `canViewCrossTenantQaData()`
  check. A standard user's fetch is now properly scoped to their own
  organisation by default — the same mechanism already enforced on every
  other case-read path in the app, not a new, separate one invented for
  this folder. Cross-tenant access, when granted, is logged as its own
  distinct auditable event (`qa.cross_tenant_access_executed`) in every
  tab that fetches cases.
- **This is still a client-side-only control, same caveat
  `caseAccessControl.ts` itself documents.** It models the correct SHAPE
  of the access decision; it is not itself a security boundary against a
  modified client. Real server-side query enforcement is tracked as its
  own backend requirement — see `backend-requirements-concurrency-security.md`
  §11 — not yet built.
- **Two ID systems, genuinely different, both real:** `order.clientId`
  (the referring provider who sent a case to the lab) and
  `Case.originHospitalId` → `Organisation.id` (the lab organisation
  actually processing it) are not interchangeable, and `QaScopeSwitcher.tsx`
  now correctly offers both as separate scope levels rather than
  collapsing them into one. See `services/organisation/README.md` for
  the fuller history of how these two concepts ended up disconnected in
  the first place.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

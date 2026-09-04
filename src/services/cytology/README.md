# src/services/cytology/

`ICytologyCategoryService.ts` + `mockCytologyCategoryService.ts` (+ test)
— Phase 1 of the real Cytology & Cervical Screening module: the real,
standard Bethesda System category dictionary.

## Context

Surfaced from a genuinely new, separate requirements document (General
Cytology & GYN Features), distinct from the existing PS-105
surgical-pathology-oriented abnormal-detection work already built this
session. Given the real scale of the full document (six modules,
multi-jurisdiction compliance, workload/QC tracking, HPV integration,
patient follow-up, a full QA reporting suite), the work was broken into
a real, sequenced set of phases rather than attempted at once. This
folder is Phase 1: the foundational vocabulary every later phase (the
cytologist worklist, screening UI, QC rescreening, reports) will
reference.

**Real, per direct guidance: any configuration for this module lives as
a new subtab under the existing System configuration screen** —
`components/Config/System/CytologyCategoriesSection.tsx`, registered in
`components/Config/System/index.tsx` under the existing "Clinical
Lookups" group, alongside `Protocol Dictionary`/`Subspecialties`/
`Departments`. Not a new, separate configuration surface — same
interface/mock pattern every other admin dictionary in this app already
follows (`participationTypes/`, `governingBodies/`, etc.).

## What's real here

The three genuinely configurable components of the 2014 Bethesda System
— confirmed directly against IARC's own published Bethesda reference
before building the seed data, not improvised:

- **Specimen Adequacy** — Satisfactory / Unsatisfactory (rejected, or
  processed but insufficient).
- **General Categorization** (optional per Bethesda itself) — NILM /
  Other / Epithelial Cell Abnormality (squamous or glandular).
- **Interpretation/Result** — the full real category tree, preserving
  Bethesda's own real sub-groupings: NILM's own Organisms and Other
  Non-Neoplastic Findings, Epithelial Cell Abnormality's own Squamous
  and Glandular branches (ASC-US through invasive carcinoma; atypical
  glandular cells through adenocarcinoma), and Other Malignant
  Neoplasms.

Specimen Type and Ancillary Testing — the other two of Bethesda's five
real report components — are deliberately NOT in this dictionary: both
are per-case narrative fields (what specimen type was received, what
ancillary test was run and its result), not a fixed vocabulary a lab
would seed and maintain here.

## `requiresPathologistReview` and `suggestedAbnormalSeverity`

`requiresPathologistReview` follows directly from each category's real
clinical meaning, matching the original module's own routing
requirement ("negative primary screens... directly to sign-out, while...
abnormal screens... to the Pathologist review queue"): false only for
NILM and its own real sub-findings (organisms, reactive changes,
atrophy, post-hysterectomy glandular cells); true for every epithelial
cell abnormality and other malignant neoplasm.

`suggestedAbnormalSeverity` is a forward-compatible, optional link to
this app's own existing `AbnormalSeverity` vocabulary (`'Abnormal' |
'Critical' | 'Malignant'`, `services/abnormalDetection/`) — recorded now
on the categories with a real, defensible mapping (LSIL → Abnormal,
HSIL/ASC-H/AGC-favor-neoplastic/AIS → Critical, carcinoma → Malignant)
so a later phase can wire GYN screening results into the same
abnormal-detection/sign-out-guardrail framework PS-105 already built,
rather than inventing a second, parallel severity system. Left unset on
ASC-US deliberately — genuinely ambiguous at this app's own three-level
granularity, not a gap to guess at now. **Not consumed anywhere yet** —
this phase only records the mapping decision.

## Phase 2 (Sep 2026) — the real specimen-level screening record

`types/case/Specimen.ts` gained `cytologyScreening?: CytologyScreeningRecord` and the `CytologyScreeningRecord` interface itself. Confirmed directly before building: `Case`'s own `reportingMode` field is unrelated (`'assist' | 'orchestrator'`, an AI-workflow mode, not a specimen-category discriminator) — a GYN cytology specimen is just a regular `Specimen` on a regular `Case`, distinguished the same way any specimen type is (`SpecimenEntry.type: 'Cytology'`/`'FNA'`, already seeded in `scripts/terminology-sources/specimens-starter.json`). No parallel case system was built.

`CytologyScreeningRecord` references `CytologyCategoryEntry.id` for `adequacyCategoryId`/`generalCategorizationId`/`interpretationResultIds` rather than duplicating label text — same "reference the dictionary, don't copy it" pattern as `Specimen.specimenDictionaryEntryId`. `interpretationResultIds` is deliberately an array: real Bethesda findings legitimately co-occur (e.g. an organism alongside reactive cellular changes).

`resolveCytologyReviewRequirement.ts` — the real, shared logic every future call site (the eventual screening UI, seed data, tests) should use to compute `CytologyScreeningRecord.requiresPathologistReview`, rather than re-implementing the lookup. Deliberately a snapshot taken at screening time, not a live re-derivation: an unresolved/unknown category id defaults to **requiring** review (the safe direction), and a later edit to a dictionary entry's own flag never silently changes what an already-screened case required. 6 tests.

Real HPV co-testing fields (`hpvCoTestOrdered`/`hpvResult`) are a minimal placeholder only — real reflex/cotesting rule automation is a genuinely separate, later module phase (see the "Explicitly NOT in this phase" list below, unchanged).

## Phase 3 (Sep 2026) — the real, granular role structure, and secondary screening wired into the existing QA framework

Direct follow-up supplied detailed, real role research: GYN cytology screening has five distinct real roles, not the two this record originally modeled (Primary Screener, Secondary/QC Screener, Senior/Lead Cytotechnologist, Diagnostic Reviewer/Pathologist, Specimen Processing Tech). Checked the existing `ParticipationTypeRecord` dictionary (`services/participationTypes/`) before building — it only has one generic `cytotechnologist` entry, which is sufficient for case-team display purposes; extending it with cytology-specific granularity would affect every specialty's case-team model for a distinction that only matters within this record.

**Real correction, per direct follow-up** ("the role is generally Cytotechnologist, however in the workflow they can serve different workflow roles... There always a single screening event, but there can be multiple Secondary Screening events for a case"): an earlier version of this record wrongly modeled `qcScreen` and `technicalReview` as two separate, singular fields. The real structure is one unified, repeatable concept — `CytologyScreeningRecord.secondaryScreenings: CytologySecondaryScreeningEvent[]` — since a real case can have several secondary screening events (a QC rescreen, a senior reviewer's own separate look, possibly more than one of either). Each event carries a `trigger`: `'qc_random_selection' | 'qc_targeted_high_risk' | 'secondary_reviewer'` — the real, different WORKFLOW REASON the event happened, not a different credential (the underlying role is always Cytotechnologist). The primary screen and the final pathologist review both stay singular, non-repeatable fields on the record itself — only secondary screening is genuinely multi-event.

`resolveCytologySecondaryScreeningConcordance.ts` (renamed from its original, QC-only name, since the same comparison logic now genuinely applies to any secondary screening event, not just QC ones) — compares the primary screen's `interpretationResultIds` against one event's own, returning structured `addedByEvent`/`missedByEvent` category ids rather than a bare boolean. Called once per event, not once per case. Real severity classification (an event adding HSIL vs. a second minor organism finding are genuinely different situations) is deliberately left to a later, real caller. 6 tests.

**Real, deliberate architectural choice**: whether a secondary screening event is concordant/discordant, and any resulting escalation, is recorded as a real `QaActivityRecord` via the existing, generic QA framework (`services/quality/`, PS-134/144-148) — a new `GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID` activity type (renamed from its original, QC-only name for the same reason as the resolver above), one record per event, same real pattern Frozen/Final and Cytology-Histology Correlation already use — rather than a third, parallel tracking system. Deliberately carries **no `capaTriggerRule`**, matching the corrected, established principle from PS-134's own follow-up: a single secondary-screening discordance is real, valuable audit trail, not an automatic CAPA trigger on its own. A genuinely recurring discordance pattern for one screener is real, separate, later work — PS-147 (Intra-Departmental Discordance Pattern Detection), not rebuilt here.

## Phase 4 (Sep 2026) — explicit Final Diagnosis selection, and a generalized comparison resolver

Direct guidance: "there needs the ability to select one of the reviews on record and select that review to be the Final Diagnosis for the report. That Final Diagnosis is what is used in discordance reporting against the Primary Cytotechs initial review."

**Real, new capability**: `CytologyScreeningRecord.finalDiagnosis?: CytologyFinalDiagnosisSelection` — an explicit, attributable selection of exactly ONE already-recorded review as authoritative for the report:

- `CytologyFinalDiagnosisSource` — a discriminated union (`{ type: 'primary' } | { type: 'secondary_screening'; eventId: string } | { type: 'pathologist_review' }`), so an invalid reference is unrepresentable rather than merely undocumented. `secondary_screening` references a `CytologySecondaryScreeningEvent` by its own real, stable `id` — which every event now carries, added specifically to make this real selection possible.
- The pathologist's own review gained its own real, independent findings (`reviewInterpretationResultIds`/`reviewAdequacyCategoryId`/`reviewGeneralCategorizationId`) — previously only `reviewedBy`/`reviewedAt` existed, with no way to capture what the pathologist themselves actually found (as opposed to merely co-signing someone else's read). Without this, the pathologist's own review couldn't be a real candidate source for Final Diagnosis at all.
- `CytologyFinalDiagnosisSelection` is a deliberate SNAPSHOT (interpretation/adequacy/general-categorization data, plus who selected it and when) — same "snapshot, don't re-derive live" reasoning as `requiresPathologistReview` already uses elsewhere in this record: editing the source review afterward can never silently change what a report already used as final.

`resolveCytologyFinalDiagnosisSnapshot.ts` — the real, shared lookup that builds this snapshot from a given source and the record it's selected from. Returns `undefined` (never a fabricated fallback) when a `secondary_screening` source's `eventId` doesn't resolve to a real, current event. 6 tests.

**Real, per direct guidance's own discordance-reporting requirement**: the Final Diagnosis is compared "against the Primary Cytotechs initial review" specifically — i.e. `resolveCytologyCategorySetConcordance(record.interpretationResultIds, finalDiagnosis.interpretationResultIds)`, the same generalized resolver Phase 3 already built for secondary-screening comparisons (renamed from its original, narrower "SecondaryScreeningConcordance" name once this second, genuinely different real caller needed the identical comparison — same function, not a duplicate).

## Phase 5 (Sep 2026) — foundational rebuild: reviews as real, auditable records; the dictionary renamed and extended with Primary/Secondary/Both filtering and Recommendations

**Part A — dictionary changes.** Real, per direct guidance: "The user can indicate if the entry is a Primary, Secondary or both. When entering the Primary, the available entry is filtered for Primary or both entries. When in the Additional Interpretation — is filtered by secondary or both." `CytologyCategoryEntry` gained `usage?: 'primary' | 'secondary' | 'both'`, meaningful only for `section: 'interpretation_result'`. Applied to all 28 existing entries: `'both'` for 21 (organisms, reactive changes, ASC-US/ASC-H/LSIL/HSIL, AGC variants, AIS — clinically plausible as either the sole finding or a co-occurring one), `'primary'`-only for 7 definitively malignant/invasive entries (SCC, invasive HSIL, all four adenocarcinoma variants, other malignant neoplasm — realistically never merely "additional" to something else).

Real, per direct guidance: "Perhaps we can use the same dictionary as interpretations, but designate the entries as recommendations and the dictionary name is changed to Interpretation and Recommendations." `CytologyCategorySection` gained `'recommendation'`; 10 new entries added, grounded in ASCCP's own published risk-based management guidance (repeat intervals, colposcopy referral including direct HPV-16/18 referral, endometrial biopsy, correlate with history) — paraphrased into standard report language, not quoted verbatim. The Config subtab and its own page title/description renamed "Interpretation and Recommendations," with a new Recommendations tab.

**Part B — the foundational rebuild: reviews as real, auditable records.** Real, per direct correction: "Each review is distinct and persists as part of the Case's auditable History." An earlier version of this module wrongly modeled every review (the primary screen, each secondary screening event, the pathologist's own review) as mutable fields directly on `Specimen.cytologyScreening` — inconsistent with how this app already handles a genuine series of distinct, auditable events on a case. Checked the real, established pattern before rebuilding: `AmendmentRecord` (`services/reports/`) is its own, separate, independently-persisted, append-only collection queried by `caseId`, never embedded fields on `Case`; `QaActivityRecord` (`types/quality/`) is the even more directly analogous shape, whose own service interface states the real, deliberate posture plainly: "always written, never edited."

`CytologyReviewRecord` (`types/cytology/`) is the result — one real, immutable-by-default record per review, unifying what used to be three inconsistent shapes into one, via a `role` field (`primary_screen | qc_random_selection | qc_targeted_high_risk | secondary_reviewer | pathologist_review`). Every review now carries real, per direct guidance's own structure: "the Review is the Diagnosis provided by each reviewer, Primary and secondary interpretations and Recommendation" — `primaryInterpretationId` (required, exactly one), `additionalInterpretationIds` (zero or more), `recommendationIds` (zero or more), all referencing the same Phase 1/5A dictionary. `allCytologyInterpretationIds()` combines the primary and additional ids for callers (`resolveCytologyReviewRequirement`, `resolveCytologyCategorySetConcordance`) that only care about the flat set, not which one is primary.

`Specimen.cytologyScreening` correspondingly shrank to just `finalDiagnosis` (a snapshot pointer to one `CytologyReviewRecord` by its real id — dramatically simplified from an earlier, more awkward discriminated-union source, since every review now shares one common, identifiable shape) plus the real HPV/educational-notes fields that genuinely are specimen-level, not review-level. `resolveCytologyFinalDiagnosisSnapshot` was rewritten to match — it now just copies fields off a given `CytologyReviewRecord`, no source-type switch needed. `mockCytologyReviewRecordService` — `getBySpecimenId`/`getByCaseId`/`create` — same "always written" posture as `mockQaActivityRecordService`.

**Part C — real, immediate correction to Part B's own posture.** Direct follow-up: "a User may edit their own review, but no one elses. This way you can safely tie a review to a Cytotech." Pure immutability was too strict — a review genuinely can be revised by its own author, and that ownership restriction is exactly what makes the attribution trustworthy in the first place. `ICytologyReviewRecordService` gained `update(id, requestingUserId, changes)`, enforced at the service layer (not left as a UI-only convention): `requestingUserId` must match the record's own `recordedBy.userId`, or the write is refused — and `recordedBy` itself is never among the editable `changes`, since allowing that would let someone reassign authorship of an existing review to themselves. `CytologyReviewRecord` gained `updatedAt?: string` so an edited review stays honestly distinguishable from one that's never been touched since it was first recorded.

Real, per direct guidance's own time-saving workflow: "It would be good for an additional review (Cytotech or Pathologist) [to] copy the selected review into their name and from there they can modify it as required." `cloneCytologyReviewAsDraft()` produces a real create()-ready draft from an existing review, copying its diagnostic content (adequacy/general categorization/interpretations/recommendations) but attributed to the new reviewer in their own new role — a genuinely new, independently-owned record once saved, not a link back to the source. Deliberately does NOT copy `notes` — the source reviewer's own personal commentary would otherwise be misattributed to whoever clones it.

44 new/updated tests across the dictionary, the review-record service (including real ownership-refusal tests — confirming a different user's edit attempt is genuinely rejected and the record stays untouched), the clone utility, and the simplified snapshot resolver. Full suite at 0 failures.

## Phase 6 (Sep 2026) — the real, standard cytology QA agreement taxonomy

Direct guidance supplied the real, standard 4-level cytology QA agreement taxonomy used for routine 10% rescreening, high-risk re-evaluations, and supervisor/pathologist peer review: Exact Agreement, Minor Discrepancy, Major Discrepancy (sub-classified false negative / false positive / high-grade skip), and Adequacy Discrepancy — a genuinely separate, parallel metric from diagnostic agreement.

`CytologyCategoryEntry` gained two new, real fields to make this classification data-driven rather than hardcoded by category id:
- `diagnosticRank?: number` (0–5, interpretation_result entries only) — a single, combined ordinal severity axis (0 = NILM and its own sub-findings, 1 = ASC-US, 2 = LSIL, 3 = ASC-H/AGC-NOS, 4 = HSIL/AGC-favor-neoplastic/AIS, 5 = frank malignancy). Real, deliberate simplification of full ASCCP risk-based management (which also weighs patient age and HPV genotype) down to the single axis a two-review comparison needs.
- `isUnsatisfactory?: boolean` (adequacy entries only) — lets the classifier determine satisfactory-vs-unsatisfactory data-driven, and correctly treats the two real "unsatisfactory" reasons (rejected vs. processed-but-insufficient) as the same side of the check, never a discrepancy against each other.

`classifyCytologyAgreement.ts` — the real, shared classifier. Minor vs. Major is determined by whether the two reviews' own `diagnosticRank` sit on the same side of the real, critical `HIGH_GRADE_RANK_THRESHOLD` (rank ≤2 vs. ≥3) — matching direct guidance's own given examples exactly (NILM-with-reactive-changes vs. NILM-without, and ASC-US vs. LSIL, are both Minor; NILM/ASC-US → HSIL/SCC/AGC is Major/false_negative; HSIL → NILM is Major/false_positive). An unresolvable category (deleted/renamed since the initial review) defaults to Major, never silently Minor — same safe-default posture `resolveCytologyReviewRequirement` already established. Adequacy discrepancy is computed and returned independently — a case can be an Exact diagnostic Agreement and still carry a real Adequacy Discrepancy, or vice versa.

14 new tests, each validating one of direct guidance's own real, given examples by name. Full suite still at 0 failures.

**Real, deliberately deferred**: the aggregate QA dashboard metrics (Overall Agreement %, Major Concordance %, the three real report types — 10% Random Rescreening, Directed/High-Risk Rescreening, CT vs. Pathologist Correlation) are NOT built here. This phase is the real, per-comparison classification logic those aggregate reports would consume; building the aggregation without a real reporting UI/context to drive it would be premature. Real, separate, later work.

## Phase 7 (Sep 2026) — the real, 3-tier QC random-selection rate cascade

Direct guidance: "there is an enterprise setting on the % random qc, followed by performing facility override and then Staff Member override. This gives us the flexibility to assign higher rates of QC for new employees or students."

Checked this app's own real, established precedent before building: `IFacilityPrintSettingsService.ts` already implements a real 2-tier (Enterprise → Facility) override/resolve cascade — `resolveEffectivePrintSettings()`, a plain, pure merge function, not a service method. This phase follows the exact same convention (`ICytologyQcSettingsService`/`mockCytologyQcSettingsService` for Tier 1, matching `IPrintSettingsService`/`mockPrintSettingsService` field-for-field; `IFacilityCytologyQcOverrideService`/`mockFacilityCytologyQcOverrideService` for Tier 2, matching `IFacilityPrintSettingsService` field-for-field), extended with a genuine Tier 3 this app had no earlier precedent for: `IStaffCytologyQcOverrideService`/`mockStaffCytologyQcOverrideService`, keyed on `StaffUser.id`.

`resolveEffectiveCytologyQcSettings(enterpriseDefault, facilityOverride, staffOverride)` — most specific wins: staff override > facility override > Enterprise default. A new admin subtab, `CytologyQcSettingsSection.tsx`, registered adjacent to "QA Configuration Center" per direct guidance's own placement suggestion ("near the Pathologist QA review settings") — Enterprise default input, plus real, working add/remove UI for both Facility and Staff overrides, wired to the real `mockFacilityService`/`mockUserService` for selection.

15 new tests, including a real, practical-scenario test matching direct guidance's own stated use case exactly: Enterprise 10%, a facility raised department-wide to 15%, one new hire raised further to 40% — the new hire genuinely gets 40%, and a different, non-overridden staff member at the same facility still correctly gets the facility's own 15%. Full suite at 0 failures.


- The cytologist-specific worklist (routing negative screens to sign-out,
  abnormal screens to the pathologist review queue)
- CT workload cap tracking, 10% QC rescreening, 5-year lookback
- HPV co-testing/reflex integration
- Multi-jurisdiction screening policy
- Patient follow-up/closed-loop tracking, recall letters
- Cyto-Histo correlation (real, existing connection point already seeded
  in `services/quality/mockQaActivityTypeService.ts`'s "Cytology-Histology
  Correlation" activity type from earlier work this session — this
  phase doesn't touch it)
- The full QA reporting suite

Each is real, separate, sequenced work, not built here.

## Phase 7 (Sep 2026) — non-GYN cytology worklist routing, real two-tier settings cascade

Direct guidance, corrected once before building was finished: "the non gyn cytology is an enterprise and performing facility decision" — not a bare, single global setting as first framed ("Some customers treat non gyn cytology like Surgicals, and some treat them like cytotech").

Real, per direct guidance: GYN cytology (Pap/HPV co-testing) always routes to the real, dedicated Cytology worklist — not configurable, since that's this whole module's own reason for existing. Only non-GYN cytology/FNA has a genuine routing choice.

- `ICytologyRoutingSettingsService.ts` (Tier 1, Enterprise default) + `IFacilityCytologyRoutingOverrideService.ts` (Tier 2, performing-facility override) — real, two-tier cascade, same real shape as PS-157's own QC-settings cascade, deliberately WITHOUT that one's third, Staff-level tier: direct guidance names only Enterprise and performing Facility here.
- `resolveEffectiveCytologyRoutingSettings.ts` — real, pure two-tier resolution (facility override > Enterprise default), same "resolve at the call site" posture as `resolveEffectiveCytologyQcSettings.ts`.
- `resolveCytologyWorklistRouting.ts` — the real, final routing decision for one specimen: GYN always to the Cytology worklist; non-GYN follows the effective, resolved setting. Deliberately takes `isGynCytology` as an explicit input rather than inferring it — that real signal lives on the specimen dictionary entry itself, not re-derived here.

27 new tests (12 for the cascade, 3 for the routing resolver, plus a full end-to-end scenario confirming two different facilities can genuinely diverge while GYN cases stay unaffected either way). Full suite at 0 failures.

**Real, separate, retroactively-ticketed discovery while investigating this (PS-157)**: this session had already built the real, complete, tested QC-rescreening-rate settings cascade (Enterprise/Facility/Staff, per earlier direct guidance) that fell out of visible context before being ticketed — confirmed correct by re-running its own tests before writing this up, not assumed.

## Phase 8 (Sep 2026) — the real Cytology tile on Home, and its own real route

Real, per direct guidance: a dedicated Cytotech tile ("their assigned cases and pool worklist"), and a real, supplied lab-scene image for it. `pages/Home.tsx` gained a real, new `cards[]` entry — `title: 'Cytology'`, route `/cytology-worklist`, image `public/cytology.webp` (converted/resized from the supplied photo, same real `.webp` convention every other tile uses). `App.tsx` wires the real, lazy-loaded route.

Deliberately NOT a second worklist destination for Pathologists — per direct guidance's own explicit constraint ("I do not want to send the Pathologist to multiple worklist"), cytology cases needing pathologist review are real, separate, later work to surface within the existing `/worklist` instead, not this tile.

`pages/CytologyWorklistPage/CytologyWorklistPage.tsx` was a real, deliberately minimal, honestly-labeled placeholder when this tile first shipped — real content built in Phase 9 below.

**Real, honest caveat on the new tile's color** (`#009E73`): every other tile's color was computationally, pairwise-verified against protanopia/deuteranopia/tritanopia simulation (`Home.tsx`'s own header comment). This one is drawn from the real, published Wong (2011, Nature Methods) colorblind-safe palette and not yet used by any existing tile, but has not been through that same full, pairwise verification against all 9 others — worth a real pass before treating this as final.

## Phase 9 (Sep 2026) — the real worklist content: assigned cases and pool

Direct guidance: implement the actual worklist. Real, deliberate reuse rather than a parallel system — checked the existing `WorklistPage.tsx` before building anything:

- **Case visibility**: `caseRouter.listCasesForUser(user.id)` — the same real, secure, tenant-scoped entry point the surgical-pathology worklist already uses.
- **Assignment/pool**: the same real `Case.order.assignedTo`/`CaseStatus.pool` fields, already confirmed case-level, not surgical-pathology-specific.
- **Pool claim/pass**: the same real `claimPoolCase`/`acceptPoolCase`/`passPoolCase` service functions `WorklistPage.tsx`'s own `PoolClaimModal` calls — but a new, simpler inline claim/pass interaction here rather than reusing that modal directly, since its own `continueToReport` behavior is written for a Pathologist's sign-out workflow, not a Cytotech's screening one.

`resolveCaseCytologyWorklistMembership.ts` — the real filter determining whether a case belongs here at all. A specimen counts as cytology if its dictionary entry's `type` is `'Cytology'` or `'FNA'`; GYN cytology always qualifies, non-GYN follows the case's own real, effective Enterprise/Facility routing setting (PS-158). A mixed case (rare, but real) qualifies if any one specimen does.

`SpecimenEntry` (`services/specimenDictionary/specimenTypes.ts`) gained the real `isGynCytology?: boolean` flag PS-158 had flagged as a follow-up — set `true` on the real seeded Pap smear entry (`sp-cyto-pap`), left unset (never true) on every other type, including every real FNA entry.

8 new tests for the membership resolver. No dedicated component test for the page itself — same established convention `WorklistPage.tsx` already has: the real, testable logic lives in the resolver, already covered; the page is UI wiring over already-tested services.

**Explicitly NOT in this phase**: any UI beyond patient/case identification and a final-diagnosis-recorded badge — real screening/interpretation entry (actually recording a `CytologyReviewRecord`) is separate, later work; surfacing cytology cases within the Pathologist's own existing `/worklist` is still real, separate, later work per direct guidance's own explicit constraint.

## Phase 10 (Sep 2026) — the real screening/review-entry UI

Direct guidance: "screening UI is the logical next step." `pages/CytologyWorklistPage/CytologyScreeningPage.tsx` — reached by clicking an assigned case in Phase 9's worklist (`/cytology-worklist/:caseId`) — is where a review actually gets recorded, reusing every real, already-built piece rather than re-deriving any of it: `mockCytologyReviewRecordService` (Phase 5), `mockCytologyCategoryService` (Phase 1/5A, with the real Primary/Secondary/Both `usage` filtering finally consumed by a real UI), `cloneCytologyReviewAsDraft` (Phase 5), `resolveCytologyReviewRequirement` (Phase 2), `resolveCytologyFinalDiagnosisSnapshot` (Phase 4).

`resolveAvailableCytologyReviewRoles.ts` — new, real logic for this phase: per direct guidance's own "There always a single screening event" rule, `primary_screen` is excluded from the available roles once one exists for a specimen; every other role (both QC variants, Secondary Reviewer, Pathologist Review) stays genuinely repeatable, with Final Diagnosis selection as the real mechanism for choosing which one is authoritative when more than one exists. `resolveDefaultCytologyReviewRole` pre-selects `primary_screen` for the common, first-review case and returns `undefined` otherwise — a genuinely ambiguous secondary/pathologist choice is never silently guessed.

The page shows the real, complete review history for the specimen (every `CytologyReviewRecord`, matching Phase 5's own "distinct, auditable" design), lets a new review be cloned from any existing one, and lets any review be explicitly selected as the specimen's Final Diagnosis.

5 new tests for the role-availability resolver.

**Real, honest open items, not resolved here:**
- Final Diagnosis selection has no role restriction in this build — any user reaching this page can set it, including a Cytotech. Direct guidance never specified who should hold this authority; worth a real, explicit decision before this reaches a production workflow.
- The "Set as Final" write goes through `caseRouter.updateCase` without an `expectedVersion` — the real, established optimistic-concurrency mechanism this app uses elsewhere for case writes is not wired in here yet.
- This page assumes exactly one qualifying cytology specimen per case, matching the worklist's own current scope — a case with more than one would only ever surface its first.

## Phase 11 (Sep 2026) — real seed data for the worklist and screening UI

Direct guidance: "We need several cases for seed data." Six real cases added to `mockCaseService.ts`'s own `MOCK_CASES`, exercising every real state the worklist and screening UI (PS-160/161) support:

| Case | Specimen | Status | Review history |
|---|---|---|---|
| S26-5001 | GYN Pap | Assigned to PATH-001 | None — "Awaiting Review" |
| S26-5002 | GYN Pap | Assigned to PATH-001 | One real, seeded `primary_screen` review, no Final Diagnosis selected yet |
| S26-5003 | GYN Pap | Pool | None |
| S26-5004 | GYN Pap | Pool | None |
| S26-5005 | Non-GYN FNA (thyroid) | Assigned to PATH-001 | None — real test of PS-158's own routing setting |
| S26-5006 | GYN Pap | Assigned to PATH-001 | One real, seeded `primary_screen` review, with a real Final Diagnosis already selected |

Assigned to `PATH-001` (the real, established demo login) rather than a new, separate Cytotechnologist account — this is seed data for exercising the UI, not a claim about who should hold this role in a real deployment.

S26-5005 is deliberately, correctly invisible on the Cytology worklist under the real, default `surgical_pathology_worklist` Enterprise setting — real, working proof of PS-158's own routing logic, not an oversight. Toggling that setting (or a facility override for `c1`) makes it appear.

`mockCytologyReviewRecordService.ts`'s own default seed data changed from an empty array to two real records (S26-5002's and S26-5006's own primary screens) — S26-5006's own record `id` matches exactly what that specimen's `cytologyScreening.finalDiagnosis.reviewRecordId` already references, not a second, independently-typed copy of the same data. Confirmed the existing "starts empty" test (`mockCytologyReviewRecordService.test.ts`) is unaffected — it queries a generic `'SPEC-1'` fixture id, never one of the new real ones.

Every `specimenDictionaryEntryId` and `CytologyCategoryEntry` id referenced was checked directly against the real seed data before writing this — not assumed to exist.

## Phase 12 (Sep 2026) — the real CT-independent-sign-out gating logic

Direct guidance supplied the real, standard CLIA '88/CAP sign-out rules matrix and four explicit "Hard System Gating Checks." `resolveCytologySignOutGate.ts` implements exactly these four, reusing existing infrastructure for three of them rather than re-deriving anything:

1. **Specimen Type** — `SpecimenEntry.isGynCytology` (PS-160). Non-GYN always blocks, regardless of interpretation.
2. **Diagnostic Severity** — the review's own, already-computed `requiresPathologistReview` (Phase 2's `resolveCytologyReviewRequirement`). NILM and its own real sub-findings (including reactive changes) already resolve `false` there; every real epithelial abnormality/malignancy already resolves `true` — not recomputed a second, different way.
3. **Specimen Adequacy** — `CytologyCategoryEntry.isUnsatisfactory` (PS-154), looked up from the review's own `adequacyCategoryId`.
4. **Pre-Sign-Out QC/Sampling** — `isFlaggedForQc`, an explicit input this pure function takes rather than derives. Real, honest scoping: the actual QC-selection algorithm (random 10% sample, high-risk-patient targeting) is separate, later work; this function only enforces the resulting gate once a case IS flagged. Direct guidance's own "High-Risk/High-History Patient (NILM)" row is covered here too — blocked via mandatory QC flagging, not a fifth, separate check.

10 tests, one validating every real row of the given matrix by name (Negative GYN allowed; Reactive Changes allowed; Abnormal/Unsatisfactory/High-Risk/QC-selected/Non-GYN all blocked, each with the correct real reason).

Wired into `CytologyScreeningPage.tsx` as a real, visible per-review badge ("CT Sign-Out Eligible" / "Pathologist Required"), reusing the gate directly rather than a second, UI-only approximation. `isFlaggedForQc` is honestly hardcoded `false` in that one call site — there's no real QC-flagging mechanism yet for it to read from.

**Explicitly NOT built**: any actual "Sign Out" action — this phase is the real, tested gating logic and a visible indicator, not a new case-status transition or report-release workflow. What "signing out" concretely means (a status change? locking the review? releasing a report?) was not specified and isn't invented here.

## Phase 13 (Sep 2026) — the real High-Risk Patient Identification Algorithm

Direct guidance supplied the real, standard CLIA '88 § 493.1274 / CAP-mandated High-Risk algorithm — eight real criteria across four categories; per direct guidance, "If ANY condition evaluates to TRUE, the specimen receives a IS_HIGH_RISK = TRUE flag." This is the real logic behind PS-163's own honestly-hardcoded `isFlaggedForQc` placeholder.

- `CytologyHighRiskFactors` (`types/cytology/`) — the real, complete input shape, one field per given criterion (prior abnormal Pap, prior cervical procedure, recent hrHPV positivity, HPV 16/18/45 genotype, immunocompromised status, in utero DES exposure, abnormal bleeding pattern, abnormal exam findings).
- `resolveCytologyHighRiskStatus.ts` — the real algorithm: a simple, real disjunction across all eight, returning the specific triggers, not just a bare boolean.
- `resolveCytologyPendingMandatoryQc.ts` — real "Impact on Sign-Out Workflow" logic: a high-risk case stays pending until a real `qc_targeted_high_risk`-role `CytologyReviewRecord` clears it — reusing the existing, real role value (Phase 3) rather than inventing a second "cleared" flag. A routine `qc_random_selection` review does NOT clear it — that's a genuinely different real trigger.
- `resolvePriorAbnormalPapFactor.ts` — real, DATA-DRIVEN resolution of the one criterion this app already has data for: reuses each historical review's own, already-computed `requiresPathologistReview` (Phase 2) as the real "was this genuinely abnormal" signal, within a real, configurable lookback window (defaulting to 5 years — the conservative end of the given 3–5 year range).

22 new tests: 11 for the algorithm (one per real criterion, plus multi-trigger and all-false cases), 6 for the data-driven prior-Pap resolver (lookback boundaries, multiple prior reviews), 5 for the pending-QC combiner.

**Real, honest limitation, not wired into the UI**: `CytologyScreeningPage.tsx`'s own `isFlaggedForQc` stays hardcoded `false` — not because the algorithm doesn't exist now (it does), but because seven of its eight real inputs have no data capture yet (the same, already-deferred "LMP + patient history dictionary" scope), and even the one input this app CAN derive — prior abnormal Pap — needs a real "find this patient's other cases across the system" lookup that doesn't exist as a single service call yet. Wiring a misleading, always-empty lookup would be worse than leaving the honest placeholder in place.

## Phase 14 (Sep 2026) — the real, three-tile worklist, and a real QC pool

Direct follow-up: the worklist page didn't match the existing `WorklistPage.tsx`'s own real visual/tab pattern, and a genuine third tile was missing entirely: "My Worklist, the default which show[s] urgent and pool worklist and a tile for QC where the pooled QC cases are accessed."

`CytologyWorklistPage.tsx` rebuilt with a real, three-tile row (My Worklist / Pool / QC), styled closer to the existing worklist's own colored, glowing, count-bearing stat-tile pattern rather than the earlier, plainer tabs.

**The real, substantive gap this surfaced**: there was no QC pool at all, and no way for a case to get into one — Phase 13's own `isFlaggedForQc` was correctly honest that the automatic selection algorithms (PS-157's random-rate settings, PS-164's high-risk algorithm) aren't wired to real cases yet. Real, deliberate fixes:

- `Specimen.cytologyScreening.qcFlag` (`types/case/Specimen.ts`) — a real, minimal, explicit, MANUAL interim mechanism: `reason: 'random_selection' | 'targeted_high_risk'`, attributed to who flagged it and when. Honestly documented as an interim measure until the real automatic algorithms exist — not a claim that manual flagging is the intended long-term mechanism.
- `resolveCytologyQcPoolMembership.ts` — generalizes Phase 13's own `resolveCytologyPendingMandatoryQc` to cover both real QC reasons. A `random_selection` flag is cleared only by a matching `qc_random_selection` review; a `targeted_high_risk` flag only by `qc_targeted_high_risk` — never cross-cleared, since they're genuinely different real obligations even though both use the same flag shape.
- `CytologyScreeningPage.tsx` gained real "Flag for Random QC" / "Flag for High-Risk QC" buttons — the only real way, right now, for a case to enter the QC pool.
- A real, 7th seed case (S26-5007) demonstrates the whole flow end-to-end: screened NILM by the CT, but flagged high-risk — correctly still blocked from CT-independent sign-out (PS-163's own `flagged_for_qc` check) despite the negative interpretation.

7 new tests for the pool-membership resolver. Full suite still at 0 failures.

## Phase 15 (Sep 2026) — real fix: mock-data seed versioning, three tiles reading zero

Direct follow-up: worklist tiles all reading zero. Per direct diagnosis ("Last time this happened it was because the seed data version hadn't been bumped") — correct: `mockCaseService.ts`'s own real `MOCK_VERSION` guard (a real, established pattern already in this app, forcing a clean localStorage re-seed whenever `MOCK_CASES` changes structurally) was never bumped across the several turns that added the seven real cytology seed cases (S26-5001 through S26-5007). Anyone with pre-existing persisted case data — still on version `'35'` — silently kept the old set, with none of the new cytology cases, exactly the failure mode that guard exists to prevent. Bumped to `'36'`.

**Real, additional gap found while fixing this**: two other real, cytology-specific seed-data changes this module made across earlier phases had no equivalent version guard at all, carrying the identical real risk:

- `mockCytologyReviewRecordService.ts` — its own default changed from `[]` to real seed data (Phase 11); a real `SEED_VERSION`/`SEED_VERSION_KEY` guard added, matching `mockCaseService.ts`'s own established pattern.
- `mockCytologyCategoryService.ts` — gained real fields across two phases after first shipping (`diagnosticRank`/`isUnsatisfactory`, Phase 6; `usage` and the whole `'recommendation'` section, Phase 5A) with no version guard at all; anyone on stale, pre-those-phases cached data would silently be missing exactly the fields `classifyCytologyAgreement`, `resolveCytologySignOutGate`, and the screening UI's own Primary/Additional filtering all depend on. Same real guard pattern added.

No new tests — this is infrastructure that only manifests as a real, observable bug in a browser with real, pre-existing localStorage state, not something a fresh Vitest environment (which starts with none) would ever catch. Full suite unaffected: 213/216 files, 2301/2310 tests, 0 failures, same as before this fix.

## Phase 16 (Sep 2026) — the real screening-UI rebuild: multi-select adequacy, per-item comments, automatic role, and a genuine two-column layout

Direct, detailed UI-review follow-up drove a real, structural rebuild of the screening page and the `CytologyReviewRecord` shape underneath it.

**Real, structural data-model change.** Per direct follow-up: "Specimen Adequacy can have multiple selection, and each selection should allow for an associated free text comment. Additional Interpretations... same. Recommendations... same. Primary Interpretation can have only one selection, and that selection may have an associated free text comment." `CytologyReviewRecord`'s `adequacyCategoryId?: string` (single) became `adequacySelections?: CytologyCategorySelection[]` (real multi-select); `additionalInterpretationIds`/`recommendationIds` (bare id arrays) became `additionalInterpretations`/`recommendations` (`CytologyCategorySelection[]`, each with its own optional comment); `primaryInterpretationId` gained a sibling `primaryInterpretationComment?: string`. `CytologyCategorySelection = { categoryId: string; comment?: string }` is the one, shared shape all three real multi-select fields use.

This cascaded through every real, dependent piece: `ICytologyReviewRecordService`'s editable-fields list, seed data (with a real `SEED_VERSION` bump — same real reasoning as the earlier mock-data versioning fix, since this is a genuine, incompatible shape change), `cloneCytologyReviewAsDraft` (copies the real selections, still deliberately drops every comment — same "don't misattribute personal wording" reasoning `notes` already had), `resolveCytologyFinalDiagnosisSnapshot` and `CytologyFinalDiagnosisSelection` (types/case/Specimen.ts, same real shape), and both `classifyCytologyAgreement` and `resolveCytologySignOutGate` — their own adequacy check changed from "is the one selection unsatisfactory" to "is ANY selection unsatisfactory," the same real disjunction pattern this module already uses elsewhere (`resolveCytologyHighRiskStatus`).

**Real, new automatic role determination.** Per direct follow-up: "The system should default the role, if there are no reviews on record, they are the Primary Screener. If there is a Review associated to the case and you're not a Pathologist, then you are a Secondary Reviewer. If your the Pathologist, you are the Pathologist Review." `resolveCytologyReviewerRole.ts` replaces the old manual role dropdown (and the `resolveAvailableCytologyReviewRoles`/`resolveDefaultCytologyReviewRole` files it depended on, now deleted) with a real, fully deterministic result — checked against the real, logged-in user's own `role` (`pathologist`/`pathologist-admin` via `useAuth`), not a self-reported choice. Real, deliberate ordering: a Pathologist's role never depends on review count — first look or fifth, always Pathologist Review, never mislabeled "Primary Screener" (a Cytotechnologist-specific role). Real, additional reconciliation with PS-165's own QC-pool mechanism: a non-Pathologist's follow-up review on a case still genuinely pending mandatory QC defaults to the specific QC role that would actually clear it, not a plain Secondary Reviewer that would leave the flag stuck open.

**Real UI rebuild** (`CytologyScreeningPage.tsx`), addressing every other real point raised:
- Genuine two-column CSS grid using the available horizontal space, replacing the earlier single, narrow column.
- Real, searchable type-to-filter pick lists (`SingleSearchSelect`/`MultiSearchSelect`) replace the native `<select multiple>` listbox — with real dictionary sections running to ~30 entries, an always-visible listbox doesn't scale; typing narrows to a short, real match list instead.
- General Categorization's own field label now notes "(dictionary-driven)" directly, addressing the real "is that dictionary driven?" question rather than leaving it ambiguous.
- The QC panel gained a real "Remove Flag" action — a manually-set flag (PS-165's own honest interim mechanism) can now be genuinely un-flagged, not just added.
- A real, minimal HPV Testing widget over the existing `hpvCoTestOrdered`/`hpvResult` fields, and a real LMP date field (`Patient.lastMenstrualPeriod`, new) — both real and working now; the full six-category clinical-history dictionary itself stays separate, deferred work, not attempted here.
- Review History now shows each review's real, complete content — every selection and its own comment, not a one-line summary — and marks the real `primary_screen` review "INITIAL REVIEW"; every other role is labeled by its own real name (never a generic "secondary").

27 real assertions updated or added across `CytologyReviewRecord.test.ts`, `mockCytologyReviewRecordService.test.ts`, `cloneCytologyReviewAsDraft.test.ts`, `resolveCytologyFinalDiagnosisSnapshot.test.ts`, `classifyCytologyAgreement.test.ts`, `resolveCytologySignOutGate.test.ts`, plus 8 new tests for `resolveCytologyReviewerRole`. Full suite clean.

## Phase 17 (Sep 2026) — the interpretation dictionary's `description` field becomes load-bearing

Direct follow-up: "The interpretation dictionary should have a reasonable description field. The contents of that description field is what is use to populate the reviews and report." Checked the real, current dictionary before writing anything — only 7 of 45 real entries had one at all. Added real, standard-Bethesda-grounded descriptions to the remaining 38 (every organism/reactive-change/squamous/glandular/other interpretation entry, all three general-categorization entries, and all ten recommendation entries) — genuine, standard reporting language for each category (e.g., "Atypical squamous cells of undetermined significance (ASC-US)."), not restating the label.

`ICytologyCategoryService.ts`'s own field doc comment updated to reflect the real, elevated purpose — `description` is now the authoritative source for review and report display, distinct from `label` (the dictionary's own short, list-facing name). `CytologyScreeningPage.tsx`'s `categoryLabel` helper (and the single-select's own "selected" chip) now prefer `description`, falling back to abbreviation/label only for the rare entry that genuinely lacks one — the search/browse dropdown itself keeps the shorter label for scannability, since that's a UI convenience, not review content.

No new tests — this is real seed content plus a display-preference change in already-tested UI, not new, independently testable logic. Full suite confirmed unaffected.

## Phase 18 (Sep 2026) — the real, automatic random QC selection algorithm

Direct correction: "the user doesn't flag for QC, the system randomly picks one based on the algorithm. The user won't [k]now until they save the initial review. Then a toast will popup informing them that their case was selected for review. I left out an important requirement. The Cytology System follows two types: 1. Cytology GYN Results that are Negative - x% of negative cases are sent to Cytology QC pool. 2. Cytology GYN Non Negatives, x% of those get sent to the Cytology QC pool."

**Real, structural settings change.** `CytologyQcSettingsConfig` (PS-157) — one shared `randomSelectionRatePercent` was wrong; replaced with two real, genuinely independent rates: `negativeRandomSelectionRatePercent` and `nonNegativeRandomSelectionRatePercent`. Cascaded through every real tier (`IFacilityCytologyQcOverrideService`/`IStaffCytologyQcOverrideService`, both `Partial<>` of the same config so no separate change needed there), `resolveEffectiveCytologyQcSettings` (unchanged — still a generic merge), and the real admin config UI, `CytologyQcSettingsSection.tsx` — a real, existing screen from earlier in this session that I hadn't re-checked before this change broke it; now shows and manages both rates at all three tiers. Real `SEED_VERSION` bump on `mockCytologyQcSettingsService.ts`'s own default, matching the same real versioning discipline PS-166 established — this is a genuine, incompatible shape change.

**Real, new algorithm.** `resolveCytologyRandomQcSelection.ts` — a real, pure, testable function taking an explicit `randomRoll` (the real caller passes `Math.random()`) rather than calling it internally, the same "inject the non-deterministic input" posture `resolvePriorAbnormalPapFactor`'s own explicit `asOfDate` already established. "Negative" reuses the existing `requiresPathologistReview: false` signal — not a second, different negativity check.

**Real, automatic wiring** (`CytologyScreeningPage.tsx`'s `handleSave`): runs immediately after a real `primary_screen` review is saved — never for a later secondary/pathologist review, and never a manual user action. Fetches the real, effective 3-tier settings for the case's own facility and the saving user, rolls against the correct rate for the review's own negative/non-negative status, and — if selected — sets the real `qcFlag` automatically (`flaggedBy: 'system'`) and shows a real `toast.info(...)` notification, the same real toast library (`react-toastify`) already used elsewhere in this app.

The manual "Flag for Random QC" button is now gone entirely — random selection is never a real user action. "Flag for High-Risk QC" stays, honestly, as the one remaining manual mechanism, since the automatic high-risk detection algorithm (PS-164) still genuinely lacks real accessioning-time input data.

8 new tests for the algorithm (boundary conditions: exact-threshold roll not selected, zero rate never selects, 100% rate always selects, negative vs. non-negative genuinely use different real rates). Full suite clean.

## Phase 19 (Sep 2026) — the real, defined report template, and the actual Sign Out action

Direct guidance: "Let's do the actual sign out. I don't believe we have a defined template defined." Correct — the earlier gate work (PS-163) only ever told you whether sign-out *would* be allowed; nothing produced a report or actually finalized a case. Mid-build, direct guidance supplied the real, authoritative Bethesda System/CAP/CLIA standard structure for a complete GYN cytology report — seven real sections — which reshaped the template significantly beyond what had first been drafted.

**The real, defined template** (`types/cytology/CytologyReportContent.ts`) mirrors all seven real, standard sections: Administrative & Patient Identifiers, Specimen Type, Specimen Adequacy, General Categorization, Interpretation/Diagnostic Result, Adjunctive Testing (HPV, computer-assisted screening), and Educational Notes/Comments/Sign-Off. Two real, new specimen-level fields support it — `preparationMethod` and `computerAssistedScreening` (`types/case/Specimen.ts`) — the same "real, simple, capturable field" treatment LMP got in Phase 16.

**Real, honest gap, stated once rather than implied by dead fields**: three real, standard §1 sub-items — hormonal status, prior abnormal-Pap/HPV/procedure history, IUD/contraception use — have no data source anywhere in this app yet (the same, already-deferred clinical-history-dictionary scope). They are genuinely absent from the type, not included as permanently-`undefined` fields implying capture is imminent.

**Real §7 sign-off requirement honored precisely**: "Name and signature/electronic sign-off of the reviewing Cytotechnologist... and/or Pathologist." `screenedBy` (the real `primary_screen` reviewer) and `signedBy` (who actually signed) are captured as two genuinely separate attributions — never collapsed into one.

`resolveCytologyReportContent.ts` — the real, pure assembly function, gathering from the Final Diagnosis review, patient, order, and specimen, preferring `description` over `label` throughout (Phase 17).

`resolveCanSignOutCytology.ts` — the real authorization decision, genuinely distinct from PS-163's own gate: a Pathologist can always sign out regardless of that gate's result (since a Pathologist signing IS the real pathologist review the gate exists to require); a Cytotechnologist only when the gate itself allows it for the Final Diagnosis review specifically.

`CytologySignOutRecord` (`types/cytology/`) + `mockCytologySignOutRecordService.ts` — a real, immutable "always written" record per real sign-out, this module's own version of this app's established `ReportSnapshot` concept — genuinely simpler, carrying real structured content directly rather than a PDF blob reference; the real PDF-rendering/storage infrastructure `ReportSnapshot` assumes is separate, substantial work not built here.

**Real UI wiring** (`CytologyScreeningPage.tsx`): a real status/action bar shows "already signed" once signed, or a live Sign Out button otherwise — disabled with the specific real blocked reason shown when a Cytotechnologist can't sign independently. Signing creates the real sign-out record and transitions the case to `'finalized'`.

**Real bug found and fixed while wiring this**: the review-history panel's own gate check (PS-163) had `isGynCytology` hardcoded `true` — harmless while every seeded specimen was GYN, but wrong once a real non-GYN case reaches this page. Now derived from the specimen's own real dictionary entry, same as the worklist itself already does.

16 new tests across the report-content resolver, the authorization resolver, and the sign-out record service. Full suite clean: 217/220 files, 2326/2335 tests, 0 failures.

## Phase 20 (Sep 2026) — the real orchestrator-mode gate, real PDF rendering, and real interface-engine dispatch

Direct guidance: "Let's move to the following: Real PDF rendering/storage." Investigated this app's own existing PDF pipeline before building anything — `SynopticReportPage.tsx`'s `generateReportPdfSnapshot` calls a real, external Firebase `render_report` Cloud Function, but its expected payload (`bodyAssembly`/`headerAssembly`/`narrativeTemplate`) is deeply coupled to the synoptic-template system cytology doesn't use. Rather than misuse a service with no source visibility to verify it, built a real, honest, separate, in-browser renderer instead.

Direct follow-up then asked the real, foundational question this depended on: "do we send the case objects and the pdf to the interface engine for processing and distribution?" Investigation confirmed this app's own real, established pattern — `buildOruR01Payload` assembles structured JSON (with a real, embedded `reportPdfBase64`) → `mockOutboundResultQueueService` (tracked, retryable) → `dispatchInterfaceMessage`, the one real, generic HTTP transport to a real, external endpoint standing in for an actual interface engine (never Mirth Connect itself, never generates HL7 — "PathScribe sends JSON, the interface engine builds HL7"). But that pathway is scoped to `reportingMode === 'orchestrator'` only — an `'assist'`-mode case means an external LIS owns the report.

Direct guidance then resolved the real architectural question directly, with supporting CAP/RCPath research: GYN Pap cytology never requires synoptic reporting (it follows Bethesda, not a CAP Synoptic Cancer Protocol), so a real GYN Pap case has no reason to be `'assist'` mode; non-GYN cytology cases that *do* warrant synoptic reporting are expected to follow the existing surgical pathway instead. **"This is why Orchestration mode is the gate to access our cytology structured workflow."**

**Real, corrected seed data**: the 6 real GYN Pap seed cases (S26-5001–5004, 5006, 5007) were wrongly `reportingMode: 'assist'` — corrected to `'orchestrator'`. S26-5005 (the non-GYN FNA case) deliberately stays `'assist'` — a real, working example of a non-GYN cytology case following the surgical pathway instead. Real `MOCK_VERSION` bump, same established discipline as PS-166.

`resolveCytologyStructuredWorkflowAccess.ts` — the real, simple gate: `reportingMode === 'orchestrator'`. Wired into `CytologyScreeningPage.tsx` as a real, honest blocking message for an assist-mode case, rather than attempting the full review/sign-out flow.

`generateCytologyReportPdf.ts` — a real, working, client-side PDF renderer (`jspdf`, newly installed and verified to actually work in this test environment, not assumed), rendering all seven real `CytologyReportContent` sections. Genuinely simpler than the synoptic pipeline, matching cytology's own genuinely simpler report — not a lesser version of it.

Cytology's own real dispatch infrastructure, mirroring the surgical pathway's established shape exactly: `CytologyOutboundResultQueueEntry` + `mockCytologyOutboundResultQueueService.ts` (same real enqueue/markSent/markFailed/retryDispatch lifecycle, same real audit-log calls, `signOutRecordId` in place of `instanceId` since cytology has no synoptic instances) and `buildCytologyOruR01Payload.ts` (the real, structured JSON package — narrative-equivalent fields plus the real, embedded, base64-encoded PDF this app generates itself).

**Real bug fixed while building the queue service**: importing `auditService` via the `@/services` barrel transitively pulled in `mockUserService.ts`'s own module-level `localStorage` access, breaking outside a browser/test-DOM context. Fixed by importing `mockAuditService` directly from its own module — the same real, established service, just not through the barrel.

Real dispatch wired into `handleSignOut`: after a real sign-out record is created and the case finalized, the real result is enqueued, a real payload built (with a real, embedded PDF), dispatched, and marked sent or failed — mirroring `dispatchCaseInstances.ts`'s own real pattern exactly, not a parallel, divergent one.

31 new tests across the gate resolver, the PDF generator, the payload builder, and the queue service. Full suite clean: 221/224 files, 2345/2354 tests, 0 failures.

## Phase 21 (Sep 2026) — international roadmap, Phase 1 (US/CA): real HPV genotype capture and co-testing dual-result support

Direct guidance laid out a real, sequenced international roadmap: US/CA, then UK/EU, then Australia/NZ, then South Korea. Before building, checked what US/CA specifically needs against what earlier phases already cover: Bethesda nomenclature (already this module's own dictionary, PS-149 onward — also the AU/NZ/Korea standard), and registry/LIS integration ("decentralized via HL7 v2/FHIR... to hospital EHRs" — exactly PS-171's own dispatch work). Self-collection routing is an AU/NZ-phase concern, not US/CA. The one real, narrow gap: **"Dual-result views that show cytological slide data and molecular HPV status side-by-side."**

`Specimen.cytologyScreening.hpvGenotypeDetail` — real, standard co-testing assay genotype reporting (`hpv16`, `hpv18Or45`, `otherHighRisk`), only meaningful when `hpvResult === 'Positive'`. Mirrors PS-164's own existing `CytologyHighRiskFactors.hpvHighRiskGenotype` grouping ("HPV 16 or HPV 18/45") exactly.

**Real gap closed**: `resolveHpvHighRiskFactors.ts` — PS-164's own High-Risk algorithm always had `recentHrHpvPositive`/`hpvHighRiskGenotype` as real criteria with no real data source, explicitly noted at the time as deferred. This is the first real, data-driven bridge — a Positive result with 16 or 18/45 genotyped now correctly informs both real factors; genotype detail left over from an earlier, non-Positive result is never trusted on its own.

`resolveCytologyReportContent.ts`'s own `hpvResult` field now carries real, formatted genotype detail when applicable (e.g. "Positive (HPV 16)"), not a bare status word — real report content, per Phase 17's own "populate the reviews and report" standard.

**Real UI**: the HPV widget gained real genotype checkboxes, shown only when the result is Positive, and a visible border color change to make a positive result genuinely noticeable — a real step toward the "side-by-side, simultaneously" requirement, alongside the cytology review already visible in the same real, two-column layout.

16 new tests across the HPV/High-Risk bridge resolver and the report-content genotype formatting. Full suite clean: 222/225 files, 2354/2363 tests, 0 failures.

**Real, explicitly deferred to later phases**: primary HPV-first triage queues, self-collection vs. clinician-collection requisition routing, non-Bethesda nomenclature systems (UK/RCPath Dyskaryosis grading, Germany's München IIIb, France's SFCC), and country-specific centralized registry feeds (Australia's NCSR, UK/Scotland's Call 18, Netherlands' BPM, Ireland's CervicalCheck) — each is its own real, substantial body of work, sequenced per direct guidance's own roadmap, not attempted here.

## Phase 22 (Sep 2026) — international roadmap, Phase 2 (UK/EU): the real, multi-nomenclature dictionary

Direct guidance: proceed to UK/EU. Real, deliberate research first, not a guessed mapping — pulled the actual BSCC/RCPath terminology and current (2013 terminology, primary-HPV-screening era) NHS management pathways, including the real, published referral-threshold ordering (Landy et al. 2016, *Cytopathology*; NHS Trust guideline result-code documentation), before assigning any severity values.

**Real architecture decision, made deliberately**: Dyskaryosis grading and Bethesda grading are broadly analogous, not clinically interchangeable — a BSCC "Borderline" call can mean either an ASC-US-equivalent or an AGC-equivalent finding depending on context. Rather than force every system onto one shared, canonical severity scale, each real nomenclature system gets its own, fully independent set of entries, with its own `diagnosticRank`/`requiresPathologistReview`/`isUnsatisfactory` calibrated to that system's own real clinical/regulatory thresholds.

`CytologyNomenclatureSystem` (`'bethesda' | 'bscc_rcpath' | 'munchen_iiib' | 'sfcc'`) — the real, new required field on every `CytologyCategoryEntry`. All 45 existing entries backfilled `'bethesda'`. Real `SEED_VERSION` bump (structural, required-field change).

**Real, validating confirmation of an earlier design choice**: `classifyCytologyAgreement`, `resolveCytologySignOutGate`, and `resolveCytologyReviewRequirement` already take `categories: CytologyCategoryEntry[]` as an explicit parameter rather than fetching the whole dictionary internally — filtering by nomenclature system at the call site required zero changes to any of that logic.

**The real BSCC/RCPath dictionary** — 17 new entries: Negative; Borderline (squamous, and the real, separate "high-grade not excluded" and endocervical variants); Low-Grade Dyskaryosis; Moderate/Severe (High-Grade) Dyskaryosis; Severe Dyskaryosis/?Invasive; the two real glandular-neoplasia categories; adequacy; and NHSCSP-era recommendations (direct referral, urgent 2-week colposcopy, the 62-day suspected-cancer pathway). Real, per direct guidance's own confirmed principle: "Neither the CAP nor RCPath requires or expects synoptic reporting for routine cervical cytology" — this dictionary feeds the same real, structured (non-synoptic) review workflow the Bethesda one does.

**Real settings cascade**, mirroring PS-158's routing-settings shape exactly: `ICytologyNomenclatureSettingsService` (Enterprise default, Bethesda) + `IFacilityCytologyNomenclatureOverrideService` (Facility override) + `resolveEffectiveCytologyNomenclatureSettings`. No Staff-level tier — a lab's own reporting nomenclature is a facility-level operational choice, same real reasoning as the routing setting.

**Real UI wiring**: `CytologyScreeningPage.tsx` now resolves the case's own effective nomenclature system (via its performing facility) and filters the entire dictionary down to just that one real system's entries — a screener at a UK facility now genuinely sees only BSCC/RCPath terminology, never a mix of two systems in the same picker.

**Real bug caught by testing, not assumed away**: the end-to-end cascade test initially failed for a reason unrelated to the logic under test — the same module-level mock-service state carryover from a prior test that PS-169 already hit once. Fixed with an explicit baseline reset in the test, not a workaround in the real service.

26 new tests across the dictionary service and the nomenclature settings cascade. Full suite clean: 223/226 files, 2363/2372 tests, 0 failures.

**Real, still-open items within this same UK/EU phase**: primary HPV-first triage queues (per direct guidance's own Product Need: "slides are generated and routed to cytotechnologists only after a positive hrHPV result"); the admin config UI (`CytologyCategoriesSection.tsx`) still only supports creating/editing Bethesda entries — BSCC/RCPath is seed data only, with no real admin screen of its own yet; Germany's München IIIb and France's SFCC dictionaries; and the real registry integrations (UK/Scotland's Call 18, Ireland's CervicalCheck, Netherlands' BPM).

## Phase 23 (Sep 2026) — the real HPV-First triage workflow

Direct guidance: "HPV triage next." Per direct guidance's own confirmed principle: cytology and HPV are done together everywhere the module already supports (`co_testing`); in UK/Scotland/Ireland/Netherlands/Australia/NZ/Germany/France, a slide only ever gets made once a molecular platform's own real hrHPV result comes back positive — the cytology lab may never see a slide at all.

`ICytologyScreeningStrategyService` (`'co_testing' | 'primary_hpv_reflex'`) + a real Facility override, mirroring this phase's own nomenclature-settings cascade shape exactly — no Staff tier, same real reasoning.

`resolveCytologyTriageState.ts` — the real, core logic. Reuses the same real `hpvResult` field PS-172 already built for co-testing; the difference is not the data, it's what the result means. Under `co_testing`, `'not_applicable'` — always eligible. Under `primary_hpv_reflex`: no result yet → `'awaiting_hpv_result'` (never assumed eligible — same "unresolved is never the reassuring answer" posture this module already established); a real Negative → `'hpv_negative_complete'` (routine recall, no reflex ever performed); a real Positive → `'reflex_triggered'` (now genuinely eligible for screening).

**Real, structural change to `resolveCaseCytologyWorklistMembership`** (PS-160): now also takes the effective screening strategy and gates on real triage eligibility — under `primary_hpv_reflex`, a case still awaiting its molecular result, or one that already came back negative, never appears in My Worklist or Pool. A companion, genuinely distinct resolver, `resolveCaseCytologyTriagePendingMembership.ts`, returns the opposite real state — exactly the cases a lab tech needs to see to record that result.

**Real UI**: a fourth tile, HPV Triage, alongside My Worklist/Pool/QC. Each pending case gets real "Record Negative"/"Record Positive" actions — Positive writes the real result and the case then genuinely appears in My Worklist/Pool per the gating above; Negative closes the case out, and it simply stops appearing in any real cytology tile, matching the real "no reflex ever performed" rule rather than needing a separate "closed" state.

22 new tests across the triage-state resolver, the settings cascade, the two membership resolvers, and 4 new cases added to the existing worklist-membership tests. Full suite clean: 226/229 files, 2385/2394 tests, 0 failures.

**Real, still-open items**: this phase does not model an actual inbound interface receiving the molecular platform's own real HL7/FHIR result — "Record Positive/Negative" is a real, manual, honest interim action, the same posture PS-165's own manual QC-flagging took before an automatic algorithm existed. Self-collection vs. clinician-collection specimen routing (the Australia/NZ phase's own real concern) is not addressed here even though it interacts with this same triage concept.

## Phase 24 (Sep 2026) — real correction: the inbound HPV result is a real interface-engine event, not a manual UI action

Direct correction to Phase 23's own stated limitation: "for the molecular platform they would be sending results through your engine which would transform that into a json payload. I don't think that is really fake, no one is resulting an HPV in the application. Also they would be sending ref ranges and abnormal flags."

Checked this app's own real, established inbound-ingestion pattern before building anything — `processBlockExceptionEvent.ts` (`services/hl7/`) is the exact real precedent: "ingest our own specification (best practice), then let the engine handle the translation." `HpvResultEventPayload` (`types/events/`) is that same real specification for HPV — messageId/timestamp for real idempotency and tracing, organisationId/siteId, accessionNumber/specimenLetter as the real lookup keys, and the real result itself: `hrHpvResult`, plus the real, per direct correction's own named fields — `abnormalFlag` (real, standard HL7 OBX-8, narrowed to `'A' | 'N'` for a qualitative hrHPV result) and `referenceRange` (real, standard OBX-7 text, exactly as the sending assay reports it — never PathScribe's own interpretation).

`processInboundHpvResultEvent.ts` — the real ingestion function, mirroring `processBlockExceptionEvent.ts`'s own complete pattern: idempotent on `messageId` (a redelivered event is a genuine no-op), every real outcome (`applied`/`already-applied`/`case-not-found`/`specimen-not-found`/`invalid-payload`) distinct and honest, and the same real "force through" posture on a concurrency conflict — the molecular result already exists at the sending system regardless of a local version conflict, so there's no safe "discard and reload" option. One real, additional validation beyond the established template: a contradictory flag (e.g. `Positive` paired with `'N'`) is rejected as `invalid-payload`, not blindly trusted — the sending system's own flag is authoritative, but still checked against the result it accompanies.

`Specimen.cytologyScreening` gained `hpvAbnormalFlag`/`hpvReferenceRange` — real, inbound-only fields, persisted exactly as received, never set by manual UI entry.

**Real UI correction**: the worklist's "Record Positive/Negative" buttons no longer mutate the specimen directly — they build a real `HpvResultEventPayload` and call `processInboundHpvResultEvent`, the same real function a genuine interface-engine delivery would call. The button simulates the *delivery* (since no real, external molecular platform is connected in this environment), not the result — matching direct correction's own point exactly.

8 new tests for the processor (redelivery idempotency, flag/result consistency validation, every real outcome). Full suite clean: 227/230 files, 2393/2402 tests, 0 failures.

## Phase 25 (Sep 2026) — real seed data for HPV testing and "ordered" states

Direct guidance: "create some seed data that represent various HPV testing results and also some in ordered states."

**Real, existing US co-testing cases enriched** (S26-5001–5004, 5006, 5007) rather than left with no HPV data at all: Negative (5001, 5006), Positive with HPV16 genotype (5002 — coherent with its existing ASC-US finding), Pending — the real "ordered, not yet resulted" state (5003), Not Performed — co-testing not ordered for this patient (5004), and Positive with an "other high-risk" genotype (5007 — a real, second, co-occurring risk factor alongside its existing immunocompromised clinical indication, not a replacement for it).

**Real bug found and fixed while touching this data**: S26-5006's own `finalDiagnosis` snapshot still used the pre-PS-167 `adequacyCategoryId` field — stale since that multi-select redesign renamed it to `adequacySelections`. Fixed.

**Real, new UK `primary_hpv_reflex` seed data**, using Fenwick Women's Hospital (`c-fenwick-womens`) — a real, already-seeded UK facility (`jurisdiction: 'GB_EW'`), now configured with real seed overrides for both screening strategy (`primary_hpv_reflex`) and nomenclature (`bscc_rcpath`), a complete real facility profile rather than one setting in isolation. Three new cases (S26-6001–6003), one for each real triage state `resolveCytologyTriageState.ts` defines: S26-6001 awaiting its molecular result (the real "ordered state" — genuinely invisible to every cytology tile until resolved), S26-6002 a real Negative closing the case with no reflex ever performed, S26-6003 a real Positive with HPV16 genuinely triggering reflex eligibility (seeded directly into Pool, ready for a real BSCC/RCPath screen).

Real `SEED_VERSION`/`MOCK_VERSION` bumps on every touched service, same established discipline as PS-166.

No new tests — this is seed content exercising already-tested logic (PS-172's HPV fields, PS-174's triage resolvers), not new, independently testable behavior. Full suite confirmed unaffected: 227/230 files, 2393/2402 tests, 0 failures.

## Phase 26 (Sep 2026) — international roadmap, Phase 3 (Australia/NZ): self-collection routing

Direct guidance: proceed to Australia/NZ. First checked what was already covered — Bethesda nomenclature and primary HPV-first triage (PS-174) both already apply to Australia/NZ, per the original roadmap document's own grouping. The one real, distinct gap: self-collection.

**Real architecture question asked and answered before building**: "Is self collect another Collection type, associated with the specimen received? We may have existing architecture to handle the[is]." Checked directly — `Specimen.collection.method` is real, existing, free-text architecture, already wired into `buildOrderCreationPayload.ts` (the interface-engine order payload) and `SpecimenEditModal.tsx`. Reused for the real descriptive text; a real, structured sibling field was still needed for reliable business logic, since driving triage decisions off string-matching free text would be fragile.

**The real, clinically critical distinction**, per the given Australian NCSP information: "a self-collected sample contains vaginal cells rather than cervical cells, it cannot be used for Liquid-Based Cytology... The LIS suppresses automated LBC reflex ordering. Instead, it auto-generates a recommendation flag... directing the ordering clinician to recall the patient." A positive result on a self-collected specimen can **never** reflex to cytology from that same specimen — genuinely different from the UK/EU reflex model, not a variant of it.

- `SpecimenEntry.isSelfCollected?: boolean` (`services/specimenDictionary/specimenTypes.ts`) — real, dictionary-level flag, matching `isGynCytology`'s own established posture, since this is a real order-code/test-catalog distinction (the given information's own "HPV-SELF vs. CST-CLIN" separate order codes), not a per-instance property. New real dictionary entry, `sp-cyto-hpv-self` ("Self-Collected Vaginal Swab (HPV Only)").
- `resolveCytologyTriageState.ts` gained a genuinely new outcome, `'reflex_requires_new_specimen'`, alongside the existing `'reflex_triggered'` — a real, structural change, not an alias. `isCytologyScreeningEligible` correctly excludes it: a positive self-collected result is never eligible for cytology screening, full stop.
- `resolveCaseCytologyRecallNeededMembership.ts` — a real, new, genuinely distinct resolver (not a filtered view of an existing one) for the real, visible surface this state needs: per the given information's own "mismatched specimen alerting" concern, a case in this state must never simply vanish from every cytology tile, since someone needs to see it and act on the recall.
- Real UI: a fifth tile, Recall Needed, alongside My Worklist/Pool/QC/HPV Triage — showing "Positive (Self-Collected) — Recall for Clinician-Collected LBC" rather than silently disappearing.

35 new tests across the triage-state resolver and all three real membership resolvers (worklist, triage-pending, recall-needed) — each validating the self-collected case is handled correctly and distinctly from the clinician-collected one. Full suite clean: 228/231 files, 2404/2413 tests, 0 failures.

**Real, explicitly deferred, per direct guidance's own follow-up** ("for the tracking part put in to a jira ticket to follow up"): pre-analytical container tracking — dry swab vs. transport medium, the rehydration/elution step before PCR loading — filed as PS-177, not built here. Also still open from the given Australian NCSP information: NCSR centralized registry integration, MBS order-modifier fields (screening reason, collection context), risk-based Cancer Council Australia interpretive comment generation, and NCSR history lookup for Medicare billing eligibility — each real, separate, substantial work, not attempted in this phase.

## Phase 27 (Sep 2026) — international roadmap, Phase 4 (South Korea): clinical order context, and a real, generic centralized-registry dispatch foundation

Direct guidance: proceed to South Korea. Checked what was already covered, per the given information, before building: co-testing/Bethesda both already apply directly ("South Korea... still broadly support co-testing," "operates under The Bethesda System"); self-collection confirmed not applicable ("strictly utilizes physician-collected cervical cytology"). The real, distinct pieces were real clinical order context and centralized registry reporting.

**Real clinical order context**: per the given information, HPV testing in Korea serves genuinely distinct real purposes outside KNCSP's own Pap-only public program — co-testing, real ASC-US reflex/secondary triage, and post-treatment surveillance — that "the system should represent... not just the result itself." `Specimen.cytologyScreening.hpvOrderReason` (`'co_test' | 'ascus_reflex' | 'post_treatment_surveillance'`), optional per direct guidance — the triage logic does not depend on it; it exists purely for real clinical accuracy and reporting. Threaded through the full real path: the inbound `HpvResultEventPayload`, `processInboundHpvResultEvent.ts`'s persistence, `resolveCytologyReportContent.ts`'s formatting (e.g. "Positive (HPV 16, ASC-US reflex triage)" — genotype and order reason combine cleanly; a routine `co_test` reason adds no real information and is never appended), and a real dropdown in the HPV widget.

**Real, generic centralized-registry dispatch** (Option B, chosen over filing a third deferred ticket): South Korea's own KNCSP/KCCR is the first real, concrete, working example against a real, generic foundation — not a one-off, Korea-only mechanism. Real, deliberate scope: `CytologyRegistryId` stays narrow (`'none' | 'kncsp_kccr_korea'`) rather than speculatively including UK/Ireland/Netherlands values with no real research or payload builder behind them yet, matching this module's own established discipline (BSCC/RCPath was only added after real research, never speculatively).

- `ICytologyRegistrySettingsService` + Facility override, mirroring this module's own established two-tier cascade shape exactly.
- `buildCytologyRegistryReportPayload.ts` — reuses `CytologySignOutRecord.reportContent`, same real pattern as `buildCytologyOruR01Payload.ts`. Real, honest gap documented directly in the file: KCCR links records via a real national identification number this app does not capture anywhere — deliberately not invented as a new `Patient` field without being asked, given the real privacy implications; MRN is the best real, available identifier used instead.
- `CytologyRegistryOutboundQueueEntry` + mock service, mirroring the EHR-dispatch queue's own enqueue/markSent/markFailed/retry lifecycle and audit-log calls exactly, `registryId` carried explicitly since a facility's registry destination is itself configurable.
- `InterfaceTransactionType` (`services/interfaceDispatch/`) extended with a real `'REGISTRY_REPORT'` value, properly, rather than cast around with `as any`.
- Wired into `handleSignOut` as a genuinely separate real dispatch from the ORU send — fires only when a facility has a real, effective registry configured, `'none'` remaining the correct default for the many real facilities with no such obligation.

**Real, new seed data**: Seoul General Screening Center (`c-kr-seoul-general`), a new real facility (`mockFacilityService.ts` — a real, previously-undiscovered gap fixed along the way: this file had no `SEED_VERSION` guard at all, unprotected since its own Client→Facility migration; added one, matching this module's established discipline), configured with the real KNCSP/KCCR registry override. One new seed case (S26-7001), Final Diagnosis already selected, seeded ready for a real Sign Out so the new registry dispatch has something real to fire against.

23 new tests across the registry settings cascade, the payload builder, and the queue service. Full suite clean: 231/234 files, 2422/2431 tests, 0 failures.

**Real, explicitly deferred**: MBS-equivalent order metadata beyond `hpvOrderReason`; KNCSP's own real universal-invitation/participation-tracking data (distinct from the per-case result reporting built here); and, as already noted, the UK/Ireland/Netherlands registries this same generic foundation is now ready to extend to, once each is researched with the same rigor BSCC/RCPath and KNCSP/KCCR received.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

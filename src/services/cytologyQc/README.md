# services/cytologyQc/

Real, per the uploaded "Automated Cytopathology QC Assignment Engine"
spec, plus extensive direct follow-up resolving two open design
questions and one confirmed real gap. This is the full, general rule
engine that supersedes `services/cytology/`'s own earlier, simpler
2-rate (negative/non-negative) Enterprise → Facility → Staff cascade
(`ICytologyQcSettingsService`, `resolveCytologyRandomQcSelection.ts`)
— those two rates become just two of many possible real rules under
this model, not a second, parallel mechanism.

**Real, deliberate migration scope, per direct guidance**: only the
*post-sign-out peer review* mechanism migrates onto this engine. The
5-year retrospective lookback and histology correlation pool
mechanisms (`resolveCytologyRetrospectiveReviewPoolMembership.ts`,
`resolveCytologyHistologyCorrelationPoolMembership.ts`) stay exactly
as they are — confirmed to serve a genuinely different real purpose,
not folded into this engine.

## Files, in build order

1. **`types/cytologyQc/CytologyQcRule.ts`** — the core data model:
   `QcRuleCriteria` (every real spec §2.1 dimension — jurisdiction,
   facility, provider, specimen, clinical risk, diagnostic scope),
   `QcSamplingLogic` (percentage/interval/fixed_volume, a real
   discriminated union), `QcWorkflowState` (spec §3's exact state
   names), `CytologyQcCaseAssignment` (a real, in-flight case's own
   record as it moves through the state machine).
2. **`resolveQcCriteriaMatch.ts`** — pure per-field criteria matching.
   An unset criteria field never excludes a case.
3. **`resolveQcSamplingDecision.ts`** — the three real sampling modes,
   each with genuinely different real state (a running counter for
   interval/fixed_volume, nothing for percentage).
4. **`resolveQcRuleEvaluation.ts`** — the real orchestrator: evaluates
   active rules in priority order (real, per direct, provided seed
   data's own convention — **higher `evaluationPriority` number
   evaluates first**, corrected from this file's own earlier,
   arbitrary ascending choice), enforces the real, upfront
   Consultation Deduplication guardrail before any rule runs, and
   returns a real, discriminated `QcEvaluationResult`.
5. **`resolveQcReviewerEligibility.ts`** — the one, hard, always-on
   Self-Review Prevention guard (never a per-rule setting).
6. **`resolveNewQcCaseAssignment.ts`** — builds the real initial
   `QC_PENDING` record from either a rule match/CT escalation, or a
   ROSE/FNA discrepancy (a real, fixed, always-on system trigger —
   never a configurable rule — landing at the real, highest urgency
   tier with a fixed real 4-hour SLA, per spec §2.3).
7. **`ICytologyQcCaseAssignmentService.ts` / `mockCytologyQcCaseAssignmentService.ts`**
   — the real, persisted state machine: `create` → `assignReviewer`
   (enforcing self-review prevention) → `recordConcurrence` /
   `recordDiscrepancy` → `escalateForSlaBreach` (real, honest refusal
   if not genuinely breached) / `supervisorBypass` (always logged,
   never silent).
8. **`resolveQcSlaStatus.ts`** — on-time / approaching (80% of window)
   / breached, pure, no clock of its own.
9. **`resolveCytologyQcComplianceReport.ts`** — spec §4's own
   aggregate reporting: tier/trigger breakdowns, per-reviewer
   discrepancy rates, real `undefined` (never a fabricated 0%) when
   there's no resolved data yet.
10. **`sortQcQueueByPriority.ts`** — the real Urgency Matrix ordering
    for the unified queue.
11. **`ICytologyQcRuleService.ts` / `mockCytologyQcRuleService.ts`** —
    real CRUD for the rules themselves, `duplicate()` (starts
    inactive, ready for one small change), and the real, international
    seed set (see below).
12. **`resolveQcRuleDraftValidation.ts`** — the admin form's own pure
    validation (real ranges, required fields) — the form itself never
    embeds this logic.
13. **`resolveQcQueueTabFilter.ts`** — the real tab slicing (All /
    Escalations & Discrepancies / Routine & Random) for the unified
    queue UI, pure.
14. **`resolveQcEvaluationContextFromCytologyReview.ts`** — the real
    adapter from `CytologyScreeningPage.tsx`'s own available data to
    a real `QcEvaluationCaseContext`. Pure — the actual async lookups
    (facility → jurisdiction, category ID → adequacy label) stay in
    the real call site, not hidden in this function.

## Admin UI & reviewer UI

- `Config/System/CytologyQcRulesSection.tsx` — the rule builder.
- `pages/CytologyQcQueuePage.tsx` (`/cytology-qc-queue`) — the real,
  unified, reviewer-facing Peer Review Queue.

## Real, international seed rule set — 8 rules

Seeded per direct, provided specification, translated field-for-field
onto this module's own types (jurisdiction labels expanded into this
app's own real per-country `Jurisdiction` values; `NILM`/`NEGATIVE`
diagnostic codes mapped onto `resultIsNegative: true` rather than
enumerating Bethesda categories; `routing.target_reviewer_role` kept
as real, provided strings in `eligibleReviewerRoles`):

| Rule | Jurisdiction(s) | Role | Sampling | Tier |
|---|---|---|---|---|
| `SEED-US-CLIA-001` | US | CT | 10% negative | routine_random |
| `SEED-US-CLIA-002` | US | CT | 100% high-risk-flagged negative | targeted_high_consequence |
| `SEED-UK-NHS-001` | GB_EW/GB_SCT/GB_NIR/IE | CT+Path | 20% HPV+ | targeted_high_consequence |
| `SEED-EU-ISO-001` | DE/FR/NL/BE | Pathologist only | 2% Path-to-Path | routine_random |
| `SEED-EU-CT-SIGNOUT-001` | DE/FR/NL/BE | CT | 10% negative | routine_random |
| `SEED-APAC-AU-001` | AU/NZ | Pathologist | 100% high-grade | targeted_high_consequence |
| `SEED-GLOBAL-ONBOARD-001` | any (ships inactive) | Pathologist | first 50 cases | high_escalation |
| `SEED-GLOBAL-UNSAT-001` | any | CT+Path | 100% unsatisfactory | targeted_high_consequence |

### Real, confirmed gap found and fixed — EU Cytotechnologist independent sign-out (Sep 2026)

The original EU seed only ever covered Pathologist-to-Pathologist
review (`SEED-EU-ISO-001`), silently assuming all EU cytology
sign-out is Pathologist-attributed. Direct guidance flagged the real
risk this created — the migration onto this engine could silently
drop QC coverage for any EU Cytotechnologist sign-out that the old,
general Enterprise/Facility/Staff cascade used to catch. Confirmed via
direct, cited research (EACC/EFCS surveys): this is a real, common
misconception, not a safe assumption — Cytotechnologists independently
sign out negative (and in several jurisdictions, abnormal) cytology
across real EU countries.

**Resolved via a complete, provided seed definition**: `SEED-EU-CT-SIGNOUT-001`
was widened into the one, real, universal negative-rescreen rule
covering every jurisdiction this app models (retiring the earlier,
now-redundant US-only `SEED-US-CLIA-001`), and `SEED-EU-ADV-CT-ABNORMAL-001`
was added for the real, distinct advanced-CT abnormal sign-out
scenario, scoped to the jurisdictions that genuinely permit it
(GB_EW/GB_SCT/GB_NIR, NL, DE — see the jurisdiction policy below).

### Real credential normalization design (Sep 2026)

Per direct guidance's own confirmed correction: rule criteria
(`QcRuleCriteria.requiredCapabilities`) and the sign-out gate both
check one, normalized system capability (`CYTO_ADVANCED_SPECIALIST`)
— never a raw, jurisdiction-specific credential string directly. A
provider's real, held credential is always the real, raw, local
certification (the UK's `IBMS_ASD`, the Netherlands' `NL_KCA_ADVANCED`,
Germany's `DE_ZYTO_ASSISTENT_ADV`); `resolveNormalizedCredentialCapabilities.ts`
is the one, real place that maps a raw credential to its normalized
capability, exposed to the evaluation engine as
`QcEvaluationCaseContext.providerCapabilities`. This also resolved
Germany's own earlier, honest placeholder (an empty accepted-credential
list, pending a real German credential name) — that real name is now
known and mapped to the same capability as the UK and Dutch ones.

**Real, important naming caveat, per direct guidance's own explicit
caution**: `CYTO_ADVANCED_SPECIALIST` is authoritative only within
PathScribe's own normalized authorization model — it is not itself a
real credential recognized by any individual country's own certifying
body. The correct, precise term is a "normalized system capability
key," never an "authoritative credential identifier" — the latter
could wrongly suggest a real, cross-border regulatory standard that
doesn't actually exist.

**Also noted, out of scope for this fix**: the same research named
Denmark and Sweden as real countries where independent CT sign-out is
established practice. Neither exists in this app's own `Jurisdiction`
type (`types/systemConfig.ts`) at all yet — a real, separate gap in
this app's own jurisdiction coverage, not something this rule-seeding
pass can fix on its own.

## Real, deliberate safety net — new engine first, old mechanism as fallback

Per direct guidance, given the real risk that any *other*,
not-yet-identified jurisdiction/role combination could have the same
kind of silent coverage gap the EU one turned out to have: the real
migration at `CytologyScreeningPage.tsx`'s own sign-out call site does
**not** simply retire the old Enterprise/Facility/Staff cascade. It
checks this engine's own active rules first; only when genuinely
nothing matches does it fall back to the old mechanism, rather than
concluding "no rule matched" means "no QC needed." This guarantees no
jurisdiction or role silently loses coverage it has today while the
real rule set is still being confirmed against real regulatory
guidance, country by country.

## Real, completed sign-out gate wiring (Sep 2026)

`resolveCytologySignOutGate.ts`'s own real 3-part advanced-CT
exception (jurisdiction policy + normalized capability check) is now
fully wired into the real sign-out screen
(`CytologyScreeningPage.tsx`) — not just available as an unused
capability. The real `labJurisdiction` and `signingProviderCredentials`
inputs are resolved once at the component level (a real facility
lookup for jurisdiction, a real staff-record lookup for credentials)
and reused across all five real call sites that check this gate,
rather than repeating both real async lookups per call. Real, honest
default: `'US'` (a jurisdiction that grants no exception) until the
real facility lookup resolves — an unresolved jurisdiction can never
silently grant an exception it hasn't actually confirmed.

**Real, pre-existing architectural note surfaced along the way**: this
app has two, separate, pre-existing `StaffUser` type definitions
(`types/index.ts` and `services/users/IUserService.ts`) — a real
duplication this work did not attempt to unify (out of scope), but
`providerCredentials` was added consistently to both so real credential
data resolves correctly regardless of which one a given real call site
happens to use.

---
*When this folder's contents change meaningfully, update THIS file.*

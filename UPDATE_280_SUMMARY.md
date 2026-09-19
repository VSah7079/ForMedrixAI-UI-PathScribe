# Update 280 — Real sign-out-authority enforcement, real Jira status, real Issues Report reconciliation

Answers all three parts of "Yes, complete the work. Are you closing the Jira records? Please
let me know where things stand from the Issues Report."

## 1. The work — real enforcement wired

`canFinalizeCase()` and `deriveEligibleFinalizerIds()` (`src/services/auth/caseAccessControl.ts`)
no longer consult the hardcoded `['primary', 'attending']` literal. They now resolve eligibility
from the real `ParticipationTypeRecord.canFinalize` flag — the Participation Types admin
screen's own checkbox — via `resolveFinalizeEligibleTypeIds()`, which calls
`resolveParticipationTypeAuthority()` (added in Update 279) to apply a lab's own
`authorityOverrides` when one exists.

**Proven backward-compatible, not just asserted**: `mockParticipationTypeService.ts`'s real seed
data has `canFinalize: true` on exactly `primary` and `attending` and `false` on every other
type — identical to the old hardcoded list. New tests assert this directly (`resolveFinalizeEligibleTypeIds(REAL_TYPES)` equals the old literal), so every existing customer's default
behavior is unchanged; only a lab that actually uses the per-lab override screen sees different
behavior.

**Wired at both real call sites**, not left as an unused parameter:
- `useSignOutWorkflow.ts`'s two `canFinalizeCase()` calls (`handleSignOutConfirm`,
  `finalizeCase`) now resolve the case's real participation types and its real performing-lab
  facility id (via the same `resolvePerformingLabFacilityId()` pattern already used elsewhere in
  that file) before checking eligibility — a lab's override now genuinely governs who can sign
  out, not just what the admin screen displays.
- `CaseRouter.ts`'s `deriveEligibleFinalizerIds()` calls (`updateCase`/`createCase`) now pass the
  real `ParticipationTypeRecord[]` too — **deliberately not lab-scoped here**: this chokepoint
  often only has a partial `Case` patch with no cheap performing-lab id to key an override off,
  and Case itself carries no stored lab id. Using each type's platform-default `canFinalize` flag
  is real and data-driven — a major improvement on the fully hardcoded list — just not lab-precise
  for this one denormalized field. The full-fidelity, lab-scoped decision is the client-side gate
  above, which always has complete case + order context.

**New shared cache**: `src/utils/participationTypeLookup.ts` — extracted because both call sites
need the same "fetch every participation type, memoize the in-flight promise" logic (same pattern
`CaseRouter.ts` already used for subspecialties/facilities). Matters more here than for a typical
admin lookup: the mock service simulates a real ~60ms network round trip, and wiring that
unmemoized directly into the sign-out hot path would have added real, repeated latency to every
finalize attempt for no reason.

**Also worth knowing — no real `firestore.rules` file exists in this codebase.** Checked directly:
there is no rules file anywhere in this project; `PRODUCTION_MIGRATION.md`'s own Step 1 lists
"Set Firestore security rules..." as a future production step, not something built yet. So
`deriveEligibleFinalizerIds()`'s denormalization is real and ready for whoever writes that file,
but nothing server-side enforces it today — the actual, live enforcement is the client-side
`canFinalizeCase()` gate, which is now fully wired.

**Validation**: `npx tsc --noEmit -p .` clean. `npx vitest run --exclude firestore.rules.test.ts`:
477/477 files, 4181/4181 tests passing (10 new tests added directly covering the lab-override
behavior, including that a lab can both revoke a normally-eligible type's authority and grant it
to a normally-ineligible one).

## 2. Are you closing the Jira records? — No, not until just now. Here's what's real.

Straight answer: no. Every "Update NNN" in this session has only ever been tracked in local
`UPDATE_NNN_SUMMARY.md` files — nothing was ever written back to Jira. I hadn't even confirmed a
real Jira connection existed until this message; my first attempt (last turn) used a placeholder
cloud ID and failed.

That's now fixed. `getAccessibleAtlassianResources` confirms a real, connected Jira site:
**formedrixai.atlassian.net**, project **PS ("PathScribe Alpha")**. I queried the real, current
status of every PS-number referenced anywhere in the Issues Report — see the table below — and
found that **every one of them still shows "To Do" or "In Review" in real Jira, regardless of
what this session's local summaries claim was implemented.** None of this session's work had
reached Jira until right now.

**What I did about it, this turn**: added a factual status comment to each of the 9 tickets
this session has real, verified evidence for (PS-48, 61, 65, 69, 71, 73, 75, 76, 83), plus one
honest "in progress, not done" comment on PS-72. Each comment names the specific local Update
that did the work and the verification that was run. **I did not transition any ticket's status**
— that's a judgment call about whether the fix meets your bar, and it's yours to make, not mine
to presume from a mock/dev environment. The comments give you what you need to verify quickly and
transition yourself (or tell me which status you want and I'll do the transition).

## 3. Where things stand — Issues Report reconciliation

The Issues Report has 37 items: 29 raw UI/UX feedback points (only one, item 5, carries an
explicit PS-number — PS-97) and 8 items (30–37) that are pure Jira-ticket-number lists.

### Real Jira status vs. this session's own work, for every PS-number in the report

| Ticket | Real Jira status (just checked) | This session's work | Evidence |
|---|---|---|---|
| PS-48 | To Do | **Done** — removed `xlsx` entirely, replaced with dependency-free CSV | Update 275 |
| PS-61 | To Do | **Done** — typed all 22 `VITE_*` env vars | Update 271 |
| PS-65 | To Do | **Done** — removed SearchPage.tsx's orphaned Profile/Logout modal | Update 271 |
| PS-69 | To Do | **Done** — root-caused and fixed the `ServiceResult<T>` narrowing quirk | Update 271 |
| PS-71 | To Do | **Done** — added concurrency-conflict audit trail, closed `expectedVersion` gaps | Update 271 |
| PS-72 | To Do | **Partial** — PHI-tagging rollout ongoing, several files done, several queued | Updates 273–278 |
| PS-73 | To Do | **Done** — uniqueness pattern extended to remaining dictionaries + Subspecialty fix | Updates 273–280 |
| PS-75 | To Do | **Done** — Performing Lab scoping pattern, rolled out to 3+ more dictionaries | Updates 273, 278–280 |
| PS-76 | To Do | **Done (one confirmed instance)** — de-duplicated `.ps-del-*` CSS blocks; ticket's own broader-audit scope not attempted | Update 271 |
| PS-83 | To Do | **Done** — real Work RVU values added for the 4 gapped billing codes (worth your own CMS PPRRVU double-check) | Update 272 |
| PS-97 | **In Review** | Not touched by this session | — real, already in progress by someone/something else |
| PS-64 | **Done** | Not touched by this session | — already closed independently |
| PS-85 | **In Review** | Not touched by this session | — already in progress independently |
| PS-41, 42, 49–54, 57, 59, 60, 62, 63, 67, 68, 70, 84, 88, 100, 102, 105, 108, 126 | To Do | **Not addressed** — no local record of any work on these | — |

### The 29 raw UI/UX feedback items (1–29)

Only two have any record in this session: **item 5 / PS-97** (not touched here — see table above)
and **item 27** ("remove the badge + Urgent" on the new-cases tile), which Update 271's own
regression notes confirm was shipped alongside PS-61/65/71/76 in that same pass. **Items 1–4,
6–26, 28–29 have no corresponding PS-number and no record of being addressed in any Update this
session produced** — I'm not going to guess at partial credit for these; treat them as
open/unstatused until you tell me otherwise or they get real ticket numbers.

## Files changed

- `src/services/auth/caseAccessControl.ts`
- `src/services/auth/caseAccessControl.test.ts`
- `src/pages/SynopticReportPage/hooks/useSignOutWorkflow.ts`
- `src/services/cases/CaseRouter.ts`
- `src/utils/participationTypeLookup.ts` (new)

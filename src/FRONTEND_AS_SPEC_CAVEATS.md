# Frontend-as-Spec: Where NOT to Copy This Literally

**Audience: the backend team building against this codebase as a
reference.** This document exists because that's a reasonable, common
way to work — but this frontend was built as a demo/prototype, mock
services backed by `localStorage`, one developer session at a time.
Several places in it contain a deliberate simplification, a documented
gap, or a client-side-only mechanism that would produce a **wrong or
dangerously incomplete real backend** if read as literal spec rather
than as one input among several. Every item below cites the real file
and line so it can be checked directly, not taken on faith.

This is not a list of things wrong with the frontend. Every
simplification here was a deliberate, reasoned choice for what this
codebase actually is — a demo, not a production system. The problem
only exists if someone builds the real backend by mimicking this
code's *behavior* without reading *why* it behaves that way.

---

## 1. CRITICAL: There is no real authentication anywhere in this app

**This is the most important item in this document, by a wide margin.**

`getSessionUser()` (`src/services/auth/caseAccessControl.ts`, line 95)
reads the "current user" — including their **role**,
**organisationId**, and permission flags like
`canViewCrossTenantQa` — directly out of `localStorage`:

```ts
const raw = localStorage.getItem(SESSION_STORAGE_KEY);
const parsed = JSON.parse(raw);
return { id: parsed.id, role: parsed.role, ... };
```

Anyone with browser DevTools can edit this value directly and become a
pathologist, gain cross-tenant QA access, or grant themselves any
permission flag in the app. There is no password, no token, no
server-side session, no verification of any kind that the identity in
`localStorage` is who it claims to be.

**What's real and worth keeping**: every *authorization* function
built on top of this — `resolveCaseAccess`, `canFinalizeCase`,
`canViewCrossTenantQaData`, `resolvePediatricAccess`, and others in the
same file — encodes real, carefully-reasoned business rules about who
should be allowed to do what. That logic is worth porting.

**What must never be ported as-is**: the *trust boundary*. A real
backend must authenticate the request itself (a real session token,
verified server-side, on every request) and derive the user's role and
permissions from its own database — never from a claim the client
sends. If the real backend is built by translating
`canFinalizeCase(session, ...)` into `canFinalizeCase(req.body.session, ...)`,
every access control in this app becomes trivially bypassable by
anyone who can read this codebase (which, per this document's own
premise, is the backend team itself).

---

## 2. Registry submissions would be rejected: MRN stands in for four real national IDs

Every registry payload builder in `src/services/cytology/` uses the
patient's MRN where a real, different national identifier is
required by the actual registry:

- **South Korea (KCCR)** — needs a real Korean national ID.
  `buildCytologyRegistryReportPayload.ts` (top-of-file comment) notes
  this directly.
- **Ireland (CervicalCheck)** — needs a real PPSN (Personal Public
  Service Number).
- **Northern Ireland (NICSP)** — needs the real "Health + Care
  Number."
- **Australia (NCSR)** — needs a real Medicare number or NHI.
  `resolveCytologyRegistryTransmissionAuditReport.ts` names this
  explicitly in its own header comment and field name
  (`patientMrn`, documented as a stand-in).

This was a deliberate, correct choice for a demo — this app was never
given real national ID data to work with, and inventing plausible-
looking ones would have been worse than omitting them. **But a real
backend that submits MRN to any of these four registries in place of
the real national identifier will have its submissions rejected** —
these are hard, structural requirements of the real registries, not
formatting preferences. Before any real registry integration ships,
the real backend needs a real field for each of these four identifiers,
captured at accessioning, not synthesized from MRN.

---

## 3. The CLIA workload cap report silently drops a real compliance mechanism

`resolveCytologyWorkloadTrackingReport.ts`, and its caller in
`mockCytologyQaReportService.ts`, apply **one Enterprise-wide cap to
every cytotechnologist** shown in the report.

The real cap logic already exists and is more sophisticated:
`resolveEffectiveCytologyWorkloadCap.ts` implements a genuine
three-tier cascade — staff-level override, then facility-level
override, then Enterprise default — and this cascade **is already
enforced live**, at the moment of sign-out
(`CytologyScreeningPage.tsx`'s own soft-brake/hard-block logic).

The QA *report* just doesn't call that same cascade per row — doing so
would mean one additional lookup per cytotechnologist shown in an
aggregate table, which was deliberately left as a documented
simplification (see the Phase 50/51 notes in
`src/services/cytology/README.md`).

**The risk**: if a backend engineer builds the real workload-tracking
report by reading `resolveCytologyWorkloadTrackingReport.ts` alone,
they will build a report that silently ignores real, already-configured
per-staff and per-facility caps — showing a CT as compliant with a
100-slide Enterprise default when their real, assigned cap is 80. The
live enforcement at sign-out is correct; only this specific *report*
takes the shortcut. Any real implementation of this report needs the
same three-tier resolution the sign-out gate already uses.

---

## 4. A real clinical/regulatory rule exists only in a markdown file, not in any type or interface

`src/FHIR_DISPATCH_ARCHITECTURE_PLAN.md` documents a real, researched
finding: **cytology sign-out must never trigger general cancer-registry
dispatch** (SEER/NPCR, NCRI, GEKID, and similar), at any severity —
because NAACCR/SEER/NPCR/CoC explicitly exclude cervical carcinoma in
situ and CIN III from reportability despite their in-situ behavior
code, and because national reportability standards require histologic
confirmation, which a cytology screening result is not.

**Nothing in the type system enforces this.** There is no
`CytologyReviewRecord` field, no interface constraint, no runtime
check anywhere in the codebase that would stop a future developer from
wiring cytology sign-out directly into a Cancer Registry dispatch
branch. The only thing preventing that mistake today is this document
existing and being read.

If/when a real Cancer Registry dispatch branch is built (it doesn't
exist yet — see the same planning document), this rule needs to become
a real, enforced constraint in code — not remain a fact someone has to
already know to avoid rebuilding it wrong.

---

## 5. Final Diagnosis has no real role restriction

Documented directly in `src/services/cytology/README.md`: **any user
who can reach the cytology screening page can set the Final
Diagnosis, including a Cytotechnologist** — there is no enforcement
that this requires pathologist sign-off, because direct guidance never
specified who should hold this authority during this app's
development.

This is a real, live gap in the current app, not just a documentation
note. A real backend should not assume the frontend's current
behavior ("anyone can finalize") reflects the intended real-world
policy — it almost certainly doesn't, for a clinical result of this
kind. This needs an explicit decision before a real backend enforces
anything here, and the real backend must enforce it server-side
regardless of what the frontend currently permits.

---

## 6. The QA report aggregation logic is a reference for behavior, not code to port literally

Following PS-205, all seven cytology QA reports sit behind a real
service interface (`ICytologyQaReportService.ts`) specifically so a
real backend implementation can replace the mock's method bodies
without touching any caller. That fixes the *interface shape*. It does
not mean the mock's *internal implementation* — fetch every raw
record via `.getAll()`, reduce in JavaScript — is what the real
backend should do.

Concretely: `resolveCytologyCtStatisticalComparisonReport.ts` groups
review records by cytotechnologist and computes rates and a
population-standard-deviation outlier flag, entirely in JS, over
whatever the mock has fetched into memory. The *math* is correct and
worth preserving (the rate formulas, the `diagnosticRank`-based
cross-nomenclature bucketing, the 2-SD variance threshold). The
*execution strategy* — fetch everything, reduce client-side — is
exactly the pattern that breaks at real production data volumes
(discussed directly in conversation: a real lab's review history
grows into the tens of thousands to millions of records over a few
years). The real backend should implement the same *logic* as a real,
server-side aggregation (a database `GROUP BY` with computed columns,
or equivalent), never send raw records to be reduced downstream.

---

## 7. PHI/export safety rules are UI conventions, not enforced boundaries

Multiple QA tabs (see `src/components/QualityAssurance/qaReportUtils.ts`'s
own header comment, and `CytologyQaTab.tsx`'s PHI note) follow a real,
deliberate convention: exported reports include case/accession
identifiers (necessary for the report to be actionable) but never
patient name, MRN, or DOB, on the reasoning that "once something
leaves as a downloaded file, none of the app's normal access controls
apply anymore."

This is a real, good policy — and it is enforced today purely by each
tab's own export-row-building code choosing which fields to include.
**Nothing prevents a future tab, or a real backend endpoint, from
including patient identifiers in an export if its author simply
doesn't know this convention exists.** A real backend should treat
this as a real, explicit policy — ideally enforced by a shared,
reusable mechanism (an allowlist, a redaction layer) — not something
every new report has to remember to replicate by reading prior
examples closely enough.

---

## How to use this document

This is not exhaustive — it's the highest-stakes items found in a
direct, deliberate sweep, not a claim that nothing else like this
exists. If the backend team finds another place where the frontend's
behavior looks like it should be ported literally, the right move is
the same one that produced this document: ask what the frontend
*couldn't* do (no real backend to talk to, no real national ID data
supplied, no real database at production scale) before assuming its
behavior is the intended real-world design.

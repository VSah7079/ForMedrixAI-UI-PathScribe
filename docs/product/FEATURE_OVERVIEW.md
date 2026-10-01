# PathScribe — Feature Overview

**Last verified:** August 2026, against the real, current codebase (not
inherited from any earlier doc). Written to be a source for generating
Jira epics/features from — each section below is a real, distinct
capability area, not a code-organization artifact.

## How to read this

Each feature area below names the real routes/pages it lives at and
the real folder to go to for implementation detail (every folder has
its own `README.md` — this document is the rollup, not a replacement).
Status is marked honestly: **Live** (built, working, in real use in
the demo), **Partial** (some real, working pieces; a real, named gap
remains), or **Planned** (deliberately scoped, not yet built).

---

## Core clinical workflow

### Synoptic Reporting (`/case/:caseId/synoptic`) — Live
The central page: a pathologist builds and signs out a report. Two
distinct operating modes:
- **CoPilot** — PathScribe as a passive synoptic data-capture layer
  feeding a host LIS.
- **Orchestration** — PathScribe owns the full report lifecycle as a
  lightweight LIS for outreach cases, including AI-assisted narrative
  generation (the Orchestrator engine).

See `src/pages/SynopticReportPage/hooks/README.md` for the full
architecture (10 domain hooks covering LIS integration, specimen/block
management, report generation, amendment workflow, grossing
completion, sign-out/finalize, and more).

### Case Accessioning (`/accession`) — Live
Case creation, order import, patient/encounter resolution, specimen
entry.

### Grossing — Live
Scan-driven grossing workflow: default block/decant generation at
accession, grossing-scan hydration, cassette color routing
(`services/cassetteRouting/`), matrix/shared-block support.

### Amendment, Correction & Addendum — Live
Real two-stage pipeline (transmission-before-release ordering), LIS
Amendment Notice handling, hybrid classification (pure addendum / pure
amendment / corrected-with-addition), `ReportVersionRecord` PDF
snapshots at every sign-out.

### Countersign & FPPE — Live
Resident-drafts/attending-countersigns workflow, and Focused
Professional Practice Evaluation (new-hire credentialing) tracking.

---

## Batch Management & Chain of Custody

### Batch Management (`/batch-management`) — Live
Cassette/slide chain-of-custody tracking through processing nodes
(Decal/Special Processing, Processing, Embedding, Microtomy/
Sectioning, Staining, Checkout) via container barcode scanning.

### Retention Hold & Disposal (`/batch-management/disposal`,
`/batch-management/retention-holds`) — Live
Jurisdiction-aware retention policy (RCPath/UK, CAP/CLIA/US), computed
disposal-eligibility queue with direct scan-to-dispose, and a
case-level Retention Hold that blocks disposal until explicitly
released.

### Case Hold (in-case sidebar) — Live
A second, deliberately separate hold concept from Retention Hold —
gates **finalize** on an active case for a real, named reason (quality
issue, awaiting outside materials, clinical discrepancy, pending
consultation), surfaced via its own "Cases on Hold" Worklist tile.

### Pending Batch Load (`/batch-management/pending-load`) — Live
Computed queue of printed/engraved cassettes and slides not yet
scanned into any active batch.

### Cassette Color Routing & Printing — Live
Admin-manageable color dictionary and routing rules
(`services/cassetteColors/`, `services/cassetteRouting/`), full label-
printing architecture (`utils/labels/` — 17 modules covering barcode
rendering, GS1/ZPL encoding, and dispatch).

### Label Printing — Partial
Production dispatch paths (QZ Tray bridge, network print via Interface
Engine, Local Bridge Agent) are each real, honest scaffolding, not yet
fully wired end-to-end. Tracked in Jira as PS-51 through PS-55.

---

## Quality Assurance & Compliance

### Quality Assurance (`/quality-assurance`) — Live
Eight distinct compliance report groups, each with its own real status
vocabulary and CSV export: Deficiencies, Intraoperative Linkage,
Discordance & Reconciliation, Countersign Turnaround, Credentialing
Review (FPPE), Post-Finalization Drift, Patient Match Review (MPI),
Management Reviews.

### System Audit / Quality Control record (`/audit`) — Live
The permanent, complete compliance record — every event regardless of
status, distinct from the working queue above.

### Frozen-to-Permanent Reconciliation — Live
Real audit trail proving the full reviewed population (not just
mismatches), matching ISO 15189/CAP audit-trail expectations.

---

## Patient Identity & Interoperability

### Master Patient Index (MPI) — Live
Deterministic patient matching, a real review queue for ambiguous
matches, Break-Glass rebind workflow for downtime-placeholder
identities.

### HL7 Processing — Partial
Standard core (ORM/ORU builders, segment builders) is real and
tested. Vendor-specific adapters: `identityAdapter` (pass-through) is
live; `cerebroAdapter` and `vantageAdapter` are deliberately
unimplemented stubs, with real, documented directional context, waiting
on a genuine vendor integration guide.

### Interface Exception & Case-Binding — Live
Handles cases created under a temporary/downtime identity, later
rebound to the confirmed patient via a real reason-code taxonomy.

---

## Administration & Configuration

### TAT (Turnaround Time) Configuration — Live
Seven-level, most-specific-wins resolution across five real dimensions
(client, specimen, subspecialty, priority, type).

### Delegation, Pools & Case Team — Live
Case delegation, subspecialty pool claiming with real membership
enforcement, ad-hoc case team assignment.

### Template Builder & Protocol Dictionary — Live
Report templates assembled from reusable Parts, CAP/RCPath synoptic
protocol dictionary (27 seeded templates), full review/approval
workflow for template changes.

### Governing Bodies, Specimen Dictionary, Client/Facility Dictionary — Live
Admin-managed reference dictionaries underlying the rest of the app.

---

## AI & Computational Features

### Orchestrator (AI narrative generation) — Live
Streaming AI-generated report narrative for Orchestration mode, with
real field-level provenance (confidence + source-text quote per
suggestion).

### Computational Sidecar — Live
Live LIS results integration (IHC, molecular, FISH) with a real
dual-tag flag model and full WCAG remediation.

### ForMedrixAI Store — Partial
Customer-facing model browse/download workflow is built. Two real,
unresolved architecture questions remain (tenant scoping, subscription
authorization) — tracked in Jira as PS-58/PS-59.

---

## Planned / Not Yet Built

- **Real OAuth SSO** (Google/Microsoft) — requirements written, not
  implemented. PS-60.
- **Case-level locking UX gaps** — the underlying version-conflict
  mechanism exists and works; several real save paths don't yet use
  it, and conflicts aren't audit-logged. PS-71.
- **Workload Tracking & Charge Capture** — real scoping notes exist
  (`docs/product/WORKLOAD_AND_CHARGE_CAPTURE_SCOPE.md`), not started.
- **Platform-level (ForMedrixAI-employee-only) admin restrictions** —
  real plan exists (`docs/architecture/ACCESS_CONTROL_PLAN.md`), not
  built; not blocking pre-deployment.

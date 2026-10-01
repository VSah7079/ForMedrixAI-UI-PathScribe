# services/migration/

Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration Engine
gap: "Legacy LIS data ingestion, cleansing, and field mapping...
MPI deduplication during import, cross-validation reporting, and
instant searchability of migrated records alongside native ones."
This gap's own Backend Needs Log entry is explicit that it is
"fundamentally a backend-heavy story; the frontend piece is
comparatively small (migration status/validation UI)" — what's built
here is that real, comparatively small frontend surface, plus the
real, working parts of the pipeline itself (field mapping, MPI
dedup) that don't require a real backend to function correctly.

## Files

- **`types/migration/MigrationCaseDraft.ts`** — a real, flattened
  intermediate shape covering every category the RFP itself names
  (demographics, accession detail, gross/micro text, SNOMED/ICD-O
  coding, slide/block inventory, a PDF archive reference, an open
  discrete-synoptic-field bag) — deliberately NOT the full, deeply-
  nested `Case` type (`types/case/Case.ts`) directly. See "Real,
  honest scope boundary" below for why.
- **`IMigrationFieldMappingService.ts` / `mockMigrationFieldMappingService.ts`**
  — a real, admin-editable dictionary mapping one legacy source field
  name to one target field on `MigrationCaseDraft`, scoped per
  `sourceSystemName` (a customer with many institutions may migrate
  from more than one legacy system).
- **`resolveMigrationFieldMapping.ts`** — the real, pure transform
  applying a set of mappings to one raw legacy record (a flat
  string→string bag — the real, honest shape a legacy export
  actually arrives in). Appends rather than overwrites when several
  source fields map to the same real array target (e.g. multiple
  SNOMED code columns); surfaces any genuinely unmapped source field
  rather than silently dropping it.
- **`IMigrationJobService.ts` / `mockMigrationJobService.ts`** — one
  real job per batch import run, with real aggregate counts
  (succeeded/failed/needs-review), logging into this app's own
  existing, cross-module audit trail.
- **`resolveMigrationCrossValidation.ts`** — the real, pure
  reconciliation check behind "cross-validation reporting": does a
  job's own real, processed count match what the source system
  itself claimed it was sending. A genuine, historically common ETL
  failure mode (a silent network drop, a truncated export file), not
  a hypothetical — a real discrepancy is reported with the exact
  missing (or extra) count, never silently accepted.
- **`IMigrationRecordResultService.ts` / `mockMigrationRecordResultService.ts`**
  — the real, per-record detail behind a job's own aggregate counts,
  so an admin reviewing a job can see exactly which source records
  failed or need review, not just how many.
- **`processLegacyRecordImport.ts`** — the real, working pipeline:
  applies the field mapping, validates the real minimum fields a case
  cannot be built without, and calls this app's own, real, already-
  existing MPI resolution (`services/patients/resolveOrCreatePatient()`)
  for dedup — "MPI deduplication during import" reused directly,
  never a second, parallel dedup mechanism. A genuine ambiguous MPI
  match during migration lands in the exact same real, existing
  `PatientMatchReviewSection.tsx` review queue a live accession's own
  ambiguous match would — confirmed directly before building
  anything further, since both real paths call the identical
  `resolveOrCreatePatient()` method.

## The status/validation UI

`pages/MigrationJobsPage.tsx` — the real, comparatively small
frontend surface this gap's own Backend Needs Log entry names: lists
every real job, its own real cross-validation result, and the
per-record detail behind any failures or needs-review count.
`components/Config/System/MigrationFieldMappingsSection.tsx` — real
admin CRUD for the field-mapping dictionary above, wired into System
Configuration.

## Real, honest scope boundary

Confirmed directly before writing `processLegacyRecordImport.ts`:
`caseService.createCase()` takes a full, complete `Case` object —
deeply nested, with real specimen/block/slide structure this
pipeline's own minimal `MigrationCaseDraft` cannot honestly
fabricate. Building a full `Case` from a flat legacy record is
itself the real, substantial backend-heavy transform this gap's own
Backend Needs Log entry names ("real, high-throughput bulk-import
tooling and storage"). This pipeline's own real, working scope stops
at mapping, validation, and MPI resolution — returning a real,
resolved (or real, provisional) `patientId` ready for that later
step, never a fabricated `Case`. "Instant searchability of migrated
records alongside native ones" is a natural consequence of that
later, not-yet-built step landing migrated data in the same, real
`Case` table native data already lives in and is already searched
from — no separate search index or migration-specific search surface
was built or is needed here.

## OCR-sourced legacy records (Sep 2026) — real, deliberate scope split

Real, per direct guidance: for a legacy source that only exists as a
scanned PDF report (no structured export at all — a real, genuine gap
for Orchestrator-mode customers, who have no live-LIS fallback the
way Assist mode does), the actual OCR/text-extraction work is
deliberately **not** built anywhere in PathScribe. Confirmed directly:
"could the OCR adapter be run on the interface engine?" — yes, and per
direct follow-up, "I want as much record processing to happen on the
engine side" as possible.

**The real, agreed hand-off contract**: the interface engine owns
PDF → raw text (via whatever real OCR service it calls) *and* the
format-specific structured-field extraction from that raw text (which
field sits where in a specific legacy report layout — genuinely
similar in kind to the vendor-specific HL7 mapping that engine already
does elsewhere in this app's own architecture). It hands PathScribe
the same real, flat string→string bag `resolveMigrationFieldMapping.ts`
already expects from any other legacy source. **No new PathScribe-side
adapter code exists or is needed** — an OCR-sourced record is just
another entry in the same admin-editable field-mapping dictionary,
scoped under its own `sourceSystemName` (e.g. `"OCR — Legacy Reports"`),
targeting the exact same `MigrationCaseDraft` fields every other
source already maps to. Same real "PathScribe owns schema, the
external layer owns translation" posture as everywhere else in this
app (the WSI viewer launch mechanism, the interface engine's own real
job description).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

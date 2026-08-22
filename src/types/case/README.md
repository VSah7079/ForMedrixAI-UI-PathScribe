# types/case/

The core case domain model — `Case`, `Specimen`, and every real type layered onto them as the app grew. The single most important folder in `types/`: almost every service and page ultimately reads or writes through these shapes.

## Files

- **`Case.ts`** — the root entity. Case-level status, accession, participants, synoptic reports, and the accumulated arrays (`retentionHolds`, `caseHolds`, `matrixBlocks`) documented individually below.
- **`Specimen.ts`** — specimens, `HistologyBlock`, `StainOrder` — the primary material tree. `Material.ts` below extends this rather than duplicating it.
- **`CaseStatus.ts`** — the case lifecycle status enum (`draft` → ... → `finalized`/`closed`), deliberately large and mutually-exclusive; see its own header for why a status like "on hold" doesn't belong here (that's `CaseHold.ts`, layered orthogonally).
- **`CaseComment.ts`** — real, append-only comment thread, replacing an earlier plain-string field that any save silently overwrote.
- **`CaseFlag.ts`** / **`SpecimenFlag.ts`** — clinical-grade flag models (LIS interoperability via `lisCode`, 1–5 severity scoring) for case-level vs. specimen-level annotations.
- **`RetentionHold.ts`** — case-level hold gating **disposal** after finalization (litigation, patient request, research). Set at accession or later; multiple can accumulate over a case's life, none ever deleted, only released.
- **`CaseHold.ts`** — case-level hold gating **finalize** on an active, not-yet-done case ("something truly wrong" — quality issue, awaiting outside materials, clinical discrepancy, pending consultation). Deliberately a separate type from `RetentionHold` despite the shared "Hold" name — see this file's own header for the full distinction.
- **`MatrixBlock.ts`** — case-level (not per-specimen) shared/matrix blocks, pulled out of individual `Specimen.blocks[]` arrays so a block shared across specimens has one real, single identity rather than duplicated copies.
- **`Material.ts`** — the newer pieces of the material tree not already covered by `Specimen.ts` (e.g. `Decant`).
- **`CountersignRecord.ts`** — the real resident-drafts/attending-countersigns workflow record.
- **`FppeAssignment.ts`** — Focused Professional Practice Evaluation (new-hire credentialing) tracking, generalized from the countersign mechanism.
- **`Patient.ts`** — patient demographics; medical-grade name schema (Prefix/Given/Family/Preferred/Suffix, not rigid First/Middle/Last).
- **`ErasureCertificate.ts`** — deliberate, forward-looking scaffolding for a real GDPR Article 17 compliance feature. Zero current consumers on purpose — waiting on legal counsel sign-off before being wired to a real delete. Not dead code.
- **`ReportSnapshot.ts`** — likely superseded by `types/reports/ReportVersionRecord.ts`, which covers materially the same concern (tracking original/corrected/addendum release events) with an overlapping field. Flagged, not deleted — circumstantial, not certain.

## Notes

- `RetentionHold` and `CaseHold` are the two real, deliberately-separate "hold" concepts in this app. Neither gates the other; a case can have an active instance of both simultaneously (e.g. a case on hold for a quality issue *and* separately under litigation retention).

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*

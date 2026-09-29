# types/case/

The core case domain model — `Case`, `Specimen`, and every real type layered onto them as the app grew. The single most important folder in `types/`: almost every service and page ultimately reads or writes through these shapes.

## Files

- **`Case.ts`** — the root entity. Case-level status, accession, participants, synoptic reports, and the accumulated arrays (`retentionHolds`, `caseHolds`, `matrixBlocks`) documented individually below.
- **`Specimen.ts`** — specimens, `HistologyBlock`, `StainOrder` — the primary material tree. `Material.ts` below extends this rather than duplicating it. Real, per direct billing-expert guidance (PS-93): `StainOrder` gained `targetSpecimenIds`/`evaluatedSpecimenIds` (only meaningful on a stain inside a shared `MatrixBlock.slides[]`), and `Specimen` gained `matrixBlockCoding` — see `MatrixBlock.ts`'s own entry below and `services/billing/README.md`'s full PS-93 account. Real, per direct guidance (Cytology & Cervical Screening module, Phase 2, Sep 2026): `Specimen` gained `cytologyScreening?: CytologyScreeningRecord` — a GYN cytology specimen is just a regular `Specimen` (`SpecimenEntry.type: 'Cytology'`/`'FNA'` already distinguishes it), not a parallel case system. References `CytologyCategoryEntry.id` (`services/cytology/`) for adequacy/general categorization/interpretation-result rather than duplicating label text. See `services/cytology/README.md` for the full account. **Protocol-Driven Workflow Infrastructure story additions (Sep 2026)**: `Specimen.protocolSnapshot?: { id, version, name }` locks the exact Protocol identity/version resolved at accession (`utils/generateDefaultMaterial.ts`) — a later edit to the master Protocol never retroactively changes what an already-accessioned specimen shows. `Specimen.triage?: SpecimenTriage` supersedes the earlier, simple retrospective `triageConfirmedAt`/`triageConfirmedBy` pair with a real, per-item checklist that genuinely gates block release (`useSpecimenBlockManagement.ts`'s `handleReleaseGrossingBlocks`) unless every item is confirmed or a supervisor override reason is recorded — see `services/protocols/README.md` for the full Part 1–2c account.
- **`CaseStatus.ts`** — the case lifecycle status enum (`draft` → ... → `finalized`/`closed`), deliberately large and mutually-exclusive; see its own header for why a status like "on hold" doesn't belong here (that's `CaseHold.ts`, layered orthogonally). **Real, per direct guidance ("Yes we should scope 'Return to Trainee'/'Reject with Notes'"): `'returned'` — a real, pre-existing member of this union previously confirmed to have zero real consuming logic anywhere in the app — is now genuinely wired**, reused deliberately rather than adding a new status value; see `services/cases/README.md`'s own fuller account of that decision and why.
- **`CaseComment.ts`** — real, append-only comment thread, replacing an earlier plain-string field that any save silently overwrote.
- **`CaseFlag.ts`** / **`SpecimenFlag.ts`** — clinical-grade flag models (LIS interoperability via `lisCode`, 1–5 severity scoring) for case-level vs. specimen-level annotations.
- **`RetentionHold.ts`** — case-level hold gating **disposal** after finalization (litigation, patient request, research). Set at accession or later; multiple can accumulate over a case's life, none ever deleted, only released.
- **`CaseHold.ts`** — case-level hold gating **finalize** on an active, not-yet-done case ("something truly wrong" — quality issue, awaiting outside materials, clinical discrepancy, pending consultation). Deliberately a separate type from `RetentionHold` despite the shared "Hold" name — see this file's own header for the full distinction.
- **`MatrixBlock.ts`** — case-level (not per-specimen) shared/matrix blocks, pulled out of individual `Specimen.blocks[]` arrays so a block shared across specimens has one real, single identity rather than duplicated copies. Real, per direct billing-expert guidance (PS-93): `StainOrder.targetSpecimenIds`/`evaluatedSpecimenIds` (`Specimen.ts`, same file) resolve real per-specimen ancillary billing coverage for a Biopsy Array — see `services/billing/README.md`'s own PS-93 entry for the full account.
- **`Material.ts`** — the newer pieces of the material tree not already covered by `Specimen.ts` (e.g. `Decant`).
- **`CountersignRecord.ts`** — the real resident-drafts/attending-countersigns workflow record. **Real, per direct guidance ("Yes we should scope 'Return to Trainee'/'Reject with Notes'"): `status` gained a real, third member, `'returned'`**, alongside a new `returnedAt` — see `services/cases/README.md`'s own fuller account of the new `reject()` method that produces it.
- **`FppeAssignment.ts`** — Focused Professional Practice Evaluation (new-hire credentialing) tracking, generalized from the countersign mechanism. **Real fix, per direct guidance:** gained a required `facilityId` — had no facility association at all before, a genuine gap; every FPPE assignment is a real, specific person practicing at one real, specific performing lab, unlike a shared network-pool printer where "no single owner" is a valid state.
- **`Patient.ts`** — patient demographics; medical-grade name schema (Prefix/Given/Family/Preferred/Suffix, not rigid First/Middle/Last).
- **`ErasureCertificate.ts`** — deliberate, forward-looking scaffolding for a real GDPR Article 17 compliance feature. Zero current consumers on purpose — waiting on legal counsel sign-off before being wired to a real delete. Not dead code.
- ~~`ReportSnapshot.ts`~~ — removed in Batch 366 (PS-68): nothing used it, and `types/reports/ReportVersionRecord.ts` is the release record the app uses. See that file's header for the two points carried forward for the API server.

## Notes

- `RetentionHold` and `CaseHold` are the two real, deliberately-separate "hold" concepts in this app. Neither gates the other; a case can have an active instance of both simultaneously (e.g. a case on hold for a quality issue *and* separately under litigation retention).

## `SynopticReportInstance.aiDraftSource` (Batch 322, PS-87)

Optional. Set when an Assist-mode LIS poll created or last refreshed a draft synoptic report. It records which LIS milestone drove it (`gross_complete` / `micro_diagnosis_complete`), when, and the AI's reason and confidence for the template. It is absent on every report a person created. Used to tell an untouched AI draft (which a later milestone may revise) from a pathologist's own work (which is only ever changed through review). See `services/assistPolling/`.

## `Case.spellingLocaleOverride` (Batch 338, PS-342)

Optional. The spelling language chosen for this one case in the report screens (an id from `services/spellcheck/spellingLocales.ts`); null or absent means "use the default": the assigned pathologist's preference, else the ordering facility's. Saved by the report screens' spelling language control.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*

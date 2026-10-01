# FHIR Dispatch Architecture — Plan

**Status: PLANNED, not built.** Same spirit as any other forward-looking
plan in this codebase: tracked here so the reasoning survives before the
real work starts, not written after the fact.

---

## Decision Record: FHIR Payload Generation Responsibility

### Status

**REVISED.** Supersedes an earlier, brief version of this same decision
that recorded "PathScribe builds a native FHIR Mapping Adapter at the
boundary" as the target architecture.

### Context

Real, direct guidance raised a general question about standardizing
PathScribe's external registry/EHR dispatch on HL7 FHIR JSON — not scoped
to any one module. Three options were considered for *all* of PathScribe's
dispatch, present and future: a FHIR-native core domain model; PathScribe
building its own FHIR resources at a boundary adapter; or leaving FHIR
shaping entirely to the interface engine.

The first pass at this decision recorded the second option (PathScribe
builds the adapter) as correct. Real, direct follow-up — "why should
PathScribe do all this processing?" — correctly identified that this
expands PathScribe's operational scope and breaks the exact architectural
pattern already applied, and already working, for every real registry this
app has built: PALGA (shaping left to the real, separate PALGA Protocol
Module), CSMS (OBR-31 data emitted, wire format left to the engine), and
every other HL7 v2 payload in this codebase. FHIR is not a special case
that earns an exception to that pattern — it is simply another wire
format.

### Decision

**PathScribe will not construct FHIR resources or manage FHIR wire formats
directly, for any module, present or future.**

1. **PathScribe's boundary**: emit complete, structured, domain-accurate
   JSON payloads carrying all required clinical extensions and local
   dictionary concepts — exactly what this app's own cytology registry
   dispatch (KNCSP/KCCR, CSMS, CervicalCheck, PALGA, NCSR) already does
   today, with zero changes needed.
2. **The interface engine's boundary**: transforming PathScribe's
   structured JSON into FHIR resources (`DiagnosticReport`, `Observation`,
   `Specimen`), enforcing FHIR profile compliance, handling terminology
   binding, and managing transport — real, mature, already-solved
   capability in tools like Mirth/NextGen Connect, Rhapsody, and
   InterSystems, not something to rebuild inside a clinical application.

### Justification

- **PathScribe's responsibility ends at clinical fidelity.** PathScribe
  owns the clinical dictionaries — CISOE-A, Bethesda, BSCC, Münchner
  Nomenklatur III — and the specimen-level extensions built on them.
  Emitting `registryExtension: { type: 'ncsr_australia', squamousResultCode: 'S2' }`
  fully satisfies that domain contract. Requiring PathScribe to also wrap
  that value in a FHIR `Observation.valueCodeableConcept.coding` block
  would force it to understand wire-format mechanics and profile versions
  that have nothing to do with cytology or pathology.
- **Standards-surface maintenance burden.** FHIR profiles (US Core, UK
  Core, Nictiz/ZIBs) version and evolve independently of clinical logic.
  A native adapter inside PathScribe would tie its own release cycle to
  external FHIR IG updates and version migrations (STU3 vs. R4 vs. R5) —
  real, ongoing maintenance load with no clinical benefit.
- **Leveraging mature, purpose-built engine capability.** Modern
  integration engines already have native FHIR transformer nodes, profile
  validators, and terminology mappers as their core competency, built
  specifically to handle the structural and transport quirks of receiving
  endpoints — work a clinical pathology application has no reason to
  duplicate.
- **A single source of truth for clinical mapping.** If clinical
  classification logic existed in both PathScribe's own dictionaries *and*
  a FHIR adapter layer, the two would need to be kept in sync by hand —
  real, avoidable drift risk. Keeping engine-side translation purely
  structural (never re-deriving a clinical judgment) closes that risk off
  entirely.

### Explicit edge case / caveat

This decision assumes a real deployment includes an interface engine
capable of message transformation — the model this whole architecture has
assumed throughout. In a direct-to-endpoint, engine-less micro-deployment,
if PathScribe ever supported one, an external, lightweight translation
shim would be the right answer — not expanding PathScribe's own core
codebase to cover that case.

### What this changes for PathScribe's own real work

**Nothing new to build, and nothing already built needs to change.** This
app's existing registry dispatch already does exactly the right thing —
clinical mapping done in PathScribe, structured JSON emitted, wire-format
translation left entirely to the interface engine. No FHIR Mapping
Adapter, no `DiagnosticReport`/`Observation`/`Composition` construction,
belongs inside this app. Any real work here is external: configuring the
interface engine to shape PathScribe's existing structured payloads into
FHIR wherever a destination requires it.

---

## The dispatch router pattern (real, but lives in the interface engine, not PathScribe)

```
                 [ PathScribe Core Domain — unchanged ]
                              │
                              │ NATIVE OUTPUT: PathScribe's own
                              │ structured JSON (already built,
                              │ already real, per registry)
                              ▼
                  [ Real, external Interface Engine ]
                              │  (shapes into FHIR / HL7 v2 / XML
                              │   as each destination requires —
                              │   not PathScribe's own job)
                              ▼
      ┌───────────────────────┼───────────────────────┐
      ▼                       ▼                       ▼
[ Screening Registries ] [ Cancer Registries ]  [ Direct EMR/LIS ]
 (PALGA, CSMS, etc.)      (SEER, NCRI, GEKID)    (FHIR Store / EHR)
```

This app's own cytology registry dispatch (KNCSP/KCCR, CSMS, CervicalCheck,
PALGA, NCSR — all real, already built) is the real, complete Screening
Registries branch, and needs no changes at all under the architecture
above — it already emits exactly the kind of structured JSON the interface
engine needs to shape into FHIR (or anything else) itself.

## The real, critical finding: cytology must never drive the Cancer Registry branch

Real, direct research before building anything here surfaced a real,
important correction to the naive "behavior code /2 or /3 → reportable"
trigger rule:

- **NAACCR/SEER/NPCR/CoC explicitly exclude carcinoma in situ of the cervix
  and CIN III from cancer-registry reportability**, effective 1996, despite
  carrying a /2 (in-situ) ICD-O-3 behavior code — a real, named exception
  alongside PIN III and skin SCC/BCC. A literal "/2 or /3" trigger would
  incorrectly flag every real HSIL/AIS/CIN3 cytology finding nationwide.
- **The deeper, more important finding**: even Louisiana's own real,
  state-specific exception (one of the few US jurisdictions that *does*
  require in-situ cervical lesion reporting) states its own reportability
  criteria explicitly as "based on histological diagnosis in pathology
  report" and instructs facilities to "**exclude diagnoses based on
  cytology only**." This reflects a real, universal clinical principle, not
  an administrative quirk: a Pap smear is a screening impression, not a
  diagnosis. Real clinical practice always requires colposcopy-directed
  biopsy before a cervical finding becomes a confirmed, reportable
  diagnosis — regardless of how severe the cytology impression reads.

**Real, direct consequence**: the Cancer Registry branch must never be
triggered from this app's own cytology sign-out, for cervical findings, at
any severity. It structurally belongs to surgical pathology (biopsy and
resection diagnoses) — which does not exist in this app yet — not to a
missing feature on cytology's own, already-complete registry dispatch.

## ICD-O-3 mapping — deferred, though the earlier premise for that was wrong

Real, direct guidance originally deferred this on the premise that
"surgical pathology's own domain model" did not exist yet. **That premise
was factually wrong, and worth correcting plainly rather than leaving on
record.** Direct, real correction: `SynopticReportPage.tsx` (5,174 lines)
and its own real report-template routing system (`mockReportTemplateService.ts`'s
five-pass Client → Physician → Synoptic protocol → Subspecialty → Gold
Standard resolution chain) are a real, mature, working surgical pathology
module — not "not started." It already has real SNOMED/ICD-10 code
capture per specimen, and its own coding UI supports live ICD-O
terminology search (`services/terminologySearch/`, `AddCodeModal.tsx`).

**What's still genuinely, honestly unconfirmed** (not "not started" —
specifically unconfirmed): whether an ICD-O code, once found via that
live search, is persisted anywhere with its real morphology+behavior
structure intact (the /2 or /3 suffix the Cancer Registry branch's own
trigger rule needs), or whether today's storage (`Specimen.coding.icd10`)
only captures ICD-10 diagnosis codes distinctly, with ICD-O suggestions
searchable but not yet stored in their own, distinct, behavior-aware
shape. This is a real, concrete, checkable question — not a "wait for a
module to be built" one — and should be resolved by inspecting the real
coding storage and flow directly before scoping any Cancer Registry
dispatch work, rather than assumed either way.

The real, critical clinical finding two sections above — that cytology
must never drive the Cancer Registry branch, regardless of how mature
surgical pathology's own domain model is — is unaffected by this
correction and still stands on its own, independent regulatory basis.

## Real, honest status of the pieces above, as of this writing

- FHIR Mapping Adapter inside PathScribe: **not needed, for any module** —
  FHIR shaping is real, external interface-engine configuration work, not
  PathScribe application code, whether for cytology's existing dispatch or
  surgical pathology's future one.
- Dispatch Router (evaluates a completed case and routes it): **built**
  (`services/cancerRegistry/dispatchCancerRegistryReportIfApplicable.ts`,
  Sep 2026) — routes PathScribe's own existing structured JSON, not a
  FHIR payload PathScribe built itself, wired into
  `useSignOutWorkflow.ts`'s real surgical pathology sign-out and
  nowhere else, per this document's own critical finding above. See
  `services/cancerRegistry/README.md` for the full account, including
  the real, previously-unconfirmed ICD-O behavior-code gap this
  document itself flagged — confirmed and fixed as a real prerequisite
  before this dispatch could be built honestly.
- Surgical pathology's own domain model: **real, mature, and already
  built** (`SynopticReportPage.tsx`, the report-template routing system,
  real SNOMED/ICD-10 coding capture) — corrected from an earlier, wrong
  "not started" note recorded here. What remains genuinely unconfirmed is
  narrower: whether ICD-O codes are persisted with real behavior-code
  structure anywhere yet, which needs direct inspection, not assumption.
- Screening Registries branch: **already real, complete, and needs no
  changes**, per `src/services/cytology/README.md`'s own Phase 39-44 —
  this app's existing cytology registry dispatch (KNCSP/KCCR, CSMS,
  CervicalCheck, PALGA, NCSR) already does exactly the right thing today.

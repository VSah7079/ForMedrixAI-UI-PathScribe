# services/accessioning/

Real, per the uploaded "Structured Clinical History Dictionary &
Accessioning Integration" specification's own User Story 5
(Validation, Deficiency Auditing & Outbound JSON Triggers). Full build
narrative lives in [services/cytology/README.md](../cytology/README.md)'s
own Phase 76 — this file documents what this folder's own files are,
not why the work was commissioned.

## Files

- **`resolveAccessionValidation.ts`** — a pure, tested function combining
  `services/clinicalHistory/validateClinicalHistoryAccessionPayload.ts`'s
  own real validation across both real levels clinical history can
  live at (`Case.order.clinicalHistory` and every real specimen's own,
  additive `Specimen.clinicalHistory`) into one, honest,
  accession-wide result. Reuses the same real validation function
  rather than a second, parallel implementation of the same rule; each
  error is scoped back to exactly where it came from (`'case'` or
  `{ specimenLabel: 'B' }`), so a real problem on a genuinely
  multi-specimen accession is traceable to the specimen that actually
  has it.
- **`IAccessionOutboundQueueService.ts` / `mockAccessionOutboundQueueService.ts`**
  — mirrors `services/cytology/ICytologyOutboundResultQueueService.ts`'s
  own real, established shape (QUEUED/SENT/FAILED lifecycle, retry,
  audit logging on every state change) rather than inventing a new
  queue pattern. Covers both real event types the spec calls for —
  `order.accessioned` (the full clinical history array, on success)
  and `order.deficiency.created` (the detailed validation errors, on
  failure) — in one shared queue, not two near-duplicate ones.

## Real, order-level deficiency status — a genuinely new concept, not folded into the existing mechanism

`Case.order.accessionStatus: 'COMPLETE' | 'DEFICIENT'` is new. Per
direct guidance's own explicit answer to a real architecture question
(how should a missing required field in case-level clinical history
be reflected as a deficiency, given the existing mechanism —
`SpecimenDeficiency`, `services/deficiencies/` — is specimen-scoped):
a genuinely new, order-level status, not forced onto the existing
mechanism, which has no real way to represent a deficiency belonging
to the order as a whole rather than one specific specimen.

Wired into `AccessionPage.tsx`'s own `handleSubmit`: validation runs
before the case is even constructed, `accessionStatus` is set directly
at creation, and the appropriate outbound event is enqueued
immediately after the case persists — fire-and-forget, never blocking
accessioning itself, the same real posture as every other outbound
dispatch in this app.

## Real scope boundary, stated plainly

The spec's own "the Interface Engine receives this JSON payload and
handles translation into outbound HL7 (ORM/DFT) or FHIR" is explicitly
the interface engine's job, not PathScribe's — the same real boundary
held since `services/clinicalHistory/`'s own Story 2. What's built
here is PathScribe's own half: validating, deciding status, and
queuing the correctly-shaped JSON for a real interface engine to pick
up.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

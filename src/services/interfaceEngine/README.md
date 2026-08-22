# services/interfaceEngine/

Real feature, per direct follow-up: "Did we want to implement the
[trigger for the] outbound Order Request message to the engine?" —
the actual, real trigger for Category E of the formal interface
specification (`PathScribe_Interface_Specification_v1.1.docx`, §7,
"Outbound: Order Creation / Confirmation"), not just the documented
payload shape.

**Why this exists.** Confirmed directly against the codebase before
building anything: no mechanism existed to notify a downstream system
when a Case is created in PathScribe with no matching pre-existing
order — a walk-in specimen, or a referring physician's office that
hasn't filed the order yet. `services/hl7/ormBuilder.ts` exists and is
real, tested code, but it's wired only into a different, unrelated
flow (`services/hardware/ModeAInterfaceService.ts`, sending stain
orders to lab hardware) — not into case creation at all.

## Files

- **`IInterfaceEngineService.ts`** — the contract, and the real
  `OrderCreationEventPayload` type, matching the formal spec's §7.1
  exactly (kept as the single source of truth for that shape — if the
  spec changes, this file and the spec document need to change
  together).
- **`buildOrderCreationPayload.ts`** — a pure, standalone function
  mapping a real `Case` + the MPI resolution outcome already computed
  at case creation into the real payload. Deliberately pure (no
  service calls inside it) — same "real data in, real data out,
  independently testable" posture as this session's other payload/
  parsing utilities (`isoDateForSearch.ts`, `parseScannedPayload.ts`).
  16 tests.
- **`mockInterfaceEngineService.ts`** — the real, currently-active
  implementation. **Honest limitation, matching the formal spec's own
  Appendix B item 6**: "PathScribe has no real backend today —
  everything is frontend, mock-service-backed." There is no real
  `/api/v1/...` endpoint this can actually `POST` to yet — that's
  real, separate backend infrastructure work. This records every real
  dispatch to `localStorage` instead, inspectable via
  `listDispatchedEvents()` — the same real, testable-without-a-server
  posture every other mock service in this app already uses, not a
  silent no-op stub. When a real backend exists, only this file's own
  real implementation needs to swap for a real HTTP transport — every
  real call site stays the same, same interface/mock/firestore pattern
  this whole `services/` folder already follows. Real idempotency, per
  the formal spec's own §2.3: a redelivered event with the same
  `messageId` is recognized, not double-recorded. 6 tests.

## Real call site

`pages/AccessionPage/AccessionPage.tsx`'s own submit handler, right
after `caseRouter.createCase()` succeeds — fires only when
`sourceOrderId` is `null` (a genuine scratch case; see that file's own
README for the earlier fix, issue #1, establishing that manual entry
with no order is a fully supported, intentional path). A case created
from a real, imported order has nothing new to announce here — the
system that sent that order already knows about it. Genuinely
fire-and-forget from the accessioner's own point of view: a real
dispatch failure here must never block or roll back an already-created
Case.

## Two real bugs found while implementing this, not just speccing it

1. **The formal spec's own first draft of `order.priority` said
   `'Routine' | 'STAT' | 'ASAP'`** — copied from the original ORM^O01
   draft's own priority codes without cross-checking this app's real
   `Case.order.priority` type. Confirmed directly against
   `types/case/Case.ts`, whose own comment documents `'ASAP'` as a
   real, previously-fixed historical bug ("this used to be its own
   independent literal union... with 'ASAP'/'Critical' values that
   never corresponded to anything real anywhere in the app") — an
   independent, pre-existing confirmation this correction is right,
   not just a guess. The real value is `'Rush'`. Fixed here, and the
   formal spec document itself was corrected to match (v1.1, same
   version — this was caught before any real engine work would have
   consumed the wrong value).
2. **This app's own `Case.order.requestingProvider` is a single, real
   free-text field** ("Dr. Jane Smith"), never split into structured
   first/last name parts anywhere in the actual data model. The formal
   spec's own `orderingProvider.lastName`/`firstName` fields assume
   structured data a real caller might have — but cramming this app's
   own free-text value into `lastName` would misleadingly present
   "Dr. Jane Smith" as if it were literally just a surname. Added a
   new, honest `rawName` field to the type instead — real callers with
   genuinely structured name data can still use `firstName`/`lastName`.

## Verified live, both directions

- A genuine scratch case (manual entry, no order import) → submits
  successfully and dispatches a real `OrderCreated` event with the
  correct shape: full demographics (a brand-new patient, confirmed via
  a real `'created'` MPI outcome), the real human-readable accession
  number as `placerOrderNumber` (not the internal case id), the real
  requesting provider as `rawName`, and correct specimen/diagnosis
  mapping.
- A case created by importing a real, existing pending order →
  dispatches nothing at all, confirmed by comparing
  `listDispatchedEvents()` before and after.

## Real, honest, unaddressed gap

`patient.assigningAuthority` and `encounter` are both real, optional
fields on the payload type, matching the formal spec — but
`buildOrderCreationPayload.ts` doesn't populate either yet.
`assigningAuthority` has no obvious source on the accession form
today; `encounter` would need real, resolved `Encounter` data (see
`services/encounters/`) threaded through, which the current call site
doesn't yet do. Left genuinely absent (never fabricated) rather than
guessed at — a real, scoped follow-up if either becomes necessary.

---
*See [services/README.md](../README.md) for how this folder fits the
whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

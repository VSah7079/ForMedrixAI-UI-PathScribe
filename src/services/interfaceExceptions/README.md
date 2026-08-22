# services/interfaceExceptions/

Real feature, per direct architecture confirmation, originally built
for ADT^A43 (Move Patient Information), **generalized in Phase A of
the "Interface Exception & Case-Binding Module" to cover A40/A24/A47
too**: a real, honest holding queue for inbound interface messages
this app could not safely auto-resolve, routed here instead of
processed, for a real human to review.

**Why this exists.** A real inbound A43 that lacks a usable MRG-5
(Prior Visit Number), or whose MRG-5 doesn't match any real, known
`Encounter`/`Case`, must never be silently dropped OR auto-moved on a
guess — moving a diagnostic report to the wrong patient chart is a
real, serious clinical-safety error, not a cosmetic one. Confirmed
directly before building: "If an incoming A43 lacks MRG-5 (or a
matching visit ID), route the message to an Interface Exception Queue
rather than auto-moving all cases."

**Phase A's own, separate real trigger**, confirmed directly: "you
cannot rely solely on automated HL7 feeds... the EHR should maintain
absolute authority over the Patient Master Index." A40/A24/A47 all
deal with identities the sending system claims are ALREADY known — a
real, confirmed bug found while scoping this work showed
`resolvePatientId()` (`services/hl7/processPatientManagementMessage.ts`)
never actually failed. An A40 whose MRG-1 referenced an identifier
this LIS didn't recognize silently fell through to
`resolveOrCreatePatient()`, which FABRICATED a brand-new patient
record and immediately merged it away — worse than doing nothing.
Every one of A40/A24/A47/A43 now routes here the moment either side
isn't a genuine, confident `'matched'` hit.

**Deliberately general**, not A43-specific — scoped by
`eventType`/`reason`/`rawMessage` rather than anything tied to the one
event type that created the need for it, so the same queue can hold a
future unresolvable event of a different real type without a
redesign. This design decision paid off directly: extending to
A40/A24/A47 required zero changes to this folder's own files.

**Paid off a second time — order-type-mapping work, Step 1 of a
multi-step build (types only, no behavior change yet):** cross-checked
an external "Order Type Mapping" spec's proposed standalone
`UnmappedOrderStub`/`/audit` "Unmapped Order Stubs" tab against this
folder before building anything, and confirmed this existing
queue/service/UI is the real match — same "unresolvable inbound event,
real human review, no silent auto-guess" shape as A40/A24/A43/A47. Only
new, optional fields (`rawOrderCode`, `normalizedOrderCode`,
`codingSystem`, `organisationId`, `siteId`) were added; `create()`/
`resolve()`/`dismiss()` need no changes at all. Next real step: raise a
real exception (`eventType: 'unmapped_order_code'`) from
`services/orderIntake`'s own `resolveOrder()` when the Specimen Code
Crosswalk has no match in any coding system tried, alongside — not
instead of — its existing auto-create-and-continue fallback; then a
new conditional panel in `InterfaceExceptionReviewModal.tsx` below for
that `eventType`.

## Files

- **`IInterfaceExceptionService.ts`** — `InterfaceException` type
  (`pending`/`resolved`/`dismissed`), `create()`/`resolve()`/`dismiss()`.
  `reason` is always a real, specific, human-readable string (e.g. "No
  MRG-5 (Prior Visit Number) present on this A43 message" or `MRG-5
  "FIN-9981" does not match any known Encounter`) — never vague
  ("processing failed"); a real reviewer needs to know exactly what's
  missing to fix it. `rawMessage` is kept so a reviewer can see exactly
  what the sending system sent — same "paper trail, not the source of
  truth once resolved" posture as `IncomingOrder.rawMessage`.
  `sourcePatientId`/`targetPatientId` (added for the real admin UI
  below) are the REAL, resolved MPI ids — distinct from the raw MRN
  strings already captured in `sourcePatientIdentifier`/
  `targetPatientIdentifier` — since `processMoveMessage()` already
  resolves both identities before deciding a message can't be safely
  auto-processed, capturing them here means the review UI never has to
  re-resolve identity by hand.
- **`mockInterfaceExceptionService.ts`** — standard CRUD, `localStorage`-backed.

## Real consumer

`services/hl7/processPatientManagementMessage.ts` — both the main
`processPatientManagementMessage()` function (A40/A24/A47) and its
`processMoveMessage()` (A43) route here via a single, shared
`routeToExceptionQueue()` helper. A43's own real failure modes: no
MRG-5, MRG-5 matching no `Encounter`, an `Encounter` with no linked
`Case`. A40/A24/A47's: either side's identifier not matching any
known, existing patient. See that file's own README for the full
architecture.

## Real admin UI, per direct confirmation: "Manual Review Queue / Flagging (Safest)"

`components/Audit/InterfaceExceptionReviewModal.tsx` — originally
opened from a "🔌 Interfaces" pill on `AuditLogPage.tsx`'s Error Log
tab. **Real, per direct redesign later the same session: this is now
a genuine, independent top-level "Interface Log" tab, not a pill
within Error Log** — see the "Real Interface Log tab redesign" section
below for the full account. A
pending exception shows as a clickable "Review" action rather than a
plain status badge; resolved/dismissed ones stay read-only. The modal
resolves both `sourcePatientId`/`targetPatientId` (real ids captured
at exception-creation time — see this folder's `IInterfaceExceptionService.ts`)
to real `MasterPatientRecord`s for every exception type. The
case-selection/move action, though, is real-and-honestly A43-only:
lists the source patient's real, active `Case`s with checkboxes and
lets an operator pick exactly which one(s) actually need to move —
nothing pre-selected, nothing moves without an explicit, real human
action — but only renders when `exception.eventType === 'A43'`. A real
A40/A24/A47 exception is an unresolved IDENTITY, not a case-binding
problem; showing "Move Selected Cases" for those would offer an action
that doesn't actually apply, so those exception types show an honest
explanatory note instead. Confirming an A43 move calls the exact same
`mockPatientIndexService.moveCaseToPatient()` a real inbound A43 would
have called if it could auto-resolve — this modal is a human-driven
front end for that one real operation, not a second, parallel
implementation. A "Dismiss — No Action Needed" option is available for
every exception type, including the real, honest case where review
determines nothing should move. **Real, full manual identity-binding
for A40/A24/A47 is a separate, not-yet-built follow-up** — Phase A only
covers routing these to the queue and letting a human see them, not
resolving them from within this modal.

## Real Interface Log tab redesign (Aug 2026)

Per direct feedback ("I feel like it deserves its own section because
there is so much going on between PathScribe and the engine and
instruments and 3rd party") — real, well-reasoned: PS-86 (outbound
dispatch), PS-87 (Assist-mode LIS milestones), and PS-88 (DP/Specimen
Tracking) will each add their own real interface event types here,
making a shortcut into Error Log's own state machine the wrong
long-term shape. `AuditLogPage.tsx`'s `ActiveTab` now includes a
genuine `'interfaces'` value — its own real filter pills (Pending/
Resolved/Dismissed, each with a real, live count), its own search
state (`interfaceSearch`, deliberately separate from `errorSearch` so
switching tabs doesn't carry over an unrelated term), and its own real
CSV export (`exportInterfaceCSV`, matching the same meta-header/PHI-
safety convention as the other three exports on that page — was the
one real gap; the others already had it). The old `?tab=errors&pill=interfaces`
deep-link still works (real backward compatibility for
`CrosswalkSection.tsx`'s own Unmapped Stubs banner, already shipped
before this redesign) alongside the new, canonical `?tab=interfaces`.

**Real, new `clientId` field on `InterfaceException`** — added
specifically for the Map & Link feature below; deliberately distinct
from `organisationId`/`siteId` (Facility ≠ Organisation/Site, a real,
different concept in this app). Populated at exception-creation time
in `mockOrderIntakeService.ts`.

**Map & Link — real, contextual resolution for `unmapped_order_code`
exceptions**, built directly into `InterfaceExceptionReviewModal.tsx`:
a `SearchableCombobox` picker (reusing the exact component
`CrosswalkSection.tsx` already uses) lets an admin pick a real
Specimen Dictionary entry and resolve the exception in one action —
`addCrosswalkEntry()` then `resolve()`, both real, existing service
calls, no new write path. Falls back to the old, manual-instruction
text when `clientId` is genuinely absent (an exception raised before
this field existed) rather than creating a mis-scoped crosswalk entry.

**`BreakGlassRebindModal.tsx` renamed to "Map Patient" in every real,
user-facing string** (trigger button, modal title, confirm button,
result messages), per direct feedback that "Break-Glass" didn't read
as clear to a user — the underlying `breakGlassRebind()` service call
and its own real restrictions are unchanged, this was a labeling fix
only. Its own modal chrome was also found using a real, rare, minority
CSS pattern (`ps-modal-overlay`/`ps-iexc-modal` — confirmed via a
direct count, only 4-5 uses total across the whole app) instead of the
real, dominant standard (`ps-overlay`/`ps-modal-dark`, confirmed 174/47
uses) — fixed to match. See `components/Audit/README.md` for the fuller
account of both changes.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

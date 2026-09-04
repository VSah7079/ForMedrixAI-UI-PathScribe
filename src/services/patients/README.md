# services/patients/

Real Master Patient Index (MPI) — the missing piece found while tracing
why "Patient History" couldn't reliably surface a patient's prior cases:
`Case.patient.id` was generated as `` `OPAT-${caseId.slice(4)}` ``,
derived from the CASE, not the PERSON. The same real-world patient with
two different cases got two completely unrelated `Patient.id` values —
there was no actual person-level identity anywhere in the data model,
only whatever the MRN text field happened to match (and per the same
investigation, MRN alone doesn't meet the Joint Commission's
two-identifier minimum for patient-identification-critical actions,
explicitly including laboratory specimens and requisitions).

**Pattern:** Standard interface/mock pattern — no firestore stub yet,
added when this folder existed for less than one session; follow the
established convention (see `services/README.md`) when the real backend
is built.

## Files

- **`IPatientIndexService.ts`** — The contract. `resolveOrCreatePatient()`
  is the real accession-time entry point: reuse an existing identity on a
  confident match, create a new one on a confident non-match, and — the
  genuinely load-bearing part — return `'ambiguous'` rather than
  silently guessing when a match is partial (MRN matches but DOB/name
  doesn't, or name+DOB matches under a different MRN). `confirmAsNewPatient`
  and `mergeIntoExistingPatient` are the two real resolutions a human
  admin can apply to an ambiguous record via
  `components/QualityAssurance/PatientMatchReviewSection.tsx`.
- **`mockPatientIndexService.ts`** — `localStorage`-backed implementation
  of the matching algorithm above. Deliberately deterministic, not
  probabilistic — a real production-grade EMPI product (4medica and
  similar) does weighted, probabilistic candidate scoring across many
  demographic fields, a substantial engineering effort in its own right
  and not what's built here. What's built is the real, correct
  foundation a future probabilistic layer would sit on top of: an actual
  persistent per-organisation identity, checked on every accession, with
  anything not confidently resolvable routed to a human rather than
  silently auto-matched or silently duplicated. `mergeIntoExistingPatient`
  genuinely repoints every case built under the provisional identity
  (via `services/cases/CaseRouter.ts`, with a real retry-once on a
  genuine `ConcurrencyConflictError`) — a merge that only updated the MPI
  record and left cases still split across two ids would be cosmetic,
  not a real fix.
- **`mockPatientIndexService.test.ts`** — Real tests, including one that
  actually creates a case under a provisional identity via the real
  `mockCaseService` and verifies the merge genuinely repoints it — not a
  mocked assertion that a function was called.

## Real fix: the Link feature, distinct from Merge — per direct discussion

The real answer to "can two records from different EMR systems be connected without a human-required merge": yes, and it needed a genuinely distinct concept, not a reuse of Merge. A Merge means one record was a mistake — collapse it, repoint every case, the old id stops being a valid ongoing match target. A Link means two records are each real, independently-valid identities (e.g. the same real patient referred to this lab by two different, unrelated EMR systems, each with its own real, ongoing MRN) that a human has confirmed represent the same person — **neither is deprecated**, both keep matching their own future orders.

- **`linkPatients()`** / **`getLinkedPatientIds()`** / **`listLinks()`** — the real, new methods. `getLinkedPatientIds()` walks the full real link graph (A-B, B-C chains transitively include C for a query on A), not just one hop.
- Real UI: `components/QualityAssurance/PatientMatchReviewSection.tsx` now has a real third action — "Link — same patient, different source" — alongside the existing Confirm-as-new and Merge, with its own real confirmation dialog explaining the distinction.

## Real, independent bug found and fixed while building the above

`mergedInto` was set by `mergeIntoExistingPatient` but never actually *read* by the matching logic itself. A real order arriving later under the same, now-merged-away MRN would have matched the stale, deprecated record directly — silently undoing the merge for that new case. Fixed via `resolveToCanonicalRecord()`, which follows the real chain (recursively, guarded against a corrupted circular chain) to whatever a record was actually, currently merged into, before using it as a match. Verified with a real regression test proving a later order under the old MRN correctly resolves to the real, current target.

## Real fix: "Patient History" now actually queries by real patient identity

Found via a direct question about how case-searching actually worked: it didn't use the real MPI at all. `MOCK_PRIOR_PATHOLOGY[mrn]` was a hardcoded object, completely disconnected from this service.

- **`patientHistoryQuery.ts`** — `queryRealPatientHistory()` filters real cases by real `patient.id`, including every identity returned by `getLinkedPatientIds()` — the actual point of the Link feature: a confirmed link now has a real, visible effect on what history displays, not just on the MPI record itself. `toPatientHistoryCase()` maps real `Case` fields (`diagnostic.synoptic.biomarkers`, `grossDescription`, etc.) honestly; fields with no real, reliable source (comment, tags, nodes) are left genuinely empty, never fabricated.
- Real consumer: `components/PatientHistory/PatientHistoryModal.tsx`, now takes a real `patientId` prop and fetches real history via `caseRouter` + the real MPI, replacing the synchronous, hardcoded lookup. The two-identifier safety gate now also requires a real `patientId` — a case predating the real MPI shows no history rather than falling back to a demographic guess.

## Real fix: the multi-authority identifier crosswalk — the rest of Phase 0

Per direct follow-up on the phased plan, and a real, honest consequence of the enterprise-wide scoping fix above: widening the match pool to the whole lab enterprise correctly fixed under-matching across referring hospitals, but increased a different, real risk — two DIFFERENT real people at two DIFFERENT hospitals whose own MRN schemes happen to produce the same string now share one matching pool, with `MasterPatientRecord.mrn`'s single string giving no way to tell them apart.

- **`PatientIdentifier`** — real, per-authority crosswalk row (`patientId`, `assigningAuthority`, `identifierValue`, `source: 'resolution' | 'manual'`).
- **`resolveOrCreatePatient()` now checks this crosswalk FIRST**, before the older, less-precise bare-MRN match — an exact `(assigningAuthority, mrn)` hit is real, structured proof of which source system issued it, not just a string that happens to match. Falls through to the prior behavior when `assigningAuthority` isn't provided (real backward compatibility — manual entry, older integrations).
- **Real, honest test proving the actual fix**: two different real people, same colliding MRN string, different real authorities — the system never silently matches them. It correctly falls back to `'ambiguous'` (flagged for a human) when no crosswalk entry yet exists for that specific authority, rather than a confident guess in either direction. An earlier draft of this same test asserted a confident `'created'` outcome instead — caught and corrected before delivery, since that would have been the *less* safe behavior, not the fix.
- **Real consumer, wired in**: `pages/AccessionPage/AccessionPage.tsx` now passes `originOrganisation.id` as `assigningAuthority` — the exact same value that was wrongly used as the MPI *scope* itself before the earlier enterprise-scoping fix. It finds its correct, real home here instead.
- **Phase 2 update**: `mergeIntoExistingPatient()`/`linkPatients()`/`addIdentifier()` — all three originally built for the human-driven review UI — are now also the real, direct target of `services/hl7/processPatientManagementMessage.ts`'s inbound A40/A24/A47 processing. A real merge or link triggered by an actual ADT event repoints real cases and records real crosswalk entries through the exact same, already-tested code paths a human clicking through the review UI uses — not a second, parallel implementation.

## Real fix, Phase 3: `updateDemographics()` — the actual missing "update" half of ADT^A08

Investigating idempotency & sequence control (the original spec's own framing) surfaced something more foundational than expected: `resolveOrCreatePatient()`'s `'matched'` outcome never actually wrote new demographic data back to an existing record — it only confirmed identity and returned the existing, unchanged record. This meant a real A08 ("Update Patient Information") had genuinely no effect at all before this fix; the new data it carried was silently discarded every time.

- **`MasterPatientRecord.lastEventAt`** — real, new field: the source-system EVN-2 timestamp of the most recent ADT event that actually updated this record, distinct from `updatedAt` (which only tracks when this system last wrote, not when the real-world event occurred).
- **`updateDemographics()`** — the real, new operation. Enforces real sequence control: an incoming event's timestamp is only applied if genuinely newer than the record's current `lastEventAt`. A stale, out-of-order event (network delay, retry, re-delivery) is honestly rejected — logged, never silently applied over newer state. Returns whether the update was actually applied, so a caller can tell "changed" from "correctly ignored" apart.
- **Real design incompatibility found and fixed while wiring this into `processAdtMessage.ts`**: A08 originally resolved identity through the same full, name-verified `resolveOrCreatePatient()` flow A01/A04 use. But an A08's entire point may be that the patient's name just legitimately changed — comparing the incoming (new) name against the currently-stored (pre-update) name would flag every real demographic change as a name mismatch, incorrectly routing it to the ambiguous/review queue instead of applying it. Fixed: A08 now resolves via the precise crosswalk lookup (`resolveByIdentifier`) instead, since an update event is, like a merge/link event, inherently about an already-known identity — not a "might be a new patient" moment where name verification is the right, important behavior (which A01/A04 still correctly apply).

## Real feature, per direct confirmation: working through the full list of ADT demographic/identity trigger events

`MasterPatientRecord` and `updateDemographics()` extended with `address` (PID-11), `phone` (PID-13), `maritalStatus` (PID-16, HL7 Table 0002 — genuinely site-extensible, guided free text not a closed enum), `aliases` (PID-9, real repeating field — REPLACES the array wholesale when present in a message rather than appending, since PID-9 carries the complete, current set as of that message, not an incremental delta), and `deceased`/`deathDateTime` (PID-29/30 — `deceased` is a real boolean, genuinely `undefined` — never assumed `false` — until a real message says so either way). Every field follows the same "only what's genuinely present in the update changes, everything else is left as-is" posture already established for `Encounter.updateMetadata()`.

**A21/A23, investigated and correctly NOT built**: verified directly against six independent real HL7 v2 references that neither is a real "Deceased" event in the standard (A21 is "leave of absence," A23 is "delete a patient record"). PID-29/30 flowing through the existing A08/A03 paths above is the real, standard-compliant mechanism — no separate event handling needed.

**`moveCaseToPatient()`**, built for ADT^A43 (Move Patient Information), per direct architecture confirmation — genuinely distinct from `mergeIntoExistingPatient()`: moves exactly one, specific `Case` from a patient it was wrongly attached to over to the correct one; NEITHER identity is retired, both stay real, separate, independently-active people. Validates the case genuinely belongs to the claimed source before moving (which also naturally blocks double-moving an already-moved case). A new, properly-typed `Patient.CaseMoved` event was added to `services/events/`'s real `PatientEvent` union rather than reaching for an `as any` cast. See `services/hl7/README.md` for the full A43 integration, and `services/interfaceExceptions/README.md` for the real fallback when a message can't be safely auto-resolved.

**`flagForReview()`**, added for Phase A of the "Interface Exception & Case-Binding Module," per direct architecture confirmation: a real, narrow gap found while fixing A40/A24/A47/A43's own "never fabricate an identity" check. `resolveOrCreatePatient()`'s `'created'` outcome (unlike `'ambiguous'`, which already sets `needsReview` via `createProvisional()`) produces an ordinary, entirely unflagged record. When `services/hl7/processPatientManagementMessage.ts` determines after the fact that a just-created record shouldn't be trusted as a real, confirmed identity for the event that triggered its creation, it calls this to mark the record `needsReview` with a clear, honest reason — never deletes it (no `delete()`/`remove()` method exists on this service at all, deliberately, matching the same "kept, not deleted; a real, traceable fact" posture already applied to merged records).

**`breakGlassRebind()`**, Phase B of the "Interface Exception & Case-Binding Module," per direct confirmation: a genuinely different real operation from both `moveCaseToPatient()` and `mergeIntoExistingPatient()` — attaches a Case created under a temporary/downtime placeholder identity (e.g. `DOE^JOHN_1234`) to the real, confirmed EHR patient once it's known. Semantically a MERGE, not a move — a downtime placeholder isn't a real, separate person the way A43's source/target are; it's the SAME real person, temporarily unidentified — so this wraps `mergeIntoExistingPatient()` internally (every real Case under the placeholder repoints, the placeholder itself retires via `mergedInto`) rather than reinventing repoint logic. `mergeIntoExistingPatient()`'s own return type grew a real `caseIds: string[]` alongside its existing `casesRepointed` count, a safe, additive change, so the immutable audit payload below can name every real case, not just count them.

Real, load-bearing restrictions, enforced at the service layer (not just the UI — a real API/service caller must satisfy the same rules a human operator does):
- Only succeeds when the source record is genuinely flagged `MasterPatientRecord.isDowntimeRecord: true` — refuses to run on an arbitrary patient, which is what makes this "restricted" rather than a second, parallel way to perform an ordinary merge.
- Requires a real reason code from the standard taxonomy (`types/patients/BreakGlassReasonCode.ts` — 7 codes across 3 categories: system/network outages, clinical emergency/unidentified patients, and lab administrative corrections) AND a free-text justification of at least `BREAK_GLASS_MIN_NOTE_LENGTH` (10) characters — a bare code alone is refused.
- Logs one real, immutable audit payload per rebind (`mpi.breakglass.rebind`, a dedicated event type distinct from an ordinary `mpi.match.merged`, so a real compliance review can find break-glass actions on their own): original MRN, new MRN, every real case id repointed, user id, timestamp, reason code, and notes.

`MasterPatientRecord.isDowntimeRecord`/`downtimeReasonCode` are set only via an explicit, human choice at accession time (`PatientMatchCandidate.isDowntimeRecord`/`downtimeReasonCode`, threaded through `resolveOrCreatePatient()`) — deliberately never inferred from a name pattern, since a real patient could legitimately be named "John Doe."

Two new, narrow query methods power the restricted rebind UI: `listDowntimeRecords()` (genuinely flagged AND not-yet-`mergedInto`, so a resolved record correctly disappears from the "still needs a rebind" list) and `searchPatients()` (a real, general, case-insensitive name/MRN substring search — deliberately simple, since this is a human-driven lookup step, not an identity-resolution algorithm). Neither existed on this service before; no general "search all patients" capability had ever been built.

**`components/Audit/BreakGlassRebindModal.tsx`** — the restricted UI, per direct confirmation. Gated to `isAdmin` at both the trigger button and the render itself (defense in depth) in `pages/AuditLogPage.tsx`, only surfaced alongside the related "🔌 Interfaces" pill. Real flow: select a genuinely-flagged downtime record → search and select the real, confirmed target → reason code (pre-filled from the downtime record's own original reason as a sensible default, since a rebind is often for the exact same real reason the placeholder existed for — but changeable) → free-text justification with live character-count feedback → an explicit "Review & Confirm" step before the irreversible action fires. `pages/AccessionPage/AccessionPage.tsx` gained the other real half: a deliberately de-emphasized checkbox (reused the existing `.ps-accession-checkbox-row` class, not new CSS) for marking a new accession as a downtime placeholder at intake, with the same real reason-code dropdown appearing once checked.

## Phase 4: real-time event broadcasting

`resolveOrCreatePatient()` (all three real success paths), `mergeIntoExistingPatient()`, `linkPatients()`, and `updateDemographics()` (only when actually applied) now publish real, typed events via `services/events/mockPatientEventBus.ts` — see that folder's own README for the full event catalogue and the real, end-to-end tests proving the wiring works, not just the bus mechanics in isolation.

## Real, second real caller of `linkPatients()`, per direct guidance ("should the accession do this as they go rather than the current process")

`AccessionPage.tsx`'s Outside Patient Data tab is now a real, second consumer of `linkPatients()`, alongside `PatientMatchReviewSection.tsx`'s own review queue and the inbound A24 path — but a genuinely different trigger from either of those: not the system flagging an ambiguous match for later human review, and not an inbound ADT event, but the accessioner *proactively* searching (reusing `searchPatients()` directly, same pattern `OrderLookupModal.tsx` already uses) and confirming a link *in the moment*, while they still have the patient's demographics in front of them, rather than depending on a separate step someone has to remember later. `resolveOrCreatePatient()` itself is completely unchanged for Outside Patients — the real `linkPatients()` call fires immediately after it returns, fire-and-forget, using today's existing `'same_person'` semantics. See `pages/AccessionPage/README.md`'s own entry for the full account, including a real, deliberately-flagged scope boundary: the maiden-name/married-name use case fits `PatientLink`'s current semantics cleanly, but a newborn-linked-to-mother use case is a genuinely different relationship (two distinct people, not one person under two identifiers) that `getLinkedPatientIds()`'s own real consumer (`PatientHistoryModal.tsx`) would incorrectly fold together today — real, separate, next-step work (a `PatientLink.relationshipType` field and a distinct UI treatment), not built in this pass.

## Real, the `relationshipType` split — now built, per direct guidance ("let's work on the split")

`PatientLink` gained a real, required `relationshipType: 'same_person' | 'family_relation'` field (`PatientLinkRelationshipType`) — not optional, not defaulted, since every real caller must be explicit about which of two genuinely different real relationships a link represents. Both `linkPatients()` and `getLinkedPatientIds()` now require it. The real, load-bearing fix is inside `getLinkedPatientIds()`'s own graph traversal: it now only follows edges of the requested type, so a chain mixing both real relationship types (e.g. A-B `same_person`, B-C `family_relation`) can never leak an unrelated relationship into a result just because it shares an intermediate patient — confirmed with a dedicated real test (`mockPatientIndexService.test.ts`) proving a `same_person` query for A includes B but never C, and a `family_relation` query for B includes C but never A.

All 3 real, pre-existing callers updated to pass `'same_person'` explicitly, preserving their exact current behavior unchanged: `PatientMatchReviewSection.tsx`'s own review queue (only ever surfaces the MPI's own automatic 'ambiguous' matcher output — the same real person under two source-system identities, never a family relation, since that's not something `resolveOrCreatePatient()`'s own matching logic ever flags), the A24 handler in `services/hl7/processPatientManagementMessage.ts` (HL7 A24 — Link Patient Information — is specifically the "same real person" event; no real ADT event type represents a family relation), and `AccessionPage.tsx`'s own Outside Patient link search.

Real, self-inflicted bug caught and fixed in the same pass: the hardcoded audit-log message on a successful link ("confirmed as the same real person") would have been factually wrong for a `family_relation` link — now branches on the real `relationshipType`. The `Patient.Linked` event (`services/events/IPatientEventBus.ts`) also gained the field, so downstream event consumers aren't left with a stale shape.

`PatientHistoryModal.tsx` now fetches both link types in parallel: `same_person` still feeds the existing case-history merge, completely unchanged; `family_relation` feeds a real, new "Related Patients" section — distinct people, shown separately, never folded into the case-history list. This is the actual UI fix `getLinkedPatientIds()`'s own doc comment promised: a mother's patient history view can no longer silently include her baby's own, separate pathology cases just because both happen to be linked.

Real, per direct follow-up ("So the ADT will trigger the system to reassign, do not sure if there is a point to this at accession unless it's the maiden/married name scenario"): traced the newborn/mother scenario through to its actual real fix, rather than building a manual `family_relation`-creation UI for it. A newborn accessioned under their mother's identity (no real MRN of their own yet) isn't a `linkPatients()` case at all — there's no separate, existing newborn identity to search for and link. The real fix is `moveCaseToPatient()` (HL7 A43) — repointing that one, specific, misattributed case once the newborn's own real identity is established and the ADT feed sends the move event, or reviewed via `InterfaceExceptionReviewModal.tsx` when it can't auto-resolve. A `family_relation` field was briefly added to `AccessionPage.tsx`'s Case & Patient tab for this, then removed again once this became clear — see `pages/AccessionPage/README.md`'s own account. `AccessionPage.tsx`'s "Check for Existing Patient" search now generalizes correctly instead — available for every real intake type, always confirming `'same_person'` links (a maiden/married-name match), since that's the one scenario that genuinely is knowable and actionable at accessioning time.

Real gap (per the same follow-up, "you might have to do those operations on the outside patient pull where the EMR may not have awareness"), now closed — see `pages/README.md`'s own `SearchPage.tsx` entry and `components/Search/README.md`'s own `ReassignCasePatientPanel.tsx` entry for the full account: `moveCaseToPatient()`'s only two real triggers used to be the inbound ADT^A43 path and `InterfaceExceptionReviewModal.tsx`'s own review queue, both depending on an external ADT feed sending the move event. An Outside/Contract Case's own referring EMR has no awareness of this lab's own records to ever generate that event against, making `moveCaseToPatient()` functionally unreachable for an Outside Patient's own case specifically, not just rare. Two real, proactive triggers now exist instead: `PatientManagementSection.tsx`'s own patient-first "Move a Case…" action, and `SearchPage.tsx`'s own case-first "Reassign Patient" action — genuinely complementary, not duplicates, since the realistic discovery moment for a misattributed case is usually "I'm already looking at this specific case," not "let me proactively search a patient to check their cases."

## Real, found-and-fixed correctness bug (Step 1 of 2 — see `components/QualityAssurance/README.md`'s own `PatientManagementSection.tsx` entry for Step 2, the real UI this fix was built ahead of): `mergeIntoExistingPatient()`/`moveCaseToPatient()` never repointed a patient's real Encounter records, only their Cases

Real, per direct guidance ("Since we have this PathScribe patient concept we need a mechanism to perform Merge, encounter record move or link... Perhaps a new section... Patient Management"): traced both operations before designing any new UI on top of them, and found a real, already-live correctness gap, not just a missing feature. `mergeIntoExistingPatient()` — in production use today via `PatientMatchReviewSection.tsx`'s own Merge action — correctly repointed every real Case under the provisional patient, but never touched a single real Encounter record (`services/encounters/`). A merged patient's own real encounters were silently left stranded, still pointing at the deprecated id — exactly the "silently fragment one person's history" failure mode this whole review system's own header comment says it exists to prevent, just one level lower than cases. `moveCaseToPatient()` had the narrower version of the same gap: it patched `Case.patient.id` but never `Case.encounterId`'s own target `Encounter.patientId`.

**The real fix:**

- **`IEncounterService.reassignPatient()`** (+ `mockEncounterService.ts` implementation) — new, real, dedicated method, same "one real concept per method" convention as `updateStatus`/`updateLocation`/`updateClass`/`updateDiagnoses`. No sequence-control staleness rejection — this is a discrete administrative identity correction, not a sequence of real-time clinical events, same shape as `moveCaseToPatient()` itself. Real, load-bearing safety check: refuses to reassign an encounter that doesn't currently belong to the claimed source patient.
- **`mergeIntoExistingPatient()`** now also calls `listForPatient(provisionalPatientId)` and reassigns every real encounter found — no sharing ambiguity to worry about here, since a merge means "confirmed to be the same real person," so every one of their encounters genuinely belongs to that one, now-canonical identity. Return type gained `encountersRepointed: number`, and the audit log detail now names both counts.
- **`moveCaseToPatient()`** is the more careful fix: a real Encounter can be legitimately shared by more than one real Case (multiple specimens collected during the same real clinical visit), so blindly moving it could incorrectly reassign another case that genuinely still belongs to the source patient. Before touching the encounter, it now checks whether any *other* real case under the source patient still references the same `encounterId`. If none do, the encounter moves too (`encounterOutcome: 'reassigned'`). If one does, the encounter correctly stays with the source patient, and the just-moved case's own `encounterId` is cleared instead — a stale, cross-patient link would be a worse, silent inconsistency than no link at all (`encounterOutcome: 'unlinked_shared'`). A case with no linked encounter at all reports `'none'`. Confirmed directly with a dedicated test proving the still-shared case is completely untouched — same patient, same encounter — while only the genuinely misattributed one moves.
- **4 new real tests** (`mockPatientIndexService.test.ts`) — the merge-encounter repointing, the exclusive-encounter move, the shared-encounter edge case (the one this fix exists for), and the no-encounter case. `moveCaseToPatient()` had zero real test coverage before this pass, not just the encounter gap.

Both return-type changes are purely additive (new optional/extra fields) — every real, existing caller kept compiling and passing without any change.

## Real, per direct guidance and the attached Pathology HL7 Outbound Feature Spec: three real outbound ADT payloads, and a real queue to hold them

Real, per direct guidance ("we trigger the json packages and the interface engine generates the formatted messages") — checked directly, first, whether ANY real outbound dispatch exists anywhere in this app before designing anything new. Found something bigger than a Patient Management gap: **nothing in this entire codebase ever makes a real outbound HTTP call to anything.** Case creation dispatches nothing. `mergeIntoExistingPatient()`/`linkPatients()`/`moveCaseToPatient()` only publish to the internal, in-app `mockPatientEventBus` — explicitly documented as "not a message-broker abstraction... for this app's own scope," never reaching outside PathScribe. Even the most mature area, billing (`services/billing/`), only *queues* — `OutboundChargeQueueEntry.status` is `'QUEUED' | 'SENT' | 'FAILED'`, but nothing anywhere ever produces `'SENT'`; `jsonWebhookBuilder.ts`'s own full payload builder isn't even used by that real, working queue, only by an admin preview screen. This is a consistent, repeatedly-documented architectural boundary across the whole app — real dispatch requires infrastructure (a real interface-engine endpoint, real credentials) this environment doesn't have — not an oversight specific to patient-identity operations.

Given that, and given the attached spec's own Section 4 registry, built the real, honest thing this environment supports: real payload builders + a real queue, following the exact proven `OutboundChargeQueueEntry` architecture, stopping at the same honest `QUEUED`-only boundary billing already has.

**Real, important scope decision, matched to the document rather than assumed:** the spec's own registry lists ADT^A08, ADT^A40, and ADT^A47 as the real, required outbound transactions under "Patient Management & Administrative Transactions." It does **not** list ADT^A24 (Link) or ADT^A43 (Move Patient Information) as outbound requirements at all. So `linkPatients()` and `moveCaseToPatient()` deliberately get **no** new queue entry here — only `mergeIntoExistingPatient()` (A40), `breakGlassRebind()` (A47), and `updateDemographics()` (A08) do. Worth naming directly: I don't assume symmetry just because Link/Move felt architecturally similar to Merge in earlier discussion — the document is the authoritative source, and it draws a real, specific line.

- **`types/patients/OutboundPatientAdtQueueEntry.ts`** / **`IOutboundPatientAdtQueueService.ts`** / **`mockOutboundPatientAdtQueueService.ts`** — mirrors `OutboundChargeQueueEntry`'s exact, proven shape: a lightweight reference + dedup id + status tracker, never a pre-built payload (so a later demographic correction can't leave a stale, already-queued payload silently out of date). Same real `retryDispatch()`/`markFailed()`/DLQ semantics, same honest `'QUEUED' | 'SENT' | 'FAILED'` status with only `'QUEUED'` ever actually produced.
- **`buildPatientAdtPayload.ts`** — three real builder functions (`buildAdt08Payload`/`buildAdt40Payload`/`buildAdt47Payload`), same "PathScribe never constructs an HL7 string itself, only the raw JSON facts" posture as `jsonWebhookBuilder.ts`'s own `ChargeCaptureEventPayload`. Deliberately does NOT reuse that payload's own reference/full PHI-minimization split (gated on match confidence) — every identity-reconciliation event here always carries full patient identity, including every real, known crosswalk identifier (`listIdentifiersForPatient()`) for MRG-1's own real "Prior Patient Identifier List" requirement — an interface engine can't act on a merge, identifier swap, or demographic correction without knowing exactly which real people are involved, regardless of how confident PathScribe's own original match was.
- **Real, load-bearing fix found while wiring this**: `breakGlassRebind()` calls `mergeIntoExistingPatient()` internally — enqueueing A40 unconditionally inside the merge would have meant every real rebind (A47) *also* incorrectly enqueued a duplicate A40. Fixed with a `suppressAdtEnqueue` parameter `breakGlassRebind()` passes as `true`, enqueueing its own, correctly-distinct A47 entry instead. Confirmed directly with a dedicated test proving a rebind produces exactly one queue entry (A47), never two.
- **9 new real tests** (`outboundPatientAdt.test.ts`) — the three real enqueue sites (including the stale-event case correctly enqueueing nothing), the rebind/merge double-enqueue fix, a real retry cycle, and all three payload builders including a genuinely nonexistent patient resolving to `null`, never a fabricated payload.

**Deliberately not built, and not specific to this feature**: ORU^R01 (finalized/corrected/addendum pathology results) — investigated directly, found an even earlier-stage gap than billing: no queue exists for it at all, not even the "queued but never sent" state. Scoped as its own, separate piece of work given its real size (the spec's own OBR-25/OBX-11 state matrix covers four distinct real states), not folded into this pass.

## Real, found-and-fixed gap: `updateDemographics()` left no audit trail at all for a genuinely successful ADT^A08 update

Real, per direct follow-up ("Any existing gaps to deal with?" → "Continue" → building the "log reports" half of the original audit requirement): while verifying which real `mpi.*` event names a new "Patient Management" audit filter (`pages/README.md`'s own `AuditLogPage.tsx` entry) would need to match, found that `updateDemographics()` only ever logged an audit event for its *rejected* (stale-event) path — a genuinely applied demographic change left zero real audit trail. For a healthcare application, a successful change to a patient's own identity fields with no record of it happening at all is exactly the kind of gap worth fixing on sight, not deferring.

Fixed: a new `mpi.demographics.updated` event, logged on every real, applied change. PHI-safe by the same, established precedent as the stale-event log immediately above it in the same function — the audit detail names only *which* real fields changed (`firstName, lastName`, etc.), never the actual new values. A new, dedicated test proves this precisely: asserts the real changed field names appear in the logged detail, and that the real new values supplied in the test (`'AuditedFirst'`/`'AuditedLast'`) never do.

## Real, per direct guidance, gap #6: `resolvePatientWithoutMatching()` — the real "completely bypassing the identity reconciliation queue" this app deferred multiple times, now built

Real, per direct follow-up ("Yes" — confirming gap #6 from a numbered list of open items, MPI bypass for Outside Patients) — the original request, from the Outside Client Support & International Financial Class Architecture Specification, all the way back at Step 2: "completely bypassing the identity reconciliation queue" for Outside/Contract Case accessioning. Deferred twice before this pass, both times for real, careful reasons — first because `resolveOrCreatePatient()`'s result appeared to feed directly into a hard Encounter-resolution dependency (later found not to be true — Encounter resolution is already optional, skipped whenever no `encounterNumber` is given), then because the real, narrower remaining question (what does an Outside Patient case's own `patientId` come from instead) deserved its own deliberate pass rather than a rushed answer bundled into unrelated work.

**The real fix**: `resolvePatientWithoutMatching()`, a genuine second entry point on `IPatientIndexService` — not a parameter on `resolveOrCreatePatient()`, since the two represent real, different intents (one actively tries to find an existing person first; this one never does, by design). Always creates a fresh, real, persistent identity — never matches, never returns `'ambiguous'`, never flags for review. Reuses the exact same "genuinely new person" creation logic `resolveOrCreatePatient()`'s own final branch already has (same real record shape, same `Patient.Created` event, same identifier-crosswalk `addIdentifier()` call when `assigningAuthority` is provided) — the only real difference is skipping every fuzzy-matching step that precedes it.

**Real, honest, permanent distinction on the record itself**: `MasterPatientRecord.establishedVia` gained a fourth real value, `'created_unmatched'` — genuinely distinct from `'created'`. `'created'` means `resolveOrCreatePatient()` actually ran its real fuzzy matching first and confidently found nothing; `'created_unmatched'` means no matching was ever attempted at all. A real, auditable record of *how* an identity came to exist, not silently indistinguishable from a genuinely-checked new patient — the kind of distinction that matters the next time someone reviews this app's own patient-identity governance.

**Wired into `AccessionPage.tsx`'s real submit path**: `intakeType === 'outside'` now calls `resolvePatientWithoutMatching()`; every other real intake type is completely unchanged, still calling `resolveOrCreatePatient()` exactly as before. The shared `patientCandidate` object (organisationId, assigningAuthority, mrn, name, DOB, sourceAccession) is built once and reused by both branches — `isDowntimeRecord`/`downtimeReasonCode` stay exclusive to the `resolveOrCreatePatient()` branch, since Downtime and Outside are mutually exclusive real intake types (the same 3-way selector can never be both at once).

**Real, deliberately complementary, not a replacement**: this doesn't touch or diminish the "Check for Existing Patient" search (`PatientLinkSearch.tsx`) already on the same Outside Patient Data tab. A human explicitly recognizing a real, returning outside patient and confirming a real `linkPatients()` call afterward remains a completely separate, still-valuable mechanism — the fresh identity this method creates and a subsequent, human-confirmed link both coexist exactly as designed, giving Outside Patients precisely what the original spec asked for: a new identifier generated, with the real ability to link it to an existing one when a human genuinely recognizes the connection.

**4 new real tests** (`mockPatientIndexService.test.ts`) — the one that matters most proves the actual point of this whole method: an exact MRN+name+DOB duplicate of an existing patient, submitted through `resolvePatientWithoutMatching()`, still gets a genuinely fresh, separate identity — the exact scenario `resolveOrCreatePatient()` would have confidently matched. Plus the honest `establishedVia` marking, the guarantee of never returning `'matched'`/`'ambiguous'`, and the identifier-crosswalk parity with the existing method.


## Real, critical safety fix, found while building Phase 1's inbound path

Building `services/hl7/`'s inbound ADT ingestion surfaced a real gap in the "crosswalk-first" check above: an exact `(assigningAuthority, mrn)` hit was being trusted completely, with no real DOB/name verification — unlike the older, bare-MRN fallback path, which already correctly required both (the same Joint Commission two-identifier discipline). A source system sending the same real `(authority, mrn)` pair for what's now a genuinely different real person (name/DOB disagree) is exactly the kind of real data-quality problem this whole system exists to catch — before this fix, the crosswalk hit alone would have silently, confidently matched the wrong person. Fixed: a crosswalk hit now also requires DOB+name agreement before returning `'matched'`; disagreement correctly falls through to the same `'ambiguous'`/review path the bare-MRN check already used. Directly tested.

Also fixed in the same pass: an ambiguous/provisional record now gets its own primary identifier recorded in the crosswalk immediately (via a new, shared `recordIdentifierInternal()` helper both `addIdentifier()` and `createProvisional()` use) — a provisional record already gets a real, usable `patientId`, so it should benefit from precise crosswalk matching on its next order while still awaiting review, not just after a human resolves it.

## Notes

- **Deliberately MPI, not EMPI** — scoped per `organisationId`, not
  global across every PathScribe customer. A record belonging to a
  different organisation is never a valid match, full stop, regardless
  of how well anything else lines up — you would not want one lab
  organisation's patients cross-matched against a completely different,
  unrelated organisation's; that's not deduplication, that's a real
  privacy problem. Verified by a real test confirming identical
  demographics in two different orgs correctly create two separate
  identities, and never appear in each other's review queues.
- **Real, critical bug found and fixed, from a direct follow-up
  question about whether the MPI/EMPI distinction could actually cause
  a problem.** The real accession-time call
  (`pages/AccessionPage/AccessionPage.tsx`) was passing
  `originOrganisation.id` — the specific *referring* hospital/clinic for
  this one case — as `organisationId`, not this lab's own stable
  identity. Confirmed directly against real seed data
  (`services/organisation/`'s own `OrganisationType` values:
  `health_system`, `nhs_foundation_trust`, `independent_lab` — each a
  distinct referring institution, not "this PathScribe tenant"). Real
  consequence: the same real patient referred to the same lab by two
  different hospitals would have incorrectly gotten two separate MPI
  identities — directly undermining the reason this whole system
  exists. Fixed to use `Organisation.enterpriseId` — the real, already-
  resolved "this lab's own stable tenant" identifier `Case.originEnterpriseId`
  itself already uses — via the new, tested
  `resolveMpiScopeEnterpriseId()` (`services/organisation/organisationService.ts`).
  The real service's own test suite and matching logic were untouched
  and correct throughout; only the value passed in at the one real call
  site was wrong.
- Consumed by `pages/AccessionPage/AccessionPage.tsx` (the real
  accession-time call) and
  `components/QualityAssurance/PatientMatchReviewSection.tsx` (the real
  review queue) — see that file's own README entry for the UI side.

## Real, per direct follow-up ("do we implement ORU^R01 dispatch trigger then actual outbound HTTP dispatch transport"): the architectural boundary described above, "nothing in this entire codebase ever makes a real outbound HTTP call to anything," is now genuinely, partially closed

Real, per direct guidance ("we can setup just the receiving end for now and look to see that the json packages coming out of PS are correct" → "Dispatch needs to be generic so all transactions can be checked"). Full account, including the real receiving-end Cloud Function (`receive_interface_message`, `functions/main.py` in the separate Firebase Functions repository) and the generic dispatch function (`services/interfaceDispatch/dispatchInterfaceMessage.ts`), lives in `pages/README.md`'s own `OutboundInterfaceDlqSection.tsx` entry and `services/reports/README.md`. This entry covers what changed specifically in this folder.

**Real, worthwhile gap found and fixed along the way, before real dispatch could even be correct**: `OutboundPatientAdtQueueEntry` never captured `casesRepointed`/`encountersRepointed`/`reasonCode`/`notes` — real values `mergeIntoExistingPatient()`/`breakGlassRebind()` both genuinely compute at the real enqueue moment, but that were being silently discarded rather than carried onto the queue entry. Building real dispatch would have meant sending fabricated placeholder values (`0`, empty strings) to a real receiver whose whole stated purpose is verifying PathScribe's own JSON is correct — directly undermining that goal. Fixed by extending the type and both real enqueue call sites to capture the real values that were already available right there, rather than losing them and faking them back later at dispatch time.

Real, honest scope note carried over from the queue entries this touches: `'SENT'` was declared on the `status` type from the very start but never once actually produced anywhere in this app — `markSent()`, now added to all three real outbound queue services (this folder's own patient-ADT queue, plus `services/reports/`'s result and LIS-sync queues), is the first real code in this whole app that ever calls it.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

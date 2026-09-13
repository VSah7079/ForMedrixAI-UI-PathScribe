# services/referral/

Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
Laboratory Specimen Referral gap: "review the Batch operations as
this is the logical place to host this functionality. Reuse existing
configurations if possible." This folder is the real, additive layer
on top of two already-existing, reused pieces — `services/batches/`'s
own real `Batch`/manifest/reconciliation architecture (a new
`'External Referral'` `BatchProcessingNode`) and `services/facilities/`'s
own real, multi-role `Facility` architecture (a new `reference_lab`
role) — rather than a new, parallel entity for either concern.

## Files

- **`buildReferralManifestPayload.ts`** — assembles a real
  `ReferralManifestEventPayload` from an existing `'External Referral'`
  `Batch`. Same real, pure-function `buildXxxPayload.ts` shape used
  throughout this app. Refuses outright (throws) on a genuine
  non-referral batch or a referral batch with no real destination set
  — never silently builds a nonsense payload.
- **`IReferralOutboundQueueService.ts` / `mockReferralOutboundQueueService.ts`**
  — mirrors `services/accessioning/IAccessionOutboundQueueService.ts`'s
  own real, established shape exactly (QUEUED/SENT/FAILED lifecycle,
  retry, audit logging on every state change).
- **`IReferralTrackingService.ts` / `mockReferralTrackingService.ts`** —
  covers the RFP's own remaining two asks in one real entity, since
  both are the same ongoing story of what happened to a batch after
  it left the building: "real-time transit status updates"
  (`ReferralTransitStatus`: dispatched → in_transit → delivered →
  result_received) and the inbound result itself once it arrives.
- **`processInboundReferralResultEvent.ts`** — real, idempotent
  ingestion of `ReferralResultEventPayload` (`types/events/`). Honors
  the RFP's own two, genuinely distinct real result modes — discrete
  data vs. a PDF attachment reference — as mutually exclusive; a
  payload carrying both, or neither, is refused as invalid.

## The real integration point

`dispatchReferralIfApplicable()`, in `services/batches/mockBatchService.ts`
itself (not here — it's the batch service's own job to know when its
own batch completes), is called from both real paths that move a
batch to `'complete'` status (`completeReconciliation`,
`overrideAndComplete`). If the completing batch is a real
`'External Referral'` batch with a real destination set, it builds
and enqueues the real manifest and creates the tracking record —
"Automated creation of outgoing referral manifests," per the RFP's
own wording, not a separate, manual trigger a tech has to remember to
click. Fire-and-forget: a referral-side failure never blocks the
batch's own, already-successful completion, the same real posture
the existing rack-release call in that same function already takes.

## Real, honest scope boundary

Same "PathScribe builds structured JSON; a real interface engine
handles actual delivery to/from the reference lab" split as
everywhere else in this app — this module assembles and stores real,
structured data; it does not itself speak any reference lab's own
intake or result-delivery format. Filed on the RFP-APLIS-2026-GLOBAL
Backend Needs Log: real inbound endpoints to receive result data/
status updates from external reference labs, and outbound delivery
of referral manifests — tracked by the backend team's own stories,
not built here.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

# services/lisIngestion/

**The vendor-agnostic LIS ingestion layer (PS-87, Batch 323)**, built to Pete's design:

1. **Adapters** isolate PathScribe from each vendor's quirks. Each one turns its own input into the same `NormalizedLisUpdate`.
2. **A universal staging queue.** Every update lands here, whether it was pushed as a message or fetched by a poll. PathScribe's workflow reads only from this queue, never from the external LIS database or API.
3. **Hybrid push and poll.** A site that can send real-time messages sends them; a site that can't is polled on an interval or on demand. Both can run at once. The same change arriving both ways is recognised and handled once.

```
HL7 v2 message ─┐
JSON webhook  ──┼──► adapter ──► staging queue ──► worker (services/assistPolling: Assist AI draft)
LIS poll      ──┘
```

## Files

- **`types.ts`** — `NormalizedLisUpdate`, `StagedLisEvent`, the adapter interfaces (`LisPushAdapter`, `LisPollAdapter`), and the adapter error codes.
- **`stagingRules.ts`** — the queue's pure rules:
  - staging with de-duplication (same accession, status, LIS time and text = the same update);
  - `workableEvents` (pending events, plus failed ones with attempts left, oldest LIS change first);
  - `recordAttempt`;
  - `retryFailed`;
  - `trimQueue` (keeps every pending and failed event and the newest 200 handled ones).

  A failed event is retried on each run up to `MAX_ATTEMPTS` (5), then waits for an admin's **Retry failed**.
- **`mockLisStagingQueueService.ts`** — the queue's storage (`pathscribe_lis_staging_queue`). In production this is a server-side table.
- **`adapters/hl7v2StatusAdapter.ts`** — HL7 v2 ORU^R01, ORM^O01 and OML^O21, one update per OBR.
  - **Accession:** OBR-3, then OBR-2, then ORC-3.
  - **Status:** ORC-5, then OBR-25. The order is configurable per site, because LISs differ on where a workflow status like "GROSSED" goes.
  - **Time:** OBR-22, then MSH-7.
  - **Text:** from OBX by LOINC: 22634-0 gross, 22635-7 microscopic, 22637-3 final diagnosis. HL7 escapes are decoded.
  - **Timestamps without an offset are read as UTC.**
- **`adapters/webhookJsonAdapter.ts`** — PathScribe's published JSON contract, for systems that can POST JSON but not HL7: `{ accession, status, updatedAt, grossText?, microscopicText?, diagnosisText? }`, one object or an array.
- **`adapters/mockPollAdapter.ts`** — the demo poll source (three seeded Assist cases).
- **Tests:** `stagingRules.test.ts` and `adapters/adapters.test.ts`.

Both push adapters come with an example message for the admin screen's **Test an inbound message** (Configuration → System → Integrations → Assist LIS Ingestion).

## Open

- **Real endpoints.** In production, an inbound HTTPS endpoint (HL7 over HTTP from the interface engine, or the JSON webhook) and a scheduled poll job both call the entry points in `services/assistPolling/assistPollingRuntime.ts`. They belong beside `api/webhooks/engine/`, which isn't in this working copy.
- **The real poll source** depends on each site's LIS (FHIR `_lastUpdated`, an HL7 query, or a vendor API) and needs that LIS's integration guide.
- **Authentication** of inbound messages (webhook signing, engine credentials) is part of building those endpoints.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*

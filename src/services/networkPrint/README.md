# services/networkPrint/

**What happened to a label sent to the interface engine (Batch 347, PS-54).** This covers printers whose Bridge Type is *Direct via Interface Engine*. Their labels go to the lab's interface engine, which prints them and reports back.

## What the user sees

A small list at the bottom left of the screen (`components/Printing/NetworkPrintJobs.tsx`):

- **Sent:** "Label S26-4403-A1 sent to ZT411. Waiting for the printer…"
- **Printed:** "…printed on ZT411." This shows for 5 seconds.
- **Failed:** "…did not print: ZT411 is out of labels." with **Retry** and **Dismiss**.
- **No answer after two minutes:** it can be retried as well.

**Retry is manual only** (Pete, Sep 26). An automatic retry could print a label twice when it did print but the answer was lost. A retry keeps the job's `idempotencyKey` and gets a new `eventId` (`…-R2`) and `attempt`, so an engine that enforces the key prints the label at most once.

**Demo:** with no API server, nothing can answer. Two small dashed buttons (*Simulate: printed*, *Simulate: out of labels*) publish the engine's answer on the local live-update transport, so the whole path runs. They never appear in an SSO build or when a hub is configured.

## Files

- **`networkPrintJobs.ts`:** `createNetworkPrintJobTracker(deps)` returns `send`, `handleResult`, `retry`, `dismiss`, `simulateResult`, `subscribe` and `getSnapshot`.
  - **Answers:** they arrive as `PrintJobStatus` events on the live-update connection. The tracker subscribes only while a label is waiting.
  - **Audit:** each result is audited (*Network Print Succeeded* / *Failed*), and so is each retry (*Network Print Retried*, with the user).
  - **Late and duplicate answers:** an answer for an earlier attempt, or a repeat, changes nothing.
  - **Helpers:** `describeNetworkPrintJob` picks the message key; `isRetryable` says whether a job can be retried.
  - Dependencies are passed in, so it is tested without module mocks.
- **`networkPrintJobsInstance.ts`:** the shared tracker, exported from `@/services` as `networkPrintJobs`. It is wired to `dispatchNetworkPrintJob`, the audit service, `liveUpdateService`, and (demo only) the local transport. `canSimulatePrintResults` decides whether the demo buttons are allowed.
- **`networkPrintJobs.test.ts`:**
  - send and listen, printed then cleared, failure then retry (same key, new id, audited with the user);
  - late and duplicate answers;
  - no-answer timeout;
  - several labels at once;
  - when simulation is allowed.

## Limits

- **Jobs live in the tab's memory.** After a reload, answers for earlier labels are still audited by the server but no longer shown. Re-reading a job's status (`GET /api/print/jobs/{eventId}`) is listed for the API server.
- **Sending is still a stub.** `dispatchNetworkPrintJob` records the job; the API server's `POST /api/print/jobs` is the call to add. The server side is specified in `docs/architecture/LIVE_UPDATES_SIGNALR.md` §10.

---
*See [services/README.md](../README.md) for the rest of the services layer.*

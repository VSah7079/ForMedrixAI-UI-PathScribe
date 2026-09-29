# services/assistPolling/

**The Assist worker (PS-87).** In Assist mode the external LIS owns the case and rarely sends preliminary results out, so PathScribe polls it, and also accepts pushed messages from sites that can send them.

Since Batch 323 every update, polled or pushed, first lands in the universal staging queue of the ingestion layer ([`../lisIngestion/`](../lisIngestion/README.md), Pete's design). This folder is the worker that reads from that queue. When a case reaches a milestone, the AI prepares a synoptic draft straight away, so it's waiting when the pathologist opens the case.

| LIS milestone | What the AI does |
|---|---|
| **Gross Complete** | Reads the gross description, decides which synoptic templates the case needs, and fills in what the gross supports. It never sees microscopic text at this stage. |
| **Microscopic/Diagnosis Complete** | Re-checks the template choice with the microscopic findings and diagnosis, and completes the draft. |

Everything the AI produces is a **draft for review**:
- **Answers:** AI answers are unverified and appear with Confirm/Override in the report editor, as other AI suggestions do. A field is (re)filled only if it's empty or still holds the AI's own earlier, unverified value; anything a person typed or verified is kept.
- **Templates:**
  - A template proposal for a specimen with no report becomes a new draft.
  - A change to an AI draft nobody has touched is applied directly.
  - A change to a pathologist's own report goes to `pendingProtocolChanges` for review.
- **Signed-out cases:** never touched.
- **AI Behavior toggles** (Config → AI Behavior): Gross-Driven AI and Microscopic-Driven AI still apply. With a toggle off, the LIS text is synced but no draft is made.

## Files

- **`types.ts`** — settings, the per-case milestone records, and the run log (`AssistPollRun`: trigger manual, scheduled, push or retry; fetched; staged; items). `LisCaseSnapshot` is now an alias of the ingestion layer's `NormalizedLisUpdate`.
- **`assistMilestoneRules.ts`** — the pure rules:
  - the status → milestone crosswalk lookup (case-insensitive);
  - text fingerprints, so an unchanged update is skipped and an amended LIS text is redrafted;
  - `planMilestoneWork`;
  - applying template proposals;
  - merging suggestions.

  Batch 322's `nextCursor` was removed: failures now wait in the staging queue, so the poll cursor always moves past everything it staged.
- **`runAssistPollCycle.ts`** — the worker, with every dependency injected. It has three entry points, all ending in the same queue drain:
  - `runAssistPollCycle`: poll adapter → stage → process;
  - `ingestPushedMessage`: push adapter → stage → process on receipt; an unreadable message is refused with the adapter's error code;
  - `retryFailedEvents`.

  One event failing never stops the others. It stays in the queue and is retried on the next run. If the LIS can't be reached, events already staged are still processed.
- **`assistPollingRuntime.ts`** — wires the worker to the app's services: `runAssistPollNow`, `ingestLisMessageNow('hl7v2' | 'webhook', raw)`, `retryFailedLisEventsNow`. The worker is a system process, so it writes Assist cases through the LIS case service directly, not through the logged-in user's `CaseRouter` access check.
- **`mockAssistPollingService.ts`** — settings, cursor, per-case records and the last 20 runs (`pathscribe_assist_lis_polling`). Settings are validated: interval 1–1440 minutes, and no blank or duplicate LIS statuses.
- **`mockLisStatusSource.ts`** — a Batch 322 file kept only as a re-export of `../lisIngestion/adapters/mockPollAdapter.ts`. Nothing imports it; it can be deleted.
- **Tests:** `assistMilestoneRules.test.ts` and `runAssistPollCycle.test.ts`. The latter covers poll, push, de-duplication across push and poll, retries, an unreachable LIS, and the milestone rules end to end.

The admin screen is `components/Config/System/AssistLisPollingSection.tsx` (Configuration → System → Integrations → **Assist LIS Ingestion**). It has the settings, **Test an inbound message**, the staging queue with **Retry failed**, **Poll now**, and the activity log.

## Open

- **The real LIS poll source.** How to ask a given LIS "what changed since X" depends on the site's LIS. Options are a FHIR `DiagnosticReport` search on `_lastUpdated` (the NHS path `cases/FHIRCaseService.ts` scaffolds), an HL7 query through the interface engine, or a vendor API. Each needs that LIS's integration guide. Whatever it is, it's another poll adapter returning `NormalizedLisUpdate[]` (see `../lisIngestion/`).
- **The schedule and the inbound endpoints.** Nothing in this app runs on a timer or listens for messages yet.
  - **Schedule:** in production a server-side job calls `runAssistPollNow('scheduled')` every `intervalMinutes`.
  - **Inbound endpoint:** it calls `ingestLisMessageNow` for each HL7 v2 or JSON message.
  - **Where they go:** beside `api/webhooks/engine/`, which isn't in this working copy.

  Until then only **Poll now** and **Test an inbound message** run the pipeline.
- **One LIS per deployment.** The settings are deployment-wide, like Voice. A deployment that polls more than one LIS would need a settings row per LIS connection.
- **No draft marker in the editor.** `aiDraftSource` (on `SynopticReportInstance`) records which milestone produced a draft, but the report editor doesn't show it yet.
- **Diagnosis text.** The LIS diagnosis is written to `diagnostic.primaryDiagnosis`, the case's existing diagnosis field.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*

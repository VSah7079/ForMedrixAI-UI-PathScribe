# Live updates: the SignalR hub on the PathScribe API server

**Status:** specification for the API server team. The browser side is built and tested (Batch 342, Jira PS-262); the hub itself is not built yet.
**Decision (Pete, Sep 26, 2026):** the PathScribe API server is **ASP.NET Core**, and live updates use **SignalR**. This follows the Sep 2026 decision that the production database is Microsoft SQL Server.

## 1. What it's for

Some screens must show changes made on other devices straight away:

- **OR Suite Live Board.** Wall displays and room workstations in the operating theatres. When a circulating nurse dismisses a case on one terminal, every other board showing that OR updates **within 500 ms** (the RFP's "Multi-Board Sync" requirement).
- **Intraop Queue.** The pathology-side list of frozen sections. New sessions, diagnoses, dismissals and merges from any device appear without a reload.

- **Network print results** (Batch 347, Jira PS-54). When a label goes to a "Direct via Interface Engine" printer, the engine's answer (printed, or why not) comes back to the user who sent it. See §10.

Other polling screens can use the same hub later with new event types: messaging (20 s poll), the Facility Ops dashboard (20 s), and the engraver monitor (30 s).

## 2. What already exists in the browser

All of this is in `src/services/liveUpdates/`:

| File | What it does |
|---|---|
| `liveUpdateContract.ts` | **The wire contract, and the source of truth for this spec:** hub path, method names, event and scope types, validation |
| `liveUpdatePolicy.ts` | Reconnect back-off, fallback polling, scope matching and combining, duplicate filter, transport choice |
| `signalRLiveUpdateService.ts` | The client: `@microsoft/signalr` 10, automatic reconnect that never gives up, scope re-sent and screens re-read after every reconnection |
| `localLiveUpdateService.ts` | Used when no hub is configured (development, demo): the mock services publish writes to this browser's own windows |
| `testing/fakeSignalRHub.ts` | **Test only.** A minimal server speaking the SignalR JSON hub protocol, used by `signalRProtocol.integration.test.ts` to run the real client end to end. It shows the behaviour this hub must have |

The screens use it through `hooks/useLiveIntraopUpdates.ts`. It re-reads through the normal service call on each change, coalesces bursts into one refresh (100 ms), polls every 15 s without a live connection and every 60 s as a safety net while live, and shows a connection badge.

**Client configuration:** `VITE_LIVE_UPDATES_HUB_URL=https://<api-host>/hubs/live`. Production requires https; development also allows loopback http. If it's not set, the app uses the local transport and polling.

## 3. The hub

- **Path:** `/hubs/live`. One hub for all live updates.
- **Protocol:** JSON hub protocol v1. MessagePack is optional later; the client would need `@microsoft/signalr-protocol-msgpack`.
- **Transports:** WebSockets first. Leave Server-Sent Events and long polling enabled as fallbacks: some hospital proxies block WebSockets, and the client negotiates automatically.
- **Keep-alive:** `KeepAliveInterval` 15 s and `ClientTimeoutInterval` 30 s (the defaults). They match the client's default server timeout of 30 s.

### Methods

| Direction | Name | Arguments | Returns |
|---|---|---|---|
| client → server | `SetIntraopScope` | `IntraopScope { locationIds: string[], all: bool }` | `SetIntraopScopeResult { acceptedLocationIds: string[], rejectedLocationIds: string[], all: bool }` |
| server → client | `IntraopChanged` | `IntraopChangedEvent` (below) | — |
| server → client | `PrintJobStatus` | `PrintJobStatusEvent` (§10) | — |

- **Replaces, not adds:** `SetIntraopScope` sets the connection's whole scope. The server removes the connection from the groups it no longer asks for and adds it to the new ones.
- **When the client calls it:** after every connect and every reconnect (groups don't survive a reconnection), and when a screen's scope changes (e.g. Multi-Suite Overview).
- **Combined scope:** one browser window keeps one connection and sends the union of its screens' scopes.

### `IntraopChangedEvent`

| Field | Type | Notes |
|---|---|---|
| `v` | int | Contract version, `1`. Clients ignore other versions |
| `eventId` | string | Unique per event: use the outbox row id. Clients drop duplicates |
| `kind` | string | See the table below |
| `sessionId` | string | The intraoperative session |
| `specimenId` | string? | When the change is about one specimen |
| `locationId` | string? | The session's OR location. Boards subscribe by location |
| `facilityId` | string? | |
| `occurredAt` | string | Commit time, ISO 8601 UTC |

**Identifiers only: never names, MRNs, diagnoses or free text.** OR wall displays are shared screens. The client only uses the event as a signal to re-read through the normal authorised API, so an event never grants access to data.

| `kind` | Sent after (today's mock-service method) |
|---|---|
| `session.created` | `createSession`, and each session in `seedOrBoardDemoData` |
| `specimen.added` | `addSpecimen` |
| `specimen.progressed` | `addMilestone`, `addPreparationOutput`, `addDigitalAsset` |
| `diagnosis.rendered` | `setFrozenSectionDiagnosis` |
| `verbal.reported` | `recordVerbalReport` |
| `specimen.dismissed` | `dismissFromBoard` |
| `session.merged` | `merge` |

`src/services/intraop/mockIntraoperativeService.ts` publishes exactly these (`announceIntraopChange`). The API server's intraop endpoints must publish the same.

## 4. Authentication

- **Users:** the API's normal bearer token (SSO, Jira PS-60). Browsers can't set headers on WebSockets, so SignalR sends the token as `access_token` in the query string. Read it in `JwtBearerEvents.OnMessageReceived` for requests to `/hubs/live`, and keep it out of access logs.
- **OR terminals:** the board route is a public kiosk page with no user signed in. Each terminal needs a **device token**:
  - issued when an administrator registers the terminal (System → OR Suite Terminals);
  - bound to the terminal id, the tenant and the locations it may show (its own location, plus its facility's locations if Multi-Suite is allowed);
  - revocable, and rotated on a schedule.
- **Client side:** since Batch 343 (PS-60) the client sends the signed-in user's SSO access token (`services/auth/accessTokenSource.ts`). Password (demo) sessions and the OR boards have no token yet; the terminal's device token is still to come. **The hub must refuse unauthenticated connections;** those screens then stay on 15-second polling.

## 5. Authorisation (`SetIntraopScope`)

- **Tenant isolation:** group names carry the tenant, so no connection can join another tenant's groups:
  - `t:{tenantId}:intraop:loc:{locationId}`
  - `t:{tenantId}:intraop:all`
- **Locations:** accept only the locations this principal may see (a terminal's allowed set, or a user's facility access). Everything else goes back in `rejectedLocationIds`; the client logs it.
- **`all`:** only for users with intraop queue access (pathologists and intraop staff), never for terminals.
- **Rate limit:** a few `SetIntraopScope` calls per second per connection is plenty.

## 6. Publishing: after the commit, never before

The client re-reads as soon as it gets an event. An event sent before the transaction commits would make every board re-read the old data. That is exactly what the browser check showed when the test harness published early (§8).

- **Transactional outbox:** each intraop write inserts an outbox row (`eventId`, `kind`, ids, `occurredAt`) **in the same transaction** as the change.
- **Dispatcher:** an `IHostedService` sends pending outbox rows to the groups through `IHubContext<LiveHub>`, then marks them sent. Delivery is at least once, and clients drop duplicates by `eventId`.
  - Wake the dispatcher right after a commit (an in-process channel), and also poll every 100 ms or less as a fallback, so the 500 ms budget holds.
- **Which groups:**
  - an event with a `locationId` goes to `…:loc:{locationId}` and `…:all`;
  - one without a `locationId` goes only to `…:all`.
- **No replay:** the client re-reads after every (re)connection, so events missed while disconnected need no replay.

## 7. Scale-out and deployment

- **Public cloud (Azure):** Azure SignalR Service in Default mode. The API servers stay stateless; no sticky sessions needed.
- **Private cloud:** the Redis backplane (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`) across API instances, or a single instance.
  - Without Azure SignalR Service, the load balancer needs **sticky sessions**, because negotiate and connect must reach the same node.
  - Enable WebSockets on the load balancer, with an idle timeout above 15 s.
- **CORS:** allow the app's origin with credentials. SignalR's negotiate request is cross-origin when the API is on another host.

## 8. Acceptance tests for the hub

1. **Contract.** Run the same scenario as `src/services/liveUpdates/signalRProtocol.integration.test.ts` against the real hub, using the real `@microsoft/signalr` client:
   - two boards (different locations) and a queue connect;
   - scopes are accepted;
   - an event reaches only the matching board and the queue;
   - every connection recovers after the server drops it, re-sends its scope and re-reads.
2. **Latency.** From commit to the second board showing the change: **p95 under 500 ms** with at least 50 connected boards. Browser checks with the test hub (Chromium, dev server, loopback, including the board's re-read):
   - hub publish to the other board's rows: 129 ms;
   - a dismissal on board A to the row gone on board B: 83 ms;
   - a new session to the Intraop Queue: 203 ms.
   Over loopback, the client alone received events in about 10 ms.
3. **Recovery.** Stop the hub for 5 minutes, then restart it. Every board shows *Reconnecting…* or *Offline*, keeps polling every 15 s, returns to *Live* without a reload, and re-reads.
4. **Authorisation.** A terminal can't subscribe outside its allowed locations or to `all`, a user can't reach another tenant, and an unauthenticated connection is refused.
5. **No PHI** in any hub message (automated check on captured frames).

## 9. Open items

- **Network print results (§10):** the API endpoints, the engine's credential, and a way to re-read a job's status after a reconnect are all still to be built.

- **Device tokens** for OR terminals. User tokens are wired (Batch 343; see `AUTHENTICATION_OIDC.md`).
- **Runtime configuration:** `VITE_LIVE_UPDATES_HUB_URL` is fixed at build time. A per-customer deployment needs runtime configuration, which is already noted in the deployment-readiness work.
- **Other screens** (messaging, Facility Ops, engraver monitor) can move onto this hub with their own event types and methods.

## 10. Network print results (Batch 347, Jira PS-54)

**What the user sees:** a label sent to a *Direct via Interface Engine* printer stays in a small list at the bottom left of the screen:
- *sent, waiting for the printer*;
- *printed* (for a few seconds);
- *did not print* with the reason, plus **Retry** and **Dismiss**.

A label with no answer after two minutes can be retried too.

**Retry is manual only** (Pete, Sep 26). An automatic retry could print a label twice when it did print but the answer was lost.

### The path

1. **Browser → API server:** `POST /api/print/jobs` with the `NetworkPrintPayload` (`src/types/printing/NetworkPrintPayload.ts`). Today the browser only records it (`dispatchNetworkPrintJob`, a stub); this is the call to add.
2. **API server → interface engine:**
   - The server forwards the job and sets `callbackUrl` to its own absolute address for the callback endpoint. The browser sends the relative placeholder `/api/print/callbacks`.
   - It stores the job: `eventId`, `idempotencyKey`, `attempt`, tenant, and the user who sent it.
3. **Interface engine → API server:** `POST /api/print/callbacks` with the `NetworkPrintCallback`: `eventId`, `status`, `printerResponse`, `durationMs`, `timestamp`.
   - Authenticate the engine with its own credential (client certificate or an engine token), never a user token.
   - Refuse a callback for a job the tenant doesn't have.
   - Callbacks may repeat: store the first and ignore the rest.
4. **API server → the user:** `PrintJobStatus` on the hub, sent with `Clients.User(userId)` to the user who sent the job (all their windows). There is no scope and no group.
   - Publish after the commit, through the same outbox as §6.
   - Each window ignores jobs it didn't send.

### `PrintJobStatusEvent`

| Field | Type | Notes |
|---|---|---|
| `v` | int | `1` |
| `eventId` | string | Unique per event (outbox row id). Clients drop duplicates |
| `jobId` | string | The payload's `eventId` for this attempt |
| `idempotencyKey` | string | The same for every attempt at one label |
| `status` | string | `PRINT_SUCCESS`, `PRINTER_UNREACHABLE`, `PAPER_OUT`, `RIBBON_OUT`, `HEAD_OPEN`, `MALFORMED_ZPL`, `INVALID_GS1` |
| `printerResponse` | string? | The engine's own text, for the audit trail. Printer text only, never PHI |
| `durationMs` | number? | |
| `occurredAt` | string | ISO 8601 UTC |

The source of truth is `src/services/liveUpdates/liveUpdateContract.ts` (`HUB_PRINT_JOB_STATUS`, `parsePrintJobStatusEvent`).

### Retries and idempotency

- **What a retry sends:** the same payload with a new `eventId` (`{idempotencyKey}-R{n}`), `attempt` n, and the **same `idempotencyKey`**.
- **What the engine must enforce:**
  - A key that has **printed** (`PRINT_SUCCESS`) is never printed again. Answer a repeat with `PRINT_SUCCESS` and don't print.
  - A key whose attempts all failed may be printed on a retry.
- **Late answers:** an answer for an earlier attempt, arriving after a retry, is audited but doesn't change what the user sees.

### Payload additions in Batch 347

- `labelData.labelType`: `CASSETTE` or `SLIDE`. If absent, treat the label as a cassette.
- `labelData.slide`: `{ level, stainName }`, for slides.
- Template versions: `ZPL-CASSETTE-V3` or `ZPL-SLIDE-V1`.
- `attempt`.
- `eventId` values are now unique per label, even for a batch sent in the same millisecond. The old `EVT-{case}-{ms}` could repeat, and an engine enforcing the key would have dropped the repeats.

### Audit

The browser records these today; the server must write the same entries:
- *Network Print Dispatched*;
- *Network Print Succeeded* / *Network Print Failed*;
- *Network Print Retried*, with the user who retried.

The detail carries `eventId`, `idempotencyKey`, `attempt`, the status and the printer.

### Tests the server should pass

1. **Success.** A job and its success callback: exactly one `PrintJobStatus`, sent only to the sender's connections.
2. **Failure, then retry.** The engine gets the same `idempotencyKey` and prints once.
3. **Duplicate callback.** A second copy of a callback sends no second event.
4. **Wrong tenant or unknown job.** A callback from the wrong tenant, or for a job that doesn't exist, is refused.

### Not built yet

- **Re-reading a job's status after a reconnect or reload:** `GET /api/print/jobs/{eventId}`. Today the list lives in the tab's memory, and answers that arrive while a tab is closed are only audited.


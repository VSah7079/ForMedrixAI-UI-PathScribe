# services/liveUpdates/

**Live updates across devices (PS-262, Batch 342).** Keeps the OR Suite Live Boards and the Intraop Queue current when anything changes on another device. In production that means a dismissal on one terminal reaches every other board for that theatre within 500 ms.

**Decision (Pete, Sep 26, 2026):** the PathScribe API server is ASP.NET Core, and live updates come from its **SignalR** hub. The hub is specified in [docs/architecture/LIVE_UPDATES_SIGNALR.md](../../../docs/architecture/LIVE_UPDATES_SIGNALR.md); it isn't built yet.

**Network print results (Batch 347, PS-54).** The same connection also carries the interface engine's answers for labels a user sent to a *Direct via Interface Engine* printer (`PrintJobStatus`). They go to that user only, with no scope. `services/networkPrint/` subscribes while a label is waiting. See spec §10.

## How a screen uses it

`hooks/useLiveIntraopUpdates(scope, reRead)`:
- **Subscribing:** it subscribes for the screen's scope: the board's OR locations, or everything for the queue.
- **Re-reading:** it calls the screen's normal re-read when a change arrives. Bursts are coalesced into one call (100 ms), and it also re-reads after every reconnection.
- **Polling:** it polls every 15 s without a live connection, and every 60 s as a safety net while live.
- **State:** it returns the connection state for `components/LiveUpdates/LiveStatusBadge.tsx`.

Events carry **identifiers only** (session, specimen, location), never patient data. A screen re-reads through the normal authorised service call, so an event never grants access to anything.

## Files

- **`liveUpdateContract.ts`:** the wire contract with the .NET hub. It has the hub path (`/hubs/live`), the methods (`SetIntraopScope`, `IntraopChanged`, and since Batch 347 `PrintJobStatus`), and the `IntraopChangedEvent` / `IntraopScope` / `PrintJobStatusEvent` types. `parseIntraopChangedEvent` and `parsePrintJobStatusEvent` validate incoming events and drop unknown fields.
- **`liveUpdatePolicy.ts`** (pure, tested):
  - reconnect back-off: 0, 2, 5, 10, 20, then 30 s, with ±20 % jitter, never giving up;
  - polling intervals per state;
  - scope matching and combining;
  - the duplicate filter;
  - the transport choice (`selectLiveUpdateTransport`).
- **`ILiveUpdateService.ts`:** `subscribeIntraop`, `subscribePrintJobs` (Batch 347), `getState`, `onStateChange`, `onResync`.
- **`signalRLiveUpdateService.ts`:** the production client (`@microsoft/signalr` 10).
  - **Connection:** one per browser window. It opens on the first subscription and closes 1 s after the last (so moving between screens reuses it).
  - **Scope:** the combined scope is sent on connect and on every reconnect.
  - **Recovery:** automatic reconnect never gives up, and a failed first start or a closed connection is retried on the same schedule. After each (re)connection the screens re-read.
  - **Print results (Batch 347):** a print-result subscriber keeps the connection open too. A connection open only for print results sends no `SetIntraopScope`.
- **`localLiveUpdateService.ts`:** used when no hub is configured. The mock services publish each write here (`announceIntraopChange` in `intraop/mockIntraoperativeService.ts`, standing in for the API server). A `BroadcastChannel` carries it to this browser's other windows; other devices are covered by polling (state `local`). Since Batch 347 it also has `publishPrintJobStatus`, which the demo uses to simulate the engine's answer.
- **`liveUpdateService.ts`:** picks the transport once. `VITE_LIVE_UPDATES_HUB_URL` set (https:// in production; loopback http in development) means SignalR, otherwise local. It is exported from `@/services` as `liveUpdateService`.
- **`testing/fakeSignalRHub.ts`:** **test infrastructure only, never deployed.** A minimal server speaking the SignalR JSON hub protocol (using the `ws` dev dependency), so the real client can be tested end to end in Node.

## Tests

- **`liveUpdates.test.ts`:** the contract (including print results, Batch 347), the policy, both transports (the SignalR one against a fake connection: scope, delivery, reconnect, never giving up, the close grace period), and that the mock intraop service publishes ids only.
- **`signalRProtocol.integration.test.ts`:** the real `@microsoft/signalr` client through this service against `fakeSignalRHub`.
  - Two boards and a queue get only their own locations.
  - Delivery is under 500 ms (about 10 ms over loopback).
  - Everyone recovers after the server drops all connections, re-sending scope and re-reading.
  - A print result reaches a print-only connection, which sends no scope (Batch 347).

## Verified in the browser

Chromium, dev server, with the OR board open twice and the Intraop Queue.
- **Local transport:** a demo started on board A showed on board B in 143 ms; a dismissal on A cleared the row on B in 120 ms; a new session reached the queue in 206 ms.
- **SignalR** (the app pointed at a protocol-compatible test hub):
  - the badges showed *Live*;
  - a hub publish reached board B's rows in 129 ms;
  - a dismissal cleared the row on B in 83 ms;
  - a new session reached the queue in 203 ms;
  - after the hub dropped every connection the badge showed *Reconnecting…*, then *Live* again, with no reload.
- **Timing includes** the screen's re-read through the mock services.

## Open

- **Authentication:** since Batch 343 (PS-60) `liveUpdateService.ts` passes `accessTokenFactory: getAccessToken` (`services/auth/accessTokenSource.ts`), so SSO users connect with their access token. Demo password sessions and OR terminals have none yet (terminal device tokens are still to come); the hub must refuse unauthenticated connections (spec §4).
- **Runtime configuration:** `VITE_LIVE_UPDATES_HUB_URL` is fixed at build time.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*

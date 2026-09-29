// src/services/liveUpdates/testing/fakeSignalRHub.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: TEST INFRASTRUCTURE ONLY — never deployed. A minimal server that
// speaks the SignalR JSON hub protocol over WebSockets, so the real
// @microsoft/signalr client (and signalRLiveUpdateService on top of it) can
// be tested end to end in Node without the .NET API server. It implements
// only what the live-update contract uses: negotiate, the handshake,
// SetIntraopScope (echoed as accepted), IntraopChanged broadcasts filtered
// by scope, pings, and dropping a connection to exercise reconnection.
// The production hub is ASP.NET Core SignalR (docs/architecture/LIVE_UPDATES_SIGNALR.md).
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IntraopChangedEvent, IntraopScope, PrintJobStatusEvent } from '../liveUpdateContract';
import { HUB_INTRAOP_CHANGED, HUB_PRINT_JOB_STATUS, HUB_SET_INTRAOP_SCOPE } from '../liveUpdateContract';
import { eventMatchesScope } from '../liveUpdatePolicy';

const RS = '\u001e'; // SignalR record separator

interface Client { socket: WebSocket; scope: IntraopScope | null; handshaken: boolean }

export interface FakeSignalRHub {
  url: string;
  /** Broadcast an event the way the API server does after a committed write. */
  publish(event: IntraopChangedEvent): number;
  /** Batch 347: a network print result. The real hub sends it to the user who
   *  sent the job; this test hub has no users, so it goes to every connection. */
  publishPrintJobStatus(event: PrintJobStatusEvent): number;
  /** Drop every open connection (the client should reconnect by itself). */
  dropAll(): void;
  scopes(): (IntraopScope | null)[];
  connectionCount(): number;
  negotiations(): number;
  close(): Promise<void>;
}

export async function startFakeSignalRHub(path = '/hubs/live', port = 0): Promise<FakeSignalRHub> {
  const clients = new Set<Client>();
  let negotiateCount = 0;
  let nextId = 1;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-requested-with, x-signalr-user-agent');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'POST' && url.pathname === `${path}/negotiate`) {
      negotiateCount++;
      const id = `c${nextId++}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        negotiateVersion: 1, connectionId: id, connectionToken: `${id}-token`,
        availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
      }));
      return;
    }
    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== path) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });

  wss.on('connection', (socket: WebSocket) => {
    const client: Client = { socket, scope: null, handshaken: false };
    clients.add(client);
    const send = (msg: unknown) => socket.send(JSON.stringify(msg) + RS);
    const ping = setInterval(() => { if (client.handshaken) send({ type: 6 }); }, 5_000);
    socket.on('close', () => { clearInterval(ping); clients.delete(client); });
    socket.on('message', (data: Buffer) => {
      for (const frame of data.toString('utf8').split(RS).filter(Boolean)) {
        const msg = JSON.parse(frame);
        if (!client.handshaken) {
          client.handshaken = true;
          socket.send('{}' + RS); // handshake accepted (protocol json v1)
          continue;
        }
        if (msg.type === 1 && msg.target === HUB_SET_INTRAOP_SCOPE) {
          const scope = msg.arguments[0] as IntraopScope;
          client.scope = scope;
          if (msg.invocationId) send({ type: 3, invocationId: msg.invocationId, result: { acceptedLocationIds: scope.locationIds, rejectedLocationIds: [], all: scope.all } });
        } else if (msg.type === 1 && msg.invocationId) {
          send({ type: 3, invocationId: msg.invocationId, error: `Unknown hub method ${msg.target}` });
        }
        // type 6 (ping) and 7 (close) need no reply
      }
    });
  });

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  return {
    url: `http://127.0.0.1:${address.port}${path}`,
    publish(event) {
      let delivered = 0;
      for (const c of clients) {
        if (!c.handshaken || !c.scope || !eventMatchesScope(event, c.scope)) continue;
        c.socket.send(JSON.stringify({ type: 1, target: HUB_INTRAOP_CHANGED, arguments: [event] }) + RS);
        delivered++;
      }
      return delivered;
    },
    publishPrintJobStatus(event) {
      let delivered = 0;
      for (const c of clients) {
        if (!c.handshaken) continue;
        c.socket.send(JSON.stringify({ type: 1, target: HUB_PRINT_JOB_STATUS, arguments: [event] }) + RS);
        delivered++;
      }
      return delivered;
    },
    dropAll() { for (const c of clients) c.socket.terminate(); },
    scopes: () => [...clients].map(c => c.scope),
    connectionCount: () => clients.size,
    negotiations: () => negotiateCount,
    close: () => new Promise<void>(resolve => {
      for (const c of clients) c.socket.terminate();
      wss.close();
      server.close(() => resolve());
    }),
  };
}

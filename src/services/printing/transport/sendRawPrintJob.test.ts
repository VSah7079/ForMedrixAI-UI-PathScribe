// src/services/printing/transport/sendRawPrintJob.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as net from 'net';
import { sendRawPrintJob } from './sendRawPrintJob';
import { DEFAULT_PRINT_PROTOCOL_PORT } from '@/types/printRouting/PrintDestination';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

function listenOnEphemeralPort(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

describe('sendRawPrintJob', () => {
  let server: net.Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('opens a real TCP socket and writes the exact, real raw document bytes with no extra framing at all', async () => {
    const received: Buffer[] = [];
    // Real, per RAW/9100's own protocol shape (sendRawPrintJob.ts calls
    // socket.end(), a real half-close) — the client-side promise
    // resolves once its own write is flushed, which is not the same
    // real moment the server has finished receiving it, so this test
    // waits on the server's own real 'end' event (the real FIN it
    // receives), never a race against the client's own resolution.
    const serverReceivedAll = new Promise<void>(resolve => {
      server = net.createServer(socket => {
        socket.on('data', (chunk: Buffer) => received.push(chunk));
        socket.on('end', () => resolve());
      });
    });
    const port = await listenOnEphemeralPort(server!);

    const destination: PrintDestination = { protocol: 'RAW_9100', ipAddress: '127.0.0.1', port };
    const payload = Buffer.from('%PDF-1.4 real raw document bytes');
    const [result] = await Promise.all([sendRawPrintJob(destination, payload), serverReceivedAll]);

    expect(result.ok).toBe(true);
    expect(Buffer.concat(received)).toEqual(payload);
  });

  it('defaults to real port 9100 when none is configured on the destination', async () => {
    const connectSpy = vi.spyOn(net.Socket.prototype, 'connect');
    const destination: PrintDestination = { protocol: 'RAW_9100', ipAddress: '127.0.0.1' }; // no port — must fall back to the real 9100 default
    void sendRawPrintJob(destination, Buffer.from('x'));
    expect(connectSpy).toHaveBeenCalledWith(DEFAULT_PRINT_PROTOCOL_PORT.RAW_9100, '127.0.0.1', expect.any(Function));
    connectSpy.mockRestore();
  });

  it('a real, unreachable printer fails honestly rather than hanging or throwing', async () => {
    const destination: PrintDestination = { protocol: 'RAW_9100', ipAddress: '127.0.0.1', port: 1 };
    const result = await sendRawPrintJob(destination, Buffer.from('data'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('127.0.0.1');
  });
});

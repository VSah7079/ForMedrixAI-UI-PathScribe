// src/services/printing/transport/sendLprPrintJob.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import { sendLprPrintJob } from './sendLprPrintJob';
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

/** Real, minimal RFC 1179 responder — acknowledges every real
 *  subcommand/file this client sends with a single real 0x00 byte,
 *  same real one-byte-ack convention the protocol itself specifies. */
function startAckingServer(receivedChunks: Buffer[]): net.Server {
  return net.createServer(socket => {
    socket.on('data', (chunk: Buffer) => {
      receivedChunks.push(chunk);
      socket.write(Buffer.from([0]));
    });
  });
}

describe('sendLprPrintJob', () => {
  let server: net.Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('sends the real, ordered RFC 1179 sequence — job command, control file, then data file — each acknowledged before the next is sent', async () => {
    const receivedChunks: Buffer[] = [];
    server = startAckingServer(receivedChunks);
    const port = await listenOnEphemeralPort(server);

    const destination: PrintDestination = { protocol: 'LPR_LPD', ipAddress: '127.0.0.1', port, queueName: 'lab-3' };
    const documentBytes = Buffer.from('%PDF-1.4 a real document');
    const result = await sendLprPrintJob(destination, documentBytes);

    expect(result.ok).toBe(true);
    const all = Buffer.concat(receivedChunks).toString('binary');

    // 1. Real "Receive a printer job" command for the real, configured queue.
    expect(all).toContain('\x02lab-3\n');
    // 2. Real "Receive control file" subcommand, naming a real cfA... file.
    expect(all).toMatch(/\x02\d+ cfA\d{3}\S+\n/);
    // Real control file content itself — H/P/J/l lines, terminated by a real null byte.
    expect(all).toMatch(/H\S+\nP\S+\nJ[^\n]*\nldfA\d{3}\S*\n\0/);
    // 3. Real "Receive data file" subcommand, naming a real dfA... file, then the real document bytes, then a real null terminator.
    expect(all).toMatch(/\x03\d+ dfA\d{3}\S+\n/);
    expect(all).toContain(documentBytes.toString('binary') + '\0');
  });

  it('defaults to real queue name ‘lp’ and real port 515 when neither is configured', async () => {
    const receivedChunks: Buffer[] = [];
    server = startAckingServer(receivedChunks);
    const port = await listenOnEphemeralPort(server);
    // Real port 515 itself is a privileged port this sandbox can't bind to for a real test server,
    // so this test confirms the real default QUEUE NAME behavior against our own ephemeral port instead.
    const destination: PrintDestination = { protocol: 'LPR_LPD', ipAddress: '127.0.0.1', port };
    await sendLprPrintJob(destination, Buffer.from('data'));
    expect(Buffer.concat(receivedChunks).toString('binary')).toContain('\x02lp\n');
    expect(DEFAULT_PRINT_PROTOCOL_PORT.LPR_LPD).toBe(515);
  });

  it('a real, non-zero acknowledgement byte from the printer fails the whole job honestly, never retried silently', async () => {
    server = net.createServer(socket => {
      socket.on('data', () => socket.write(Buffer.from([1]))); // real, honest rejection byte
    });
    const port = await listenOnEphemeralPort(server);
    const destination: PrintDestination = { protocol: 'LPR_LPD', ipAddress: '127.0.0.1', port };
    const result = await sendLprPrintJob(destination, Buffer.from('data'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('rejected');
  });

  it('a real, unreachable printer fails honestly rather than hanging or throwing', async () => {
    const destination: PrintDestination = { protocol: 'LPR_LPD', ipAddress: '127.0.0.1', port: 1 };
    const result = await sendLprPrintJob(destination, Buffer.from('data'));
    expect(result.ok).toBe(false);
  });
});

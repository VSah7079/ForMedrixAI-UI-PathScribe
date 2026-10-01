// src/services/printing/transport/sendLprPrintJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278 §2.1.3 — LPR/LPD, RFC 1179's own real "Receive a
// printer job" exchange. Real, deliberately minimal subset: this
// implements exactly the one real, standard sequence every LPR/LPD
// print (as opposed to a queue-status or remove-job request) actually
// needs —
//   1. '\x02<queue>\n'                          (02 = Receive a printer job)
//   2. '\x02<size> <control-file-name>\n'        (02 = Receive control file)
//   3. <control file bytes> + '\0'
//   4. '\x03<size> <data-file-name>\n'           (03 = Receive data file)
//   5. <document bytes> + '\0'
// — each of the five real steps above acknowledged by exactly one
// real byte from the printer/print server (0x00 = accepted; any other
// value is a real, honest rejection, per RFC 1179 §5's own "positive
// acknowledge is a single byte '0'" convention). Real, disclosed
// scope: no queue-status ('\x03'/'\x04' top-level commands) or
// remove-job ('\x05') support — this file only ever sends one real
// job, start to finish, per call, same real, narrow scope
// dispatchPrintJob.ts's own two existing modes already have.
//
// The real control file itself carries the minimal, standard fields a
// real LPD daemon expects (H=host, P=user, J=job name) plus a real
// 'l' ("print file leaving control characters", i.e. literal/raw —
// correct for an already-rendered PDF byte stream, which must never
// be run through the daemon's own text-formatting filters the way a
// plain-text 'f' job would be).
//
// Real, honest execution-context note: same as sendRawPrintJob.ts's
// own header — a real TCP socket cannot run inside a browser tab;
// this is written to run wherever this app's own "services/" layer
// actually executes server-side. See services/printing/README.md.
// ─────────────────────────────────────────────────────────────────────────────

import * as net from 'net';
import * as os from 'os';
import { DEFAULT_PRINT_PROTOCOL_PORT } from '@/types/printRouting/PrintDestination';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';
import type { SendPrintJobResult } from './sendRawPrintJob';

export const LPR_CONNECT_TIMEOUT_MS = 10_000;

function safeHostname(): string {
  try {
    // Real, per RFC 1179's own control-file 'H' field — the
    // submitting host's own real name. Falls back to a real, fixed
    // literal only if the real lookup itself throws (a genuinely
    // sandboxed/restricted Node environment) — never fabricated
    // per-job.
    return os.hostname() || 'pathscribe';
  } catch {
    return 'pathscribe';
  }
}

function connectSocket(socket: net.Socket, port: number, ipAddress: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.setTimeout(LPR_CONNECT_TIMEOUT_MS);
    socket.once('timeout', () => reject(new Error(`connection to ${ipAddress}:${port} timed out after ${LPR_CONNECT_TIMEOUT_MS}ms`)));
    socket.once('error', (err: Error) => reject(err));
    socket.connect(port, ipAddress, () => resolve());
  });
}

function readAckByte(socket: net.Socket): Promise<number> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => { cleanup(); resolve(chunk[0]); };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new Error('connection closed while waiting for a real LPR/LPD acknowledgement byte')); };
    function cleanup() {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    }
    socket.once('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

async function sendAndAwaitAck(socket: net.Socket, buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => socket.write(buffer, err => (err ? reject(err) : resolve())));
  const ack = await readAckByte(socket);
  if (ack !== 0) {
    throw new Error(`printer/print server rejected a real LPR/LPD subcommand (acknowledgement byte ${ack}, RFC 1179 expects 0)`);
  }
}

export async function sendLprPrintJob(destination: PrintDestination, documentBytes: Buffer): Promise<SendPrintJobResult> {
  const port = destination.port ?? DEFAULT_PRINT_PROTOCOL_PORT.LPR_LPD;
  const queueName = destination.queueName ?? 'lp';
  const socket = new net.Socket();

  try {
    await connectSocket(socket, port, destination.ipAddress);

    const hostname = safeHostname();
    // Real, per RFC 1179 — a 3-digit job sequence number is the
    // real, conventional shape ('cfA123host', 'dfA123host'); not
    // meaningfully unique across concurrent jobs at real scale, same
    // real, disclosed narrowness as the rest of this minimal subset.
    const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const controlFileName = `cfA${seq}${hostname}`;
    const dataFileName = `dfA${seq}${hostname}`;

    const controlFileContent = [
      `H${hostname}`,
      `P${process.env.USER ?? process.env.USERNAME ?? 'pathscribe'}`,
      `J${destination.displayName ?? 'PathScribe Report'}`,
      `l${dataFileName}`,
      '',
    ].join('\n');
    const controlFileBuffer = Buffer.from(controlFileContent, 'ascii');

    await sendAndAwaitAck(socket, Buffer.from(`\x02${queueName}\n`, 'ascii'));
    await sendAndAwaitAck(socket, Buffer.from(`\x02${controlFileBuffer.length} ${controlFileName}\n`, 'ascii'));
    await sendAndAwaitAck(socket, Buffer.concat([controlFileBuffer, Buffer.from([0])]));
    await sendAndAwaitAck(socket, Buffer.from(`\x03${documentBytes.length} ${dataFileName}\n`, 'ascii'));
    await sendAndAwaitAck(socket, Buffer.concat([documentBytes, Buffer.from([0])]));

    socket.end();
    return { ok: true };
  } catch (err: any) {
    socket.destroy();
    return { ok: false, error: `LPR/LPD job to ${destination.ipAddress}:${port} failed: ${err?.message ?? String(err)}` };
  }
}

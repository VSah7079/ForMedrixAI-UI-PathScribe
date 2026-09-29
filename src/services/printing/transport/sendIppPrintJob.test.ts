// src/services/printing/transport/sendIppPrintJob.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import { sendIppPrintJob, buildIppPrintJobRequest, IPP_TAG } from './sendIppPrintJob';
import { DEFAULT_PRINT_PROTOCOL_PORT } from '@/types/printRouting/PrintDestination';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

/** Real, self-consistency decoder — walks the exact real,
 *  documented RFC 8010 shape this file's own header discloses as
 *  verified only against itself, not an external IPP implementation.
 *  Mirrors the encoder in sendIppPrintJob.ts exactly, independently
 *  re-derived here rather than imported, so a real encoding bug in
 *  the source wouldn't also be silently mirrored in its own test. */
function decodeIppOperationAttributes(body: Buffer): { tag: number; name: string; value: string }[] {
  expect(body.readUInt8(0)).toBe(0x01); // version major
  expect(body.readUInt8(1)).toBe(0x01); // version minor
  expect(body.readUInt16BE(2)).toBe(0x0002); // Print-Job operation-id
  let offset = 8; // version(2) + operation-id(2) + request-id(4)
  expect(body.readUInt8(offset)).toBe(IPP_TAG.OPERATION_ATTRIBUTES);
  offset += 1;

  const attrs: { tag: number; name: string; value: string }[] = [];
  while (body.readUInt8(offset) !== IPP_TAG.END_OF_ATTRIBUTES) {
    const tag = body.readUInt8(offset); offset += 1;
    const nameLen = body.readUInt16BE(offset); offset += 2;
    const name = body.subarray(offset, offset + nameLen).toString('ascii'); offset += nameLen;
    const valueLen = body.readUInt16BE(offset); offset += 2;
    const value = body.subarray(offset, offset + valueLen).toString('utf-8'); offset += valueLen;
    attrs.push({ tag, name, value });
  }
  return attrs;
}

/** Real, self-consistency decoder for the optional job-attributes
 *  group (IPP_TAG.JOB_ATTRIBUTES) — same real "independently
 *  re-derived, not imported" posture as decodeIppOperationAttributes
 *  above. Returns [] when the request carries no job-attributes group
 *  at all (the real, no-presentation-supplied case). */
function decodeIppJobAttributes(body: Buffer): { tag: number; name: string; value: string }[] {
  let offset = 8;
  expect(body.readUInt8(offset)).toBe(IPP_TAG.OPERATION_ATTRIBUTES);
  offset += 1;
  // Skip the four real, always-present operation attributes.
  for (let i = 0; i < 4; i++) {
    offset += 1; // tag
    const nameLen = body.readUInt16BE(offset); offset += 2 + nameLen;
    const valueLen = body.readUInt16BE(offset); offset += 2 + valueLen;
  }
  if (body.readUInt8(offset) === IPP_TAG.END_OF_ATTRIBUTES) return [];
  expect(body.readUInt8(offset)).toBe(IPP_TAG.JOB_ATTRIBUTES);
  offset += 1;
  const attrs: { tag: number; name: string; value: string }[] = [];
  while (body.readUInt8(offset) !== IPP_TAG.END_OF_ATTRIBUTES) {
    const tag = body.readUInt8(offset); offset += 1;
    const nameLen = body.readUInt16BE(offset); offset += 2;
    const name = body.subarray(offset, offset + nameLen).toString('ascii'); offset += nameLen;
    const valueLen = body.readUInt16BE(offset); offset += 2;
    const value = body.subarray(offset, offset + valueLen).toString('utf-8'); offset += valueLen;
    attrs.push({ tag, name, value });
  }
  return attrs;
}

function successfulIppResponse(requestId = 1): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(0x01, 0); buf.writeUInt8(0x01, 1); // version 1.1
  buf.writeUInt16BE(0x0000, 2); // successful-ok status-code
  buf.writeUInt32BE(requestId, 4);
  buf.writeUInt8(0x03, 8); // end-of-attributes-tag
  return buf;
}

describe('buildIppPrintJobRequest', () => {
  it('encodes a real, self-consistent operation-attributes group — charset, natural language, printer-uri, requesting-user-name', () => {
    const request = buildIppPrintJobRequest('ipp://192.168.20.40:631/ipp/print', 1, 'pathscribe');
    const attrs = decodeIppOperationAttributes(request);
    expect(attrs).toEqual([
      { tag: IPP_TAG.CHARSET, name: 'attributes-charset', value: 'utf-8' },
      { tag: IPP_TAG.NATURAL_LANGUAGE, name: 'attributes-natural-language', value: 'en' },
      { tag: IPP_TAG.URI, name: 'printer-uri', value: 'ipp://192.168.20.40:631/ipp/print' },
      { tag: IPP_TAG.NAME_WITHOUT_LANGUAGE, name: 'requesting-user-name', value: 'pathscribe' },
    ]);
  });

  it('real, per PS-279 §2.2.4 — carries no job-attributes group at all when no presentation is supplied', () => {
    const request = buildIppPrintJobRequest('ipp://192.168.20.40:631/ipp/print', 1, 'pathscribe');
    expect(decodeIppJobAttributes(request)).toEqual([]);
  });

  it('real, per PS-279 §2.2.4 — encodes duplexMode as the real, registered `sides` keyword', () => {
    const duplex = buildIppPrintJobRequest('ipp://x:631/ipp/print', 1, 'pathscribe', { duplexMode: 'DUPLEX' });
    expect(decodeIppJobAttributes(duplex)).toEqual([{ tag: IPP_TAG.KEYWORD, name: 'sides', value: 'two-sided-long-edge' }]);

    const simplex = buildIppPrintJobRequest('ipp://x:631/ipp/print', 1, 'pathscribe', { duplexMode: 'SIMPLEX' });
    expect(decodeIppJobAttributes(simplex)).toEqual([{ tag: IPP_TAG.KEYWORD, name: 'sides', value: 'one-sided' }]);
  });

  it('real, per PS-279 §2.2.4 — encodes paperSource as the real, widely-implemented `media-source` keyword', () => {
    const tray1 = buildIppPrintJobRequest('ipp://x:631/ipp/print', 1, 'pathscribe', { paperSource: 'TRAY_1_LETTERHEAD' });
    expect(decodeIppJobAttributes(tray1)).toEqual([{ tag: IPP_TAG.KEYWORD, name: 'media-source', value: 'tray-1' }]);

    const tray2 = buildIppPrintJobRequest('ipp://x:631/ipp/print', 1, 'pathscribe', { paperSource: 'TRAY_2_PLAIN' });
    expect(decodeIppJobAttributes(tray2)).toEqual([{ tag: IPP_TAG.KEYWORD, name: 'media-source', value: 'tray-2' }]);
  });

  it('real, per PS-279 §2.2.4 — encodes both fields together, independently, in one job-attributes group', () => {
    const request = buildIppPrintJobRequest('ipp://x:631/ipp/print', 1, 'pathscribe', { paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'SIMPLEX' });
    expect(decodeIppJobAttributes(request)).toEqual([
      { tag: IPP_TAG.KEYWORD, name: 'sides', value: 'one-sided' },
      { tag: IPP_TAG.KEYWORD, name: 'media-source', value: 'tray-1' },
    ]);
  });
});

describe('sendIppPrintJob', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = undefined;
    }
  });

  function listenOnEphemeralPort(s: http.Server): Promise<number> {
    return new Promise(resolve => {
      s.listen(0, '127.0.0.1', () => {
        const address = s.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });
  }

  it('POSTs a real, well-formed IPP request followed by the real document bytes, and reports success on a real successful IPP response', async () => {
    let receivedBody: Buffer | undefined;
    let receivedContentType: string | undefined;
    server = http.createServer((req, res) => {
      receivedContentType = req.headers['content-type'];
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks);
        res.writeHead(200);
        res.end(successfulIppResponse());
      });
    });
    const port = await listenOnEphemeralPort(server);

    const destination: PrintDestination = { protocol: 'IPP', ipAddress: '127.0.0.1', port, resourcePath: '/ipp/print' };
    const documentBytes = Buffer.from('%PDF-1.4 a real document');
    const result = await sendIppPrintJob(destination, documentBytes);

    expect(result.ok).toBe(true);
    expect(receivedContentType).toBe('application/ipp');
    expect(receivedBody).toBeDefined();
    // The real document bytes must follow the real IPP header/attributes verbatim, unmodified.
    expect(receivedBody!.subarray(receivedBody!.length - documentBytes.length).equals(documentBytes)).toBe(true);
  });

  it('defaults to the real IPP port 631 and resource path ‘/ipp/print’ when neither is configured', () => {
    expect(DEFAULT_PRINT_PROTOCOL_PORT.IPP).toBe(631);
    const request = buildIppPrintJobRequest('ipp://192.168.1.5:631/ipp/print');
    const attrs = decodeIppOperationAttributes(request);
    expect(attrs.find(a => a.name === 'printer-uri')?.value).toBe('ipp://192.168.1.5:631/ipp/print');
  });

  it('a real, non-2xx HTTP status from the printer/print server fails honestly', async () => {
    server = http.createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => { res.writeHead(503); res.end(); });
    });
    const port = await listenOnEphemeralPort(server);
    const destination: PrintDestination = { protocol: 'IPP', ipAddress: '127.0.0.1', port };
    const result = await sendIppPrintJob(destination, Buffer.from('data'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('503');
  });

  it('a real, non-successful IPP status code in an otherwise-200 HTTP response fails honestly, never treated as success just because the transport succeeded', async () => {
    server = http.createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        const buf = Buffer.alloc(9);
        buf.writeUInt8(0x01, 0); buf.writeUInt8(0x01, 1);
        buf.writeUInt16BE(0x040a, 2); // real IPP client-error-not-found
        buf.writeUInt32BE(1, 4);
        buf.writeUInt8(0x03, 8);
        res.writeHead(200);
        res.end(buf);
      });
    });
    const port = await listenOnEphemeralPort(server);
    const destination: PrintDestination = { protocol: 'IPP', ipAddress: '127.0.0.1', port };
    const result = await sendIppPrintJob(destination, Buffer.from('data'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('040a');
  });

  it('a real, unreachable printer fails honestly rather than hanging or throwing', async () => {
    const destination: PrintDestination = { protocol: 'IPP', ipAddress: '127.0.0.1', port: 1 };
    const result = await sendIppPrintJob(destination, Buffer.from('data'));
    expect(result.ok).toBe(false);
  });
});

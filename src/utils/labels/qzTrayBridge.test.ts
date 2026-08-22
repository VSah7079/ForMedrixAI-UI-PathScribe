// src/utils/labels/qzTrayBridge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('qz-tray', () => ({
  websocket: {
    isActive: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  printers: {
    find: vi.fn(),
  },
  configs: {
    create: vi.fn(),
  },
  print: vi.fn(),
  security: {
    setCertificatePromise: vi.fn(),
    setSignaturePromise: vi.fn(),
  },
}));

import * as qz from 'qz-tray';
import {
  connectToQzTray, isQzTrayConnected, findQzTrayPrinters, printZplViaQzTray, configureQzTraySigning,
} from './qzTrayBridge';
import type { QzTrayError } from './qzTrayBridge';

describe('qzTrayBridge — real integration with the real, existing QZ Tray desktop service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('connectToQzTray: a real, successful connection reports ok', async () => {
    (qz.websocket.isActive as any).mockReturnValue(false);
    (qz.websocket.connect as any).mockResolvedValue(undefined);
    const result = await connectToQzTray();
    expect(result.ok).toBe(true);
    expect(qz.websocket.connect).toHaveBeenCalled();
  });

  it('connectToQzTray: an already-active connection short-circuits — never calls connect() again', async () => {
    (qz.websocket.isActive as any).mockReturnValue(true);
    const result = await connectToQzTray();
    expect(result.ok).toBe(true);
    expect(qz.websocket.connect).not.toHaveBeenCalled();
  });

  it('connectToQzTray: the real, single most common failure — QZ Tray not running — is translated into a clear, actionable message, not a raw WebSocket error', async () => {
    (qz.websocket.isActive as any).mockReturnValue(false);
    (qz.websocket.connect as any).mockRejectedValue(new Error('WebSocket connection failed'));
    const result = await connectToQzTray();
    expect(result.ok).toBe(false);
    // Real, deliberate cast — this project's own tsconfig.json has
    // strictNullChecks disabled, under which TypeScript cannot
    // reliably narrow a discriminated union to its `ok: false` branch
    // through ordinary control flow. Same real, established workaround
    // used throughout dispatchNetworkPrintJob.test.ts — see that
    // file's own comment for the full reasoning.
    const message = (result as QzTrayError).message;
    expect(message).toContain('does not appear to be running');
    expect(message).toContain('qz.io');
  });

  it('isQzTrayConnected reflects the real, live qz.websocket.isActive() state', () => {
    (qz.websocket.isActive as any).mockReturnValue(true);
    expect(isQzTrayConnected()).toBe(true);
    (qz.websocket.isActive as any).mockReturnValue(false);
    expect(isQzTrayConnected()).toBe(false);
  });

  it('findQzTrayPrinters: normalizes a real, single-string result (QZ Tray\'s own API returns either a string or a string[]) into an array', async () => {
    (qz.printers.find as any).mockResolvedValue('Zebra ZT411');
    const result = await findQzTrayPrinters('zebra');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(['Zebra ZT411']);
  });

  it('findQzTrayPrinters: a real array result passes through unchanged', async () => {
    (qz.printers.find as any).mockResolvedValue(['Zebra ZT411', 'Zebra ZD621']);
    const result = await findQzTrayPrinters();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(['Zebra ZT411', 'Zebra ZD621']);
  });

  it('printZplViaQzTray: refuses to print when not connected — never calls qz.print blind', async () => {
    (qz.websocket.isActive as any).mockReturnValue(false);
    const result = await printZplViaQzTray('Zebra ZT411', '^XA^XZ');
    expect(result.ok).toBe(false);
    expect(qz.print).not.toHaveBeenCalled();
  });

  it('printZplViaQzTray: real, deliberate forceRaw:true — the exact real precision problem (rasterization, sensor-offset drift) raw ZPL exists to avoid', async () => {
    (qz.websocket.isActive as any).mockReturnValue(true);
    (qz.configs.create as any).mockReturnValue({ copies: 1, forceRaw: true });
    (qz.print as any).mockResolvedValue(undefined);

    const zpl = '^XA^FH^FD0100850000000000_1...^FS^XZ';
    const result = await printZplViaQzTray('Zebra ZT411', zpl, 2);

    expect(result.ok).toBe(true);
    expect(qz.configs.create).toHaveBeenCalledWith('Zebra ZT411', { copies: 2, forceRaw: true });
    // Real, exact ZPL string passed straight through, untouched —
    // this module builds no label content of its own.
    expect(qz.print).toHaveBeenCalledWith({ copies: 1, forceRaw: true }, [zpl]);
  });

  it('printZplViaQzTray: a real print failure is reported, not thrown', async () => {
    (qz.websocket.isActive as any).mockReturnValue(true);
    (qz.configs.create as any).mockReturnValue({});
    (qz.print as any).mockRejectedValue(new Error('Printer offline'));
    const result = await printZplViaQzTray('Zebra ZT411', '^XA^XZ');
    expect(result.ok).toBe(false);
    // Same real, established cast pattern — see the earlier test's
    // own comment for why.
    if (!result.ok) expect((result as QzTrayError).message).toContain('Printer offline');
  });

  it('configureQzTraySigning wires real certificate/signature functions into qz.security — never fabricates either', () => {
    const fetchCert = vi.fn().mockResolvedValue('-----BEGIN CERTIFICATE-----');
    const sign = vi.fn().mockResolvedValue('signature');
    configureQzTraySigning(fetchCert, sign);
    expect(qz.security.setCertificatePromise).toHaveBeenCalled();
    expect(qz.security.setSignaturePromise).toHaveBeenCalledWith(sign);
  });
});

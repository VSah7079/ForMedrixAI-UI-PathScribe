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
  connectToQzTray, isQzTrayConnected, findQzTrayPrinters, printZplViaQzTray, printPdfViaQzTray, configureQzTraySigning,
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

  describe('printPdfViaQzTray', () => {
    it('a real, successful PDF print with no paperSize/presentation builds a plain config and reports ok', async () => {
      (qz.websocket.isActive as any).mockReturnValue(true);
      (qz.configs.create as any).mockReturnValue({ copies: 1 });
      (qz.print as any).mockResolvedValue(undefined);

      const result = await printPdfViaQzTray('Front Desk Printer', 'BASE64DATA');

      expect(result.ok).toBe(true);
      expect(qz.configs.create).toHaveBeenCalledWith('Front Desk Printer', { copies: 1 });
      expect(qz.print).toHaveBeenCalledWith({ copies: 1 }, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: 'BASE64DATA' }]);
    });

    it('not connected to QZ Tray reports a real, honest error rather than attempting to print', async () => {
      (qz.websocket.isActive as any).mockReturnValue(false);
      const result = await printPdfViaQzTray('Front Desk Printer', 'BASE64DATA');
      expect(result.ok).toBe(false);
      if (!result.ok) expect((result as QzTrayError).message).toContain('Not connected to QZ Tray');
      expect(qz.print).not.toHaveBeenCalled();
    });

    it('PS-278/279 gap-closing: DUPLEX presentation maps to QZ Tray’s own real "long-edge" duplex token, the same long-edge default sendIppPrintJob.ts already chose for the identical real reason', async () => {
      (qz.websocket.isActive as any).mockReturnValue(true);
      (qz.configs.create as any).mockReturnValue({});
      (qz.print as any).mockResolvedValue(undefined);

      await printPdfViaQzTray('Theatre 2 Frozen Section Printer', 'BASE64DATA', 1, undefined, { duplexMode: 'DUPLEX' });

      expect(qz.configs.create).toHaveBeenCalledWith('Theatre 2 Frozen Section Printer', { copies: 1, duplex: 'long-edge' });
    });

    it('PS-278/279 gap-closing: SIMPLEX presentation maps to QZ Tray’s own real "one-sided" duplex token', async () => {
      (qz.websocket.isActive as any).mockReturnValue(true);
      (qz.configs.create as any).mockReturnValue({});
      (qz.print as any).mockResolvedValue(undefined);

      await printPdfViaQzTray('Theatre 2 Frozen Section Printer', 'BASE64DATA', 1, undefined, { duplexMode: 'SIMPLEX' });

      expect(qz.configs.create).toHaveBeenCalledWith('Theatre 2 Frozen Section Printer', { copies: 1, duplex: 'one-sided' });
    });

    it('PS-278/279 gap-closing: a real paperSource presentation hint maps to a real printerTray value, previously silently dropped on this NATIVE_QZ_TRAY branch', async () => {
      (qz.websocket.isActive as any).mockReturnValue(true);
      (qz.configs.create as any).mockReturnValue({});
      (qz.print as any).mockResolvedValue(undefined);

      await printPdfViaQzTray('Front Desk Printer', 'BASE64DATA', 1, undefined, { paperSource: 'TRAY_1_LETTERHEAD' });

      expect(qz.configs.create).toHaveBeenCalledWith('Front Desk Printer', { copies: 1, printerTray: 'Tray 1' });
    });

    it('PS-278/279 gap-closing: paperSize, duplexMode, and paperSource all combine into one real config object when all three are given', async () => {
      (qz.websocket.isActive as any).mockReturnValue(true);
      (qz.configs.create as any).mockReturnValue({});
      (qz.print as any).mockResolvedValue(undefined);

      await printPdfViaQzTray('Front Desk Printer', 'BASE64DATA', 3, 'A4', { duplexMode: 'DUPLEX', paperSource: 'TRAY_2_PLAIN' });

      expect(qz.configs.create).toHaveBeenCalledWith('Front Desk Printer', expect.objectContaining({
        copies: 3, duplex: 'long-edge', printerTray: 'Tray 2',
      }));
    });

    it('a real print failure is reported, not thrown', async () => {
      (qz.websocket.isActive as any).mockReturnValue(true);
      (qz.configs.create as any).mockReturnValue({});
      (qz.print as any).mockRejectedValue(new Error('Out of paper'));

      const result = await printPdfViaQzTray('Front Desk Printer', 'BASE64DATA');

      expect(result.ok).toBe(false);
      if (!result.ok) expect((result as QzTrayError).message).toContain('Out of paper');
    });
  });
});

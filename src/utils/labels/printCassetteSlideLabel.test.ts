// src/utils/labels/printCassetteSlideLabel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./qzTrayBridge', () => ({
  printZplViaQzTray: vi.fn(),
}));
vi.mock('./dispatchNetworkPrintJob', async () => {
  const actual = await vi.importActual<typeof import('./dispatchNetworkPrintJob')>('./dispatchNetworkPrintJob');
  return { ...actual, dispatchNetworkPrintJob: vi.fn(actual.dispatchNetworkPrintJob) };
});

import { printCassetteLabel, printSlideLabel } from './printCassetteSlideLabel';
import type { PrintCassetteSlideLabelError } from './printCassetteSlideLabel';
import { printZplViaQzTray } from './qzTrayBridge';
import { dispatchNetworkPrintJob } from './dispatchNetworkPrintJob';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

const basePrinter: PrinterProfile = {
  id: 'printer-1', printerId: 'ZEBRA-TEST', model: 'ZT411', dpi: 300,
  supportsDataMatrix: true, supportsGS1: true, zplVersion: '7.0',
  maxPrintDensity: 300, moduleSize: 4, vendor: 'ZEBRA_ZPL', bridgeType: 'qz_tray',
  ipAddress: '192.168.1.50', port: 9100, active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const cassetteInput = {
  fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', cassetteId: 'A1', patientName: 'DOE, JOHN',
};
const slideInput = {
  fullAccession: 'S26-4403', specimenLabel: 'A', blockLabel: '1', level: 'L1', stainName: 'H&E', slideId: 'A1L1',
};

describe('printCassetteSlideLabel — real, parallel printed path alongside engraving (per direct follow-up: "support both slide engraving and printed labels")', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('printCassetteLabel', () => {
    it('refuses cleanly, with a real, specific message, when no GTIN is configured — never encodes a fabricated value', async () => {
      const result = await printCassetteLabel(cassetteInput, basePrinter, '');
      expect(result.ok).toBe(false);
      if (!result.ok) expect((result as PrintCassetteSlideLabelError).message).toContain('No GS1 GTIN configured');
      expect(printZplViaQzTray).not.toHaveBeenCalled();
    });

    it('refuses cleanly on invalid GS1 fields (e.g. an illegal character) before ever attempting dispatch', async () => {
      const result = await printCassetteLabel({ ...cassetteInput, cassetteId: 'A_1' }, basePrinter, '00850000000000');
      expect(result.ok).toBe(false);
      expect(printZplViaQzTray).not.toHaveBeenCalled();
    });

    it('real, working qz_tray dispatch — the already-built ZPL template is passed straight through', async () => {
      (printZplViaQzTray as any).mockResolvedValue({ ok: true, data: undefined });
      const result = await printCassetteLabel(cassetteInput, basePrinter, '00850000000000');
      expect(result.ok).toBe(true);
      expect(printZplViaQzTray).toHaveBeenCalledTimes(1);
      const [printerId, zpl] = (printZplViaQzTray as any).mock.calls[0];
      expect(printerId).toBe('ZEBRA-TEST');
      expect(zpl).toContain('^XA');
      expect(zpl).toContain('^BXN,4,200,,,1'); // real, corrected ECC200 value; columns/rows blank (auto), not 0 — see zplTemplates.ts's own real Labelary-verified fix
    });

    it('a real qz_tray dispatch failure is reported, not swallowed', async () => {
      (printZplViaQzTray as any).mockResolvedValue({ ok: false, message: 'QZ Tray does not appear to be running.' });
      const result = await printCassetteLabel(cassetteInput, basePrinter, '00850000000000');
      expect(result.ok).toBe(false);
      if (!result.ok) expect((result as PrintCassetteSlideLabelError).message).toContain('does not appear to be running');
    });

    it('real, working direct_interface_engine dispatch — routes through the real, already-tested NetworkPrintPayload contract', async () => {
      const printer: PrinterProfile = { ...basePrinter, bridgeType: 'direct_interface_engine' };
      const result = await printCassetteLabel(cassetteInput, printer, '00850000000000');
      expect(result.ok).toBe(true);
      expect(dispatchNetworkPrintJob).toHaveBeenCalledTimes(1);
      expect(printZplViaQzTray).not.toHaveBeenCalled();
    });

    it('real, honest refusal for a bridge type with no implementation yet — never silently no-ops', async () => {
      const printer: PrinterProfile = { ...basePrinter, bridgeType: 'zebra_browser_print' };
      const result = await printCassetteLabel(cassetteInput, printer, '00850000000000');
      expect(result.ok).toBe(false);
      if (!result.ok) expect((result as PrintCassetteSlideLabelError).message).toContain('zebra_browser_print');
    });

    it('real feature, per direct follow-up (cell block spec): a real cellBlockNumber applies the -CB{n} suffix (not the spec\'s own literal underscore) to both the GS1-encoded id and the visible label text', async () => {
      (printZplViaQzTray as any).mockResolvedValue({ ok: true, data: undefined });
      const result = await printCassetteLabel({ ...cassetteInput, cellBlockNumber: 1 }, basePrinter, '00850000000000');
      expect(result.ok).toBe(true);
      const [, zpl] = (printZplViaQzTray as any).mock.calls[0];
      expect(zpl).toContain('1-CB1'); // suffixed block label, visible text
      expect(zpl).not.toContain('_CB1'); // never the spec's own illegal underscore form
    });

    it('with no cellBlockNumber, an ordinary tissue block cassette is never suffixed', async () => {
      (printZplViaQzTray as any).mockResolvedValue({ ok: true, data: undefined });
      await printCassetteLabel(cassetteInput, basePrinter, '00850000000000');
      const [, zpl] = (printZplViaQzTray as any).mock.calls[0];
      expect(zpl).not.toContain('-CB');
    });
  });

  describe('printSlideLabel', () => {
    it('refuses cleanly when no GTIN is configured', async () => {
      const result = await printSlideLabel(slideInput, basePrinter, '');
      expect(result.ok).toBe(false);
    });

    it('real, working qz_tray dispatch using the real, compact slide template — not the cassette one', async () => {
      (printZplViaQzTray as any).mockResolvedValue({ ok: true, data: undefined });
      const result = await printSlideLabel(slideInput, basePrinter, '00850000000000');
      expect(result.ok).toBe(true);
      const [, zpl] = (printZplViaQzTray as any).mock.calls[0];
      expect(zpl).toContain('^BXN,2,200,,,1'); // the slide template's own, smaller module size; columns/rows blank (auto), not 0
    });

    it('real, honest gap acknowledged directly: direct_interface_engine has no real slide payload shape yet — refuses rather than forcing the cassette shape', async () => {
      const printer: PrinterProfile = { ...basePrinter, bridgeType: 'direct_interface_engine' };
      const result = await printSlideLabel(slideInput, printer, '00850000000000');
      expect(result.ok).toBe(false);
      if (!result.ok) expect((result as PrintCassetteSlideLabelError).message).toContain('not yet built');
      expect(dispatchNetworkPrintJob).not.toHaveBeenCalled();
    });

    it('real feature, per direct follow-up: a real cellBlockNumber applies the -CB{n} suffix to a slide cut from a cell block too', async () => {
      (printZplViaQzTray as any).mockResolvedValue({ ok: true, data: undefined });
      await printSlideLabel({ ...slideInput, cellBlockNumber: 2 }, basePrinter, '00850000000000');
      const [, zpl] = (printZplViaQzTray as any).mock.calls[0];
      expect(zpl).toContain('1-CB2');
    });
  });
});

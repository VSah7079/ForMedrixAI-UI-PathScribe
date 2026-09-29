// src/services/printing/attemptPrintDelivery.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockPrintQueueService', () => ({
  mockPrintQueueService: { markFailed: vi.fn(), markPrinted: vi.fn() },
}));
vi.mock('@/utils/labels/qzTrayBridge', () => ({
  printPdfViaQzTray: vi.fn(),
  isQzTrayConnected: vi.fn(),
}));
vi.mock('../interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn(),
}));
vi.mock('./transport/dispatchViaPrintProtocol', () => ({
  dispatchViaPrintProtocol: vi.fn(),
}));

import { mockPrintQueueService } from './mockPrintQueueService';
import { printPdfViaQzTray, isQzTrayConnected } from '@/utils/labels/qzTrayBridge';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchViaPrintProtocol } from './transport/dispatchViaPrintProtocol';
import { attemptPrintDelivery } from './attemptPrintDelivery';

const baseInput = {
  jobId: 'job-1', caseId: 'CASE-1', reportType: 'FINAL' as const, priority: 'Routine' as const, pdfBase64: 'BASE64DATA',
};

beforeEach(() => {
  vi.mocked(mockPrintQueueService.markFailed).mockReset().mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(mockPrintQueueService.markPrinted).mockReset().mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(printPdfViaQzTray).mockReset();
  vi.mocked(isQzTrayConnected).mockReset().mockReturnValue(true);
  vi.mocked(dispatchInterfaceMessage).mockReset().mockResolvedValue({ ok: true } as any);
  vi.mocked(dispatchViaPrintProtocol).mockReset().mockResolvedValue({ ok: true } as any);
});

describe('attemptPrintDelivery — real, per PS-279 extraction out of dispatchPrintJob.ts', () => {
  describe('NATIVE_QZ_TRAY', () => {
    it('dispatches successfully and marks the real job printed', async () => {
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'NATIVE_QZ_TRAY', printerName: 'Front-Desk' });
      expect(result.outcome).toBe('dispatched');
      expect(printPdfViaQzTray).toHaveBeenCalledWith('Front-Desk', 'BASE64DATA', 1, undefined, undefined);
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
    });

    it('PS-278/279 gap-closing: forwards presentation (paper source/duplex) through to printPdfViaQzTray, previously silently dropped on this branch', async () => {
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
      const presentation = { paperSource: 'TRAY_1_LETTERHEAD' as const, duplexMode: 'DUPLEX' as const };
      await attemptPrintDelivery({ ...baseInput, mode: 'NATIVE_QZ_TRAY', printerName: 'Front-Desk', presentation });
      expect(printPdfViaQzTray).toHaveBeenCalledWith('Front-Desk', 'BASE64DATA', 1, undefined, presentation);
    });

    it('no printerName fails honestly, maxRetriesExceeded true', async () => {
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'NATIVE_QZ_TRAY' });
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED', maxRetriesExceeded: true }));
    });

    it('QZ Tray disconnected fails with PRINTER_OFFLINE, never even attempts the real print call', async () => {
      vi.mocked(isQzTrayConnected).mockReturnValue(false);
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'NATIVE_QZ_TRAY', printerName: 'Front-Desk' });
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_OFFLINE' }));
      expect(printPdfViaQzTray).not.toHaveBeenCalled();
    });

    it('a real print failure fails with PRINTER_UNREACHABLE, retriable', async () => {
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: false, message: 'jammed' } as any);
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'NATIVE_QZ_TRAY', printerName: 'Front-Desk' });
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_UNREACHABLE', errorMessage: 'jammed', maxRetriesExceeded: false }));
    });
  });

  describe('DIRECT_NETWORK_PRINT', () => {
    const destination = { protocol: 'RAW_9100' as const, ipAddress: '192.168.1.9' };

    it('dispatches via dispatchViaPrintProtocol with the real, decoded PDF bytes and any real presentation options', async () => {
      const presentation = { paperSource: 'TRAY_1_LETTERHEAD' as const, duplexMode: 'DUPLEX' as const };
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'DIRECT_NETWORK_PRINT', destination, presentation });
      expect(result.outcome).toBe('dispatched');
      expect(dispatchViaPrintProtocol).toHaveBeenCalledWith(destination, Buffer.from('BASE64DATA', 'base64'), presentation);
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
    });

    it('no real destination at all fails honestly, maxRetriesExceeded true', async () => {
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'DIRECT_NETWORK_PRINT' });
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED', maxRetriesExceeded: true }));
      expect(dispatchViaPrintProtocol).not.toHaveBeenCalled();
    });

    it('a real transport failure fails with PRINTER_UNREACHABLE, retriable', async () => {
      vi.mocked(dispatchViaPrintProtocol).mockResolvedValue({ ok: false, error: 'connection refused' });
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'DIRECT_NETWORK_PRINT', destination });
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_UNREACHABLE', errorMessage: 'connection refused' }));
    });
  });

  describe('INTERFACE_ENGINE_HANDOFF', () => {
    it('dispatches via dispatchInterfaceMessage with a real PRINT_JOB transaction type', async () => {
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'INTERFACE_ENGINE_HANDOFF', priority: 'Urgent' });
      expect(result.outcome).toBe('dispatched');
      expect(dispatchInterfaceMessage).toHaveBeenCalledWith('job-1', 'PRINT_JOB', expect.objectContaining({ caseId: 'CASE-1', reportType: 'FINAL', priority: 'Urgent', pdfBase64: 'BASE64DATA' }));
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
    });

    it('a real hand-off failure fails with PRINTER_UNREACHABLE, never thrown', async () => {
      vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'Interface Engine unreachable' } as any);
      const result = await attemptPrintDelivery({ ...baseInput, mode: 'INTERFACE_ENGINE_HANDOFF' });
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_UNREACHABLE' }));
    });
  });
});

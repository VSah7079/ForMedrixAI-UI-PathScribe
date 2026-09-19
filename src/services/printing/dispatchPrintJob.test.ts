// src/services/printing/dispatchPrintJob.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  facilityService: { getById: vi.fn() },
}));
vi.mock('./mockPrintQueueService', () => ({
  mockPrintQueueService: { enqueue: vi.fn(), markFailed: vi.fn(), markPrinted: vi.fn() },
}));
vi.mock('@/utils/labels/qzTrayBridge', () => ({
  printPdfViaQzTray: vi.fn(),
  isQzTrayConnected: vi.fn(),
}));
vi.mock('../interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn(),
}));

import { facilityService } from '../index';
import { mockPrintQueueService } from './mockPrintQueueService';
import { printPdfViaQzTray, isQzTrayConnected } from '@/utils/labels/qzTrayBridge';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchPrintJob } from './dispatchPrintJob';

const nativeConfig = { enabled: true, mode: 'NATIVE_QZ_TRAY' as const, printerName: 'Front-Desk-Printer' };
const handoffConfig = { enabled: true, mode: 'INTERFACE_ENGINE_HANDOFF' as const };
const okPdf = async () => ({ pdfBase64: 'BASE64DATA' });

beforeEach(() => {
  vi.mocked(facilityService.getById).mockReset();
  vi.mocked(mockPrintQueueService.enqueue).mockReset();
  vi.mocked(mockPrintQueueService.enqueue).mockResolvedValue({ ok: true, data: { id: 'job-1' } } as any);
  vi.mocked(mockPrintQueueService.markFailed).mockReset();
  vi.mocked(mockPrintQueueService.markFailed).mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(mockPrintQueueService.markPrinted).mockReset();
  vi.mocked(mockPrintQueueService.markPrinted).mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(printPdfViaQzTray).mockReset();
  vi.mocked(isQzTrayConnected).mockReset();
  vi.mocked(isQzTrayConnected).mockReturnValue(true);
  vi.mocked(dispatchInterfaceMessage).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: true } as any);
});

describe('dispatchPrintJob', () => {
  it('no performingFacilityId at all is a real, honest not_configured \u2014 never queues a job with nowhere to resolve config from', async () => {
    const result = await dispatchPrintJob('CASE-1', undefined, 'FINAL', 'Routine', okPdf);
    expect(result.outcome).toBe('not_configured');
    expect(mockPrintQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('a real facility with no printDeliveryConfig at all is not_configured \u2014 a site that never opted in never gets a surprise print job', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: {} } as any);
    const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
    expect(result.outcome).toBe('not_configured');
  });

  it('a real facility with printDeliveryConfig.enabled: false is not_configured', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: { ...nativeConfig, enabled: false } } } as any);
    const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
    expect(result.outcome).toBe('not_configured');
  });

  it('no real generatePdf callback at all fails honestly (PRINT_REJECTED) rather than queuing a job with nothing to ever print', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
    const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', undefined);
    expect(result.outcome).toBe('failed');
    expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED' }));
  });

  it('a real generatePdf callback that returns no pdfBase64 fails honestly, carrying the real generationError through', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
    const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', async () => ({ generationError: 'real rendering failure' }));
    expect(result.outcome).toBe('failed');
    expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorMessage: 'real rendering failure' }));
  });

  describe('Mode 1 \u2014 NATIVE_QZ_TRAY', () => {
    it('no printerName configured fails honestly (PRINT_REJECTED), maxRetriesExceeded \u2014 retrying without a printer would never help', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: { enabled: true, mode: 'NATIVE_QZ_TRAY' } } } as any);
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED', maxRetriesExceeded: true }));
    });

    it('QZ Tray genuinely not connected fails with PRINTER_OFFLINE, per the source spec\u2019s own Use Case 2 \u2014 held for real, manual retry, not thrown', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
      vi.mocked(isQzTrayConnected).mockReturnValue(false);
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_OFFLINE', maxRetriesExceeded: false }));
      expect(printPdfViaQzTray).not.toHaveBeenCalled();
    });

    it('a real, successful QZ Tray print dispatches and marks the real job printed', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('dispatched');
      expect(printPdfViaQzTray).toHaveBeenCalledWith('Front-Desk-Printer', 'BASE64DATA', 1, undefined);
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
    });

    it('a real, configured A4 paper size (per direct follow-up \u2014 "UK uses A4") is forwarded through to the real QZ Tray print call, and recorded on the real job', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: { ...nativeConfig, paperSize: 'A4' } } } as any);
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
      await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(printPdfViaQzTray).toHaveBeenCalledWith('Front-Desk-Printer', 'BASE64DATA', 1, 'A4');
      expect(mockPrintQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ paperSize: 'A4' }));
    });

    it('a real QZ Tray print failure fails with PRINTER_UNREACHABLE, real retry still possible (maxRetriesExceeded: false)', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: false, message: 'Printer jammed' } as any);
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_UNREACHABLE', errorMessage: 'Printer jammed', maxRetriesExceeded: false }));
    });
  });

  describe('Mode 2 \u2014 INTERFACE_ENGINE_HANDOFF', () => {
    it('a real, successful hand-off dispatches via the real, generic dispatchInterfaceMessage with a real PRINT_JOB transaction type', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: handoffConfig } } as any);
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Urgent', okPdf);
      expect(result.outcome).toBe('dispatched');
      expect(dispatchInterfaceMessage).toHaveBeenCalledWith('job-1', 'PRINT_JOB', expect.objectContaining({ caseId: 'CASE-1', reportType: 'FINAL', priority: 'Urgent', pdfBase64: 'BASE64DATA' }));
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
      expect(printPdfViaQzTray).not.toHaveBeenCalled();
    });

    it('a real hand-off failure fails with PRINTER_UNREACHABLE, never thrown back to the caller', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: handoffConfig } } as any);
      vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'Interface Engine unreachable' } as any);
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_UNREACHABLE' }));
    });
  });
});

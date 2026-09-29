// src/services/printing/dispatchPrintJob.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  facilityService: { getById: vi.fn() },
}));
vi.mock('./mockPrintQueueService', () => ({
  mockPrintQueueService: { enqueue: vi.fn(), markFailed: vi.fn(), markPrinted: vi.fn(), persistRenderedPdf: vi.fn() },
}));
vi.mock('@/utils/labels/qzTrayBridge', () => ({
  printPdfViaQzTray: vi.fn(),
  isQzTrayConnected: vi.fn(),
}));
vi.mock('../interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn(),
}));
vi.mock('../printRouting/mockPrintRoutingRuleService', () => ({
  mockPrintRoutingRuleService: { getActive: vi.fn() },
}));
vi.mock('../printRouting/resolveRealPrintRoutingContext', () => ({
  resolveRealPrintRoutingContext: vi.fn(),
}));
vi.mock('./transport/dispatchViaPrintProtocol', () => ({
  dispatchViaPrintProtocol: vi.fn(),
}));

// Real, deliberate: resolvePrintPresentationOptions and
// attemptPrintDelivery are NOT mocked here — both are pure/thin
// real functions whose own dependencies are already fully mocked
// above (mockPrintQueueService, qzTrayBridge, dispatchInterfaceMessage,
// dispatchViaPrintProtocol), so letting them run for real here
// exercises the exact same real integration path this file's tests
// verified before the PS-279 extraction, without a second, redundant
// mock of logic already covered by resolvePrintPresentationOptions.test.ts
// and attemptPrintDelivery.test.ts in isolation.

import { facilityService } from '../index';
import { mockPrintQueueService } from './mockPrintQueueService';
import { printPdfViaQzTray, isQzTrayConnected } from '@/utils/labels/qzTrayBridge';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { mockPrintRoutingRuleService } from '../printRouting/mockPrintRoutingRuleService';
import { resolveRealPrintRoutingContext } from '../printRouting/resolveRealPrintRoutingContext';
import { dispatchViaPrintProtocol } from './transport/dispatchViaPrintProtocol';
import { dispatchPrintJob } from './dispatchPrintJob';

const nativeConfig = { enabled: true, mode: 'NATIVE_QZ_TRAY' as const, printerName: 'Front-Desk-Printer' };
const handoffConfig = { enabled: true, mode: 'INTERFACE_ENGINE_HANDOFF' as const };
const okPdf = async () => ({ pdfBase64: 'BASE64DATA' });
// Real, per resolvePrintPresentationOptions.ts's own FINAL default —
// what every test below gets unless it overrides the ordering
// facility's own printPresentationPreference.
const finalDefaultPresentation = { paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'DUPLEX' };

beforeEach(() => {
  vi.mocked(facilityService.getById).mockReset();
  vi.mocked(mockPrintQueueService.enqueue).mockReset();
  vi.mocked(mockPrintQueueService.enqueue).mockResolvedValue({ ok: true, data: { id: 'job-1' } } as any);
  vi.mocked(mockPrintQueueService.markFailed).mockReset();
  vi.mocked(mockPrintQueueService.markFailed).mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(mockPrintQueueService.markPrinted).mockReset();
  vi.mocked(mockPrintQueueService.markPrinted).mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(mockPrintQueueService.persistRenderedPdf).mockReset();
  vi.mocked(mockPrintQueueService.persistRenderedPdf).mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(printPdfViaQzTray).mockReset();
  vi.mocked(isQzTrayConnected).mockReset();
  vi.mocked(isQzTrayConnected).mockReturnValue(true);
  vi.mocked(dispatchInterfaceMessage).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: true } as any);
  vi.mocked(mockPrintRoutingRuleService.getActive).mockReset();
  vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({ ok: true, data: [] } as any);
  vi.mocked(resolveRealPrintRoutingContext).mockReset();
  vi.mocked(resolveRealPrintRoutingContext).mockResolvedValue({ facilityId: 'FAC-A' } as any);
  vi.mocked(dispatchViaPrintProtocol).mockReset();
  vi.mocked(dispatchViaPrintProtocol).mockResolvedValue({ ok: true } as any);
});

describe('dispatchPrintJob', () => {
  it('no performingFacilityId at all is a real, honest not_configured — never queues a job with nowhere to resolve config from', async () => {
    const result = await dispatchPrintJob('CASE-1', undefined, 'FINAL', 'Routine', okPdf);
    expect(result.outcome).toBe('not_configured');
    expect(mockPrintQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('a real facility with no printDeliveryConfig at all is not_configured — a site that never opted in never gets a surprise print job', async () => {
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
    expect(mockPrintQueueService.persistRenderedPdf).not.toHaveBeenCalled();
  });

  it('a real generatePdf callback that returns no pdfBase64 fails honestly, carrying the real generationError through', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
    const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', async () => ({ generationError: 'real rendering failure' }));
    expect(result.outcome).toBe('failed');
    expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorMessage: 'real rendering failure' }));
  });

  it('real, per PS-279 — a successful dispatch persists the rendered PDF onto the job record before attempting delivery', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
    vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
    await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
    expect(mockPrintQueueService.persistRenderedPdf).toHaveBeenCalledWith('job-1', 'BASE64DATA');
  });

  it('real, per PS-279 — orderingFacilityId/pointOfCare/source/paperSource/duplexMode are wired onto the real enqueue() call, regardless of delivery mode', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: nativeConfig } } as any);
    vi.mocked(resolveRealPrintRoutingContext).mockResolvedValue({ facilityId: 'FAC-A', orderingFacilityId: 'CLIENT-A', pointOfCare: 'Theatre 2' } as any);
    vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
    await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf, { source: 'SURGPATH' });
    expect(mockPrintQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      source: 'SURGPATH', orderingFacilityId: 'CLIENT-A', pointOfCare: 'Theatre 2',
      paperSource: finalDefaultPresentation.paperSource, duplexMode: finalDefaultPresentation.duplexMode,
    }));
  });

  it('real, per PS-279 §2.2.4 — resolves the ORDERING facility’s own printPresentationPreference via a second, real facilityService.getById call', async () => {
    vi.mocked(facilityService.getById).mockImplementation(async (id: string) => {
      if (id === 'FAC-A') return { ok: true, data: { printDeliveryConfig: nativeConfig } } as any;
      if (id === 'CLIENT-A') return { ok: true, data: { printPresentationPreference: { paperSource: 'TRAY_2_PLAIN' } } } as any;
      return { ok: false, error: 'not found' } as any;
    });
    vi.mocked(resolveRealPrintRoutingContext).mockResolvedValue({ facilityId: 'FAC-A', orderingFacilityId: 'CLIENT-A' } as any);
    vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
    await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
    expect(facilityService.getById).toHaveBeenCalledWith('CLIENT-A');
    // Client's own paperSource override wins; duplexMode still falls back to the FINAL default.
    expect(mockPrintQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ paperSource: 'TRAY_2_PLAIN', duplexMode: 'DUPLEX' }));
  });

  describe('Mode 1 — NATIVE_QZ_TRAY', () => {
    it('no printerName configured fails honestly (PRINT_REJECTED), maxRetriesExceeded — retrying without a printer would never help', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: { enabled: true, mode: 'NATIVE_QZ_TRAY' } } } as any);
      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED', maxRetriesExceeded: true }));
    });

    it('QZ Tray genuinely not connected fails with PRINTER_OFFLINE, per the source spec’s own Use Case 2 — held for real, manual retry, not thrown', async () => {
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
      // Real, per PS-278/279 Gap D: the same resolved presentation
      // (paperSource/duplexMode) that DIRECT_NETWORK_PRINT mode already
      // forwarded to dispatchViaPrintProtocol is now forwarded to
      // printPdfViaQzTray too, closing the previously-disclosed gap
      // where NATIVE_QZ_TRAY silently dropped it on the floor.
      expect(printPdfViaQzTray).toHaveBeenCalledWith('Front-Desk-Printer', 'BASE64DATA', 1, undefined, finalDefaultPresentation);
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
    });

    it('a real, configured A4 paper size (per direct follow-up — "UK uses A4") is forwarded through to the real QZ Tray print call, and recorded on the real job', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: { ...nativeConfig, paperSize: 'A4' } } } as any);
      vi.mocked(printPdfViaQzTray).mockResolvedValue({ ok: true, data: undefined });
      await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(printPdfViaQzTray).toHaveBeenCalledWith('Front-Desk-Printer', 'BASE64DATA', 1, 'A4', finalDefaultPresentation);
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

  describe('Mode 2 — INTERFACE_ENGINE_HANDOFF', () => {
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

  describe('Mode 3 — DIRECT_NETWORK_PRINT (PS-278/PS-279)', () => {
    const directConfig = { enabled: true, mode: 'DIRECT_NETWORK_PRINT' as const };
    const destination = { protocol: 'RAW_9100' as const, ipAddress: '192.168.1.9' };

    it('a real PrintRoutingRule match resolves the destination and dispatches via dispatchViaPrintProtocol with the real, decoded PDF bytes and real, default presentation options', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: directConfig } } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({
        ok: true,
        data: [{ id: 'r1', scopeType: 'facility', scopeId: 'FAC-A', printDestination: destination, active: true, createdAt: '', updatedAt: '' }],
      } as any);
      vi.mocked(resolveRealPrintRoutingContext).mockResolvedValue({ facilityId: 'FAC-A' } as any);

      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('dispatched');
      expect(dispatchViaPrintProtocol).toHaveBeenCalledWith(destination, Buffer.from('BASE64DATA', 'base64'), finalDefaultPresentation);
      expect(mockPrintQueueService.markPrinted).toHaveBeenCalledWith('job-1');
      expect(dispatchInterfaceMessage).not.toHaveBeenCalled();
      expect(printPdfViaQzTray).not.toHaveBeenCalled();
    });

    it('falls back to the real, configured facility default (directNetworkPrintDestination) when no real PrintRoutingRule matches at any tier', async () => {
      const fallbackDestination = { protocol: 'IPP' as const, ipAddress: '192.168.1.50' };
      vi.mocked(facilityService.getById).mockResolvedValue({
        ok: true, data: { printDeliveryConfig: { ...directConfig, directNetworkPrintDestination: fallbackDestination } },
      } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({ ok: true, data: [] } as any);

      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('dispatched');
      expect(dispatchViaPrintProtocol).toHaveBeenCalledWith(fallbackDestination, expect.any(Buffer), finalDefaultPresentation);
    });

    it('a real PrintRoutingRule match is used even when a facility default is also configured — the more specific real rule is never shadowed by the default', async () => {
      const fallbackDestination = { protocol: 'IPP' as const, ipAddress: '192.168.1.50' };
      vi.mocked(facilityService.getById).mockResolvedValue({
        ok: true, data: { printDeliveryConfig: { ...directConfig, directNetworkPrintDestination: fallbackDestination } },
      } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({
        ok: true,
        data: [{ id: 'r1', scopeType: 'facility', scopeId: 'FAC-A', printDestination: destination, active: true, createdAt: '', updatedAt: '' }],
      } as any);

      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('dispatched');
      expect(dispatchViaPrintProtocol).toHaveBeenCalledWith(destination, expect.any(Buffer), finalDefaultPresentation);
    });

    it('no real rule match and no real facility default fails honestly (PRINT_REJECTED), maxRetriesExceeded — retrying with nowhere to send would never help', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: directConfig } } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({ ok: true, data: [] } as any);

      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED', maxRetriesExceeded: true }));
      expect(dispatchViaPrintProtocol).not.toHaveBeenCalled();
      // Real, per PS-279 — never even attempts to generate/persist a
      // PDF for a job with nowhere real to send it.
      expect(mockPrintQueueService.persistRenderedPdf).not.toHaveBeenCalled();
    });

    it('a real transport failure fails with PRINTER_UNREACHABLE, real retry still possible', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: directConfig } } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({
        ok: true,
        data: [{ id: 'r1', scopeType: 'facility', scopeId: 'FAC-A', printDestination: destination, active: true, createdAt: '', updatedAt: '' }],
      } as any);
      vi.mocked(dispatchViaPrintProtocol).mockResolvedValue({ ok: false, error: 'connection refused' });

      const result = await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(result.outcome).toBe('failed');
      expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINTER_UNREACHABLE', errorMessage: 'connection refused', maxRetriesExceeded: false }));
    });

    it('forwards the real, optional printRoutingContext (source, overrides) straight through to resolveRealPrintRoutingContext', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: directConfig } } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({ ok: true, data: [] } as any);

      await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf, { source: 'CYTOLOGY', workstationId: 'WS-9' });
      expect(resolveRealPrintRoutingContext).toHaveBeenCalledWith('CASE-1', 'FINAL', 'FAC-A', 'CYTOLOGY', { source: 'CYTOLOGY', workstationId: 'WS-9' });
    });

    it('real, per PS-279 — records the real, resolved destination onto the job record itself (resolvedDestination), for a later Retry to reuse verbatim', async () => {
      vi.mocked(facilityService.getById).mockResolvedValue({ ok: true, data: { printDeliveryConfig: directConfig } } as any);
      vi.mocked(mockPrintRoutingRuleService.getActive).mockResolvedValue({
        ok: true,
        data: [{ id: 'r1', scopeType: 'facility', scopeId: 'FAC-A', printDestination: destination, active: true, createdAt: '', updatedAt: '' }],
      } as any);
      await dispatchPrintJob('CASE-1', 'FAC-A', 'FINAL', 'Routine', okPdf);
      expect(mockPrintQueueService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ resolvedDestination: destination }));
    });
  });
});

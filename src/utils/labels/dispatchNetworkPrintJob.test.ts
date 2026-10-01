// src/utils/labels/dispatchNetworkPrintJob.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildNetworkPrintPayload, dispatchNetworkPrintJob, getDispatchedNetworkPrintJobs,
  _resetDispatchedNetworkPrintJobsForTests, newNetworkPrintJobId,
} from './dispatchNetworkPrintJob';
import type { BuildNetworkPrintPayloadError } from './dispatchNetworkPrintJob';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

const realPrinter: PrinterProfile = {
  id: 'printer-test-1', printerId: 'ZEBRA-TEST', model: 'ZT411', dpi: 300,
  supportsDataMatrix: true, supportsGS1: true, zplVersion: '7.0',
  maxPrintDensity: 300, moduleSize: 4, vendor: 'ZEBRA_ZPL',
  ipAddress: '192.168.1.50', port: 9100, bridgeType: 'direct_interface_engine', active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const validInput = {
  caseId: 'S26-0001', fullAccession: 'S26-0001', specimenDesignator: 'A1', blockId: 'BLK-02',
  patientName: 'DOE, JOHN', gtin: '00850000000000', printer: realPrinter,
  callbackUrl: 'https://pathscribe/api/print-status',
};

describe('dispatchNetworkPrintJob — real PathScribe-side half of PS-51 (Sections 5, 7, 9.2, 10)', () => {
  beforeEach(() => { _resetDispatchedNetworkPrintJobsForTests(); });

  it('builds a real, complete, valid payload matching Section 5.1\'s own shape', () => {
    const result = buildNetworkPrintPayload(validInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.action).toBe('PRINT_NETWORK_LABEL');
    expect(result.payload.targetPrinter.printerId).toBe('ZEBRA-TEST');
    expect(result.payload.labelData.gs1DataMatrix).toContain('\x1d'); // real separator present
    expect(result.payload.idempotencyKey).toBe(result.payload.eventId);
    expect(result.payload.copies).toBe(1);
  });

  it('real, deliberate rejection — Section 2.3\'s own "Reject jobs incompatible with printer capabilities": a printer without GS1 support is refused before any GS1 encoding is attempted', () => {
    const result = buildNetworkPrintPayload({ ...validInput, printer: { ...realPrinter, supportsGS1: false } });
    expect(result.ok).toBe(false);
    // Real, deliberate cast — this project's own tsconfig.json has
    // strictNullChecks disabled, under which TypeScript cannot reliably
    // narrow a discriminated union to its `ok: false` branch through
    // ordinary control flow (confirmed directly: neither
    // "if (result.ok) return;" nor "if (!result.ok) { ... }" narrows
    // here, though the `ok: true` branch narrows fine). Same real,
    // established workaround this codebase already uses elsewhere for
    // the identical situation (see ValidationStudiesSection.tsx's own
    // ServiceResult handling) — the `ok` check just above has already
    // confirmed this at runtime, so the cast reflects a real, already-
    // verified fact, not a guess.
    const errors = (result as BuildNetworkPrintPayloadError).errors;
    expect(errors.some(e => e.includes('GS1 support'))).toBe(true);
  });

  it('rejects a printer without DataMatrix support', () => {
    const result = buildNetworkPrintPayload({ ...validInput, printer: { ...realPrinter, supportsDataMatrix: false } });
    expect(result.ok).toBe(false);
  });

  it('rejects an inactive printer profile', () => {
    const result = buildNetworkPrintPayload({ ...validInput, printer: { ...realPrinter, active: false } });
    expect(result.ok).toBe(false);
  });

  it('real, specific GS1 validation errors surface directly — never a vague "invalid input"', () => {
    const result = buildNetworkPrintPayload({ ...validInput, blockId: 'BAD_ID' }); // underscore is illegal
    expect(result.ok).toBe(false);
    // Same real, deliberate cast as the test above — see that test's
    // own comment for why.
    const errors = (result as BuildNetworkPrintPayloadError).errors;
    expect(errors.some(e => e.includes('blockId'))).toBe(true);
  });

  it('dispatchNetworkPrintJob is a real, honest stub — records the real payload, never throws, never claims a real network send happened', async () => {
    const built = buildNetworkPrintPayload(validInput);
    if (!built.ok) throw new Error('setup failed');
    const result = await dispatchNetworkPrintJob(built.payload);
    expect(result).toEqual({ dispatched: true, method: 'stub' });
    expect(getDispatchedNetworkPrintJobs()).toHaveLength(1);
    expect(getDispatchedNetworkPrintJobs()[0].eventId).toBe(built.payload.eventId);
  });

  // Batch 347: the answer handling (formerly handleNetworkPrintCallback here)
  // moved to services/networkPrint/networkPrintJobs.ts, tested there.

  it('job ids stay unique for labels sent in the same millisecond (Batch 347)', () => {
    const at = new Date('2026-09-26T12:00:00Z');
    const ids = new Set(Array.from({ length: 50 }, () => newNetworkPrintJobId('S26-1', at, () => 0)));
    expect(ids.size).toBe(50);
  });

  it('a slide payload says so and carries level and stain (Batch 347)', () => {
    const built = buildNetworkPrintPayload({ ...validInput, callbackUrl: undefined, slide: { level: 'L2', stainName: 'H&E' } });
    if (built.ok === false) throw new Error('setup failed');
    expect(built.payload.labelData).toMatchObject({ labelType: 'SLIDE', slide: { level: 'L2', stainName: 'H&E' } });
    expect(built.payload.templateVersion).toBe('ZPL-SLIDE-V1');
    expect(built.payload.attempt).toBe(1);
    expect(built.payload.callbackUrl).toBe('/api/print/callbacks');
  });
});

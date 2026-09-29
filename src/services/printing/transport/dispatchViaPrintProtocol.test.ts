// src/services/printing/transport/dispatchViaPrintProtocol.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./sendRawPrintJob', () => ({ sendRawPrintJob: vi.fn() }));
vi.mock('./sendLprPrintJob', () => ({ sendLprPrintJob: vi.fn() }));
vi.mock('./sendIppPrintJob', () => ({ sendIppPrintJob: vi.fn() }));

import { sendRawPrintJob } from './sendRawPrintJob';
import { sendLprPrintJob } from './sendLprPrintJob';
import { sendIppPrintJob } from './sendIppPrintJob';
import { dispatchViaPrintProtocol } from './dispatchViaPrintProtocol';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

beforeEach(() => {
  vi.mocked(sendRawPrintJob).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(sendLprPrintJob).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(sendIppPrintJob).mockReset().mockResolvedValue({ ok: true });
});

describe('dispatchViaPrintProtocol', () => {
  it('routes RAW_9100 to sendRawPrintJob only', async () => {
    const destination: PrintDestination = { protocol: 'RAW_9100', ipAddress: '10.0.0.1' };
    const bytes = Buffer.from('x');
    await dispatchViaPrintProtocol(destination, bytes);
    expect(sendRawPrintJob).toHaveBeenCalledWith(destination, bytes);
    expect(sendLprPrintJob).not.toHaveBeenCalled();
    expect(sendIppPrintJob).not.toHaveBeenCalled();
  });

  it('routes LPR_LPD to sendLprPrintJob only', async () => {
    const destination: PrintDestination = { protocol: 'LPR_LPD', ipAddress: '10.0.0.1' };
    const bytes = Buffer.from('x');
    await dispatchViaPrintProtocol(destination, bytes);
    expect(sendLprPrintJob).toHaveBeenCalledWith(destination, bytes);
    expect(sendRawPrintJob).not.toHaveBeenCalled();
    expect(sendIppPrintJob).not.toHaveBeenCalled();
  });

  it('routes IPP to sendIppPrintJob only', async () => {
    const destination: PrintDestination = { protocol: 'IPP', ipAddress: '10.0.0.1' };
    const bytes = Buffer.from('x');
    await dispatchViaPrintProtocol(destination, bytes);
    expect(sendIppPrintJob).toHaveBeenCalledWith(destination, bytes, undefined);
    expect(sendRawPrintJob).not.toHaveBeenCalled();
    expect(sendLprPrintJob).not.toHaveBeenCalled();
  });

  it('real, per PS-279 §2.2.4 — forwards an optional presentation hint through to sendIppPrintJob only — RAW_9100/LPR_LPD have no real protocol-level equivalent to carry it', async () => {
    const destination: PrintDestination = { protocol: 'IPP', ipAddress: '10.0.0.1' };
    const bytes = Buffer.from('x');
    const presentation = { paperSource: 'TRAY_1_LETTERHEAD' as const, duplexMode: 'DUPLEX' as const };
    await dispatchViaPrintProtocol(destination, bytes, presentation);
    expect(sendIppPrintJob).toHaveBeenCalledWith(destination, bytes, presentation);
  });

  it('forwards the real result (success or failure) straight through, never reinterpreted', async () => {
    vi.mocked(sendRawPrintJob).mockResolvedValue({ ok: false, error: 'printer jammed' });
    const result = await dispatchViaPrintProtocol({ protocol: 'RAW_9100', ipAddress: '10.0.0.1' }, Buffer.from('x'));
    expect(result).toEqual({ ok: false, error: 'printer jammed' });
  });
});

// @vitest-environment happy-dom
//
// src/pages/MolecularOrderQueuePage/MolecularOrderQueuePage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the same page-level test gap this app's other new pages
// (GrossingScreenPage, OrSuiteDashboardPage) already closed. Mocks
// the real queue service and processInboundHpvResultEvent — this is
// about the page's own rendering/wiring, not re-proving those
// functions' own logic (already covered by their own dedicated
// tests).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

const { getAll, enqueue } = vi.hoisted(() => ({ getAll: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/services/molecularOrders/mockMolecularOrderOutboundQueueService', () => ({
  mockMolecularOrderOutboundQueueService: { getAll, enqueue },
}));

const { processInboundHpvResultEvent } = vi.hoisted(() => ({ processInboundHpvResultEvent: vi.fn() }));
vi.mock('@/services/hl7/processInboundHpvResultEvent', () => ({ processInboundHpvResultEvent }));

beforeEach(() => {
  getAll.mockResolvedValue({ ok: true, data: [] });
  enqueue.mockResolvedValue({ ok: true, data: {} });
  processInboundHpvResultEvent.mockResolvedValue({ outcome: 'applied' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MolecularOrderQueuePage — real render smoke test', () => {
  it('shows the empty state, then the demo panel', async () => {
    const { default: MolecularOrderQueuePage } = await import('./MolecularOrderQueuePage');
    render(<MolecularOrderQueuePage />);
    await act(async () => {});
    expect(screen.getByText('molecularOrderQueue.noEntries')).not.toBeNull();
    expect(screen.getByText('molecularOrderQueue.queueOrderBtn')).not.toBeNull();
  });

  it('"Queue HPV co-test order" enqueues the real demo order against the real seed accession', async () => {
    const { default: MolecularOrderQueuePage } = await import('./MolecularOrderQueuePage');
    render(<MolecularOrderQueuePage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('molecularOrderQueue.queueOrderBtn'));
    await act(async () => {});
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'S26-5003-CYT-001',
      eventType: 'order.molecular',
      payload: expect.objectContaining({ accessionNumber: 'S26-5003-CYT-001', specimenLetter: 'A', assayCode: 'st-hpv-highrisk-screen' }),
    }));
  });

  it('simulating a Positive result on the standalone assay calls the real processor with the real fields, and shows the reflex-specific outcome', async () => {
    const { default: MolecularOrderQueuePage } = await import('./MolecularOrderQueuePage');
    render(<MolecularOrderQueuePage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('molecularOrderQueue.simulateResultBtn'));
    await act(async () => {});
    expect(processInboundHpvResultEvent).toHaveBeenCalledWith(expect.objectContaining({
      accessionNumber: 'S26-5003-CYT-001', specimenLetter: 'A', hrHpvResult: 'Positive', assayStainTypeId: 'st-hpv-highrisk-screen',
    }));
    expect(screen.getByText('molecularOrderQueue.resultAppliedWithReflex')).not.toBeNull();
  });

  it('a queued reflex entry renders with the reflex reason label', async () => {
    getAll.mockResolvedValue({
      ok: true,
      data: [{
        id: 'e1', caseId: 'S26-5003-CYT-001', eventType: 'order.molecular', status: 'QUEUED', queuedAt: '2026-09-10T00:00:00.000Z', retryCount: 0, maxRetriesExceeded: false,
        payload: { accessionNumber: 'S26-5003-CYT-001', specimenLetter: 'A', assayCode: 'st-hpv-genotyping', orderReason: 'hpv_reflex_genotyping', priority: 'Routine', reflexFromMessageId: 'msg-1' },
      }],
    });
    const { default: MolecularOrderQueuePage } = await import('./MolecularOrderQueuePage');
    render(<MolecularOrderQueuePage />);
    await act(async () => {});
    expect(screen.getByText('molecularOrderQueue.reasonReflex')).not.toBeNull();
  });
});

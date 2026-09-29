// @vitest-environment happy-dom
// src/components/Printing/NetworkPrintJobs.test.tsx — Batch 347 (PS-54)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key) }),
}));
vi.mock('@/services', () => ({ networkPrintJobs: null }));

import { NetworkPrintJobs } from './NetworkPrintJobs';
import { createNetworkPrintJobTracker } from '@/services/networkPrint/networkPrintJobs';
import type { PrintJobStatusEvent } from '@/services/liveUpdates/liveUpdateContract';
import type { NetworkPrintPayload } from '@/types/printing/NetworkPrintPayload';

afterEach(cleanup);

const payload: NetworkPrintPayload = {
  eventId: 'EVT-1', idempotencyKey: 'EVT-1', action: 'PRINT_NETWORK_LABEL', timestamp: 't', templateVersion: 'v', callbackUrl: '/cb',
  targetPrinter: { printerId: 'ZT411', ipAddress: '', port: 9100, vendor: 'ZEBRA_ZPL' },
  labelData: { accessionNumber: 'S26-1', specimenDesignator: 'A', blockId: 'A1', patientName: '', gs1DataMatrix: 'x' }, copies: 1, attempt: 1,
};

describe('NetworkPrintJobs', () => {
  it('shows a waiting label with demo buttons, then the failure with Retry, then the retry waiting', async () => {
    let deliver: (e: PrintJobStatusEvent) => void = () => {};
    const sent: NetworkPrintPayload[] = [];
    const tracker = createNetworkPrintJobTracker({
      dispatch: async p => { sent.push(p); },
      audit: { logEvent: async () => {} },
      subscribeResults: on => { deliver = on; return { unsubscribe: () => {} }; },
      simulate: r => deliver({ ...r, v: 1, eventId: `e${Math.random()}`, occurredAt: 'now' }),
      currentUserName: () => 'U',
      setTimer: () => 0, clearTimer: () => {},
    });
    render(<NetworkPrintJobs tracker={tracker} />);
    await act(async () => { await tracker.send(payload); });
    expect(screen.getByText(/networkPrint.job.waiting/)).toBeTruthy();

    act(() => { fireEvent.click(screen.getByText('networkPrint.demo.simulatePaperOut')); });
    expect(screen.getByRole('alert').textContent).toContain('networkPrint.job.failed.PAPER_OUT');

    await act(async () => { fireEvent.click(screen.getByText('networkPrint.job.retry')); });
    expect(sent.map(p => p.eventId)).toEqual(['EVT-1', 'EVT-1-R2']);
    expect(screen.getByText(/networkPrint.job.waiting/)).toBeTruthy();
    expect(screen.getByText(/networkPrint.job.attempt \{"count":2\}/)).toBeTruthy();

    act(() => { fireEvent.click(screen.getByText('networkPrint.demo.simulatePrinted')); });
    expect(screen.getByText(/networkPrint.job.printed/)).toBeTruthy();
    expect(screen.queryByText('networkPrint.job.retry')).toBeNull();
  });
});

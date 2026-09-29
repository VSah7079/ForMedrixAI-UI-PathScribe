// @vitest-environment happy-dom
// src/components/Printing/AgentPrintStatus.test.tsx — Batch 346 (PS-52, point 2)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { AgentPrintStatus } from './AgentPrintStatus';
import { createAgentPrintJobStore } from '@/utils/labels/pathscribeAgent/printJobStatus';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key) }),
}));

afterEach(cleanup);

describe('AgentPrintStatus', () => {
  it('is an empty live region until a job starts, then follows it', () => {
    const store = createAgentPrintJobStore();
    render(<AgentPrintStatus store={store} />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    act(() => store.update({ jobId: 'a', printerName: 'ZD421', phase: 'sending' }));
    expect(region.textContent).toBe('agentPrintStatus.sending');

    act(() => store.update({ jobId: 'a', printerName: 'ZD421', phase: 'queued', position: 0 }));
    expect(region.textContent).toBe('agentPrintStatus.queuedNext');

    act(() => store.update({ jobId: 'b', printerName: 'ZD421', phase: 'queued', position: 2 }));
    expect(region.textContent).toContain('agentPrintStatus.queuedNext');
    expect(region.textContent).toContain('agentPrintStatus.moreWaiting {"count":1}');

    act(() => store.update({ jobId: 'a', printerName: 'ZD421', phase: 'printing' }));
    expect(region.textContent).toContain('agentPrintStatus.printing {"printer":"ZD421"}');

    act(() => { store.update({ jobId: 'a', printerName: 'ZD421', phase: 'done' }); store.update({ jobId: 'b', printerName: 'ZD421', phase: 'queued', position: 3 }); });
    expect(region.textContent).toBe('agentPrintStatus.queued {"count":3}');

    act(() => store.update({ jobId: 'b', printerName: 'ZD421', phase: 'failed' }));
    expect(region.textContent).toBe('');
  });
});

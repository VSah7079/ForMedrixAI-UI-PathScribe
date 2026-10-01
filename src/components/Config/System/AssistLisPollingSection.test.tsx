// @vitest-environment happy-dom
// src/components/Config/System/AssistLisPollingSection.test.tsx — PS-87 screen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@/i18n/config';

const runNow = vi.fn();
const ingestNow = vi.fn();
vi.mock('@/services/assistPolling/assistPollingRuntime', () => ({
  runAssistPollNow: (...a: unknown[]) => runNow(...a),
  ingestLisMessageNow: (...a: unknown[]) => ingestNow(...a),
  retryFailedLisEventsNow: vi.fn(),
}));

import AssistLisPollingSection from './AssistLisPollingSection';
import { ASSIST_POLLING_STORAGE_KEY } from '@/services/assistPolling/mockAssistPollingService';

describe('AssistLisPollingSection', () => {
  beforeEach(() => { localStorage.clear(); runNow.mockReset(); ingestNow.mockReset(); });
  afterEach(cleanup);

  it('shows the default mapping and refuses a duplicate status on save', async () => {
    render(<AssistLisPollingSection />);
    const inputs = await screen.findAllByPlaceholderText('e.g. GROSSED');
    expect(inputs.map(i => (i as HTMLInputElement).value)).toEqual(['GROSS_COMPLETE', 'GROSSED', 'MICRO_COMPLETE', 'DX_COMPLETE']);
    fireEvent.change(inputs[1], { target: { value: 'gross_complete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Each LIS status can be mapped only once.')).toBeTruthy();
    expect(localStorage.getItem('pathscribe_mock_' + ASSIST_POLLING_STORAGE_KEY)).toBeNull();
  });

  it('saves a valid change', async () => {
    render(<AssistLisPollingSection />);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved');
    const stored = JSON.parse(localStorage.getItem('pathscribe_mock_' + ASSIST_POLLING_STORAGE_KEY)!);
    expect(stored.settings.enabled).toBe(true);
  });

  it('Poll now runs a manual poll', async () => {
    runNow.mockResolvedValue({});
    render(<AssistLisPollingSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Poll now' }));
    await waitFor(() => expect(runNow).toHaveBeenCalledWith('manual'));
  });

  it('sends a pasted inbound message through the chosen adapter and shows an adapter error', async () => {
    ingestNow.mockResolvedValue({ id: 'r', startedAt: '', finishedAt: '', trigger: 'push', fetched: 0, staged: 0, items: [], error: 'INVALID_JSON' });
    render(<AssistLisPollingSection />);
    fireEvent.change(await screen.findByLabelText('Message format'), { target: { value: 'webhook' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    const box = screen.getByLabelText('Inbound message') as HTMLTextAreaElement;
    expect(box.value).toContain('S26-4416-BX-001');
    fireEvent.click(screen.getByRole('button', { name: 'Send to staging queue' }));
    await waitFor(() => expect(ingestNow).toHaveBeenCalledWith('webhook', box.value));
    expect(await screen.findByText("This isn't valid JSON.")).toBeTruthy();
  });
});

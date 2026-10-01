// @vitest-environment happy-dom
//
// src/pages/OutboundDispatchTrailSection.test.tsx — PS-86 (Batch 318).
// Page-level render test in the same style as PrintQueueDashboardSection.test.tsx:
// react-i18next returns the raw key, and the one service this section reads is
// mocked at the module boundary. Joining/filtering logic is covered in
// services/interfaceEngine/buildDispatchTrail.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

const engine = vi.hoisted(() => ({ listDispatchTrail: vi.fn() }));
vi.mock('@/services/interfaceEngine/mockInterfaceEngineService', () => ({ mockInterfaceEngineService: engine }));

import OutboundDispatchTrailSection from './OutboundDispatchTrailSection';

const payload = (messageId: string, accession: string) => ({
  messageId, eventType: 'OrderCreated', eventTimestamp: '2026-09-24T10:00:00.000Z', organisationId: 'ENT-1', facilityId: 'H-UNKNOWN',
  patient: { patientDataScope: 'reference', identifier: 'MRN-9' }, order: { placerOrderNumber: accession, priority: 'Routine' }, specimens: [{ label: 'A' }],
});

beforeEach(() => {
  engine.listDispatchTrail.mockResolvedValue({
    ok: true,
    data: [
      { payload: payload('evt-2', 'S26-0002'), status: 'failed', attempts: 1, error: 'Receiver down', errorCode: 'DISPATCH_UNREACHABLE' },
      { payload: payload('evt-1', 'S26-0001'), status: 'delivered', attempts: 1 },
    ],
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('OutboundDispatchTrailSection (PS-86)', () => {
  it('lists every dispatch with its outcome and counts each status', async () => {
    render(<OutboundDispatchTrailSection />);
    await waitFor(() => expect(screen.getByText('S26-0002')).toBeTruthy());
    expect(screen.getByText('S26-0001')).toBeTruthy();
    expect(screen.getByText('outboundDispatchTrail.status.failed')).toBeTruthy();
    expect(screen.getByText('outboundDispatchTrail.status.delivered')).toBeTruthy();
    expect(screen.getByText('outboundDispatchTrail.footerCount:{"shown":2,"total":2}')).toBeTruthy();
  });

  it('the Failed filter shows only failed sends', async () => {
    render(<OutboundDispatchTrailSection />);
    await waitFor(() => expect(screen.getByText('S26-0001')).toBeTruthy());
    fireEvent.click(screen.getByText('outboundDispatchTrail.filter.failed'));
    expect(screen.queryByText('S26-0001')).toBeNull();
    expect(screen.getByText('S26-0002')).toBeTruthy();
  });

  it('opening a row shows the exact payload and its error, and Copy Payload copies the JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<OutboundDispatchTrailSection />);
    await waitFor(() => expect(screen.getByText('S26-0002')).toBeTruthy());
    fireEvent.click(screen.getByText('S26-0002'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('"MRN-9"')).toBeTruthy();
    expect(screen.getByText(/Receiver down/)).toBeTruthy();
    fireEvent.click(screen.getByText('outboundDispatchTrail.drawer.copyPayload'));
    await waitFor(() => expect(screen.getByText('outboundDispatchTrail.drawer.copied')).toBeTruthy());
    expect(JSON.parse(writeText.mock.calls[0][0]).messageId).toBe('evt-2');
  });
});

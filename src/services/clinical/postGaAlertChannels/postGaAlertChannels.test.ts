// src/services/clinical/postGaAlertChannels/postGaAlertChannels.test.ts
// Real coverage for the post-GA, interface-engine-routed alert-channel
// variants — same real mocking pattern as
// services/printing/dispatchPrintJob.test.ts's own use of
// dispatchInterfaceMessage.ts (mocked, no real network call).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/interfaceDispatch/dispatchInterfaceMessage', () => ({
  dispatchInterfaceMessage: vi.fn(),
}));

import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { sendSmsAlertViaInterfaceEngine } from './sendSmsAlertViaInterfaceEngine';
import { sendSecureEmailAlertViaInterfaceEngine } from './sendSecureEmailAlertViaInterfaceEngine';
import { pushEhrInboxAlertViaInterfaceEngine } from './pushEhrInboxAlertViaInterfaceEngine';
import type { CriticalAlertPayload } from '@/types/clinical/CriticalAlertDispatch';

function payload(overrides: Partial<CriticalAlertPayload> = {}): CriticalAlertPayload {
  return {
    caseId: 'case-1',
    findingTerm: 'invasive carcinoma',
    findingSeverity: 'Critical',
    sourceQuote: 'invasive carcinoma identified',
    confirmedAt: '2026-09-19T00:00:00.000Z',
    recipient: {
      physicianId: 'phys-1',
      physicianName: 'Dr. Chen',
      email: 'dr.chen@example.org',
      smsCapablePhone: '555-0102',
      hasKnownEhrInbox: true,
      preferredContact: 'Email',
    },
    referenceUrl: 'https://pathscribe.app/critical-alert/cat_abc123',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(dispatchInterfaceMessage).mockReset();
  vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: true });
});

describe('sendSmsAlertViaInterfaceEngine — real, per-GA cutover candidate', () => {
  it('dispatches via dispatchInterfaceMessage with transactionType CRITICAL_ALERT, and reports method: "interface_engine"', async () => {
    const outcome = await sendSmsAlertViaInterfaceEngine(payload());
    expect(dispatchInterfaceMessage).toHaveBeenCalledTimes(1);
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith(
      expect.stringContaining('crit-alert-sms-'),
      'CRITICAL_ALERT',
      expect.objectContaining({ channel: 'sms', to: '555-0102' }),
    );
    expect(outcome).toEqual({ channel: 'sms', dispatched: true, method: 'interface_engine', detail: expect.stringContaining('555-0102') });
  });

  it('never includes findingTerm/findingSeverity in the SMS body — same zero-PHI template as the live sendSmsAlert.ts', async () => {
    const outcome = await sendSmsAlertViaInterfaceEngine(payload());
    expect(outcome.detail).not.toContain('invasive carcinoma');
    expect(outcome.detail).not.toContain('Critical');
    expect(outcome.detail).toContain('https://pathscribe.app/critical-alert/cat_abc123');
  });

  it('reports dispatched: false, honestly, on a real dispatch failure — never silently claims success', async () => {
    vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'The interface engine rejected this message: bad payload.' });
    const outcome = await sendSmsAlertViaInterfaceEngine(payload());
    expect(outcome.dispatched).toBe(false);
    expect(outcome.method).toBe('interface_engine');
    expect(outcome.detail).toContain('bad payload');
  });

  it('threads carrier + resolved emailToSmsGatewayAddress through to the envelope when the physician has a carrier on file — real, per direct follow-up closing the carrier data-model gap', async () => {
    await sendSmsAlertViaInterfaceEngine(payload({
      recipient: { ...payload().recipient, smsCapablePhone: '555-010-2222', smsCarrier: 'verizon' },
    }));
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith(
      expect.stringContaining('crit-alert-sms-'),
      'CRITICAL_ALERT',
      expect.objectContaining({ carrier: 'verizon', emailToSmsGatewayAddress: '5550102222@vtext.com' }),
    );
  });

  it("resolves an 'other' carrier's gateway address from smsCarrierOtherDomain", async () => {
    await sendSmsAlertViaInterfaceEngine(payload({
      recipient: { ...payload().recipient, smsCapablePhone: '555-010-2222', smsCarrier: 'other', smsCarrierOtherDomain: 'sms.example-mvno.net' },
    }));
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith(
      expect.stringContaining('crit-alert-sms-'),
      'CRITICAL_ALERT',
      expect.objectContaining({ carrier: 'other', emailToSmsGatewayAddress: '5550102222@sms.example-mvno.net' }),
    );
  });

  it('leaves carrier/emailToSmsGatewayAddress undefined when no carrier is on file — real, honest gap, never a fabricated guess', async () => {
    await sendSmsAlertViaInterfaceEngine(payload());
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith(
      expect.stringContaining('crit-alert-sms-'),
      'CRITICAL_ALERT',
      expect.objectContaining({ carrier: undefined, emailToSmsGatewayAddress: undefined }),
    );
  });
});

describe('sendSecureEmailAlertViaInterfaceEngine — real, post-GA cutover candidate', () => {
  it('dispatches via dispatchInterfaceMessage with transactionType CRITICAL_ALERT', async () => {
    const outcome = await sendSecureEmailAlertViaInterfaceEngine(payload());
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith(
      expect.stringContaining('crit-alert-email-'),
      'CRITICAL_ALERT',
      expect.objectContaining({ channel: 'secure_email', to: 'dr.chen@example.org' }),
    );
    expect(outcome.method).toBe('interface_engine');
    expect(outcome.dispatched).toBe(true);
  });

  it('never includes findingTerm/findingSeverity in the email body — same zero-PHI template as the live sendSecureEmailAlert.ts', async () => {
    const outcome = await sendSecureEmailAlertViaInterfaceEngine(payload());
    expect(outcome.detail).not.toContain('invasive carcinoma');
  });

  it('falls back to a link-free message when no reference link was issued, same as the live channel', async () => {
    const outcome = await sendSecureEmailAlertViaInterfaceEngine(payload({ referenceUrl: undefined }));
    expect(outcome.detail).not.toContain('http');
  });
});

describe('pushEhrInboxAlertViaInterfaceEngine — real, post-GA cutover candidate', () => {
  it('dispatches via dispatchInterfaceMessage, deliberately still carrying real clinical detail', async () => {
    const outcome = await pushEhrInboxAlertViaInterfaceEngine(payload());
    expect(dispatchInterfaceMessage).toHaveBeenCalledWith(
      expect.stringContaining('crit-alert-ehrpush-'),
      'CRITICAL_ALERT',
      expect.objectContaining({ channel: 'ehr_push', findingTerm: 'invasive carcinoma', findingSeverity: 'Critical' }),
    );
    expect(outcome.detail).toContain('invasive carcinoma');
    expect(outcome.method).toBe('interface_engine');
  });

  it('reports dispatched: false honestly on a real dispatch failure', async () => {
    vi.mocked(dispatchInterfaceMessage).mockResolvedValue({ ok: false, error: 'The interface engine returned an unexpected error (HTTP 500).' });
    const outcome = await pushEhrInboxAlertViaInterfaceEngine(payload());
    expect(outcome.dispatched).toBe(false);
    expect(outcome.detail).toContain('HTTP 500');
  });
});

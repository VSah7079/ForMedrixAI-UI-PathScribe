// src/services/clinical/alertChannels/alertChannels.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { sendSecureEmailAlert, getSentSecureEmailAlerts, _resetSentSecureEmailAlertsForTests } from './sendSecureEmailAlert';
import { sendSmsAlert, getSentSmsAlerts, _resetSentSmsAlertsForTests } from './sendSmsAlert';
import { pushEhrInboxAlert, getPushedEhrInboxAlerts, _resetPushedEhrInboxAlertsForTests } from './pushEhrInboxAlert';
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
    ...overrides,
  };
}

beforeEach(() => {
  _resetSentSecureEmailAlertsForTests();
  _resetSentSmsAlertsForTests();
  _resetPushedEhrInboxAlertsForTests();
});

describe('sendSecureEmailAlert — real, disclosed stub', () => {
  it('reports dispatched: true and method: "stub", never claiming a real vendor send happened', async () => {
    const outcome = await sendSecureEmailAlert(payload());
    expect(outcome).toEqual({
      channel: 'secure_email',
      dispatched: true,
      method: 'stub',
      detail: expect.stringContaining('dr.chen@example.org'),
    });
  });

  it('records the real request in the inspectable log', async () => {
    await sendSecureEmailAlert(payload());
    expect(getSentSecureEmailAlerts()).toHaveLength(1);
    expect(getSentSecureEmailAlerts()[0].to).toBe('dr.chen@example.org');
  });
});

describe('sendSmsAlert — real, disclosed stub', () => {
  it('reports dispatched: true and method: "stub"', async () => {
    const outcome = await sendSmsAlert(payload());
    expect(outcome.channel).toBe('sms');
    expect(outcome.dispatched).toBe(true);
    expect(outcome.method).toBe('stub');
  });

  it('never includes the sourceQuote (patient-adjacent narrative text) in the SMS body — kept minimal by design', async () => {
    const outcome = await sendSmsAlert(payload({ sourceQuote: 'a real, specific narrative quote' }));
    expect(outcome.detail).not.toContain('a real, specific narrative quote');
  });

  it('records the real request in the inspectable log', async () => {
    await sendSmsAlert(payload());
    expect(getSentSmsAlerts()).toHaveLength(1);
    expect(getSentSmsAlerts()[0].to).toBe('555-0102');
  });
});

describe('pushEhrInboxAlert — real, disclosed stub', () => {
  it('reports dispatched: true and method: "stub"', async () => {
    const outcome = await pushEhrInboxAlert(payload());
    expect(outcome.channel).toBe('ehr_push');
    expect(outcome.dispatched).toBe(true);
    expect(outcome.method).toBe('stub');
  });

  it('records the real request in the inspectable log, keyed by physicianId', async () => {
    await pushEhrInboxAlert(payload());
    expect(getPushedEhrInboxAlerts()).toHaveLength(1);
    expect(getPushedEhrInboxAlerts()[0].physicianId).toBe('phys-1');
  });

  it('the test reset genuinely clears each log independently', async () => {
    await sendSecureEmailAlert(payload());
    await sendSmsAlert(payload());
    await pushEhrInboxAlert(payload());
    _resetSentSecureEmailAlertsForTests();
    expect(getSentSecureEmailAlerts()).toHaveLength(0);
    expect(getSentSmsAlerts()).toHaveLength(1);
    expect(getPushedEhrInboxAlerts()).toHaveLength(1);
  });
});

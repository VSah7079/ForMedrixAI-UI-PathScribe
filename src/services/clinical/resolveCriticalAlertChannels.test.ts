// src/services/clinical/resolveCriticalAlertChannels.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCriticalAlertChannels, resolveAvailableAlertChannels } from './resolveCriticalAlertChannels';
import type { CriticalAlertRecipient } from '@/types/clinical/CriticalAlertDispatch';

function recipient(overrides: Partial<CriticalAlertRecipient> = {}): CriticalAlertRecipient {
  return {
    physicianId: 'phys-1',
    physicianName: 'Dr. Chen',
    email: undefined,
    smsCapablePhone: undefined,
    hasKnownEhrInbox: false,
    preferredContact: 'Email',
    ...overrides,
  };
}

describe('resolveAvailableAlertChannels — real availability, never fabricated', () => {
  it('returns nothing for a recipient with no real contact data at all', () => {
    expect(resolveAvailableAlertChannels(recipient())).toEqual([]);
  });

  it('includes secure_email only when a real email is present', () => {
    expect(resolveAvailableAlertChannels(recipient({ email: 'dr.chen@example.org' }))).toEqual(['secure_email']);
  });

  it('includes sms only when a real, dedicated SMS-capable number is present — generic phone is never assumed', () => {
    expect(resolveAvailableAlertChannels(recipient({ smsCapablePhone: '555-0102' }))).toEqual(['sms']);
  });

  it('includes ehr_push only when hasKnownEhrInbox is true (physician synced from an upstream EHR feed)', () => {
    expect(resolveAvailableAlertChannels(recipient({ hasKnownEhrInbox: true }))).toEqual(['ehr_push']);
  });

  it('includes every real channel at once when all three are genuinely present', () => {
    const r = recipient({ email: 'a@b.org', smsCapablePhone: '555-0102', hasKnownEhrInbox: true });
    expect(resolveAvailableAlertChannels(r)).toEqual(['secure_email', 'sms', 'ehr_push']);
  });
});

describe('resolveCriticalAlertChannels — the real severity-driven rule engine', () => {
  it('Critical severity fires on every available channel — real, multi-channel urgent alert', () => {
    const r = recipient({ email: 'a@b.org', smsCapablePhone: '555-0102', hasKnownEhrInbox: true });
    expect(resolveCriticalAlertChannels('Critical', r)).toEqual(['secure_email', 'sms', 'ehr_push']);
  });

  it('Malignant severity fires on every available channel, same as Critical', () => {
    const r = recipient({ email: 'a@b.org', hasKnownEhrInbox: true });
    expect(resolveCriticalAlertChannels('Malignant', r)).toEqual(['secure_email', 'ehr_push']);
  });

  it('Critical/Malignant with zero available channels resolves to a real, honest empty array — never fabricated', () => {
    expect(resolveCriticalAlertChannels('Critical', recipient())).toEqual([]);
  });

  it('Abnormal severity fires only the recipient\'s own preferredContact channel when it maps to one', () => {
    const r = recipient({ email: 'a@b.org', smsCapablePhone: '555-0102', hasKnownEhrInbox: true, preferredContact: 'Email' });
    expect(resolveCriticalAlertChannels('Abnormal', r)).toEqual(['secure_email']);
  });

  it('Abnormal severity with preferredContact Phone (no automated equivalent) fires nothing, even with channels available', () => {
    const r = recipient({ email: 'a@b.org', smsCapablePhone: '555-0102', hasKnownEhrInbox: true, preferredContact: 'Phone' });
    expect(resolveCriticalAlertChannels('Abnormal', r)).toEqual([]);
  });

  it('Abnormal severity with preferredContact Fax (no automated equivalent) fires nothing', () => {
    const r = recipient({ email: 'a@b.org', preferredContact: 'Fax' });
    expect(resolveCriticalAlertChannels('Abnormal', r)).toEqual([]);
  });

  it('Abnormal severity with a stated Email preference but no real email on file fires nothing — never substitutes another channel', () => {
    const r = recipient({ smsCapablePhone: '555-0102', preferredContact: 'Email' });
    expect(resolveCriticalAlertChannels('Abnormal', r)).toEqual([]);
  });
});

// src/pages/WorklistPage/PendingGrossingTriageTile.test.ts
import { describe, it, expect } from 'vitest';
import { isTriagePending } from './PendingGrossingTriageTile';
import type { SpecimenTriage } from '@/types/case/Specimen';

const triage = (overrides: Partial<SpecimenTriage>): SpecimenTriage => ({
  requiredAt: '2026-09-01T00:00:00.000Z',
  checklistItems: [{ item: 'Split core into LM/IF/EM portions', confirmed: false }],
  ...overrides,
});

describe('isTriagePending', () => {
  it('is false for a specimen with no SpecimenTriage at all', () => {
    expect(isTriagePending(undefined)).toBe(false);
  });

  it('is true when at least one checklist item is unconfirmed and there is no override', () => {
    expect(isTriagePending(triage({}))).toBe(true);
  });

  it('is false once every checklist item is confirmed', () => {
    expect(isTriagePending(triage({ checklistItems: [{ item: 'x', confirmed: true }] }))).toBe(false);
  });

  it('is false when an override reason is recorded, even with the checklist still incomplete', () => {
    expect(isTriagePending(triage({ overrideReason: 'Urgent — supervisor override.' }))).toBe(false);
  });
});

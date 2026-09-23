// src/services/cases/resolveCytologyIsPathologistTrack.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyIsPathologistTrack } from './resolveCytologyIsPathologistTrack';
import type { CaseParticipant } from '@/types/case/Case';

function makeParticipant(over: Partial<CaseParticipant> = {}): CaseParticipant {
  return {
    staffId: 'u1', staffName: 'Test User', source: 'manual',
    participationTypeIds: ['primary'], addedBy: 'u1', addedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...over,
  } as CaseParticipant;
}

describe('resolveCytologyIsPathologistTrack — real, per-case participant-driven signal', () => {
  it('treats a resident participant as pathologist-track', () => {
    const participants = [makeParticipant({ staffId: 'u-res', participationTypeIds: ['resident'] })];
    expect(resolveCytologyIsPathologistTrack(participants, 'u-res', false)).toBe(true);
  });

  it('treats an attending/primary participant as pathologist-track', () => {
    const participants = [makeParticipant({ staffId: 'u-att', participationTypeIds: ['attending'] })];
    expect(resolveCytologyIsPathologistTrack(participants, 'u-att', false)).toBe(true);
  });

  it('treats a cytotechnologist-only participant as CT-track, not pathologist-track', () => {
    const participants = [makeParticipant({ staffId: 'u-ct', participationTypeIds: ['cytotechnologist'] })];
    expect(resolveCytologyIsPathologistTrack(participants, 'u-ct', true)).toBe(false);
  });

  it('treats a dual-tagged participant (cytotechnologist + another real tag) as pathologist-track', () => {
    const participants = [makeParticipant({ staffId: 'u-dual', participationTypeIds: ['cytotechnologist', 'consultant'] })];
    expect(resolveCytologyIsPathologistTrack(participants, 'u-dual', false)).toBe(true);
  });

  it('falls back to the caller-supplied default when this user has no real participant record on the case', () => {
    const participants = [makeParticipant({ staffId: 'someone-else', participationTypeIds: ['cytotechnologist'] })];
    expect(resolveCytologyIsPathologistTrack(participants, 'u-unknown', true)).toBe(true);
    expect(resolveCytologyIsPathologistTrack(participants, 'u-unknown', false)).toBe(false);
  });

  it('ignores a removed/inactive participant record', () => {
    const participants = [makeParticipant({ staffId: 'u1', status: 'removed', participationTypeIds: ['attending'] })];
    expect(resolveCytologyIsPathologistTrack(participants, 'u1', false)).toBe(false);
  });

  it('falls back when no signing user id is given', () => {
    expect(resolveCytologyIsPathologistTrack([], undefined, true)).toBe(true);
  });
});

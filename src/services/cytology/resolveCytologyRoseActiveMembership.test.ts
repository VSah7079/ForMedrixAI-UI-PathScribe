import { describe, it, expect } from 'vitest';
import { resolveCytologyRoseActiveMembership } from './resolveCytologyRoseActiveMembership';
import type { CytologyRoseEvaluation } from '@/types/cytology/CytologyRoseEvaluation';

const evaluation = (performedAt: string): CytologyRoseEvaluation => ({
  id: 'r1', performedAt, performedBy: { userId: 'u1', userName: 'Dr. Smith' }, location: 'radiology',
  passes: [{ passNumber: 1, adequacyAssessment: 'adequate' }],
});

describe('resolveCytologyRoseActiveMembership', () => {
  it('a real specimen with no ROSE evaluations at all is never active', () => {
    expect(resolveCytologyRoseActiveMembership(undefined)).toBe(false);
    expect(resolveCytologyRoseActiveMembership([])).toBe(false);
  });

  it('a real, recent ROSE evaluation within the real default 48-hour window is genuinely active', () => {
    const asOf = new Date('2026-01-10T12:00:00Z');
    const recent = evaluation('2026-01-09T12:00:00Z'); // 24 hours before
    expect(resolveCytologyRoseActiveMembership([recent], asOf)).toBe(true);
  });

  it('a real, old ROSE evaluation outside the real window is no longer active', () => {
    const asOf = new Date('2026-01-10T12:00:00Z');
    const old = evaluation('2026-01-01T12:00:00Z'); // 9 days before
    expect(resolveCytologyRoseActiveMembership([old], asOf)).toBe(false);
  });

  it('a real, custom window is genuinely respected, not hardcoded to the default', () => {
    const asOf = new Date('2026-01-10T12:00:00Z');
    const twoDaysAgo = evaluation('2026-01-08T12:00:00Z');
    expect(resolveCytologyRoseActiveMembership([twoDaysAgo], asOf, 24)).toBe(false);
    expect(resolveCytologyRoseActiveMembership([twoDaysAgo], asOf, 72)).toBe(true);
  });

  it('a real specimen with multiple evaluations is active if ANY one is recent, not only when all are', () => {
    const asOf = new Date('2026-01-10T12:00:00Z');
    const old = evaluation('2026-01-01T12:00:00Z');
    const recent = evaluation('2026-01-10T06:00:00Z');
    expect(resolveCytologyRoseActiveMembership([old, recent], asOf)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveAutopsyBodyReleaseGate } from './resolveAutopsyBodyReleaseGate';
import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';

function baseCase(overrides: Partial<AutopsyCaseDetails>): AutopsyCaseDetails {
  return {
    jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full',
    addenda: [], ancillaryHold: { active: false }, ...overrides,
  } as AutopsyCaseDetails;
}

const signedPad = {
  tier: 'PAD' as const,
  frozenPayload: { findings: 'preliminary findings' },
  signedBy: { name: 'Dr. E. Reed', isPathologist: true },
  signedAt: '2026-09-05T14:00:00Z',
};

describe('resolveAutopsyBodyReleaseGate', () => {
  it('a real case with no real padSnapshot at all is blocked', () => {
    const result = resolveAutopsyBodyReleaseGate(baseCase({}));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toHaveLength(1);
  });

  it('a real case with a real, signed padSnapshot and no active hold is allowed \u2014 the real FAD is never required for release', () => {
    const result = resolveAutopsyBodyReleaseGate(baseCase({ padSnapshot: signedPad }));
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('a real case with a real, signed padSnapshot but a real, active ancillary hold is blocked', () => {
    const result = resolveAutopsyBodyReleaseGate(baseCase({
      padSnapshot: signedPad,
      ancillaryHold: { active: true, reason: 'Awaiting toxicology specimens', startedAt: '2026-09-05T15:00:00Z' },
    }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]).toContain('ancillary hold');
  });

  it('a real case whose ancillary hold has since ENDED (active: false, real endedAt set) is allowed again, alongside a real padSnapshot', () => {
    const result = resolveAutopsyBodyReleaseGate(baseCase({
      padSnapshot: signedPad,
      ancillaryHold: { active: false, reason: 'Awaiting toxicology specimens', startedAt: '2026-09-05T15:00:00Z', endedAt: '2026-09-07T10:00:00Z' },
    }));
    expect(result.allowed).toBe(true);
  });

  it('a real case with real, authorized organ retention (tier_2_full_organ_retention) is still allowed \u2014 retention is a real, parallel, non-blocking process', () => {
    const result = resolveAutopsyBodyReleaseGate(baseCase({
      padSnapshot: signedPad,
      organRetentionTier: 'tier_2_full_organ_retention',
    }));
    expect(result.allowed).toBe(true);
  });

  it('both real blocking conditions surface together when both are genuinely true', () => {
    const result = resolveAutopsyBodyReleaseGate(baseCase({
      ancillaryHold: { active: true, reason: 'Awaiting toxicology specimens' },
    }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toHaveLength(2);
  });
});

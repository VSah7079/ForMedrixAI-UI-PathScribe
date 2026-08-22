// src/components/Contribution/productivityCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { wasFinalizedByUser, computeMonthlyCaseCounts, canSeePeerComparison, computeRvuSummary, computeMonthlyRvu, computePeerRvuStats } from './productivityCalculations';
import type { RvuTableVersion } from '@/services/billing/RvuTableVersion';
import type { Case } from '@/types/case/Case';

// Real, timezone-runner-independent date construction. A real bug, caught
// on Pete's own machine (Arizona, UTC-7) then a SECOND time while
// verifying the fix under UTC+14: the first version of this helper used
// the test runner's own local time via the multi-arg Date constructor,
// which only accounts for ONE conversion (runner TZ -> UTC). Once
// production code added a real, explicit facility-timezone conversion
// (UTC -> 'America/Phoenix'), that's a SECOND conversion stacked on top -
// under a runner set to UTC+14, the combined swing exceeded 12 hours and
// crossed a real day boundary, reproducing the exact same test failure
// under a completely different runner timezone. The real, robust fix:
// build the UTC timestamp directly via Date.UTC, anchored to noon in the
// FACILITY timezone specifically (America/Phoenix, UTC-7, no DST -> 19:00
// UTC = noon Arizona) - never touches the test runner's own local time at
// all, so the result is identical no matter what timezone vitest itself
// happens to run in.
function localIso(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day, 19, 0, 0)).toISOString();
}

// Same real, facility-anchored approach as localIso, but returning a real
// Date object directly for the 'now' parameter these functions take.
function localNow(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 19, 0, 0));
}

function makeCase(over: Partial<Case> = {}): Case {
  return {
    id: 'S26-1', status: 'in-progress', diagnostic: {}, ...over,
  } as any;
}

describe('canSeePeerComparison — real fix: the admin-configurable peer-visibility toggle', () => {
  it('admin role always sees peer comparison, regardless of the toggle', () => {
    expect(canSeePeerComparison('admin', false)).toBe(true);
    expect(canSeePeerComparison('admin', true)).toBe(true);
  });

  it('pathologist-admin and superadmin also always see it, same as admin', () => {
    expect(canSeePeerComparison('pathologist-admin', false)).toBe(true);
    expect(canSeePeerComparison('superadmin', false)).toBe(true);
  });

  it('plain pathologist only sees it when the toggle is explicitly on', () => {
    expect(canSeePeerComparison('pathologist', false)).toBe(false);
    expect(canSeePeerComparison('pathologist', true)).toBe(true);
  });

  it('fails closed (hidden) for an unknown/undefined role, not open - a real bug caught and fixed during this extraction: the original inline expression (role !== "pathologist") would have incorrectly shown peer data for an undefined role', () => {
    expect(canSeePeerComparison(undefined, true)).toBe(false);
    expect(canSeePeerComparison(undefined, false)).toBe(false);
  });
});

describe('wasFinalizedByUser — real fix: distinguishes "assigned to me" from "actually completed by me"', () => {
  it('true when this user genuinely finalized the case, with a real issued date', () => {
    const c = makeCase({ diagnostic: { finalizedBy: 'path-1', issuedDate: '2026-03-15' } as any });
    expect(wasFinalizedByUser(c, 'path-1')).toBe(true);
  });

  it('false when finalized by a different pathologist', () => {
    const c = makeCase({ diagnostic: { finalizedBy: 'path-2', issuedDate: '2026-03-15' } as any });
    expect(wasFinalizedByUser(c, 'path-1')).toBe(false);
  });

  it('false when never finalized at all (no finalizedBy)', () => {
    const c = makeCase({ diagnostic: {} as any });
    expect(wasFinalizedByUser(c, 'path-1')).toBe(false);
  });

  it('false when finalizedBy is set but issuedDate is missing - incomplete data should not count', () => {
    const c = makeCase({ diagnostic: { finalizedBy: 'path-1' } as any });
    expect(wasFinalizedByUser(c, 'path-1')).toBe(false);
  });
});

describe('computeMonthlyCaseCounts — real fix: replaces the entirely-hardcoded mockMonthly array', () => {
  const now = localNow(2026, 3, 15);

  it('counts a real, genuinely-finalized case in its correct month', () => {
    const cases = [makeCase({ diagnostic: { finalizedBy: 'path-1', issuedDate: localIso(2026, 1, 10) } as any })];
    const result = computeMonthlyCaseCounts(cases, 'path-1', 'America/Phoenix', now);
    const feb = result.find(m => m.month === 'Feb');
    expect(feb?.cases).toBe(1);
  });

  it('does not count a case finalized by a different pathologist', () => {
    const cases = [makeCase({ diagnostic: { finalizedBy: 'path-2', issuedDate: localIso(2026, 1, 10) } as any })];
    const result = computeMonthlyCaseCounts(cases, 'path-1', 'America/Phoenix', now);
    const feb = result.find(m => m.month === 'Feb');
    expect(feb?.cases).toBe(0);
  });

  it('only returns months up to the current month - no future months', () => {
    const cases: Case[] = [];
    const result = computeMonthlyCaseCounts(cases, 'path-1', 'America/Phoenix', now); // April = index 3
    expect(result.length).toBe(4); // Jan, Feb, Mar, Apr
    expect(result.map(m => m.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr']);
  });

  it('excludes cases from a different calendar year', () => {
    const cases = [makeCase({ diagnostic: { finalizedBy: 'path-1', issuedDate: localIso(2025, 1, 10) } as any })];
    const result = computeMonthlyCaseCounts(cases, 'path-1', 'America/Phoenix', now);
    const totalCases = result.reduce((sum, m) => sum + m.cases, 0);
    expect(totalCases).toBe(0);
  });

  it('accumulates multiple real cases correctly within the same month', () => {
    const cases = [
      makeCase({ id: 'S26-1', diagnostic: { finalizedBy: 'path-1', issuedDate: localIso(2026, 2, 2) } as any }),
      makeCase({ id: 'S26-2', diagnostic: { finalizedBy: 'path-1', issuedDate: localIso(2026, 2, 20) } as any }),
      makeCase({ id: 'S26-3', diagnostic: { finalizedBy: 'path-1', issuedDate: localIso(2026, 2, 28) } as any }),
    ];
    const result = computeMonthlyCaseCounts(cases, 'path-1', 'America/Phoenix', now);
    expect(result.find(m => m.month === 'Mar')?.cases).toBe(3);
  });

  it('returns zero counts across all months for a user with no finalized cases, not an empty/broken result', () => {
    const result = computeMonthlyCaseCounts([], 'path-1', 'America/Phoenix', now);
    expect(result.every(m => m.cases === 0)).toBe(true);
    expect(result.length).toBe(4);
  });

  it('ignores a case with an unparseable issuedDate rather than crashing', () => {
    const cases = [makeCase({ diagnostic: { finalizedBy: 'path-1', issuedDate: 'not-a-date' } as any })];
    expect(() => computeMonthlyCaseCounts(cases, 'path-1', 'America/Phoenix', now)).not.toThrow();
  });
});

describe('computeRvuSummary — real fix: replaces the entirely hardcoded demoRvuTile, using the real, already-existing RVU code map service', () => {
  function makeVersion(over: Partial<RvuTableVersion> = {}): RvuTableVersion {
    return {
      id: 'v1', label: 'Test Version', effectiveDate: '2026-01-01T00:00:00.000Z',
      uploadedAt: '2026-01-01T00:00:00.000Z', uploadedBy: 'admin', isActive: true,
      entries: [
        { code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.73 },
        { code: '88304', billingCode: '88304', description: 'Level III', workRvu: 0.21 },
      ],
      ...over,
    };
  }

  function makeCaseWithCpt(over: Partial<Case> & { cptCodes?: string[]; specimenCount?: number } = {}): Case {
    const { cptCodes, specimenCount, ...rest } = over;
    return {
      id: 'S26-1', status: 'final',
      diagnostic: { finalizedBy: 'user-1', issuedDate: localIso(2026, 5, 1) },
      specimens: Array.from({ length: specimenCount ?? 1 }).map((_, i) => ({
        id: `sp-${i}`, coding: i === 0 ? { cpt: cptCodes ?? [] } : { cpt: [] },
      })),
      ...rest,
    } as any;
  }

  it('computes a real, genuine total from real, assigned CPT codes and the real, effective RVU version', () => {
    const cases = [makeCaseWithCpt({ cptCodes: ['88305'] })];
    const summary = computeRvuSummary(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.total).toBe(0.73);
    expect(summary.caseCount).toBe(1);
  });

  it('sums real work RVU across multiple real, assigned codes on one case', () => {
    const cases = [makeCaseWithCpt({ cptCodes: ['88305', '88304'] })];
    const summary = computeRvuSummary(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.total).toBeCloseTo(0.94, 5);
  });

  it('real, critical regression test, per direct follow-up: a case whose Block.coding.cpt carries a billingCode label ("IHC-FIRST") — what BlockStainEditorModal.tsx actually writes now, post Charge Capture rewire — still resolves against the SAME RvuTableVersion.entries via the dual-key (code + billingCode) lookup, not just the old raw-CPT ("88342") form', () => {
    const versionWithBillingCodes = makeVersion({
      entries: [
        { code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.73 },
        { code: '88342', billingCode: 'IHC-FIRST', description: 'IHC first single antibody stain', workRvu: 0.68 },
      ],
    });
    const oldStyleCase = makeCaseWithCpt({ cptCodes: ['88342'] }); // historical case data, written before the rewire
    const newStyleCase = makeCaseWithCpt({ cptCodes: ['IHC-FIRST'] }); // real, current data, written by BlockStainEditorModal.tsx today
    const oldSummary = computeRvuSummary([oldStyleCase], 'user-1', [versionWithBillingCodes], 'America/Phoenix', localNow(2026, 5, 15));
    const newSummary = computeRvuSummary([newStyleCase], 'user-1', [versionWithBillingCodes], 'America/Phoenix', localNow(2026, 5, 15));
    expect(oldSummary.total).toBe(0.68);
    expect(newSummary.total).toBe(0.68); // same real RVU value, resolved from the same real rule, regardless of which label the stored code happens to be
    expect(newSummary.unrecognizedCodeCount).toBe(0); // NOT silently undercounted as an unrecognized code
  });

  it('real, critical regression test, per direct follow-up: the ACTUAL, real, shipped mockRvuCodeMapService seed data (not just a local test fixture) resolves a full, real, mixed-code case correctly', async () => {
    const { mockRvuCodeMapService } = await import('@/services/billing/mockRvuCodeMapService');
    const versionsRes = await mockRvuCodeMapService.getAllVersions();
    if (!versionsRes.ok) throw new Error('setup failed');
    // A real case with a base specimen code plus two real block-level
    // ancillary codes, exactly as BlockStainEditorModal.tsx would write
    // them today: base code stays a raw CPT string (Specimen dictionary
    // resolution was never part of the billingCode rewire), ancillary
    // codes are real billingCode labels.
    const realCase = {
      id: 'S26-1', status: 'final',
      diagnostic: { finalizedBy: 'user-1', issuedDate: localIso(2026, 5, 1) },
      specimens: [{
        id: 'sp-0', coding: { cpt: ['88305'] },
        blocks: [{ id: 'blk-0', coding: { cpt: ['IHC-FIRST', 'SPECIAL-STAIN'] } }],
      }],
    } as any;
    const summary = computeRvuSummary([realCase], 'user-1', versionsRes.data, 'America/Phoenix', localNow(2026, 5, 15));
    // 0.73 (88305) + 0.68 (IHC-FIRST/88342) + 0.53 (SPECIAL-STAIN/88312)
    expect(summary.total).toBeCloseTo(1.94, 5);
    expect(summary.unrecognizedCodeCount).toBe(0);
  });

  it('falls back to the real, honest rule-based default when a case genuinely has no assigned codes', () => {
    const cases = [makeCaseWithCpt({ cptCodes: [], specimenCount: 2 })];
    const summary = computeRvuSummary(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    // ruleBasedDefaultCptCodes(2) = two real 88305s = 2 * 0.73
    expect(summary.total).toBeCloseTo(1.46, 5);
  });

  it('resolves the real, HISTORICALLY effective version for a case, not whichever version is active today', () => {
    const oldVersion = makeVersion({ id: 'old', effectiveDate: '2025-01-01T00:00:00.000Z', entries: [{ code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.75 }] });
    const newVersion = makeVersion({ id: 'new', effectiveDate: '2026-04-01T00:00:00.000Z', entries: [{ code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.73 }] });
    // A real case finalized BEFORE the new version's real effective date.
    const cases = [makeCaseWithCpt({ cptCodes: ['88305'], diagnostic: { finalizedBy: 'user-1', issuedDate: localIso(2026, 1, 1) } })];
    const summary = computeRvuSummary(cases, 'user-1', [oldVersion, newVersion], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.total).toBe(0.75); // the real, OLD rate, correctly in effect at that real time
  });

  it('a genuinely unrecognized real CPT code is honestly reported, not silently ignored or fabricated', () => {
    const cases = [makeCaseWithCpt({ cptCodes: ['99999'] })];
    const summary = computeRvuSummary(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.total).toBe(0);
    expect(summary.unrecognizedCodeCount).toBe(1);
  });

  it('only counts real cases genuinely finalized by this specific user', () => {
    const cases = [
      makeCaseWithCpt({ cptCodes: ['88305'], diagnostic: { finalizedBy: 'user-OTHER', issuedDate: localIso(2026, 5, 1) } }),
    ];
    const summary = computeRvuSummary(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.caseCount).toBe(0);
    expect(summary.total).toBe(0);
  });

  it('a genuinely empty case list returns real, honest zeros, never NaN', () => {
    const summary = computeRvuSummary([], 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.total).toBe(0);
    expect(summary.avgPerCase).toBe(0);
    expect(summary.delta).toBe('+0.0%');
  });

  it('computes a real, honest year-over-year delta from the same real calendar window in both years', () => {
    const version = makeVersion({ effectiveDate: '2020-01-01T00:00:00.000Z' }); // genuinely covers both real years being compared
    const cases = [
      makeCaseWithCpt({ cptCodes: ['88305'], diagnostic: { finalizedBy: 'user-1', issuedDate: localIso(2026, 2, 1) } }),
      makeCaseWithCpt({ cptCodes: ['88305'], diagnostic: { finalizedBy: 'user-1', issuedDate: localIso(2025, 2, 1) } }),
      makeCaseWithCpt({ cptCodes: ['88305'], diagnostic: { finalizedBy: 'user-1', issuedDate: localIso(2025, 2, 1) } }),
    ];
    // 1 real case this year, 2 real cases last year in the same window - a real, genuine decrease.
    const summary = computeRvuSummary(cases, 'user-1', [version], 'America/Phoenix', localNow(2026, 5, 15));
    expect(summary.up).toBe(false);
  });
});

describe('computeMonthlyRvu — real fix: replaces the entirely hardcoded demoRvuByMonth (ProductivityTab.tsx)', () => {
  function makeVersion(over: Partial<RvuTableVersion> = {}): RvuTableVersion {
    return {
      id: 'v1', label: 'Test Version', effectiveDate: '2020-01-01T00:00:00.000Z',
      uploadedAt: '2020-01-01T00:00:00.000Z', uploadedBy: 'admin', isActive: true,
      entries: [{ code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.73 }],
      ...over,
    };
  }

  function makeCaseWithCpt(issuedDate: string, cptCodes: string[], userId = 'user-1'): Case {
    return {
      id: `S26-${issuedDate}`, status: 'final',
      diagnostic: { finalizedBy: userId, issuedDate },
      specimens: [{ id: 'sp-0', coding: { cpt: cptCodes } }],
    } as any;
  }

  it('groups real RVU totals into the real month a case was genuinely finalized in', () => {
    const cases = [
      makeCaseWithCpt(localIso(2026, 0, 15), ['88305']),
      makeCaseWithCpt(localIso(2026, 2, 15), ['88305']),
    ];
    const monthly = computeMonthlyRvu(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    const jan = monthly.find(m => m.month === 'Jan');
    const mar = monthly.find(m => m.month === 'Mar');
    const feb = monthly.find(m => m.month === 'Feb');
    expect(jan?.rvus).toBe(0.73);
    expect(mar?.rvus).toBe(0.73);
    expect(feb?.rvus).toBe(0); // a real, genuinely empty month is an honest 0, not omitted or fabricated
  });

  it('sums multiple real cases within the same real month correctly', () => {
    const cases = [
      makeCaseWithCpt(localIso(2026, 1, 1), ['88305']),
      makeCaseWithCpt(localIso(2026, 1, 20), ['88305']),
    ];
    const monthly = computeMonthlyRvu(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(monthly.find(m => m.month === 'Feb')?.rvus).toBe(1.46);
  });

  it('only counts real cases genuinely finalized by this specific user, matching computeMonthlyCaseCounts\' own real scoping', () => {
    const cases = [makeCaseWithCpt(localIso(2026, 1, 1), ['88305'], 'user-OTHER')];
    const monthly = computeMonthlyRvu(cases, 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(monthly.find(m => m.month === 'Feb')?.rvus).toBe(0);
  });

  it('never includes a real, future month beyond the current real calendar month', () => {
    const monthly = computeMonthlyRvu([], 'user-1', [makeVersion()], 'America/Phoenix', localNow(2026, 2, 15));
    expect(monthly.map(m => m.month)).toEqual(['Jan', 'Feb', 'Mar']);
  });
});

describe('computePeerRvuStats — real fix: replaces the entirely hardcoded demoPeerData, respecting the real, explicit "anonymized" requirement', () => {
  function makeVersion(): RvuTableVersion {
    return {
      id: 'v1', label: 'Test Version', effectiveDate: '2020-01-01T00:00:00.000Z',
      uploadedAt: '2020-01-01T00:00:00.000Z', uploadedBy: 'admin', isActive: true,
      entries: [{ code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 1 }],
    };
  }

  function makeCaseWithCpt(userId: string, cptCodes: string[]): Case {
    return {
      id: `S26-${userId}-${Math.random()}`, status: 'final',
      diagnostic: { finalizedBy: userId, issuedDate: localIso(2026, 5, 1) },
      specimens: [{ id: 'sp-0', coding: { cpt: cptCodes } }],
    } as any;
  }

  it('computes a real, honest average across genuine peer pathologists', () => {
    const cases = [
      makeCaseWithCpt('peer-1', ['88305']),
      makeCaseWithCpt('peer-1', ['88305']),
      makeCaseWithCpt('peer-2', ['88305']),
    ];
    // peer-1: 2 RVU, peer-2: 1 RVU -> real avg 1.5
    const stats = computePeerRvuStats(cases, ['peer-1', 'peer-2'], [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(stats.peerAvg).toBe(1.5);
    expect(stats.peerCount).toBe(2);
  });

  it('computes a real, honest top performer - the genuine max across real peers, never a fabricated one', () => {
    const cases = [
      makeCaseWithCpt('peer-1', ['88305']),
      makeCaseWithCpt('peer-2', ['88305', '88305', '88305']),
    ];
    const stats = computePeerRvuStats(cases, ['peer-1', 'peer-2'], [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(stats.topPerf).toBe(3);
  });

  it('real, critical privacy fix: never exposes a per-peer breakdown, only real aggregate stats', () => {
    const cases = [makeCaseWithCpt('peer-1', ['88305'])];
    const stats = computePeerRvuStats(cases, ['peer-1'], [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(Object.keys(stats).sort()).toEqual(['peerAvg', 'peerCount', 'topPerf']);
  });

  it('a genuinely empty peer list returns real, honest zeros, never a fabricated average', () => {
    const stats = computePeerRvuStats([], [], [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(stats.peerAvg).toBe(0);
    expect(stats.topPerf).toBe(0);
    expect(stats.peerCount).toBe(0);
  });

  it('a real peer with zero real cases genuinely contributes 0 to the average, not excluded silently', () => {
    const cases = [makeCaseWithCpt('peer-1', ['88305'])];
    // peer-2 has no real cases at all in this data set.
    const stats = computePeerRvuStats(cases, ['peer-1', 'peer-2'], [makeVersion()], 'America/Phoenix', localNow(2026, 5, 15));
    expect(stats.peerAvg).toBe(0.5); // (1 + 0) / 2
    expect(stats.peerCount).toBe(2);
  });
});

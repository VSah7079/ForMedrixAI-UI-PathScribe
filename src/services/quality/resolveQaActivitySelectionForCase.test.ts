import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveQaActivitySelectionForCase } from './resolveQaActivitySelectionForCase';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { QaCaseSelectionContext } from './resolveQaCaseSelectionContext';

function makeActivityType(overrides: Partial<QaActivityType> = {}): QaActivityType {
  return {
    id: 'qa-activity-test',
    name: 'Test Activity',
    tabScope: 'custom',
    fields: [],
    teachingOnboardingEnabled: false,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    ...overrides,
  };
}

const noSignals: QaCaseSelectionContext = { hasNonDeferredFrozenCategory: false };
const frozenSignal: QaCaseSelectionContext = { hasNonDeferredFrozenCategory: true };

describe('resolveQaActivitySelectionForCase - deterministic behavior', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never selects an inactive activity type, even with a matching targeted rule', () => {
    const type = makeActivityType({ active: false, targetedSelectionRule: { signal: 'hasNonDeferredFrozenCategory' } });
    expect(resolveQaActivitySelectionForCase(frozenSignal, [type])).toEqual([]);
  });

  it('selects with reason "targeted" when the targeted rule matches, regardless of Math.random()', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999); // would never randomly sample at any real rate
    const type = makeActivityType({ id: 'discordance', targetedSelectionRule: { signal: 'hasNonDeferredFrozenCategory' }, samplingPercentage: 0 });
    expect(resolveQaActivitySelectionForCase(frozenSignal, [type])).toEqual([{ activityTypeId: 'discordance', reason: 'targeted' }]);
  });

  it('does not select on the targeted rule alone when the signal is false, but does fall through to a random roll if configured', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // would sample at any rate > 1
    const type = makeActivityType({ id: 'discordance', targetedSelectionRule: { signal: 'hasNonDeferredFrozenCategory' }, samplingPercentage: 10 });
    expect(resolveQaActivitySelectionForCase(noSignals, [type])).toEqual([{ activityTypeId: 'discordance', reason: 'random' }]);
  });

  it('never selects an activity with neither a targeted rule nor a sampling percentage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would sample at any rate > 0
    const type = makeActivityType();
    expect(resolveQaActivitySelectionForCase(noSignals, [type])).toEqual([]);
  });

  it('evaluates each active activity type independently — a case can be selected for more than one real reason at once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const targeted = makeActivityType({ id: 'a-targeted', targetedSelectionRule: { signal: 'hasNonDeferredFrozenCategory' } });
    const random = makeActivityType({ id: 'a-random', samplingPercentage: 10 });
    const result = resolveQaActivitySelectionForCase(frozenSignal, [targeted, random]);
    expect(result).toEqual(
      expect.arrayContaining([
        { activityTypeId: 'a-targeted', reason: 'targeted' },
        { activityTypeId: 'a-random', reason: 'random' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it("expresses Discordance's own real trigger condition through this generic mechanism", () => {
    // The exact real condition useSignOutWorkflow.ts hardcodes today:
    // a merged intraop session with a non-deferred frozen category.
    // Configuring an activity's targetedSelectionRule to this one
    // signal reproduces that same real behavior generically.
    const discordance = makeActivityType({ id: 'discordance', targetedSelectionRule: { signal: 'hasNonDeferredFrozenCategory' } });
    expect(resolveQaActivitySelectionForCase(frozenSignal, [discordance])).toEqual([{ activityTypeId: 'discordance', reason: 'targeted' }]);
    expect(resolveQaActivitySelectionForCase(noSignals, [discordance])).toEqual([]);
  });
});

describe('resolveQaActivitySelectionForCase - real, genuine randomness (statistical sanity check)', () => {
  it('a real 10% rate over 5000 real trials lands close to 10%, mirroring shouldRandomlySampleForCodeReview\'s own real convention', () => {
    const type = makeActivityType({ samplingPercentage: 10 });
    let selected = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (resolveQaActivitySelectionForCase(noSignals, [type]).length > 0) selected++;
    }
    const proportion = selected / trials;
    expect(proportion).toBeGreaterThan(0.06);
    expect(proportion).toBeLessThan(0.14);
  });

  it('a newly-defined Custom activity with only a configured samplingPercentage produces a real, correct queue with no code change beyond configuration', () => {
    const brandNewCustomActivity = makeActivityType({ id: 'brand-new', tabScope: 'custom', samplingPercentage: 25 });
    let selected = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (resolveQaActivitySelectionForCase(noSignals, [brandNewCustomActivity]).length > 0) selected++;
    }
    const proportion = selected / trials;
    expect(proportion).toBeGreaterThan(0.19);
    expect(proportion).toBeLessThan(0.31);
  });
});

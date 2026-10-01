// src/components/Contribution/tatCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { resolveTatTargetHours, resolveTatEntry, computeTotalCaseTatOutliers, computeFirstTouchOutliers, computeGrossingOutliers, computeSignOutOutliers, computeFrozenSectionOutliers, computeColdIschemiaOutliers, computeConsultResponseOutliers, computeConsultAwaitingOutliers, type TatEntryForResolution, type CaseForTatCalc, type IntraopEntryForTatCalc, type CaseWithSpecimensForTatCalc, type DelegationForTatCalc } from './qualityCalculations';

function makeEntry(over: Partial<TatEntryForResolution> = {}): TatEntryForResolution {
  return {
    type: 'TOTAL_CASE', targetHours: 24, urgency: null,
    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null,
    active: true,
    ...over,
  };
}

describe('resolveTatTargetHours — real fix: TATConfigSection.tsx never had a callable resolver, only a display-sort helper', () => {
  it('resolves the real system default when no more specific rule matches', () => {
    const entries = [makeEntry({ targetHours: 24, urgency: 'ROUTINE' })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE' });
    expect(result).toBe(24);
  });

  it('prefers a client-specific rule over a system-wide default - most-specific-wins', () => {
    const entries = [
      makeEntry({ targetHours: 24, urgency: 'ROUTINE' }),
      makeEntry({ targetHours: 12, urgency: 'ROUTINE', facilityId: 'client-1' }),
    ];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', facilityId: 'client-1' });
    expect(result).toBe(12);
  });

  it('returns null (not a fabricated default) when genuinely nothing matches', () => {
    const entries = [makeEntry({ type: 'FROZEN_SECTION' })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE' });
    expect(result).toBeNull();
  });

  it('ignores role-scoped entries for case-level resolution - roleId must be null to be eligible', () => {
    const entries = [makeEntry({ targetHours: 8, roleId: 'resident' })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', {});
    expect(result).toBeNull();
  });

  it('ignores inactive entries', () => {
    const entries = [makeEntry({ targetHours: 24, active: false })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', {});
    expect(result).toBeNull();
  });

  it('does not match a STAT-only entry against a routine case', () => {
    const entries = [makeEntry({ targetHours: 4, urgency: 'STAT' })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE' });
    expect(result).toBeNull();
  });
});

describe('resolveTatTargetHours — real, per direct guidance: Performing Lab and Ordering Client are two genuinely separate, independently-applicable dimensions, not one replacing the other', () => {
  it('a performing-lab-specific rule wins over the system default, the same way a client-specific one already does', () => {
    const entries = [
      makeEntry({ targetHours: 24, urgency: 'ROUTINE' }),
      makeEntry({ targetHours: 8, urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' }),
    ];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' });
    expect(result).toBe(8);
  });

  it('a real ordering client agreement and a real performing lab policy can both exist independently, and the context resolves to whichever one actually applies', () => {
    const entries = [
      makeEntry({ targetHours: 24, urgency: 'ROUTINE' }),
      makeEntry({ targetHours: 8, urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' }),
      makeEntry({ targetHours: 12, urgency: 'ROUTINE', facilityId: 'client-1' }),
    ];
    // A case performed at lab-1, ordered by some other, unrelated client
    // — the lab's own policy applies, the client-1 agreement doesn't.
    expect(resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-1', facilityId: 'client-99' })).toBe(8);
    // A case ordered by client-1, performed at some other, unrelated lab
    // — client-1's own agreement applies, lab-1's policy doesn't.
    expect(resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-99', facilityId: 'client-1' })).toBe(12);
  });

  it('real compounding specificity: an entry with BOTH a performing lab and an ordering client set wins over one with only either alone', () => {
    const entries = [
      makeEntry({ targetHours: 24, urgency: 'ROUTINE' }),
      makeEntry({ targetHours: 8, urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' }),
      makeEntry({ targetHours: 12, urgency: 'ROUTINE', facilityId: 'client-1' }),
      makeEntry({ targetHours: 4, urgency: 'ROUTINE', performingLabFacilityId: 'lab-1', facilityId: 'client-1' }),
    ];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-1', facilityId: 'client-1' });
    expect(result).toBe(4);
  });

  it('a performing-lab-specific rule never fires for a different real performing lab, even with everything else identical', () => {
    const entries = [makeEntry({ targetHours: 8, urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-2' });
    expect(result).toBeNull();
  });

  it('real, per direct guidance: an entry with neither dimension set (Enterprise-wide) still applies when the case has both a real performing lab and a real ordering client, as the honest fallback', () => {
    const entries = [makeEntry({ targetHours: 24, urgency: 'ROUTINE' })];
    const result = resolveTatTargetHours(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-1', facilityId: 'client-1' });
    expect(result).toBe(24);
  });
});

describe('resolveTatEntry — real, per direct guidance: the winning-entry resolution TATConfigSection.tsx\'s own Resolution Simulator now calls directly, replacing a real, hand-maintained, already-stale duplicate priority list', () => {
  it('returns the actual winning entry, not just its targetHours — the real reason a consumer would need this over resolveTatTargetHours', () => {
    const entries = [
      makeEntry({ targetHours: 24, urgency: 'ROUTINE' }),
      makeEntry({ targetHours: 8, urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' }),
    ];
    const result = resolveTatEntry(entries, 'TOTAL_CASE', { urgency: 'ROUTINE', performingLabFacilityId: 'lab-1' });
    expect(result?.targetHours).toBe(8);
    expect(result?.performingLabFacilityId).toBe('lab-1');
  });

  it('resolveTatTargetHours is a genuine thin wrapper over this — the two can never disagree, by construction', () => {
    const entries = [
      makeEntry({ targetHours: 24, urgency: 'ROUTINE' }),
      makeEntry({ targetHours: 8, urgency: 'ROUTINE', facilityId: 'client-1', performingLabFacilityId: 'lab-1' }),
    ];
    const context = { urgency: 'ROUTINE' as const, facilityId: 'client-1', performingLabFacilityId: 'lab-1' };
    const entry = resolveTatEntry(entries, 'TOTAL_CASE', context);
    const hours = resolveTatTargetHours(entries, 'TOTAL_CASE', context);
    expect(entry?.targetHours).toBe(hours);
  });

  it('returns null (not a fabricated entry) when genuinely nothing matches', () => {
    const entries = [makeEntry({ targetHours: 24, urgency: 'STAT' })];
    const result = resolveTatEntry(entries, 'TOTAL_CASE', { urgency: 'ROUTINE' });
    expect(result).toBeNull();
  });
});

describe('computeTotalCaseTatOutliers — real fix: replaces the entirely hardcoded mockTotalTATOutliers array', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ targetHours: 24, urgency: 'ROUTINE' })];

  it('flags a genuine outlier - real elapsed time exceeding the real resolved target', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine', receivedDate: '2026-03-20T00:00:00.000Z' },
      diagnostic: { issuedDate: '2026-03-21T06:00:00.000Z' }, // 30 real hours, target is 24
    }];
    const result = computeTotalCaseTatOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].tatHrs).toBe(30);
    expect(result[0].overByHrs).toBe(6);
  });

  it('does not flag a case within target', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine', receivedDate: '2026-03-20T00:00:00.000Z' },
      diagnostic: { issuedDate: '2026-03-20T12:00:00.000Z' }, // 12 hours, target is 24
    }];
    const result = computeTotalCaseTatOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes a case with no target resolvable at all, rather than defaulting to a fabricated number that could create a false breach', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine', receivedDate: '2026-03-20T00:00:00.000Z' },
      diagnostic: { issuedDate: '2026-03-25T00:00:00.000Z' }, // 120 hours, well over any real target
    }];
    const result = computeTotalCaseTatOutliers(cases, [], {}, now); // no entries at all
    expect(result).toHaveLength(0);
  });

  it('excludes a case missing either real timestamp, rather than guessing', () => {
    const cases: CaseForTatCalc[] = [
      { id: 'S26-1', order: { receivedDate: '2026-03-20T00:00:00.000Z' } }, // no issuedDate
      { id: 'S26-2', diagnostic: { issuedDate: '2026-03-21T00:00:00.000Z' } },   // no receivedDate
    ];
    const result = computeTotalCaseTatOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('resolves the real client name for assigningAuthority when available', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine', facilityId: 'client-1', receivedDate: '2026-03-20T00:00:00.000Z' },
      diagnostic: { issuedDate: '2026-03-21T06:00:00.000Z' },
    }];
    const result = computeTotalCaseTatOutliers(cases, entries, { 'client-1': 'Metro General Hospital' }, now);
    expect(result[0].assigningAuthority).toBe('Metro General Hospital');
  });

  it('maps Rush priority to the Routine TAT tier, since the TAT system only has two tiers', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Rush', receivedDate: '2026-03-20T00:00:00.000Z' },
      diagnostic: { issuedDate: '2026-03-21T06:00:00.000Z' },
    }];
    const result = computeTotalCaseTatOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(1); // matched the ROUTINE-tier entry, not excluded
  });
});

describe('computeFirstTouchOutliers — real fix: replaces mockFirstTouchOutliers, using the new real firstOpenedAt field', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'FIRST_TOUCH', targetHours: 4, urgency: 'ROUTINE' })];

  it('flags a genuine first-touch delay', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine', receivedDate: '2026-03-20T08:00:00.000Z' },
      firstOpenedAt: '2026-03-20T14:00:00.000Z', // 6 real hours, target is 4
    }];
    const result = computeFirstTouchOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].firstTouchHrs).toBe(6);
  });

  it('excludes a case never yet opened (no firstOpenedAt at all)', () => {
    const cases: CaseForTatCalc[] = [{ id: 'S26-1', order: { receivedDate: '2026-03-20T08:00:00.000Z' } }];
    const result = computeFirstTouchOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

describe('computeGrossingOutliers — real fix: replaces mockGrossingOutliers, using the new real grossCompletedAt field', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'GROSSING', targetHours: 4, urgency: 'ROUTINE' })];

  it('flags a genuine grossing delay', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine', receivedDate: '2026-03-20T08:00:00.000Z' },
      grossCompletedAt: '2026-03-20T20:00:00.000Z', // 12 real hours, target is 4
    }];
    const result = computeGrossingOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].actualHrs).toBe(12);
  });

  it('excludes a case where grossing has not been genuinely completed yet', () => {
    const cases: CaseForTatCalc[] = [{ id: 'S26-1', order: { receivedDate: '2026-03-20T08:00:00.000Z' } }];
    const result = computeGrossingOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

describe('computeSignOutOutliers — real fix: replaces mockSignOutOutliers, using grossCompletedAt \u2192 issuedDate (real gross-to-final-signout interval)', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'SIGN_OUT', targetHours: 24, urgency: 'ROUTINE' })];

  it('flags a genuine sign-out delay measured from real grossing completion, not case receipt', () => {
    const cases: CaseForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine' },
      grossCompletedAt: '2026-03-20T08:00:00.000Z',
      diagnostic: { issuedDate: '2026-03-22T08:00:00.000Z' }, // 48 real hours, target is 24
    }];
    const result = computeSignOutOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].actualHrs).toBe(48);
  });

  it('excludes a case never grossed, even if issuedDate exists', () => {
    const cases: CaseForTatCalc[] = [{ id: 'S26-1', diagnostic: { issuedDate: '2026-03-22T08:00:00.000Z' } }];
    const result = computeSignOutOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

describe('computeFrozenSectionOutliers — real fix: replaces mockFrozenSectionOutliers, cross-referencing real intraop data to a real Case via mergedIntoCaseId', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'FROZEN_SECTION', targetHours: 0.5, urgency: 'ROUTINE' })];
  const realCase: CaseForTatCalc = { id: 'S26-1', order: { priority: 'Routine' }, specimens: [{ description: 'Thyroid lobe' }] };

  it('flags a genuine delay between arrival and the real diagnosis-rendered timestamp', () => {
    const intraop: IntraopEntryForTatCalc[] = [{
      id: 'intraop-1', status: 'merged', mergedIntoCaseId: 'S26-1',
      specimens: [{
        id: 'sp-1',
        arrivalTimestamp: '2026-03-20T10:00:00.000Z',
        milestones: [],
        frozenDiagnosisRenderedAt: '2026-03-20T10:45:00.000Z', // 45 min, target 30
      }],
    }];
    const result = computeFrozenSectionOutliers(intraop, [realCase], entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].actualHrs).toBe(0.8); // 48 min rounded, ~0.75h -> 0.8 at one decimal
  });

  it('excludes an entry that never got merged into a real case', () => {
    const intraop: IntraopEntryForTatCalc[] = [{
      id: 'intraop-1', status: 'pending', mergedIntoCaseId: undefined,
      specimens: [{ id: 'sp-1', arrivalTimestamp: '2026-03-20T10:00:00.000Z', milestones: [], frozenDiagnosisRenderedAt: '2026-03-20T10:45:00.000Z' }],
    }];
    const result = computeFrozenSectionOutliers(intraop, [realCase], entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes an entry whose mergedIntoCaseId does not match any real case - the exact bug caught in real seed data', () => {
    const intraop: IntraopEntryForTatCalc[] = [{
      id: 'intraop-1', status: 'merged', mergedIntoCaseId: 'does-not-exist',
      specimens: [{ id: 'sp-1', arrivalTimestamp: '2026-03-20T10:00:00.000Z', milestones: [], frozenDiagnosisRenderedAt: '2026-03-20T10:45:00.000Z' }],
    }];
    const result = computeFrozenSectionOutliers(intraop, [realCase], entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes a specimen with no diagnosis rendered yet', () => {
    const intraop: IntraopEntryForTatCalc[] = [{
      id: 'intraop-1', status: 'merged', mergedIntoCaseId: 'S26-1',
      specimens: [{ id: 'sp-1', arrivalTimestamp: '2026-03-20T10:00:00.000Z', milestones: [] }],
    }];
    const result = computeFrozenSectionOutliers(intraop, [realCase], entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

describe('computeColdIschemiaOutliers — real fix: replaces mockColdIschemiaOutliers, using the real, already-designed Specimen.collectedAt/processing.processedAt fields', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'COLD_ISCHEMIA', targetHours: 1, urgency: 'ROUTINE' })];

  it('flags a genuine cold ischemia breach', () => {
    const cases: CaseWithSpecimensForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine' },
      specimens: [{
        id: 'sp-1', description: 'Breast margin',
        collectedAt: '2026-03-20T09:00:00.000Z',
        processing: { processedAt: '2026-03-20T10:35:00.000Z' }, // 95 min, target 60
      }],
    }];
    const result = computeColdIschemiaOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].actualHrs).toBeCloseTo(1.58, 1);
  });

  it('never treats an estimated processedAt as verified compliance data', () => {
    const cases: CaseWithSpecimensForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine' },
      specimens: [{
        id: 'sp-1',
        collectedAt: '2026-03-20T09:00:00.000Z',
        processing: { processedAt: '2026-03-20T10:35:00.000Z', processedAtIsEstimated: true },
      }],
    }];
    const result = computeColdIschemiaOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('does not flag a specimen within target', () => {
    const cases: CaseWithSpecimensForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine' },
      specimens: [{
        id: 'sp-1',
        collectedAt: '2026-03-20T09:00:00.000Z',
        processing: { processedAt: '2026-03-20T09:30:00.000Z' }, // 30 min, target 60
      }],
    }];
    const result = computeColdIschemiaOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes a specimen missing either real timestamp', () => {
    const cases: CaseWithSpecimensForTatCalc[] = [{
      id: 'S26-1',
      order: { priority: 'Routine' },
      specimens: [{ id: 'sp-1', collectedAt: '2026-03-20T09:00:00.000Z' }],
    }];
    const result = computeColdIschemiaOutliers(cases, entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

describe('computeConsultResponseOutliers — real fix: replaces mockConsultResponseOutliers, built on the real DelegationRecord system, scoped to CASUAL_REVIEW per Pete\'s direct correction', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'CONSULTATION_RESPONSE', targetHours: 24, urgency: 'ROUTINE' })];
  const realCase: CaseForTatCalc = { id: 'S26-1', order: { priority: 'Routine' }, specimens: [{ description: 'GI biopsy' }] };

  it('flags a genuine slow response when the current user completed a real, informal review request', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-b', toUserId: 'user-a',
      delegationType: 'CASUAL_REVIEW', status: 'completed',
      timestamp: '2026-03-20T08:00:00.000Z', completedAt: '2026-03-21T14:00:00.000Z', // 30h, target 24
    }];
    const result = computeConsultResponseOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].actualHrs).toBe(30);
  });

  it('excludes a formal SECOND_OPINION delegation - deliberately scoped to informal review only', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-b', toUserId: 'user-a',
      delegationType: 'SECOND_OPINION', status: 'completed',
      timestamp: '2026-03-20T08:00:00.000Z', completedAt: '2026-03-21T14:00:00.000Z',
    }];
    const result = computeConsultResponseOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes a request not yet responded to', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-b', toUserId: 'user-a',
      delegationType: 'CASUAL_REVIEW', status: 'pending',
      timestamp: '2026-03-20T08:00:00.000Z',
    }];
    const result = computeConsultResponseOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes a request directed at someone else', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-b', toUserId: 'user-c',
      delegationType: 'CASUAL_REVIEW', status: 'completed',
      timestamp: '2026-03-20T08:00:00.000Z', completedAt: '2026-03-21T14:00:00.000Z',
    }];
    const result = computeConsultResponseOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

describe('computeConsultAwaitingOutliers — real fix: replaces mockConsultAwaitingOutliers, measuring a genuinely ongoing wait rather than a completed interval', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const entries = [makeEntry({ type: 'CONSULTATION_AWAITING', targetHours: 24, urgency: 'ROUTINE' })];
  const realCase: CaseForTatCalc = { id: 'S26-1', order: { priority: 'Routine' }, specimens: [{ description: 'GI biopsy' }] };

  it('flags a genuine, still-ongoing wait past target', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-a', toUserId: 'user-b',
      delegationType: 'CASUAL_REVIEW', status: 'pending',
      timestamp: '2026-03-30T00:00:00.000Z', // 48h before "now", target 24
    }];
    const result = computeConsultAwaitingOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].actualHrs).toBe(48);
  });

  it('excludes a request that has already been resolved - no longer genuinely "awaiting"', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-a', toUserId: 'user-b',
      delegationType: 'CASUAL_REVIEW', status: 'completed',
      timestamp: '2026-03-30T00:00:00.000Z', completedAt: '2026-03-31T00:00:00.000Z',
    }];
    const result = computeConsultAwaitingOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(0);
  });

  it('excludes a request the current user did not originate', () => {
    const delegations: DelegationForTatCalc[] = [{
      id: 'del-1', caseId: 'S26-1', fromUserId: 'user-c', toUserId: 'user-b',
      delegationType: 'CASUAL_REVIEW', status: 'pending',
      timestamp: '2026-03-30T00:00:00.000Z',
    }];
    const result = computeConsultAwaitingOutliers(delegations, [realCase], 'user-a', entries, {}, now);
    expect(result).toHaveLength(0);
  });
});

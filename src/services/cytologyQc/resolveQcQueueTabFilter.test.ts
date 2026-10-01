import { describe, it, expect } from 'vitest';
import { resolveQcQueueTabFilter } from './resolveQcQueueTabFilter';
import type { CytologyQcCaseAssignment } from '@/types/cytologyQc/CytologyQcRule';

const item = (priorityTier: CytologyQcCaseAssignment['priorityTier']): CytologyQcCaseAssignment => ({
  id: `a-${priorityTier}`, caseId: 'c1', specimenId: 's1', triggerSource: 'rule_match',
  priorityTier, badges: [], state: 'QC_PENDING', primarySignOutProviderId: 'p1',
  slaEscalationCount: 0, slaDeadline: new Date().toISOString(), createdAt: new Date().toISOString(),
});

describe('resolveQcQueueTabFilter', () => {
  const all = [item('high_escalation'), item('targeted_high_consequence'), item('routine_random')];

  it('the "all" tab returns every real item untouched', () => {
    expect(resolveQcQueueTabFilter(all, 'all')).toHaveLength(3);
  });

  it('the "escalations_discrepancies" tab includes both real non-routine tiers', () => {
    const result = resolveQcQueueTabFilter(all, 'escalations_discrepancies');
    expect(result).toHaveLength(2);
    expect(result.every(a => a.priorityTier !== 'routine_random')).toBe(true);
  });

  it('the "routine_random" tab only includes real routine-tier items', () => {
    const result = resolveQcQueueTabFilter(all, 'routine_random');
    expect(result).toHaveLength(1);
    expect(result[0].priorityTier).toBe('routine_random');
  });
});

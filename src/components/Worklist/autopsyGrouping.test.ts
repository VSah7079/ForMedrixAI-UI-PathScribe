import { describe, it, expect } from 'vitest';
import { buildAutopsyGroupRows } from './autopsyGrouping';
import type { Case } from '@/types/case/Case';

const autopsyCase = (id: string, overrides: any = {}): any => ({
  id,
  autopsy: {
    caseAuthority: 'hospital_consented',
    hospitalConsent: {},
    ancillaryHold: { active: false },
    addenda: [],
    ...overrides,
  },
});

describe('buildAutopsyGroupRows', () => {
  it('a real temporary case (no real consent logged yet) groups under Temporary Accession', () => {
    const rows = buildAutopsyGroupRows([autopsyCase('c1')] as Case[]);
    expect(rows[0]).toMatchObject({ __divider: true, groupKey: 'temporary', count: 1 });
    expect((rows[1] as any).id).toBe('c1');
  });

  it('a real, fully-consented case groups under Fully Authorized', () => {
    const rows = buildAutopsyGroupRows([autopsyCase('c1', { hospitalConsent: { consentGivenAt: '2026-01-01' } })] as Case[]);
    expect(rows[0]).toMatchObject({ __divider: true, groupKey: 'fully_authorized', count: 1 });
  });

  it('Temporary Accession sorts before Fully Authorized, regardless of real input order', () => {
    const cases = [
      autopsyCase('c-auth', { hospitalConsent: { consentGivenAt: '2026-01-01' } }),
      autopsyCase('c-temp'),
    ] as Case[];
    const rows = buildAutopsyGroupRows(cases);
    const dividerLabels = rows.filter(r => '__divider' in r).map((r: any) => r.groupKey);
    expect(dividerLabels).toEqual(['temporary', 'fully_authorized']);
  });

  it('a real case with no autopsy details at all is silently skipped, never guessed into a group', () => {
    const rows = buildAutopsyGroupRows([{ id: 'c-not-autopsy' } as Case]);
    expect(rows).toEqual([]);
  });

  it('a genuinely empty case list returns a genuinely empty row set', () => {
    expect(buildAutopsyGroupRows([])).toEqual([]);
  });
});

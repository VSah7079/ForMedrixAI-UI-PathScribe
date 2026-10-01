// src/services/cytology/resolveCytologyHistologySeverityFromSnomed.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHistologySeverityFromSnomed, type SnomedSeverityMappingEntry } from './resolveCytologyHistologySeverityFromSnomed';

// Real, deliberate: these are obviously-synthetic test identifiers,
// never real SNOMED CT code values, matching this codebase's own
// established TEST-SNOMED convention (types/case/Case.ts).
const TEST_MAPPING: SnomedSeverityMappingEntry[] = [
  { snomedCode: 'TEST-BENIGN-001', severityRank: 0 },
  { snomedCode: 'TEST-CIN1-001', severityRank: 1 },
  { snomedCode: 'TEST-CIN2-001', severityRank: 2 },
  { snomedCode: 'TEST-CIN3-001', severityRank: 4 },
  { snomedCode: 'TEST-INVASIVE-001', severityRank: 5 },
];

describe('resolveCytologyHistologySeverityFromSnomed — real, per direct correction ("that is where you can find the comparison")', () => {
  it('a real specimen with no SNOMED coding at all resolves to honest undefined, never a fabricated rank', () => {
    expect(resolveCytologyHistologySeverityFromSnomed(undefined, TEST_MAPPING)).toBeUndefined();
    expect(resolveCytologyHistologySeverityFromSnomed([], TEST_MAPPING)).toBeUndefined();
  });

  it('a real SNOMED code with no entry in the given mapping resolves to honest undefined — the real "pending a confirmed license" state, never a fabricated rank', () => {
    const coding = [{ code: 'TEST-UNMAPPED-999' }];
    expect(resolveCytologyHistologySeverityFromSnomed(coding, TEST_MAPPING)).toBeUndefined();
  });

  it('a real, single mapped SNOMED code correctly resolves its own severity rank', () => {
    const coding = [{ code: 'TEST-CIN3-001' }];
    expect(resolveCytologyHistologySeverityFromSnomed(coding, TEST_MAPPING)).toBe(4);
  });

  it('when a real specimen carries more than one real, individually-applied SNOMED code, the HIGHEST resolvable severity wins', () => {
    const coding = [{ code: 'TEST-CIN1-001' }, { code: 'TEST-INVASIVE-001' }];
    expect(resolveCytologyHistologySeverityFromSnomed(coding, TEST_MAPPING)).toBe(5);
  });

  it('real, repeated individual associations for the same real concept (never deduplicated on write) correctly resolve the same real rank, not double-counted', () => {
    const coding = [{ code: 'TEST-CIN2-001' }, { code: 'TEST-CIN2-001' }, { code: 'TEST-CIN2-001' }];
    expect(resolveCytologyHistologySeverityFromSnomed(coding, TEST_MAPPING)).toBe(2);
  });

  it('a real mix of mapped and unmapped codes on the same specimen still resolves from the mapped ones, ignoring the unmapped', () => {
    const coding = [{ code: 'TEST-UNMAPPED-999' }, { code: 'TEST-CIN2-001' }];
    expect(resolveCytologyHistologySeverityFromSnomed(coding, TEST_MAPPING)).toBe(2);
  });
});

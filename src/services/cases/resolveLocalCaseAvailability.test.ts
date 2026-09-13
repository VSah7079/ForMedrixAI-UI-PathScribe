import { describe, it, expect } from 'vitest';
import { resolveLocalCaseAvailability } from './resolveLocalCaseAvailability';
import type { Case } from '@/types/case/Case';

const makeCase = (id: string, accession: string): Case => ({
  id, accession: { fullAccession: accession },
} as any);

describe('resolveLocalCaseAvailability', () => {
  it('a case genuinely in the local cache, with no pending amendment, opens immediately', () => {
    const result = resolveLocalCaseAvailability('S26-1001', [makeCase('c1', 'S26-1001')], new Set());
    expect(result.availability).toBe('available_locally');
  });

  it('a case not in the local cache at all needs a real remote fetch', () => {
    const result = resolveLocalCaseAvailability('S26-9999', [], new Set());
    expect(result).toEqual({ availability: 'needs_remote_fetch', reason: 'not_in_local_cache' });
  });

  it('a case that IS in the local cache, but has a real pending LIS amendment notice, is still treated as a real cache miss', () => {
    const result = resolveLocalCaseAvailability('S26-1001', [makeCase('c1', 'S26-1001')], new Set(['c1']));
    expect(result).toEqual({ availability: 'needs_remote_fetch', reason: 'pending_lis_amendment' });
  });

  it('a pending amendment on a DIFFERENT case never affects this one', () => {
    const result = resolveLocalCaseAvailability('S26-1001', [makeCase('c1', 'S26-1001')], new Set(['some-other-case']));
    expect(result.availability).toBe('available_locally');
  });
});

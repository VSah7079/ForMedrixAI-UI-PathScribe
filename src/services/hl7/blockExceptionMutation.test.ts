import { describe, it, expect } from 'vitest';
import { applyBlockException } from './blockExceptionMutation';
import type { Specimen } from '@/types/case/Specimen';

const baseSpecimens = (): Specimen[] => [
  {
    id: 'SP-1', label: 'A', description: 'Breast',
    blocks: [
      { id: 'BLK-1', label: '1', status: 'Grossed' } as any,
      { id: 'BLK-2', label: '2', status: 'Grossed' } as any,
    ],
  } as any,
];

describe('applyBlockException', () => {
  it('sets status, exceptionNote, and exceptionReportedAt on the matching block only', () => {
    const result = applyBlockException(baseSpecimens(), {
      specimenLetter: 'A', blockNumber: '1', status: 'Lost',
      note: 'Dropped during embedding', reportedAt: '2026-01-01T00:00:00Z', timestamp: '2026-01-01T00:05:00Z',
    });
    expect(result).not.toBeNull();
    const block1 = result!.specimens[0].blocks!.find((b: any) => b.id === 'BLK-1')!;
    const block2 = result!.specimens[0].blocks!.find((b: any) => b.id === 'BLK-2')!;
    expect((block1 as any).status).toBe('Lost');
    expect((block1 as any).exceptionNote).toBe('Dropped during embedding');
    expect((block1 as any).exceptionReportedAt).toBe('2026-01-01T00:00:00Z');
    expect((block2 as any).status).toBe('Grossed'); // untouched
    expect(result!.specimenId).toBe('SP-1');
    expect(result!.blockId).toBe('BLK-1');
  });

  it('falls back to timestamp when reportedAt is not provided', () => {
    const result = applyBlockException(baseSpecimens(), {
      specimenLetter: 'A', blockNumber: '1', status: 'Damaged', timestamp: '2026-01-01T00:05:00Z',
    });
    const block1 = result!.specimens[0].blocks!.find((b: any) => b.id === 'BLK-1')!;
    expect((block1 as any).exceptionReportedAt).toBe('2026-01-01T00:05:00Z');
  });

  it('returns null for an unknown specimen letter', () => {
    expect(applyBlockException(baseSpecimens(), { specimenLetter: 'Z', blockNumber: '1', status: 'Lost', timestamp: 't' })).toBeNull();
  });

  it('returns null for an unknown block number on a real specimen', () => {
    expect(applyBlockException(baseSpecimens(), { specimenLetter: 'A', blockNumber: '99', status: 'Lost', timestamp: 't' })).toBeNull();
  });

  it('never mutates the original specimens array (real immutability)', () => {
    const original = baseSpecimens();
    const originalBlock1 = original[0].blocks![0];
    applyBlockException(original, { specimenLetter: 'A', blockNumber: '1', status: 'Lost', timestamp: 't' });
    expect(original[0].blocks![0]).toBe(originalBlock1);
    expect((originalBlock1 as any).status).toBe('Grossed');
  });
});

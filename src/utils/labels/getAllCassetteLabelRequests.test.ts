// src/utils/labels/getAllCassetteLabelRequests.test.ts
import { describe, it, expect } from 'vitest';
import { getAllCassetteLabelRequests } from './getAllCassetteLabelRequests';
import type { Case } from '@/types/case/Case';

function makeCase(
  specimens: Array<{ label: string; blocks: Array<{ label: string }> }>,
  matrixBlocks: Array<{ label: string; participantLabels: string[] }> = [],
): Case {
  const specimenRecords = specimens.map(sp => ({
    id: `sp-${sp.label}`,
    label: sp.label,
    blocks: sp.blocks.map(b => ({ id: `blk-${sp.label}-${b.label}`, label: b.label, status: 'Grossed', stains: [] })),
  }));
  return {
    id: 'O26-0031',
    accession: { fullAccession: 'DVMC26-0001' },
    specimens: specimenRecords,
    matrixBlocks: matrixBlocks.map((mb, i) => ({
      id: `mtx-${i}`,
      label: mb.label,
      status: 'Grossed',
      participants: mb.participantLabels.map(label => ({
        specimenId: specimenRecords.find(s => s.label === label)?.id ?? `sp-${label}`,
        positionInBlock: 1,
      })),
      slides: [],
      createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'test',
    })),
  } as unknown as Case;
}

describe('getAllCassetteLabelRequests — real feature, per direct research: "Print All Cassettes for Case"', () => {
  it('a case with no specimens or matrix blocks produces genuinely empty lists, not an error', () => {
    const caseData = makeCase([]);
    expect(getAllCassetteLabelRequests(caseData)).toEqual({ ordinary: [], matrix: [] });
  });

  it('a specimen with no blocks contributes nothing to the ordinary list', () => {
    const caseData = makeCase([{ label: 'A', blocks: [] }]);
    expect(getAllCassetteLabelRequests(caseData).ordinary).toEqual([]);
  });

  it('one specimen with three real blocks produces exactly three ordinary requests', () => {
    const caseData = makeCase([{ label: 'A', blocks: [{ label: '1' }, { label: '2' }, { label: '3' }] }]);
    const { ordinary } = getAllCassetteLabelRequests(caseData);
    expect(ordinary).toHaveLength(3);
    expect(ordinary.map(r => r.cassetteId)).toEqual(['DVMC26-0001-A1', 'DVMC26-0001-A2', 'DVMC26-0001-A3']);
  });

  it('multiple specimens each contribute their own real blocks, in order', () => {
    const caseData = makeCase([
      { label: 'A', blocks: [{ label: '1' }] },
      { label: 'B', blocks: [{ label: '1' }, { label: '2' }] },
    ]);
    const { ordinary } = getAllCassetteLabelRequests(caseData);
    expect(ordinary.map(r => r.cassetteId)).toEqual(['DVMC26-0001-A1', 'DVMC26-0001-B1', 'DVMC26-0001-B2']);
  });

  it('every ordinary request carries the real, correct fullAccession and specimenLabel', () => {
    const caseData = makeCase([{ label: 'C', blocks: [{ label: '1' }] }]);
    const [request] = getAllCassetteLabelRequests(caseData).ordinary;
    expect(request.fullAccession).toBe('DVMC26-0001');
    expect(request.specimenLabel).toBe('C');
    expect(request.blockLabel).toBe('1');
  });

  // Real feature, per direct follow-up: "primary label printing for
  // matrix blocks." Before this fix, a real matrix block was silently
  // invisible to this function entirely — "Print All Cassettes for
  // Case" never dispatched anything for a shared cassette.
  it('a case with no matrix blocks produces a genuinely empty matrix list', () => {
    const caseData = makeCase([{ label: 'A', blocks: [{ label: '1' }] }]);
    expect(getAllCassetteLabelRequests(caseData).matrix).toEqual([]);
  });

  it('a real matrix block shared by two specimens produces exactly one matrix request', () => {
    const caseData = makeCase(
      [{ label: 'A', blocks: [] }, { label: 'B', blocks: [] }],
      [{ label: 'C1', participantLabels: ['A', 'B'] }],
    );
    const { matrix } = getAllCassetteLabelRequests(caseData);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].cassetteId).toBe('DVMC26-0001-C1');
    expect(matrix[0].specimenLabels).toEqual(['A', 'B']);
    expect(matrix[0].matrixBlockLabel).toBe('C1');
  });

  it('ordinary blocks and matrix blocks on the same case both appear, independently', () => {
    const caseData = makeCase(
      [{ label: 'A', blocks: [{ label: '1' }] }, { label: 'B', blocks: [] }],
      [{ label: 'C1', participantLabels: ['A', 'B'] }],
    );
    const { ordinary, matrix } = getAllCassetteLabelRequests(caseData);
    expect(ordinary).toHaveLength(1);
    expect(matrix).toHaveLength(1);
  });
});

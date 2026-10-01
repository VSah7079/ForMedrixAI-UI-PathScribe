// src/utils/labels/dispatchCassetteLabel.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchCassetteLabel, getDispatchedCassetteLabels, _resetDispatchedCassetteLabelsForTests } from './dispatchCassetteLabel';

beforeEach(() => {
  _resetDispatchedCassetteLabelsForTests();
});

describe('dispatchCassetteLabel — real, honest stub pending PS-51 (engraver integration, not a print pipeline)', () => {
  it('reports dispatched: true and method: "stub", never throws', async () => {
    const result = await dispatchCassetteLabel({
      fullAccession: 'DVMC26-0001',
      specimenLabel: 'A',
      blockLabel: '1',
      cassetteId: 'DVMC26-0001-A1',
    });
    expect(result).toEqual({ dispatched: true, method: 'stub' });
  });

  it('records the real request in the inspectable log', async () => {
    await dispatchCassetteLabel({
      fullAccession: 'DVMC26-0001',
      specimenLabel: 'A',
      blockLabel: '1',
      cassetteId: 'DVMC26-0001-A1',
    });
    const log = getDispatchedCassetteLabels();
    expect(log).toHaveLength(1);
    expect(log[0].cassetteId).toBe('DVMC26-0001-A1');
  });

  it('multiple real dispatches accumulate in order', async () => {
    await dispatchCassetteLabel({ fullAccession: 'X', specimenLabel: 'A', blockLabel: '1', cassetteId: 'X-A1' });
    await dispatchCassetteLabel({ fullAccession: 'X', specimenLabel: 'A', blockLabel: '2', cassetteId: 'X-A2' });
    const log = getDispatchedCassetteLabels();
    expect(log.map(r => r.cassetteId)).toEqual(['X-A1', 'X-A2']);
  });

  it('the test reset genuinely clears the log between cases', async () => {
    await dispatchCassetteLabel({ fullAccession: 'X', specimenLabel: 'A', blockLabel: '1', cassetteId: 'X-A1' });
    _resetDispatchedCassetteLabelsForTests();
    expect(getDispatchedCassetteLabels()).toHaveLength(0);
  });
});

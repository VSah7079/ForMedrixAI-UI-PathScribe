import { describe, it, expect } from 'vitest';
import { resolveQcSamplingDecision, INITIAL_QC_SAMPLING_STATE } from './resolveQcSamplingDecision';

describe('resolveQcSamplingDecision', () => {
  describe('percentage mode', () => {
    it('a real roll under the rate selects the case', () => {
      const result = resolveQcSamplingDecision({ type: 'percentage', ratePercent: 10 }, INITIAL_QC_SAMPLING_STATE, 0.05);
      expect(result.selected).toBe(true);
    });
    it('a real roll at or above the rate does not select the case', () => {
      const result = resolveQcSamplingDecision({ type: 'percentage', ratePercent: 10 }, INITIAL_QC_SAMPLING_STATE, 0.5);
      expect(result.selected).toBe(false);
    });
    it('percentage mode never mutates the counter state — it has none to mutate', () => {
      const state = { casesEvaluatedSinceReset: 3, casesSelectedTotal: 7 };
      const result = resolveQcSamplingDecision({ type: 'percentage', ratePercent: 50 }, state, 0.1);
      expect(result.updatedState).toEqual(state);
    });
  });

  describe('interval mode', () => {
    it('selects on exactly the Nth real matching case and resets the counter', () => {
      let state = INITIAL_QC_SAMPLING_STATE;
      for (let i = 1; i < 5; i++) {
        const result = resolveQcSamplingDecision({ type: 'interval', everyNthCase: 5 }, state, 0.9);
        expect(result.selected).toBe(false);
        state = result.updatedState;
      }
      const fifthResult = resolveQcSamplingDecision({ type: 'interval', everyNthCase: 5 }, state, 0.9);
      expect(fifthResult.selected).toBe(true);
      expect(fifthResult.updatedState.casesEvaluatedSinceReset).toBe(0);
    });
  });

  describe('fixed_volume mode', () => {
    it('selects every real case until the real fixed volume is reached, then stops permanently', () => {
      let state = INITIAL_QC_SAMPLING_STATE;
      for (let i = 0; i < 3; i++) {
        const result = resolveQcSamplingDecision({ type: 'fixed_volume', firstNCases: 3 }, state, 0.9);
        expect(result.selected).toBe(true);
        state = result.updatedState;
      }
      expect(state.casesSelectedTotal).toBe(3);
      const fourthResult = resolveQcSamplingDecision({ type: 'fixed_volume', firstNCases: 3 }, state, 0.9);
      expect(fourthResult.selected).toBe(false);
    });

    it('never resets — a real fixed-volume rule\'s own history is permanent, not a recurring window', () => {
      const exhaustedState = { casesEvaluatedSinceReset: 0, casesSelectedTotal: 3 };
      const result = resolveQcSamplingDecision({ type: 'fixed_volume', firstNCases: 3 }, exhaustedState, 0.001);
      expect(result.selected).toBe(false);
    });
  });
});

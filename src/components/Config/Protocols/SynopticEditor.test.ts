import { describe, it, expect } from 'vitest';
import { isVisible } from './SynopticEditor';

describe('isVisible', () => {
  it('a real, undefined condition is always visible', () => {
    expect(isVisible(undefined, {})).toBe(true);
  });

  it('a real, existing single-value condition (answerId alone) keeps working completely unchanged', () => {
    expect(isVisible({ fieldId: 'f1', answerId: 'a' }, { f1: 'a' })).toBe(true);
    expect(isVisible({ fieldId: 'f1', answerId: 'a' }, { f1: 'b' })).toBe(false);
  });

  it('a real, existing single-value condition against a real, array-type answer still works via includes()', () => {
    expect(isVisible({ fieldId: 'f1', answerId: 'a' }, { f1: ['a', 'c'] })).toBe(true);
    expect(isVisible({ fieldId: 'f1', answerId: 'a' }, { f1: ['b', 'c'] })).toBe(false);
  });

  it('a real, new multi-value condition (answerIds) matches on ANY one of them \u2014 the real OR-logic Part B needs', () => {
    const condition = { fieldId: 'container', answerId: '', answerIds: ['whole_body', 'thoraco_abdominal'] };
    expect(isVisible(condition, { container: 'whole_body' })).toBe(true);
    expect(isVisible(condition, { container: 'thoraco_abdominal' })).toBe(true);
    expect(isVisible(condition, { container: 'head_and_neck' })).toBe(false);
  });

  it('a real, multi-value condition against a real, array-type answer matches if ANY overlap exists', () => {
    const condition = { fieldId: 'container', answerId: '', answerIds: ['whole_body', 'thoraco_abdominal'] };
    expect(isVisible(condition, { container: ['thoraco_abdominal', 'head_and_neck'] })).toBe(true);
    expect(isVisible(condition, { container: ['head_and_neck'] })).toBe(false);
  });

  it('a real, present but empty answerIds array falls back to the real, original single-value answerId check, never silently matching everything', () => {
    const condition = { fieldId: 'f1', answerId: 'a', answerIds: [] };
    expect(isVisible(condition, { f1: 'a' })).toBe(true);
    expect(isVisible(condition, { f1: 'b' })).toBe(false);
  });

  it('a real, missing/unset answer is never visible, regardless of single- or multi-value condition shape', () => {
    expect(isVisible({ fieldId: 'f1', answerId: 'a' }, {})).toBe(false);
    expect(isVisible({ fieldId: 'f1', answerId: '', answerIds: ['a', 'b'] }, {})).toBe(false);
  });
});

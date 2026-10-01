import { describe, it, expect } from 'vitest';
import { evaluateQaTargetedSelectionRule } from './evaluateQaTargetedSelectionRule';
import type { QaCaseSelectionContext } from './resolveQaCaseSelectionContext';

describe('evaluateQaTargetedSelectionRule', () => {
  const trueContext: QaCaseSelectionContext = { hasNonDeferredFrozenCategory: true };
  const falseContext: QaCaseSelectionContext = { hasNonDeferredFrozenCategory: false };

  it('never matches when no rule is configured, regardless of context', () => {
    expect(evaluateQaTargetedSelectionRule(undefined, trueContext)).toBe(false);
    expect(evaluateQaTargetedSelectionRule(undefined, falseContext)).toBe(false);
  });

  it('matches when the named signal is true in the context', () => {
    expect(evaluateQaTargetedSelectionRule({ signal: 'hasNonDeferredFrozenCategory' }, trueContext)).toBe(true);
  });

  it('does not match when the named signal is false in the context', () => {
    expect(evaluateQaTargetedSelectionRule({ signal: 'hasNonDeferredFrozenCategory' }, falseContext)).toBe(false);
  });
});

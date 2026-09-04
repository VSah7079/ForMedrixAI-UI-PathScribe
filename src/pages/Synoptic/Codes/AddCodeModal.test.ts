// @vitest-environment happy-dom
// src/pages/Synoptic/Codes/AddCodeModal.test.ts
import { describe, it, expect } from 'vitest';
import { findAppliedElsewhere, type PendingCode } from './AddCodeModal';

function code(overrides: Partial<PendingCode> = {}): PendingCode {
  return { id: 'x', code: '254837009', display: 'Malignant tumor', system: 'SNOMED', specimenIndex: 0, pendingDelete: false, ...overrides };
}

describe('findAppliedElsewhere — real, per direct guidance: flag a code already applied to a different target, offer reassignment', () => {
  it('finds a real, active application of the same code to a genuinely different target', () => {
    const applied = [code({ specimenIndex: 1 })];
    const result = findAppliedElsewhere(applied, '254837009', 0);
    expect(result).toHaveLength(1);
    expect(result[0].specimenIndex).toBe(1);
  });

  it('does NOT flag an application already on the current target — that is activeCount\'s own, separate job', () => {
    const applied = [code({ specimenIndex: 0 })];
    expect(findAppliedElsewhere(applied, '254837009', 0)).toHaveLength(0);
  });

  it('never flags a pending-delete entry — a code the pathologist just removed shouldn\'t block re-adding it here', () => {
    const applied = [code({ specimenIndex: 1, pendingDelete: true })];
    expect(findAppliedElsewhere(applied, '254837009', 0)).toHaveLength(0);
  });

  it('never matches a genuinely different code', () => {
    const applied = [code({ code: '999999999', specimenIndex: 1 })];
    expect(findAppliedElsewhere(applied, '254837009', 0)).toHaveLength(0);
  });

  it('correctly treats case-level (null) as its own, real, distinct target', () => {
    const applied = [code({ specimenIndex: null })];
    expect(findAppliedElsewhere(applied, '254837009', 0)).toHaveLength(1);
    expect(findAppliedElsewhere(applied, '254837009', null)).toHaveLength(0);
  });

  it('finds every real, distinct elsewhere application when the same code is legitimately applied to more than one other target', () => {
    const applied = [code({ id: 'a', specimenIndex: 1 }), code({ id: 'b', specimenIndex: 2 })];
    expect(findAppliedElsewhere(applied, '254837009', 0)).toHaveLength(2);
  });
});

// src/utils/__tests__/evaluateMicroscopicFinalizeGate.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateMicroscopicFinalizeGate, type MicroscopicFinalizeGateInput } from '../evaluateMicroscopicFinalizeGate';

function makeInput(overrides: Partial<MicroscopicFinalizeGateInput> = {}): MicroscopicFinalizeGateInput {
  return {
    microscopicStatus: 'not-started',
    microscopicText: '',
    hasSynopticTemplate: true,
    allRequiredSynopticFieldsComplete: true,
    requiresMicroscopicNarrative: false,
    ...overrides,
  };
}

describe('evaluateMicroscopicFinalizeGate — the real, specified scenario table', () => {
  it('Row 1 — Standard Biopsy: populated narrative, synoptic state N/A -> Allowed', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'saved',
      microscopicText: 'Sections show a benign finding.',
      hasSynopticTemplate: false,
      allRequiredSynopticFieldsComplete: false,
    }));
    expect(result.blocked).toBe(false);
  });

  it('Row 2 — Resection (CAP Protocol): empty/skipped narrative, synoptic completed -> Allowed', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'saved',
      microscopicText: '',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: true,
    }));
    expect(result.blocked).toBe(false);
  });

  it('Row 3 — Resection (CAP Protocol): draft/unsaved narrative, synoptic incomplete -> Blocked', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'draft',
      microscopicText: 'Sections show...',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: false,
    }));
    expect(result.blocked).toBe(true);
    expect(result.reasonKey).toBe('evaluateMicroscopicFinalizeGate.unsavedDraft');
  });

  it('Row 4 — Mandatory Protocol Case: empty narrative, admin-required -> Blocked', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'not-started',
      microscopicText: '',
      requiresMicroscopicNarrative: true,
    }));
    expect(result.blocked).toBe(true);
    expect(result.reasonKey).toBe('evaluateMicroscopicFinalizeGate.requiredForProcedure');
  });
});

describe('evaluateMicroscopicFinalizeGate — real edge cases beyond the table', () => {
  it('a draft blocks even when the draft text itself is populated-looking — draft status always wins over content', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'draft',
      microscopicText: 'A full, real narrative already typed but not yet saved.',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: true,
      requiresMicroscopicNarrative: false,
    }));
    expect(result.blocked).toBe(true);
  });

  it('a draft blocks even when nothing else would ever block — draft alone is sufficient', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({ microscopicStatus: 'draft', microscopicText: 'x' }));
    expect(result.blocked).toBe(true);
  });

  it('saved, populated narrative allows even when synoptic is incomplete', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'saved',
      microscopicText: 'Real narrative text.',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: false,
    }));
    expect(result.blocked).toBe(false);
  });

  it('saved, populated narrative allows even when requiresMicroscopicNarrative is true — the requirement is satisfied, not overridden', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'saved',
      microscopicText: 'Real narrative text.',
      requiresMicroscopicNarrative: true,
    }));
    expect(result.blocked).toBe(false);
  });

  it('saved status with only whitespace text is treated as genuinely empty, not populated', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'saved',
      microscopicText: '   \n  ',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: true,
    }));
    expect(result.blocked).toBe(false); // falls through to Rule 6 — complete synoptic, real skip
  });

  it('not-started is treated identically to saved-and-empty for the requirement checks', () => {
    const notStarted = evaluateMicroscopicFinalizeGate(makeInput({ microscopicStatus: 'not-started', microscopicText: '' }));
    const savedEmpty = evaluateMicroscopicFinalizeGate(makeInput({ microscopicStatus: 'saved', microscopicText: '' }));
    expect(notStarted.blocked).toBe(savedEmpty.blocked);
  });

  it('empty narrative + no synoptic template at all blocks, even with requiresMicroscopicNarrative false — nothing documents the case', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'not-started',
      microscopicText: '',
      hasSynopticTemplate: false,
      requiresMicroscopicNarrative: false,
    }));
    expect(result.blocked).toBe(true);
    expect(result.reasonKey).toBe('evaluateMicroscopicFinalizeGate.noDocumentationAtAll');
  });

  it('admin-mandated requirement takes precedence over the "no synoptic template" reason — checked first', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'not-started',
      microscopicText: '',
      hasSynopticTemplate: false,
      requiresMicroscopicNarrative: true,
    }));
    expect(result.blocked).toBe(true);
    expect(result.reasonKey).toBe('evaluateMicroscopicFinalizeGate.requiredForProcedure');
  });

  it('empty narrative + synoptic template present but incomplete blocks, distinct reason from the no-template case', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'not-started',
      microscopicText: '',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: false,
    }));
    expect(result.blocked).toBe(true);
    expect(result.reasonKey).toBe('evaluateMicroscopicFinalizeGate.incompleteSynopticFields');
  });

  it('a fully allowed case never returns a reason string', () => {
    const result = evaluateMicroscopicFinalizeGate(makeInput({
      microscopicStatus: 'saved',
      microscopicText: '',
      hasSynopticTemplate: true,
      allRequiredSynopticFieldsComplete: true,
    }));
    expect(result.blocked).toBe(false);
    expect(result.reasonKey).toBeUndefined();
  });
});

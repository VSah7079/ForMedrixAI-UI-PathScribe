// src/pages/SynopticReportPage/resolveEmbeddedCoding.test.ts
import { describe, it, expect } from 'vitest';
import { resolveEmbeddedCodesForAnswer, appendEmbeddedCodesToSpecimen } from './resolveEmbeddedCoding';
import type { EditorField } from '@/components/Config/Protocols/SynopticEditor';

function optionField(overrides: Partial<EditorField> = {}): EditorField {
  return {
    id: 'margin_status', label: 'Margin Status', type: 'dropdown', required: false,
    snomed: '', icd: '',
    options: [
      { id: 'opt_positive', label: 'Positive', snomed: '254837009', icd: 'C50.911' },
      { id: 'opt_negative', label: 'Negative', snomed: '', icd: '' },
    ],
    ...overrides,
  };
}

function freeTextField(overrides: Partial<EditorField> = {}): EditorField {
  return {
    id: 'gross_note', label: 'Gross Note', type: 'text', required: false,
    snomed: '128462008', icd: '',
    options: [],
    ...overrides,
  };
}

describe('resolveEmbeddedCodesForAnswer — real, per direct guidance: CAP/RCPath template-embedded code metadata', () => {
  it('resolves the selected option\'s own real, embedded codes for a dropdown field', () => {
    const codes = resolveEmbeddedCodesForAnswer(optionField(), 'opt_positive');
    expect(codes).toEqual([
      { system: 'SNOMED', code: '254837009', display: 'Margin Status: Positive' },
      { system: 'ICD', code: 'C50.911', display: 'Margin Status: Positive' },
    ]);
  });

  it('resolves no codes at all for an option with genuinely empty code metadata (e.g. every generic/placeholder template today)', () => {
    const codes = resolveEmbeddedCodesForAnswer(optionField(), 'opt_negative');
    expect(codes).toEqual([]);
  });

  it('resolves no codes for an unrecognized/empty selection, never a fabricated default', () => {
    expect(resolveEmbeddedCodesForAnswer(optionField(), undefined)).toEqual([]);
    expect(resolveEmbeddedCodesForAnswer(optionField(), '')).toEqual([]);
    expect(resolveEmbeddedCodesForAnswer(optionField(), 'not_a_real_option')).toEqual([]);
  });

  it('resolves each real, selected option\'s own codes for a multi-select (checkbox) field — one entry per real selection', () => {
    const field = optionField({
      label: 'Invasion Findings',
      type: 'checkboxes',
      options: [
        { id: 'a', label: 'Lymphovascular Invasion', snomed: '444319009', icd: '' },
        { id: 'b', label: 'Perineural Invasion', snomed: '399952009', icd: '' },
        { id: 'c', label: 'None', snomed: '', icd: '' },
      ],
    });
    const codes = resolveEmbeddedCodesForAnswer(field, ['a', 'b']);
    expect(codes).toEqual([
      { system: 'SNOMED', code: '444319009', display: 'Invasion Findings: Lymphovascular Invasion' },
      { system: 'SNOMED', code: '399952009', display: 'Invasion Findings: Perineural Invasion' },
    ]);
  });

  it('resolves a free-text field\'s own top-level embedded code, regardless of the specific text entered', () => {
    const codes = resolveEmbeddedCodesForAnswer(freeTextField(), 'any text the pathologist types');
    expect(codes).toEqual([{ system: 'SNOMED', code: '128462008', display: 'Gross Note' }]);
  });

  it('resolves no codes for a free-text field with no real, embedded code configured', () => {
    const codes = resolveEmbeddedCodesForAnswer(freeTextField({ snomed: '', icd: '' }), 'some text');
    expect(codes).toEqual([]);
  });
});

describe('appendEmbeddedCodesToSpecimen — real, per direct guidance: never dedupe on write, retain every individual association', () => {
  function specimens() {
    return [
      { id: 'spec-1', coding: {} },
      { id: 'spec-2', coding: { snomed: [{ code: 'EXISTING', description: 'pre-existing' }] } },
    ];
  }

  it('appends a new code to the target specimen only, leaving others untouched', () => {
    const updated = appendEmbeddedCodesToSpecimen(specimens(), 'spec-1', [{ system: 'SNOMED', code: '254837009', display: 'Margin Status: Positive' }]);
    expect(updated.find(s => s.id === 'spec-1')?.coding.snomed).toEqual([{ code: '254837009', description: 'Margin Status: Positive' }]);
    expect(updated.find(s => s.id === 'spec-2')?.coding.snomed).toEqual([{ code: 'EXISTING', description: 'pre-existing' }]);
  });

  it('the exact real principle this exists for: appending the same real code twice retains BOTH associations, never deduplicated', () => {
    let updated = appendEmbeddedCodesToSpecimen(specimens(), 'spec-1', [{ system: 'SNOMED', code: '254837009', display: 'First observation' }]);
    updated = appendEmbeddedCodesToSpecimen(updated, 'spec-1', [{ system: 'SNOMED', code: '254837009', display: 'Second, repeated observation' }]);
    expect(updated.find(s => s.id === 'spec-1')?.coding.snomed).toEqual([
      { code: '254837009', description: 'First observation' },
      { code: '254837009', description: 'Second, repeated observation' },
    ]);
  });

  it('splits SNOMED and ICD into their own real, separate arrays', () => {
    const updated = appendEmbeddedCodesToSpecimen(specimens(), 'spec-1', [
      { system: 'SNOMED', code: '254837009', display: 'x' },
      { system: 'ICD', code: 'C50.911', display: 'x' },
    ]);
    const sp = updated.find(s => s.id === 'spec-1');
    expect(sp?.coding.snomed).toHaveLength(1);
    expect(sp?.coding.icd10).toHaveLength(1);
  });

  it('never mutates the input specimens array', () => {
    const original = specimens();
    const originalCopy = JSON.parse(JSON.stringify(original));
    appendEmbeddedCodesToSpecimen(original, 'spec-1', [{ system: 'SNOMED', code: 'X', display: 'x' }]);
    expect(original).toEqual(originalCopy);
  });
});

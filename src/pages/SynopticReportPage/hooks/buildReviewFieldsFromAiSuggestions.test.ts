import { describe, it, expect } from 'vitest';
import { buildReviewFieldsFromAiSuggestions } from './buildReviewFieldsFromAiSuggestions';
import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';
import type { Case } from '@/types/case/Case';

const template: EditorTemplate = {
  id: 'test_template', name: 'Test', source: 'Custom', version: '0.1.0', category: 'TEST',
  sections: [
    {
      id: 'section_a', title: 'Section A', collapsed: false,
      fields: [
        { id: 'field_1', label: 'Field One', type: 'radio', required: true, snomed: '', icd: '', options: [] },
        { id: 'field_2', label: 'Field Two', type: 'numeric', required: false, snomed: '', icd: '', options: [] },
      ],
    },
    {
      id: 'section_b', title: 'Section B', collapsed: false,
      fields: [
        { id: 'field_3', label: 'Field Three', type: 'checkboxes', required: false, snomed: '', icd: '', options: [] },
      ],
    },
  ],
};

function baseCase(overrides: Partial<Case>): Case {
  return {
    id: 'case-1', accession: { accessionNumber: 'A-1' }, originHospitalId: 'H1', originEnterpriseId: 'E1',
    patient: { id: 'p1', firstName: 'John', lastName: 'Doe' }, specimens: [], order: { priority: 'Routine' },
    status: 'draft', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...overrides,
  } as Case;
}

describe('buildReviewFieldsFromAiSuggestions', () => {
  it('a real field with a real AI suggestion becomes a real ReviewField, correctly attributed to its own real section title', () => {
    const caseData = baseCase({ diagnostic: { grossDescription: 'The specimen measures 2.3 x 1.8 cm overall.' } as any });
    const suggestions = { field_1: { value: 'Positive', confidence: 88, source: '"measures 2.3 x 1.8 cm"' } };
    const result = buildReviewFieldsFromAiSuggestions(suggestions, template, caseData);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fieldId: 'field_1', fieldLabel: 'Field One', sectionTitle: 'Section A',
      aiValue: 'Positive', confidence: 88, verification: 'unverified', sourceNotFound: false,
    });
  });

  it('a real field with NO suggestion is genuinely excluded \u2014 never a fabricated, empty placeholder ReviewField', () => {
    const suggestions = { field_1: { value: 'Positive', confidence: 88, source: '' } };
    const result = buildReviewFieldsFromAiSuggestions(suggestions, template, baseCase({}));
    expect(result.map(r => r.fieldId)).toEqual(['field_1']);
  });

  it('a real suggestion whose cited source genuinely cannot be located in the report text is correctly flagged sourceNotFound', () => {
    const caseData = baseCase({ diagnostic: { grossDescription: 'Completely unrelated text.' } as any });
    const suggestions = { field_1: { value: 'Positive', confidence: 95, source: '"a phrase that never appears anywhere"' } };
    const result = buildReviewFieldsFromAiSuggestions(suggestions, template, caseData);
    expect(result[0].sourceNotFound).toBe(true);
  });

  it('real suggestions across multiple real sections are each correctly attributed to their OWN real section title, not the first one', () => {
    const suggestions = {
      field_1: { value: 'A', confidence: 90, source: '' },
      field_3: { value: 'B', confidence: 80, source: '' },
    };
    const result = buildReviewFieldsFromAiSuggestions(suggestions, template, baseCase({}));
    const byId = Object.fromEntries(result.map(r => [r.fieldId, r.sectionTitle]));
    expect(byId.field_1).toBe('Section A');
    expect(byId.field_3).toBe('Section B');
  });

  it('every real, newly-built ReviewField starts genuinely unverified \u2014 never pre-confirmed or pre-disputed', () => {
    const suggestions = { field_1: { value: 'A', confidence: 90, source: '' } };
    const result = buildReviewFieldsFromAiSuggestions(suggestions, template, baseCase({}));
    expect(result[0].verification).toBe('unverified');
  });

  it('a real, empty suggestions map produces a real, empty ReviewField array', () => {
    expect(buildReviewFieldsFromAiSuggestions({}, template, baseCase({}))).toEqual([]);
  });
});

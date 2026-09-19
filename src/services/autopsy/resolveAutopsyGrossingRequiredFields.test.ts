import { describe, it, expect } from 'vitest';
import { resolveAutopsyGrossingRequiredFields, resolveAutopsyGrossingMissingRequiredFields } from './resolveAutopsyGrossingRequiredFields';
import type { EditorTemplate } from '../../components/Config/Protocols/SynopticEditor';

// Real, per direct guidance's own confirmed example: Spleen Status is
// Tier 1 (always required); Spleen Weight is Tier 2 (required only
// when Spleen Status = Present).
const template: EditorTemplate = {
  id: 'test', name: 'Test', source: 'Custom', version: '0.1.0', category: 'TEST',
  sections: [
    {
      id: 'spleen', title: 'Spleen', collapsed: false,
      fields: [
        {
          id: 'spleen_status', label: 'Spleen Status', type: 'radio', required: true, snomed: '', icd: '',
          options: [
            { id: 'spleen_present', label: 'Present', snomed: '', icd: '' },
            { id: 'spleen_resected', label: 'Previously Resected', snomed: '', icd: '' },
          ],
        },
        {
          id: 'spleen_weight', label: 'Spleen Weight (g)', type: 'numeric', required: false, snomed: '', icd: '',
          requiredIf: { fieldId: 'spleen_status', answerId: 'spleen_present' },
          options: [],
        },
        {
          id: 'spleen_capsule', label: 'Capsule Appearance', type: 'radio', required: false, snomed: '', icd: '',
          options: [{ id: 'capsule_intact', label: 'Intact', snomed: '', icd: '' }],
        },
      ],
    },
  ],
};

describe('resolveAutopsyGrossingRequiredFields', () => {
  it('a real Tier 1 field (unconditional required) is always in the real result, regardless of any other answers', () => {
    const result = resolveAutopsyGrossingRequiredFields(template, {});
    expect(result.map(f => f.id)).toContain('spleen_status');
  });

  it('a real Tier 2 field is NOT required when its own real parent condition hasn\u2019t been triggered yet', () => {
    const result = resolveAutopsyGrossingRequiredFields(template, {});
    expect(result.map(f => f.id)).not.toContain('spleen_weight');
  });

  it('a real Tier 2 field BECOMES required once its own real parent condition is genuinely satisfied \u2014 Spleen Status = Present triggers Spleen Weight', () => {
    const result = resolveAutopsyGrossingRequiredFields(template, { spleen_status: 'spleen_present' });
    expect(result.map(f => f.id)).toContain('spleen_weight');
  });

  it('a real Tier 2 field stays NOT required when the parent answer genuinely does NOT match its own trigger \u2014 Previously Resected never requires Spleen Weight', () => {
    const result = resolveAutopsyGrossingRequiredFields(template, { spleen_status: 'spleen_resected' });
    expect(result.map(f => f.id)).not.toContain('spleen_weight');
  });

  it('a real Tier 3 field (neither required nor requiredIf) never appears in the real result, under any real answers', () => {
    const result = resolveAutopsyGrossingRequiredFields(template, { spleen_status: 'spleen_present' });
    expect(result.map(f => f.id)).not.toContain('spleen_capsule');
  });
});

describe('resolveAutopsyGrossingMissingRequiredFields', () => {
  it('a real, currently-required field with genuinely no answer yet is reported missing', () => {
    const result = resolveAutopsyGrossingMissingRequiredFields(template, {});
    expect(result.map(f => f.id)).toEqual(['spleen_status']);
  });

  it('once a real, currently-required field IS genuinely answered, it drops out of the real missing list', () => {
    const result = resolveAutopsyGrossingMissingRequiredFields(template, { spleen_status: 'spleen_present' });
    // spleen_status is answered; spleen_weight is now required (Present triggered it) but still unanswered.
    expect(result.map(f => f.id)).toEqual(['spleen_weight']);
  });

  it('a real, complete answer set (every currently-required field answered) reports genuinely nothing missing', () => {
    const result = resolveAutopsyGrossingMissingRequiredFields(template, {
      spleen_status: 'spleen_present', spleen_weight: '150',
    });
    expect(result).toEqual([]);
  });

  it('the Previously Resected path never demands Spleen Weight \u2014 answering the real gatekeeper alone is genuinely sufficient', () => {
    const result = resolveAutopsyGrossingMissingRequiredFields(template, { spleen_status: 'spleen_resected' });
    expect(result).toEqual([]);
  });
});

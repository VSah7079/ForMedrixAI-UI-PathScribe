import { describe, it, expect } from 'vitest';
import { resolveSynopticAnswersValidation } from './resolveSynopticAnswersValidation';
import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';

const template: SynopticTemplate = {
  id: 'test', name: 'Test', source: 'Custom', version: '1.0.0', category: 'CYTOLOGY_NONGYN', standard: 'Test Standard',
  sections: [
    {
      id: 'specimen', title: 'Specimen', fields: [
        { id: 'procedure', label: 'Procedure', type: 'dropdown', required: true, options: [{ id: 'fna', label: 'FNA' }] },
        { id: 'notes', label: 'Notes', type: 'longtext', required: false },
      ],
    },
  ],
};

describe('resolveSynopticAnswersValidation', () => {
  it('a real, fully-answered required field passes validation', () => {
    const result = resolveSynopticAnswersValidation(template, { procedure: 'fna' });
    expect(result.valid).toBe(true);
    expect(result.missingFieldIds).toEqual([]);
  });

  it('a real, missing required field is genuinely flagged', () => {
    const result = resolveSynopticAnswersValidation(template, {});
    expect(result.valid).toBe(false);
    expect(result.missingFieldIds).toEqual(['procedure']);
  });

  it('an optional field being unanswered never fails validation', () => {
    const result = resolveSynopticAnswersValidation(template, { procedure: 'fna' });
    expect(result.missingFieldIds).not.toContain('notes');
  });

  it('a real, empty-string answer to a required field is treated as genuinely unanswered', () => {
    const result = resolveSynopticAnswersValidation(template, { procedure: '   ' });
    expect(result.valid).toBe(false);
  });

  it('a real, empty array answer to a required checkbox field is treated as genuinely unanswered', () => {
    const result = resolveSynopticAnswersValidation(template, { procedure: [] });
    expect(result.valid).toBe(false);
  });
});

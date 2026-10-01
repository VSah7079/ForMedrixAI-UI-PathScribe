import { describe, it, expect } from 'vitest';
import { buildSynopticNarrativePrompt } from './buildSynopticNarrativePrompt';
import type { EditorTemplate } from '../../../components/Config/Protocols/SynopticEditor';

const template: EditorTemplate = {
  id: 'test', name: 'Test', source: 'Custom', version: '0.1.0', category: 'TEST',
  sections: [
    {
      id: 'spleen', title: 'Spleen', collapsed: false,
      fields: [
        {
          id: 'spleen_status', label: 'Spleen Status', type: 'radio', required: true, snomed: '', icd: '',
          options: [
            { id: 'spleen_present', label: 'Present and examined', snomed: '', icd: '' },
            { id: 'spleen_resected', label: 'Previously resected', snomed: '', icd: '' },
          ],
        },
        {
          id: 'spleen_lesions', label: 'Focal Lesions', type: 'checkboxes', required: false, snomed: '', icd: '',
          options: [
            { id: 'lesion_none', label: 'None identified', snomed: '', icd: '' },
            { id: 'lesion_infarct', label: 'Infarct(s)', snomed: '', icd: '' },
          ],
        },
        {
          id: 'spleen_weight', label: 'Spleen Weight (g)', type: 'numeric', required: false, snomed: '', icd: '',
          options: [],
        },
      ],
    },
    {
      id: 'heart', title: 'Heart', collapsed: false,
      fields: [
        {
          id: 'heart_status', label: 'Myocardium', type: 'radio', required: true, snomed: '', icd: '',
          options: [{ id: 'myo_homogeneous', label: 'Homogeneous, no infarction', snomed: '', icd: '' }],
        },
      ],
    },
  ],
};

describe('buildSynopticNarrativePrompt', () => {
  it('resolves a real radio answer id to its own real option label, never the raw id', () => {
    const { prompt } = buildSynopticNarrativePrompt(template, { spleen_status: 'spleen_present' });
    expect(prompt).toContain('Present and examined');
    expect(prompt).not.toContain('spleen_present');
  });

  it('resolves multiple real checkbox answer ids into a real, joined, comma-separated label list', () => {
    const { prompt } = buildSynopticNarrativePrompt(template, {
      spleen_status: 'spleen_present', spleen_lesions: ['lesion_infarct'],
    });
    expect(prompt).toContain('Focal Lesions: Infarct(s)');
  });

  it('a real numeric field\u2019s own raw value passes through as-is (no option list to resolve against)', () => {
    const { prompt } = buildSynopticNarrativePrompt(template, {
      spleen_status: 'spleen_present', spleen_weight: '150',
    });
    expect(prompt).toContain('Spleen Weight (g): 150');
  });

  it('a genuinely unanswered field is silently omitted \u2014 never padded with a placeholder that could read as a real negative finding', () => {
    const { prompt } = buildSynopticNarrativePrompt(template, { spleen_status: 'spleen_present' });
    expect(prompt).not.toContain('Focal Lesions');
    expect(prompt).not.toContain('Spleen Weight');
  });

  it('real answered fields are grouped under their own real section title', () => {
    const { prompt } = buildSynopticNarrativePrompt(template, {
      spleen_status: 'spleen_present', heart_status: 'myo_homogeneous',
    });
    expect(prompt).toContain('Spleen:');
    expect(prompt).toContain('Heart:');
  });

  it('a real section with genuinely no answered fields at all contributes no real section block', () => {
    const { prompt } = buildSynopticNarrativePrompt(template, { spleen_status: 'spleen_present' });
    expect(prompt).not.toContain('Heart:');
  });

  it('the real system prompt instructs prose-only output, matching the real, established suggestSynopticFields JSON-only convention in spirit (format instructions live in system, not prompt)', () => {
    const { system } = buildSynopticNarrativePrompt(template, {});
    expect(system.toLowerCase()).toContain('narrative');
  });
});

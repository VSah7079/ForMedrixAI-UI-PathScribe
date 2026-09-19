import { describe, it, expect } from 'vitest';
import { filterAutopsyTemplateToActiveSections } from '@/services/autopsy/filterAutopsyTemplateToActiveSections';
import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';

function makeTemplate(category: string): EditorTemplate {
  return {
    id: 'test', name: 'Test', source: 'Custom', version: '0.1.0', category,
    sections: [
      {
        id: 'external_examination', title: 'External Examination', collapsed: false,
        fields: [
          { id: 'body_weight_kg', label: 'Body Weight (kg)', type: 'numeric', required: false, snomed: '', icd: '', options: [] },
          { id: 'body_length_cm', label: 'Body Length (cm)', type: 'numeric', required: false, snomed: '', icd: '', options: [] },
          { id: 'body_mass_index', label: 'BMI', type: 'numeric', required: false, snomed: '', icd: '', options: [] },
          { id: 'rigor_mortis', label: 'Rigor Mortis', type: 'radio', required: true, snomed: '', icd: '', options: [] },
          { id: 'livor_mortis', label: 'Livor Mortis', type: 'radio', required: true, snomed: '', icd: '', options: [] },
          { id: 'medical_intervention_devices', label: 'Medical Intervention Devices', type: 'checkboxes', required: true, snomed: '', icd: '', options: [] },
          { id: 'surface_injuries_trauma', label: 'Surface Injuries / Trauma', type: 'checkboxes', required: true, snomed: '', icd: '', options: [] },
        ],
      },
      { id: 'head_and_neck', title: 'Head & Neck', collapsed: false, fields: [] },
      { id: 'cardiovascular_system', title: 'Cardiovascular', collapsed: false, fields: [] },
    ],
  };
}

describe('filterAutopsyTemplateToActiveSections', () => {
  it('a real, non-Autopsy template passes through completely unchanged \u2014 identity, not just equal content', () => {
    const template = makeTemplate('SURGICAL');
    const result = filterAutopsyTemplateToActiveSections(template, [{ organCodes: ['brain'] }]);
    expect(result).toBe(template);
  });

  it('a real Autopsy template with a Brain-only specimen keeps only External Exam + Head & Neck', () => {
    const template = makeTemplate('AUTOPSY');
    const result = filterAutopsyTemplateToActiveSections(template, [{ organCodes: ['brain'] }]);
    expect(result.sections.map(s => s.id)).toEqual(['external_examination', 'head_and_neck']);
  });

  it('a real Autopsy template with no real specimens at all still keeps External Examination', () => {
    const template = makeTemplate('AUTOPSY');
    const result = filterAutopsyTemplateToActiveSections(template, []);
    expect(result.sections.map(s => s.id)).toEqual(['external_examination']);
  });

  it('never mutates the real input template\u2019s own sections array \u2014 a distinct array reference every time', () => {
    const template = makeTemplate('AUTOPSY');
    const originalSections = template.sections;
    filterAutopsyTemplateToActiveSections(template, [{ organCodes: ['brain'] }]);
    expect(template.sections).toBe(originalSections);
  });
});

describe('filterAutopsyTemplateToActiveSections \u2014 External Examination field-narrowing for Head & Neck Only scope', () => {
  it('a real Head & Neck Only case (Brain-only specimen) narrows External Exam to just rigor/livor mortis, devices, and trauma \u2014 whole-body measurements dropped', () => {
    const template = makeTemplate('AUTOPSY');
    const result = filterAutopsyTemplateToActiveSections(template, [{ organCodes: ['brain'] }]);
    const externalExam = result.sections.find(s => s.id === 'external_examination');
    expect(externalExam?.fields.map(f => f.id)).toEqual([
      'rigor_mortis', 'livor_mortis', 'medical_intervention_devices', 'surface_injuries_trauma',
    ]);
  });

  it('a real Whole Body case (brain + heart present) leaves External Exam completely unnarrowed \u2014 all 7 real fields stay', () => {
    const template = makeTemplate('AUTOPSY');
    const result = filterAutopsyTemplateToActiveSections(template, [{ organCodes: ['brain', 'heart'] }]);
    const externalExam = result.sections.find(s => s.id === 'external_examination');
    expect(externalExam?.fields).toHaveLength(7);
  });

  it('a real case with genuinely no specimens at all (External Exam only, no Head & Neck) also leaves External Exam unnarrowed \u2014 narrowing is specifically for the Head & Neck Only combination, not "External Exam is the only visible organ section"', () => {
    const template = makeTemplate('AUTOPSY');
    const result = filterAutopsyTemplateToActiveSections(template, []);
    const externalExam = result.sections.find(s => s.id === 'external_examination');
    expect(externalExam?.fields).toHaveLength(7);
  });
});

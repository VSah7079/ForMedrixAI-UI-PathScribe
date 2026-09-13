import { describe, it, expect } from 'vitest';
import { resolveSynopticTemplateClinicalTierConsistency } from './resolveSynopticTemplateClinicalTierConsistency';
import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';

function templateWith(field: SynopticTemplate['sections'][0]['fields'][0]): SynopticTemplate {
  return {
    id: 't', name: 'Test', source: 'Custom', version: '1.0.0', category: 'CYTOLOGY_NONGYN', standard: 'Test',
    sections: [{ id: 's', title: 'Section', fields: [field] }],
  };
}

describe('resolveSynopticTemplateClinicalTierConsistency', () => {
  it('a real field correctly tagged diagnostic_category with a real lexiconTermKey-bearing option produces no finding', () => {
    const template = templateWith({
      id: 'category', label: 'Category', type: 'dropdown', clinicalTier: 'tier_1_diagnostic_category',
      options: [{ id: 'a', label: 'A', lexiconTermKey: 'x.a' }],
    });
    expect(resolveSynopticTemplateClinicalTierConsistency(template)).toEqual([]);
  });

  it('a real field with no lexiconTermKey anywhere produces no finding, regardless of its own tier tag', () => {
    const untagged = templateWith({ id: 'arch', label: 'Architecture', type: 'checkboxes', options: [{ id: 'a', label: 'A' }] });
    expect(resolveSynopticTemplateClinicalTierConsistency(untagged)).toEqual([]);
    const tagged = templateWith({ id: 'arch', label: 'Architecture', type: 'checkboxes', clinicalTier: 'tier_2_descriptive', options: [{ id: 'a', label: 'A' }] });
    expect(resolveSynopticTemplateClinicalTierConsistency(tagged)).toEqual([]);
  });

  it('a real, untagged field that DOES carry a real lexiconTermKey-bearing option is flagged \u2014 the authoring mistake this check exists to catch', () => {
    const template = templateWith({
      id: 'category', label: 'Category', type: 'dropdown',
      options: [{ id: 'a', label: 'A', lexiconTermKey: 'x.a' }],
    });
    expect(resolveSynopticTemplateClinicalTierConsistency(template)).toEqual([
      { fieldId: 'category', reason: 'untagged_field_has_lexicon_option' },
    ]);
  });

  it('a real field explicitly tagged morphological_feature that somehow carries a real lexiconTermKey-bearing option is flagged, never silently allowed', () => {
    const template = templateWith({
      id: 'nuclear_features', label: 'Nuclear Features', type: 'checkboxes', clinicalTier: 'tier_2_descriptive',
      options: [{ id: 'grooves', label: 'Grooves', lexiconTermKey: 'nuclear.features.grooves' }],
    });
    expect(resolveSynopticTemplateClinicalTierConsistency(template)).toEqual([
      { fieldId: 'nuclear_features', reason: 'tier_2_field_has_lexicon_option' },
    ]);
  });

  it('real findings are collected across every real field in the whole template, not just the first one', () => {
    const template: SynopticTemplate = {
      id: 't', name: 'Test', source: 'Custom', version: '1.0.0', category: 'CYTOLOGY_NONGYN', standard: 'Test',
      sections: [{
        id: 's', title: 'Section',
        fields: [
          { id: 'field-a', label: 'A', type: 'dropdown', options: [{ id: 'x', label: 'X', lexiconTermKey: 'a.x' }] },
          { id: 'field-b', label: 'B', type: 'dropdown', clinicalTier: 'tier_1_diagnostic_category', options: [{ id: 'y', label: 'Y', lexiconTermKey: 'b.y' }] },
          { id: 'field-c', label: 'C', type: 'checkboxes', clinicalTier: 'tier_2_descriptive', options: [{ id: 'z', label: 'Z', lexiconTermKey: 'c.z' }] },
        ],
      }],
    };
    expect(resolveSynopticTemplateClinicalTierConsistency(template)).toEqual([
      { fieldId: 'field-a', reason: 'untagged_field_has_lexicon_option' },
      { fieldId: 'field-c', reason: 'tier_2_field_has_lexicon_option' },
    ]);
  });
});

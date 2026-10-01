import { describe, it, expect } from 'vitest';
import {
  resolveAutopsyGrossingSectionVisibility,
  resolveAutopsyTargetedOrganSectionVisibility,
  AUTOPSY_GROSSING_SECTION_IDS,
} from './resolveAutopsyGrossingSectionVisibility';

function visibleIds(result: ReturnType<typeof resolveAutopsyGrossingSectionVisibility>): string[] {
  return result.filter(r => r.visible).map(r => r.sectionId);
}

describe('resolveAutopsyGrossingSectionVisibility \u2014 Rule Set 1: Whole Body', () => {
  it('reveals all 6 real sections, matching the spec\u2019s own "Complete 3-Cavity Autopsy"', () => {
    const result = resolveAutopsyGrossingSectionVisibility('whole_body');
    expect(visibleIds(result)).toEqual([...AUTOPSY_GROSSING_SECTION_IDS]);
    expect(result.every(r => r.visible)).toBe(true);
  });
});

describe('resolveAutopsyGrossingSectionVisibility \u2014 Rule Set 2: Head & Neck Only', () => {
  it('reveals only External Examination and Head & Neck; every other real section hidden', () => {
    const result = resolveAutopsyGrossingSectionVisibility('head_and_neck');
    expect(visibleIds(result)).toEqual(['external_examination', 'head_and_neck']);
  });

  it('genuinely hides Cardiovascular, Respiratory, GI/Hepatobiliary, Genitourinary/Endocrine, and Musculoskeletal/Hematopoietic', () => {
    const result = resolveAutopsyGrossingSectionVisibility('head_and_neck');
    const hidden = result.filter(r => !r.visible).map(r => r.sectionId);
    expect(hidden).toEqual(['cardiovascular_system', 'respiratory_system', 'gastrointestinal_hepatobiliary', 'genitourinary_endocrine', 'musculoskeletal_hematopoietic']);
  });
});

describe('resolveAutopsyGrossingSectionVisibility \u2014 Rule Set 3: Thoraco-Abdominal', () => {
  it('reveals External Examination plus all real organ-system sections EXCEPT Head & Neck, including Musculoskeletal & Hematopoietic (spleen, lymph nodes are genuinely truncal structures)', () => {
    const result = resolveAutopsyGrossingSectionVisibility('thoraco_abdominal');
    expect(visibleIds(result)).toEqual([
      'external_examination', 'cardiovascular_system', 'respiratory_system',
      'gastrointestinal_hepatobiliary', 'genitourinary_endocrine', 'musculoskeletal_hematopoietic',
    ]);
  });

  it('genuinely hides only Head & Neck, matching the spec\u2019s own "Truncal Autopsy" scope', () => {
    const result = resolveAutopsyGrossingSectionVisibility('thoraco_abdominal');
    const hidden = result.filter(r => !r.visible).map(r => r.sectionId);
    expect(hidden).toEqual(['head_and_neck']);
  });
});

describe('resolveAutopsyTargetedOrganSectionVisibility \u2014 Rule Set 4: Targeted Organ', () => {
  it('a real Brain specimen reveals ONLY Head & Neck \u2014 matching the spec\u2019s own "Specimen Container B" example exactly', () => {
    const result = resolveAutopsyTargetedOrganSectionVisibility('brain');
    expect(visibleIds(result)).toEqual(['head_and_neck']);
  });

  it('a real Heart specimen reveals ONLY Cardiovascular \u2014 matching the spec\u2019s own "Specimen Container C" example exactly', () => {
    const result = resolveAutopsyTargetedOrganSectionVisibility('heart');
    expect(visibleIds(result)).toEqual(['cardiovascular_system']);
  });

  it('every real result covers all 6 real sections, explicitly marking each visible or hidden \u2014 never an incomplete list', () => {
    const result = resolveAutopsyTargetedOrganSectionVisibility('heart');
    expect(result.map(r => r.sectionId)).toEqual([...AUTOPSY_GROSSING_SECTION_IDS]);
  });
});

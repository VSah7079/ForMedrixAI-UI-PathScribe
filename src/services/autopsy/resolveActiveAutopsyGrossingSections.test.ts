import { describe, it, expect } from 'vitest';
import { resolveActiveAutopsyGrossingSections, resolveActiveAutopsyGrossingSectionVisibility } from './resolveActiveAutopsyGrossingSections';

describe('resolveActiveAutopsyGrossingSections', () => {
  it('External Examination is always active, even with real, completely empty specimens', () => {
    const result = resolveActiveAutopsyGrossingSections([]);
    expect(result.has('external_examination')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('a real specimen with real organCodes spanning every organ produces every real combination \u2014 "Whole Body" is just what falls out, never a real, separate preset', () => {
    const result = resolveActiveAutopsyGrossingSections([
      { organCodes: ['brain', 'heart', 'right_lung', 'liver', 'right_kidney', 'spleen'] },
    ]);
    expect(result).toEqual(new Set([
      'external_examination', 'head_and_neck', 'cardiovascular_system', 'respiratory_system',
      'gastrointestinal_hepatobiliary', 'genitourinary_endocrine', 'musculoskeletal_hematopoietic',
    ]));
  });

  it('a real, single Brain-only specimen matches the spec\u2019s own "Specimen Container B" example exactly \u2014 External Exam + Head & Neck only', () => {
    const result = resolveActiveAutopsyGrossingSections([{ organCodes: ['brain'] }]);
    expect(result).toEqual(new Set(['external_examination', 'head_and_neck']));
  });

  it('a real, single Heart-only specimen matches the spec\u2019s own "Specimen Container C" example exactly \u2014 External Exam + Cardiovascular only', () => {
    const result = resolveActiveAutopsyGrossingSections([{ organCodes: ['heart'] }]);
    expect(result).toEqual(new Set(['external_examination', 'cardiovascular_system']));
  });

  it('a real, genuinely novel combination the original spec never named (e.g. lung + kidney, no heart or brain) is correctly derived \u2014 the whole real point of moving off fixed presets', () => {
    const result = resolveActiveAutopsyGrossingSections([{ organCodes: ['left_lung', 'right_kidney'] }]);
    expect(result).toEqual(new Set(['external_examination', 'respiratory_system', 'genitourinary_endocrine']));
  });

  it('real organs across MULTIPLE real specimens are all correctly aggregated into one real, combined section set', () => {
    const result = resolveActiveAutopsyGrossingSections([
      { organCodes: ['brain'] },
      { organCodes: ['heart'] },
      { organCodes: ['spleen', 'lymph_nodes'] },
    ]);
    expect(result).toEqual(new Set(['external_examination', 'head_and_neck', 'cardiovascular_system', 'musculoskeletal_hematopoietic']));
  });

  it('a real specimen with no real organCodes at all contributes nothing beyond the always-present External Exam', () => {
    const result = resolveActiveAutopsyGrossingSections([{}, { organCodes: [] }]);
    expect(result).toEqual(new Set(['external_examination']));
  });

  it('a real, unrecognized/stale organCode is silently skipped, never thrown on \u2014 this is additive derivation, not a validation gate', () => {
    const result = resolveActiveAutopsyGrossingSections([{ organCodes: ['brain', 'not_a_real_organ_code'] }]);
    expect(result).toEqual(new Set(['external_examination', 'head_and_neck']));
  });

  it('thyroid genuinely activates Genitourinary & Endocrine, never Head & Neck \u2014 confirming the deliberate standard-grouping assignment carries through derivation', () => {
    const result = resolveActiveAutopsyGrossingSections([{ organCodes: ['thyroid'] }]);
    expect(result).toEqual(new Set(['external_examination', 'genitourinary_endocrine']));
  });
});

describe('resolveActiveAutopsyGrossingSectionVisibility', () => {
  it('produces the exact same real, complete visible/hidden list shape as the preset-based resolver, so a rendering layer can treat both identically', () => {
    const result = resolveActiveAutopsyGrossingSectionVisibility([{ organCodes: ['heart'] }]);
    expect(result).toHaveLength(7);
    expect(result.find(r => r.sectionId === 'cardiovascular_system')?.visible).toBe(true);
    expect(result.find(r => r.sectionId === 'respiratory_system')?.visible).toBe(false);
  });
});

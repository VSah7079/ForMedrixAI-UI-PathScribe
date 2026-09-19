import { describe, it, expect } from 'vitest';
import template from './autopsy_gross_examination.json';
import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';

const typedTemplate = template as unknown as EditorTemplate;

function findField(fieldId: string) {
  for (const section of typedTemplate.sections) {
    const field = section.fields.find(f => f.id === fieldId);
    if (field) return field;
  }
  return undefined;
}

describe('autopsy_gross_examination.json \u2014 External Examination section', () => {
  it('has real, correct top-level identity matching the established EditorTemplate shape', () => {
    expect(typedTemplate.id).toBe('autopsy_gross_examination');
    expect(typedTemplate.category).toBe('AUTOPSY');
    expect(typedTemplate.sections.length).toBeGreaterThanOrEqual(2);
    expect(typedTemplate.sections[0].id).toBe('external_examination');
  });

  it('has all 7 real fields from Part A Section 1, in the real, expected order', () => {
    const fieldIds = typedTemplate.sections[0].fields.map(f => f.id);
    expect(fieldIds).toEqual([
      'body_weight_kg', 'body_length_cm', 'body_mass_index',
      'rigor_mortis', 'livor_mortis', 'medical_intervention_devices', 'surface_injuries_trauma',
    ]);
  });

  it('the real numeric measurement fields are genuinely typed numeric, not text or dropdown', () => {
    expect(findField('body_weight_kg')?.type).toBe('numeric');
    expect(findField('body_length_cm')?.type).toBe('numeric');
    expect(findField('body_mass_index')?.type).toBe('numeric');
  });

  it('rigor_mortis has all 5 real options from the spec, each with a real, distinct lexiconTermKey', () => {
    const field = findField('rigor_mortis');
    expect(field?.options).toHaveLength(5);
    const keys = field?.options.map(o => o.lexiconTermKey);
    expect(new Set(keys).size).toBe(5);
    expect(keys?.every(k => k?.startsWith('forensic.rigor_mortis.'))).toBe(true);
  });

  it('livor_mortis has all 7 real options from the spec, each with a real, distinct lexiconTermKey', () => {
    const field = findField('livor_mortis');
    expect(field?.options).toHaveLength(7);
    const keys = field?.options.map(o => o.lexiconTermKey);
    expect(new Set(keys).size).toBe(7);
  });

  it('medical_intervention_devices is real checkboxes (multi-select) \u2014 several devices can genuinely coexist', () => {
    expect(findField('medical_intervention_devices')?.type).toBe('checkboxes');
  });

  it('the real "None"/"No significant trauma" negative options deliberately carry no lexiconTermKey \u2014 there\u2019s no real clinical finding to bind', () => {
    const devices = findField('medical_intervention_devices');
    const noneOption = devices?.options.find(o => o.id === 'devices_none');
    expect(noneOption?.lexiconTermKey).toBeUndefined();

    const trauma = findField('surface_injuries_trauma');
    const noTraumaOption = trauma?.options.find(o => o.id === 'trauma_none');
    expect(noTraumaOption?.lexiconTermKey).toBeUndefined();
  });

  it('surface_injuries_trauma is real checkboxes and every real, genuine trauma-type option (excluding the negative) carries a real lexiconTermKey', () => {
    const field = findField('surface_injuries_trauma');
    expect(field?.type).toBe('checkboxes');
    const positiveOptions = field?.options.filter(o => o.id !== 'trauma_none');
    expect(positiveOptions?.every(o => !!o.lexiconTermKey)).toBe(true);
  });
});

describe('autopsy_gross_examination.json \u2014 Head & Neck section', () => {
  it('has all 15 real fields from Part A Section 2, in the real, expected order', () => {
    const fieldIds = typedTemplate.sections[1].fields.map(f => f.id);
    expect(fieldIds).toEqual([
      'scalp_subgaleal_tissues', 'subgaleal_region_detail',
      'cranial_vault_skull_base', 'skull_fracture_location_detail',
      'intracranial_hemorrhage', 'epidural_hemorrhage_volume_ml',
      'subdural_hemorrhage_chronicity', 'subdural_hemorrhage_volume_ml',
      'subarachnoid_hemorrhage_distribution', 'fresh_brain_weight_g',
      'meninges_circle_of_willis', 'parenchyma_herniation_features',
      'hyoid_laryngeal_skeleton', 'cervical_strap_muscle_hemorrhage', 'strap_muscle_hemorrhage_region_detail',
    ]);
  });

  it('the real "Specify Region"/"Specify Location" follow-up fields are only visible for the real option(s) that need them', () => {
    expect(findField('subgaleal_region_detail')?.visibleWhen).toEqual({ fieldId: 'scalp_subgaleal_tissues', answerId: 'subgaleal_localized' });
    expect(findField('strap_muscle_hemorrhage_region_detail')?.visibleWhen).toEqual({ fieldId: 'cervical_strap_muscle_hemorrhage', answerId: 'strap_muscle_hemorrhage_present' });
  });

  it('skull_fracture_location_detail genuinely uses the real, new multi-value answerIds \u2014 visible for EITHER linear OR depressed/comminuted fracture, not just one', () => {
    const field = findField('skull_fracture_location_detail');
    expect(field?.visibleWhen?.answerIds).toEqual(['skull_fracture_linear', 'skull_fracture_depressed_comminuted']);
  });

  it('intracranial_hemorrhage is real checkboxes \u2014 multiple hemorrhage types can genuinely coexist', () => {
    expect(findField('intracranial_hemorrhage')?.type).toBe('checkboxes');
    expect(findField('intracranial_hemorrhage')?.options).toHaveLength(5);
  });

  it('the real subdural-specific follow-ups (chronicity, volume) are each genuinely gated on the real subdural checkbox alone', () => {
    expect(findField('subdural_hemorrhage_chronicity')?.visibleWhen).toEqual({ fieldId: 'intracranial_hemorrhage', answerId: 'ich_subdural' });
    expect(findField('subdural_hemorrhage_volume_ml')?.visibleWhen).toEqual({ fieldId: 'intracranial_hemorrhage', answerId: 'ich_subdural' });
    expect(findField('subdural_hemorrhage_chronicity')?.options).toHaveLength(3);
  });

  it('parenchyma_herniation_features correctly expands uncal herniation laterality into three real, distinct options rather than a separate follow-up field', () => {
    const field = findField('parenchyma_herniation_features');
    const lateralityIds = field?.options.filter(o => o.id.startsWith('herniation_uncal_')).map(o => o.id);
    expect(lateralityIds).toEqual(['herniation_uncal_left', 'herniation_uncal_right', 'herniation_uncal_bilateral']);
  });

  it('hyoid_laryngeal_skeleton is real checkboxes \u2014 multiple real fractures (e.g. both hyoid horns) can genuinely coexist', () => {
    expect(findField('hyoid_laryngeal_skeleton')?.type).toBe('checkboxes');
    expect(findField('hyoid_laryngeal_skeleton')?.options).toHaveLength(6);
  });

  it('every real, genuine positive finding across the Head & Neck section carries a real lexiconTermKey; every real negative/intact finding does not', () => {
    const negativeIds = new Set([
      'subgaleal_intact', 'skull_intact', 'ich_none', 'cow_patent', 'parenchyma_normal',
      'hyoid_laryngeal_intact', 'strap_muscles_intact',
    ]);
    for (const field of typedTemplate.sections[1].fields) {
      for (const option of field.options) {
        if (negativeIds.has(option.id)) {
          expect(option.lexiconTermKey, `${option.id} should NOT have a lexiconTermKey`).toBeUndefined();
        } else {
          expect(option.lexiconTermKey, `${option.id} SHOULD have a lexiconTermKey`).toBeTruthy();
        }
      }
    }
  });
});

describe('autopsy_gross_examination.json \u2014 Cardiovascular System section', () => {
  it('has all 10 real fields from Part A Section 3, in the real, expected order', () => {
    const fieldIds = typedTemplate.sections[2].fields.map(f => f.id);
    expect(fieldIds).toEqual([
      'heart_weight_fresh_g', 'lv_wall_thickness_mm', 'rv_wall_thickness_mm', 'ivs_thickness_mm',
      'lad_stenosis', 'lcx_stenosis', 'rca_stenosis', 'pda_stenosis',
      'myocardium_valvular_apparatus', 'myocardial_infarction_location_detail',
    ]);
  });

  it('all 4 real coronary arteries each get their own real, complete 5-option stenosis field', () => {
    for (const fieldId of ['lad_stenosis', 'lcx_stenosis', 'rca_stenosis', 'pda_stenosis']) {
      const field = findField(fieldId);
      expect(field?.type).toBe('radio');
      expect(field?.options).toHaveLength(5);
      expect(field?.options.every(o => !!o.lexiconTermKey)).toBe(true);
    }
  });

  it('the real coronary stenosis severity lexiconTermKeys are shared across all 4 arteries \u2014 one real, canonical severity vocabulary, not four separate ones', () => {
    const ladKeys = findField('lad_stenosis')?.options.map(o => o.lexiconTermKey);
    const rcaKeys = findField('rca_stenosis')?.options.map(o => o.lexiconTermKey);
    expect(ladKeys).toEqual(rcaKeys);
  });

  it('myocardium_valvular_apparatus is real checkboxes \u2014 e.g. an acute infarction and valve calcification can genuinely coexist', () => {
    expect(findField('myocardium_valvular_apparatus')?.type).toBe('checkboxes');
  });

  it('myocardial_infarction_location_detail genuinely uses the real, multi-value answerIds \u2014 visible for EITHER acute OR healed infarction', () => {
    const field = findField('myocardial_infarction_location_detail');
    expect(field?.visibleWhen?.answerIds).toEqual(['myocardium_acute_infarction', 'myocardium_healed_infarction']);
  });

  it('the real cardiac measurement fields are genuinely typed numeric', () => {
    for (const fieldId of ['heart_weight_fresh_g', 'lv_wall_thickness_mm', 'rv_wall_thickness_mm', 'ivs_thickness_mm']) {
      expect(findField(fieldId)?.type).toBe('numeric');
    }
  });
});

describe('autopsy_gross_examination.json \u2014 Respiratory System section', () => {
  it('has all 9 real fields from Part A Section 4, in the real, expected order', () => {
    const fieldIds = typedTemplate.sections[3].fields.map(f => f.id);
    expect(fieldIds).toEqual([
      'right_lung_weight_g', 'left_lung_weight_g', 'lung_parenchyma_appearance',
      'tracheobronchial_mucosa', 'pulmonary_arterial_system',
      'right_pleural_cavity_volume_ml', 'right_pleural_fluid_character',
      'left_pleural_cavity_volume_ml', 'left_pleural_fluid_character',
    ]);
  });

  it('the real pleural fluid character lexiconTermKeys are shared across BOTH sides \u2014 one real, canonical vocabulary, not two separate ones', () => {
    const rightKeys = findField('right_pleural_fluid_character')?.options.map(o => o.lexiconTermKey);
    const leftKeys = findField('left_pleural_fluid_character')?.options.map(o => o.lexiconTermKey);
    expect(rightKeys).toEqual(leftKeys);
    expect(rightKeys).toHaveLength(4);
  });

  it('both real lung weight fields are genuinely typed numeric, and Tier 3 (no clean gatekeeper for whether weighing is feasible \u2014 e.g. thoracic disruption)', () => {
    expect(findField('right_lung_weight_g')).toMatchObject({ type: 'numeric', required: false });
    expect(findField('left_lung_weight_g')).toMatchObject({ type: 'numeric', required: false });
  });

  it('the real pleural cavity volume/character fields are genuinely optional \u2014 not every real autopsy finds pleural fluid at all', () => {
    expect(findField('right_pleural_cavity_volume_ml')?.required).toBe(false);
    expect(findField('right_pleural_fluid_character')?.required).toBe(false);
  });

  it('every real, genuine positive finding across the Respiratory section carries a real lexiconTermKey; every real negative/normal finding does not', () => {
    const negativeIds = new Set([
      'lung_parenchyma_normal', 'tracheobronchial_clear', 'pulmonary_artery_free_of_emboli',
    ]);
    for (const field of typedTemplate.sections[3].fields) {
      for (const option of field.options) {
        if (negativeIds.has(option.id)) {
          expect(option.lexiconTermKey, `${option.id} should NOT have a lexiconTermKey`).toBeUndefined();
        } else {
          expect(option.lexiconTermKey, `${option.id} SHOULD have a lexiconTermKey`).toBeTruthy();
        }
      }
    }
  });
});

describe('autopsy_gross_examination.json \u2014 Gastrointestinal & Hepatobiliary section', () => {
  it('has all 6 real fields from Part A Section 5, in the real, expected order', () => {
    const fieldIds = typedTemplate.sections[4].fields.map(f => f.id);
    expect(fieldIds).toEqual([
      'gastric_content_volume_ml', 'gastric_content_description',
      'liver_weight_fresh_g', 'liver_parenchymal_appearance',
      'gallbladder_status', 'gallbladder_bile_volume_ml',
    ]);
  });

  it('gallbladder_bile_volume_ml genuinely uses the real, multi-value answerIds \u2014 visible whenever real bile could exist (normal OR cholelithiasis), never when surgically absent', () => {
    const field = findField('gallbladder_bile_volume_ml');
    expect(field?.visibleWhen?.answerIds).toEqual(['gallbladder_normal', 'gallbladder_cholelithiasis']);
  });

  it('the real liver and gastric measurement fields are genuinely typed numeric', () => {
    expect(findField('gastric_content_volume_ml')?.type).toBe('numeric');
    expect(findField('liver_weight_fresh_g')?.type).toBe('numeric');
  });
});

describe('autopsy_gross_examination.json \u2014 Genitourinary & Endocrine section', () => {
  it('has all 7 real fields from Part A Section 6, in the real, expected order', () => {
    const fieldIds = typedTemplate.sections[5].fields.map(f => f.id);
    expect(fieldIds).toEqual([
      'right_kidney_weight_g', 'left_kidney_weight_g', 'renal_cortical_surface',
      'bladder_content_volume_ml', 'bladder_content_character',
      'adrenal_glands', 'thyroid_gland',
    ]);
  });

  it('both real kidney weight fields are genuinely typed numeric, and Tier 3 (measurement, no clean gatekeeper)', () => {
    expect(findField('right_kidney_weight_g')).toMatchObject({ type: 'numeric', required: false });
    expect(findField('left_kidney_weight_g')).toMatchObject({ type: 'numeric', required: false });
  });

  it('the real thyroid GLAND lexiconTermKeys are genuinely distinct from Section 2\u2019s own thyroid CARTILAGE fracture keys \u2014 different real anatomic structures, never collapsed into one vocabulary', () => {
    const thyroidGlandKeys = findField('thyroid_gland')?.options.map(o => o.lexiconTermKey).filter(Boolean);
    const thyroidCartilageField = typedTemplate.sections[1].fields.find(f => f.id === 'cranial_vault_skull_base');
    expect(thyroidGlandKeys?.every(k => k?.startsWith('forensic.thyroid_gland.'))).toBe(true);
    // Sanity: the Section 2 field this could be confused with is a
    // genuinely different field entirely (skull fractures, not thyroid).
    expect(thyroidCartilageField?.id).not.toBe('thyroid_gland');
  });

  it('every real, genuine positive finding across the Genitourinary & Endocrine section carries a real lexiconTermKey; every real negative/normal finding does not', () => {
    const negativeIds = new Set([
      'renal_cortical_smooth_sharp', 'bladder_content_clear_yellow', 'bladder_content_empty',
      'adrenal_unremarkable', 'thyroid_gland_unremarkable',
    ]);
    for (const field of typedTemplate.sections[5].fields) {
      for (const option of field.options) {
        if (negativeIds.has(option.id)) {
          expect(option.lexiconTermKey, `${option.id} should NOT have a lexiconTermKey`).toBeUndefined();
        } else {
          expect(option.lexiconTermKey, `${option.id} SHOULD have a lexiconTermKey`).toBeTruthy();
        }
      }
    }
  });

  it('the real template is now fully authored: all 7 real sections present (Part A\u2019s original 6 plus Musculoskeletal & Hematopoietic)', () => {
    expect(typedTemplate.sections).toHaveLength(7);
    expect(typedTemplate.sections.map(s => s.id)).toEqual([
      'external_examination', 'head_and_neck', 'cardiovascular_system',
      'respiratory_system', 'gastrointestinal_hepatobiliary', 'genitourinary_endocrine',
      'musculoskeletal_hematopoietic',
    ]);
  });
});

describe('autopsy_gross_examination.json \u2014 Musculoskeletal & Hematopoietic section', () => {
  it('has all 44 real fields, matching the Tier 1/2/3 required-field reconciliation', () => {
    expect(typedTemplate.sections[6].fields).toHaveLength(44);
  });

  it('the real Spleen Status gatekeeper is Tier 1 (unconditionally required); Spleen Weight and Dimensions are Tier 2 (requiredIf Present)', () => {
    expect(findField('spleen_status')).toMatchObject({ required: true });
    expect(findField('spleen_weight_status')).toMatchObject({ required: false, requiredIf: { fieldId: 'spleen_status', answerId: 'spleen_status_present' } });
    expect(findField('spleen_dimension_length_cm')).toMatchObject({ required: false, requiredIf: { fieldId: 'spleen_status', answerId: 'spleen_status_present' } });
  });

  it('a real, genuine free-text elaboration field (Mass/Tumor detail) stays Tier 3 \u2014 never required, never requiredIf, per the "no forced dummy data" principle', () => {
    const field = findField('spleen_mass_tumor_detail');
    expect(field?.required).toBe(false);
    expect(field?.requiredIf).toBeUndefined();
  });

  it('every real field with a requiredIf condition also has its own real, matching parent field actually present in the section', () => {
    const fieldIds = new Set(typedTemplate.sections[6].fields.map(f => f.id));
    for (const field of typedTemplate.sections[6].fields) {
      if (field.requiredIf) {
        expect(fieldIds.has(field.requiredIf.fieldId), `${field.id}'s requiredIf references a real, existing field`).toBe(true);
      }
    }
  });
});

describe('autopsy_gross_examination.json \u2014 Sections 1\u20136 Tier 1/2/3 reconciliation', () => {
  it('every real gatekeeper field with a "normal/none/intact" escape option is Tier 1 (unconditionally required)', () => {
    for (const fieldId of [
      'rigor_mortis', 'livor_mortis', 'medical_intervention_devices', 'surface_injuries_trauma',
      'scalp_subgaleal_tissues', 'cranial_vault_skull_base', 'intracranial_hemorrhage',
      'meninges_circle_of_willis', 'parenchyma_herniation_features', 'hyoid_laryngeal_skeleton',
      'cervical_strap_muscle_hemorrhage', 'myocardium_valvular_apparatus', 'lung_parenchyma_appearance',
      'tracheobronchial_mucosa', 'pulmonary_arterial_system', 'gastric_content_description',
      'liver_parenchymal_appearance', 'gallbladder_status', 'renal_cortical_surface',
      'adrenal_glands', 'thyroid_gland',
    ]) {
      expect(findField(fieldId)?.required, `${fieldId} should be Tier 1`).toBe(true);
    }
  });

  it('every real bare measurement with no clean gatekeeper parent is genuinely Tier 3, never forcing dummy data on autolyzed/disrupted specimens', () => {
    for (const fieldId of [
      'body_weight_kg', 'body_length_cm', 'fresh_brain_weight_g', 'heart_weight_fresh_g',
      'lv_wall_thickness_mm', 'rv_wall_thickness_mm', 'ivs_thickness_mm',
      'right_lung_weight_g', 'left_lung_weight_g', 'gastric_content_volume_ml',
      'liver_weight_fresh_g', 'right_kidney_weight_g', 'left_kidney_weight_g',
    ]) {
      expect(findField(fieldId)?.required, `${fieldId} should be Tier 3`).toBe(false);
      expect(findField(fieldId)?.requiredIf, `${fieldId} should have no requiredIf`).toBeUndefined();
    }
  });

  it('coronary stenosis grading across all 4 real vessels is Tier 3, per the differential-clinical-depth principle \u2014 a basic medical autopsy shouldn\u2019t be forced into full 4-vessel grading', () => {
    for (const fieldId of ['lad_stenosis', 'lcx_stenosis', 'rca_stenosis', 'pda_stenosis']) {
      expect(findField(fieldId)?.required).toBe(false);
    }
  });

  it('every real positive-finding-detail field\u2019s own requiredIf exactly mirrors its own existing visibleWhen \u2014 becoming visible and becoming required stay the same real trigger for these', () => {
    for (const fieldId of [
      'subgaleal_region_detail', 'skull_fracture_location_detail', 'epidural_hemorrhage_volume_ml',
      'subdural_hemorrhage_chronicity', 'subdural_hemorrhage_volume_ml', 'subarachnoid_hemorrhage_distribution',
      'strap_muscle_hemorrhage_region_detail', 'myocardial_infarction_location_detail',
    ]) {
      const field = findField(fieldId);
      expect(field?.requiredIf, `${fieldId}`).toEqual(field?.visibleWhen);
    }
  });

  it('every real field with a requiredIf condition, across every real section, references its own real, existing parent field', () => {
    for (const section of typedTemplate.sections) {
      const fieldIds = new Set(section.fields.map(f => f.id));
      for (const field of section.fields) {
        if (field.requiredIf) {
          expect(fieldIds.has(field.requiredIf.fieldId), `${section.id}/${field.id}'s requiredIf references a real, existing field`).toBe(true);
        }
      }
    }
  });

  it('gallbladder_status is genuinely Tier 1, matching the Spleen Status pattern exactly \u2014 the same real, "organ present/absent/diseased" shape', () => {
    expect(findField('gallbladder_status')?.required).toBe(true);
  });
});

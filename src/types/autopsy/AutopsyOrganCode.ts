// src/types/autopsy/AutopsyOrganCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed canonical organ vocabulary
// — explicit, enumerated tokens mapped directly to their parent
// section, replacing the earlier, narrower "specimen container type"
// model (resolveAutopsyGrossingSectionVisibility.ts's own
// whole_body/head_and_neck/thoraco_abdominal presets), which couldn't
// extend to combinations the spec never named. Real section
// visibility is now derived from which organs are actually present
// among a case's real specimens, not a fixed preset — every
// combination falls out for free.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyGrossingSectionId } from '../../services/autopsy/resolveAutopsyGrossingSectionVisibility';

export type AutopsyOrganCode =
  // Head & Neck
  | 'brain' | 'pituitary' | 'eyes' | 'spinal_cord' | 'thyroid' | 'parathyroid' | 'larynx_trachea'
  // Cardiovascular
  | 'heart' | 'pericardium' | 'aorta' | 'major_vessels'
  // Respiratory
  | 'right_lung' | 'left_lung' | 'pleura' | 'tracheobronchial_tree'
  // Gastrointestinal & Hepatobiliary
  | 'esophagus' | 'stomach' | 'duodenum' | 'small_intestine' | 'large_intestine' | 'appendix'
  | 'liver' | 'gallbladder_biliary' | 'pancreas' | 'peritoneum_omentum'
  // Genitourinary & Endocrine
  | 'right_kidney' | 'left_kidney' | 'adrenal_glands' | 'bladder' | 'ureters'
  | 'prostate' | 'uterus_adnexa' | 'testes'
  // Musculoskeletal & Hematopoietic
  | 'spleen' | 'lymph_nodes' | 'bone_marrow' | 'skin_subcutis' | 'musculoskeletal_specimen';

/** Real, per direct guidance's own explicit note: thyroid and
 *  adrenal_glands are deliberately assigned to Genitourinary &
 *  Endocrine (standard autopsy reporting grouping), NOT Head & Neck —
 *  even though thyroid CARTILAGE fractures are a real, separate,
 *  correctly-distinct concept already covered in the Head & Neck
 *  section's own laryngeal-skeleton field. brain maps exclusively to
 *  Head & Neck. */
export const AUTOPSY_ORGAN_TO_SECTION: Record<AutopsyOrganCode, AutopsyGrossingSectionId> = {
  brain: 'head_and_neck', pituitary: 'head_and_neck', eyes: 'head_and_neck',
  spinal_cord: 'head_and_neck', thyroid: 'genitourinary_endocrine',
  parathyroid: 'genitourinary_endocrine', larynx_trachea: 'head_and_neck',

  heart: 'cardiovascular_system', pericardium: 'cardiovascular_system',
  aorta: 'cardiovascular_system', major_vessels: 'cardiovascular_system',

  right_lung: 'respiratory_system', left_lung: 'respiratory_system',
  pleura: 'respiratory_system', tracheobronchial_tree: 'respiratory_system',

  esophagus: 'gastrointestinal_hepatobiliary', stomach: 'gastrointestinal_hepatobiliary',
  duodenum: 'gastrointestinal_hepatobiliary', small_intestine: 'gastrointestinal_hepatobiliary',
  large_intestine: 'gastrointestinal_hepatobiliary', appendix: 'gastrointestinal_hepatobiliary',
  liver: 'gastrointestinal_hepatobiliary', gallbladder_biliary: 'gastrointestinal_hepatobiliary',
  pancreas: 'gastrointestinal_hepatobiliary', peritoneum_omentum: 'gastrointestinal_hepatobiliary',

  right_kidney: 'genitourinary_endocrine', left_kidney: 'genitourinary_endocrine',
  adrenal_glands: 'genitourinary_endocrine', bladder: 'genitourinary_endocrine',
  ureters: 'genitourinary_endocrine', prostate: 'genitourinary_endocrine',
  uterus_adnexa: 'genitourinary_endocrine', testes: 'genitourinary_endocrine',

  spleen: 'musculoskeletal_hematopoietic', lymph_nodes: 'musculoskeletal_hematopoietic',
  bone_marrow: 'musculoskeletal_hematopoietic', skin_subcutis: 'musculoskeletal_hematopoietic',
  musculoskeletal_specimen: 'musculoskeletal_hematopoietic',
};

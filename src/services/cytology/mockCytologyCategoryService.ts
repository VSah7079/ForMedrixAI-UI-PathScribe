// src/services/cytology/mockCytologyCategoryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of ICytologyCategoryService.
// Reads/writes localStorage — same "dev mock / live Firestore" split as
// every other dictionary service in this app.
//
// Seed data below is the real, standard 2014 Bethesda System vocabulary
// (verified against IARC's own published Bethesda reference, not
// improvised) — the three configurable components: Specimen Adequacy,
// General Categorization, and Interpretation/Result. Interpretation/
// Result's own real sub-groups (Negative for Intraepithelial Lesion or
// Malignancy — Organisms / Other Non-Neoplastic Findings, Epithelial
// Cell Abnormality — Squamous / Glandular, Other Malignant Neoplasms)
// are preserved exactly as the real Bethesda structure organizes them,
// not flattened or reorganized.
//
// requiresPathologistReview follows directly from the real Bethesda
// clinical meaning of each category, per the original module's own
// routing requirement: NILM and its own sub-findings (organisms,
// reactive changes, atrophy, post-hysterectomy glandular cells) are the
// only interpretation_result entries that don't require it — every
// epithelial cell abnormality and other malignant neoplasm does.
// suggestedAbnormalSeverity is set only on entries with a real, existing
// AbnormalSeverity equivalent worth recording now — deliberately left
// unset on entries this app's own three-level vocabulary genuinely
// doesn't map onto (ASC-US) without engineering-driven guesswork.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ICytologyCategoryService,
  CytologyCategoryEntry,
  CytologyCategorySection,
  NewCytologyCategoryEntry,
} from './ICytologyCategoryService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ─── Seed data — the real, standard Bethesda System vocabulary ────────────────

const SEED: CytologyCategoryEntry[] = [
  // ── Specimen Adequacy ──
  { id: 'cyto-adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', isUnsatisfactory: false, label: 'Satisfactory for Evaluation', description: 'Endocervical/transformation zone component and any quality indicators (e.g. partially obscuring blood, inflammation) are described on the report.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-adeq-rejected', section: 'adequacy', nomenclatureSystem: 'bethesda', isUnsatisfactory: true, label: 'Unsatisfactory — Specimen Rejected/Not Processed', description: 'Specify the reason the specimen was rejected before processing.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-adeq-processed-insufficient', section: 'adequacy', nomenclatureSystem: 'bethesda', isUnsatisfactory: true, label: 'Unsatisfactory — Processed, But Insufficient for Epithelial Abnormality Evaluation', description: 'Specimen was processed and examined but does not support a reliable epithelial abnormality assessment; specify the reason.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },

  // ── General Categorization (optional per Bethesda) ──
  { id: 'cyto-gencat-nilm', section: 'general_categorization', nomenclatureSystem: 'bethesda', description: 'Negative for Intraepithelial Lesion or Malignancy (NILM).', label: 'Negative for Intraepithelial Lesion or Malignancy', abbreviation: 'NILM', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-gencat-other', section: 'general_categorization', nomenclatureSystem: 'bethesda', label: 'Other', description: 'E.g. endometrial cells present in a woman aged 40 or older — see Interpretation/Result.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-gencat-epithelial-squamous', section: 'general_categorization', nomenclatureSystem: 'bethesda', description: 'Epithelial Cell Abnormality — Squamous.', label: 'Epithelial Cell Abnormality — Squamous', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-gencat-epithelial-glandular', section: 'general_categorization', nomenclatureSystem: 'bethesda', description: 'Epithelial Cell Abnormality — Glandular.', label: 'Epithelial Cell Abnormality — Glandular', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 4 },

  // ── Interpretation/Result: NILM — Organisms ──
  { id: 'cyto-org-trichomonas', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Trichomonas vaginalis organisms identified.', label: 'Trichomonas vaginalis', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-org-candida', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Fungal organisms morphologically consistent with Candida species identified.', label: 'Fungal Organisms Morphologically Consistent With Candida spp.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-org-bv', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Shift in flora suggestive of bacterial vaginosis.', label: 'Shift in Flora Suggestive of Bacterial Vaginosis', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-org-actinomyces', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Bacterial organisms morphologically consistent with Actinomyces species identified.', label: 'Bacteria Morphologically Consistent With Actinomyces spp.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-org-hsv', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Cellular changes consistent with Herpes simplex virus infection.', label: 'Cellular Changes Consistent With Herpes Simplex Virus', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },

  // ── Interpretation/Result: NILM — Other Non-Neoplastic Findings ──
  { id: 'cyto-nonneo-reactive-inflammation', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Reactive cellular changes associated with inflammation (includes typical repair).', label: 'Reactive Cellular Changes — Inflammation', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-nonneo-reactive-radiation', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Reactive cellular changes associated with radiation.', label: 'Reactive Cellular Changes — Radiation', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-nonneo-reactive-iud', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Reactive cellular changes associated with an intrauterine contraceptive device (IUD).', label: 'Reactive Cellular Changes — Intrauterine Device (IUD)', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-nonneo-posthyst', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Glandular cells present in a post-hysterectomy patient.', label: 'Glandular Cells, Status Post-Hysterectomy', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-nonneo-atrophy', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Atrophic cellular pattern.', label: 'Atrophy', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },

  // ── Interpretation/Result: Other ──
  { id: 'cyto-other-endometrial', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Other', diagnosticRank: 0, label: 'Endometrial Cells (Woman Aged 40 or Older)', description: 'Specify if negative for squamous intraepithelial lesion.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },

  // ── Interpretation/Result: Epithelial Cell Abnormality — Squamous ──
  { id: 'cyto-squam-ascus', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 1, description: 'Atypical squamous cells of undetermined significance (ASC-US).', label: 'Atypical Squamous Cells of Undetermined Significance', abbreviation: 'ASC-US', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-squam-asch', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 3, description: 'Atypical squamous cells, cannot exclude high-grade squamous intraepithelial lesion (ASC-H).', label: 'Atypical Squamous Cells, Cannot Exclude HSIL', abbreviation: 'ASC-H', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-squam-lsil', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 2, label: 'Low-Grade Squamous Intraepithelial Lesion', abbreviation: 'LSIL', description: 'Encompasses HPV cytopathic effect, mild dysplasia, and CIN 1.', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-squam-hsil', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 4, label: 'High-Grade Squamous Intraepithelial Lesion', abbreviation: 'HSIL', description: 'Encompasses moderate and severe dysplasia, carcinoma in situ, and CIN 2/CIN 3.', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-squam-hsil-invasive', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 5, description: 'High-grade squamous intraepithelial lesion with features suspicious for invasion.', label: 'HSIL, With Features Suspicious for Invasion', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 5 },
  { id: 'cyto-squam-scc', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 5, description: 'Squamous cell carcinoma.', label: 'Squamous Cell Carcinoma', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 6 },

  // ── Interpretation/Result: Epithelial Cell Abnormality — Glandular ──
  { id: 'cyto-gland-atyp-endocervical', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 3, description: 'Atypical endocervical cells, not otherwise specified (NOS).', label: 'Atypical Endocervical Cells, Not Otherwise Specified', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-gland-atyp-endometrial', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 3, description: 'Atypical endometrial cells.', label: 'Atypical Endometrial Cells, Not Otherwise Specified', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-gland-atyp-glandular-nos', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 3, description: 'Atypical glandular cells, not otherwise specified (NOS).', label: 'Atypical Glandular Cells, Not Otherwise Specified', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-gland-atyp-endocervical-neo', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 4, description: 'Atypical endocervical cells, favor neoplastic.', label: 'Atypical Endocervical Cells, Favor Neoplastic', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-gland-atyp-glandular-neo', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 4, description: 'Atypical glandular cells, favor neoplastic.', label: 'Atypical Glandular Cells, Favor Neoplastic', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 5 },
  { id: 'cyto-gland-ais', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 4, description: 'Endocervical adenocarcinoma in situ (AIS).', label: 'Endocervical Adenocarcinoma In Situ', abbreviation: 'AIS', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 6 },
  { id: 'cyto-gland-adenoca-endocervical', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Endocervical adenocarcinoma.', label: 'Adenocarcinoma, Endocervical', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 7 },
  { id: 'cyto-gland-adenoca-endometrial', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Endometrial adenocarcinoma.', label: 'Adenocarcinoma, Endometrial', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 8 },
  { id: 'cyto-gland-adenoca-extrauterine', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Extrauterine adenocarcinoma.', label: 'Adenocarcinoma, Extrauterine', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 9 },
  { id: 'cyto-gland-adenoca-nos', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Adenocarcinoma, not otherwise specified (NOS).', label: 'Adenocarcinoma, Not Otherwise Specified', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 10 },

  // ── Interpretation/Result: Other Malignant Neoplasms ──
  { id: 'cyto-other-malignant', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Other Malignant Neoplasms', diagnosticRank: 5, description: 'Other malignant neoplasm; specify.', label: 'Other Malignant Neoplasm (Specify)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 1 },

  // ── Recommendations — real, standard clinical follow-up
  // recommendations drawn from ASCCP's own published risk-based
  // management guidance, paraphrased into standard report language
  // (not quoted verbatim). Same dictionary as the interpretation/
  // result categories above — a recommendation is selected and
  // displayed the same way an interpretation is, per direct guidance.
  { id: 'cyto-rec-routine-interval', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Routine screening at the recommended interval.', label: 'Routine Screening Interval per Current Guidelines', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-rec-repeat-6mo', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Repeat cytology in 6 months.', label: 'Repeat Cytology in 6 Months', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-rec-repeat-12mo', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Repeat cytology in 12 months.', label: 'Repeat Cytology in 12 Months', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-rec-hpv-cotest-1yr', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'HPV testing (or cotesting) recommended in 1 year.', label: 'Repeat HPV Testing or Cotesting in 1 Year', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-rec-hpv-cotest-3yr', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'HPV testing (or cotesting) recommended in 3 years.', label: 'Repeat Cotesting in 3 Years', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },
  { id: 'cyto-rec-colposcopy', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Colposcopic evaluation recommended.', label: 'Refer for Colposcopy', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 6 },
  { id: 'cyto-rec-colposcopy-direct-hpv1618', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Direct referral to colposcopy recommended based on HPV genotype 16/18 positivity.', label: 'Direct Colposcopy Referral (HPV 16/18-Positive)', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 7 },
  { id: 'cyto-rec-endometrial-biopsy', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Endometrial biopsy recommended.', label: 'Endometrial Biopsy Recommended', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 8 },
  { id: 'cyto-rec-repeat-unsatisfactory', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Repeat cytologic sampling recommended due to unsatisfactory specimen.', label: 'Repeat Testing Due to Unsatisfactory Specimen', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 9 },
  { id: 'cyto-rec-correlate-history', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Correlate with clinical and prior cytologic/histologic history.', label: 'Correlate With Clinical History and Prior Cytology/Histology', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 10 },

  // ── UK/EU roadmap Phase 2: UK/Scotland/Ireland — British Society for
  // Clinical Cytology (BSCC) / RCPath terminology, per the NHS Cervical
  // Screening Programme's own current (2013 terminology, primary-HPV-
  // screening era) reporting and management pathways. Real, researched
  // grading and referral thresholds — not a Bethesda-to-BSCC alias
  // table; each entry's own diagnosticRank/requiresPathologistReview
  // reflects THIS system's own real clinical/regulatory thresholds.
  // Real, per direct guidance's own confirmed principle: "Neither the
  // CAP nor RCPath requires or expects synoptic reporting for routine
  // cervical cytology" — this dictionary, like the Bethesda one, feeds
  // this module's own structured (non-synoptic) review workflow.

  // Adequacy
  { id: 'bscc-adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bscc_rcpath', description: 'Satisfactory for evaluation.', label: 'Satisfactory', requiresPathologistReview: false, isUnsatisfactory: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'bscc-adeq-unsatisfactory', section: 'adequacy', nomenclatureSystem: 'bscc_rcpath', description: 'Unsatisfactory/inadequate for evaluation — repeat sample required.', label: 'Unsatisfactory / Inadequate', requiresPathologistReview: false, isUnsatisfactory: true, active: true, isSystem: true, sortOrder: 2 },

  // Interpretation / Result — real, standard BSCC terminology.
  // diagnosticRank mirrors the real, published referral-threshold
  // ordering (Landy et al. 2016, Cytopathology; NHS Trust guideline
  // result-code documentation): 0 = Negative; 1-2 = low-grade (routine
  // referral under HPV-primary screening); 3-5 = high-grade/malignant
  // (urgent 2-week or 62-day suspected-cancer pathway).
  { id: 'bscc-negative', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Negative', diagnosticRank: 0, description: 'Negative — no abnormality detected.', label: 'Negative', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'bscc-borderline-squamous', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Borderline Changes', diagnosticRank: 1, description: 'Borderline changes in squamous cells.', label: 'Borderline Changes in Squamous Cells', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 2 },
  { id: 'bscc-low-grade-dyskaryosis', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Dyskaryosis', diagnosticRank: 2, description: 'Low-grade dyskaryosis.', label: 'Low-Grade Dyskaryosis', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 3 },
  { id: 'bscc-borderline-high-grade-not-excluded', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Borderline Changes', diagnosticRank: 3, description: 'Borderline changes, high-grade dyskaryosis not excluded.', label: 'Borderline, High-Grade Not Excluded', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 4 },
  { id: 'bscc-borderline-endocervical', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Borderline Changes', diagnosticRank: 3, description: 'Borderline changes in endocervical cells.', label: 'Borderline Changes in Endocervical Cells', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 5 },
  { id: 'bscc-high-grade-moderate', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Dyskaryosis', diagnosticRank: 4, description: 'High-grade dyskaryosis (moderate).', label: 'High-Grade Dyskaryosis (Moderate)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 6 },
  { id: 'bscc-high-grade-severe', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'both', group: 'Dyskaryosis', diagnosticRank: 5, description: 'High-grade dyskaryosis (severe).', label: 'High-Grade Dyskaryosis (Severe)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 7 },
  { id: 'bscc-severe-dyskaryosis-invasive', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'primary', group: 'Dyskaryosis', diagnosticRank: 5, description: 'Severe dyskaryosis, ?invasive squamous carcinoma.', label: 'Severe Dyskaryosis, ?Invasive Squamous Carcinoma', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 8 },
  { id: 'bscc-glandular-neoplasia-endocervical', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'primary', group: 'Glandular Neoplasia', diagnosticRank: 5, description: '?Glandular neoplasia of endocervical type (CGIN).', label: '?Glandular Neoplasia, Endocervical Type (CGIN)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 9 },
  { id: 'bscc-glandular-neoplasia-non-cervical', section: 'interpretation_result', nomenclatureSystem: 'bscc_rcpath', usage: 'primary', group: 'Glandular Neoplasia', diagnosticRank: 5, description: 'Glandular neoplasia of non-cervical origin (endometrial, ovarian, or metastatic).', label: 'Glandular Neoplasia, Non-Cervical Origin', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 10 },

  // Recommendations — real, standard NHSCSP-era management language
  // (current, primary-HPV-screening era: even low-grade/borderline
  // results are direct-referred, since cytology only occurs as reflex
  // testing after an already-confirmed hrHPV-positive result).
  { id: 'bscc-rec-routine-recall', section: 'recommendation', nomenclatureSystem: 'bscc_rcpath', description: 'Return to routine recall.', label: 'Return to Routine Recall', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'bscc-rec-direct-colposcopy', section: 'recommendation', nomenclatureSystem: 'bscc_rcpath', description: 'Direct referral to colposcopy.', label: 'Direct Referral to Colposcopy', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'bscc-rec-urgent-colposcopy-2week', section: 'recommendation', nomenclatureSystem: 'bscc_rcpath', description: 'Urgent referral to colposcopy — offered an appointment within 2 weeks.', label: 'Urgent (2-Week) Colposcopy Referral', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'bscc-rec-62-day-pathway', section: 'recommendation', nomenclatureSystem: 'bscc_rcpath', description: 'Referral within the 62-day suspected cancer pathway.', label: '62-Day Suspected Cancer Pathway Referral', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'bscc-rec-repeat-inadequate', section: 'recommendation', nomenclatureSystem: 'bscc_rcpath', description: 'Repeat sample recommended due to an inadequate specimen.', label: 'Repeat Sample — Inadequate Specimen', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },
];

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORE_KEY = 'pathscribe_cytology_categories_v1';

// Real, per direct follow-up's own established mock-data versioning
// pattern (mockCaseService.ts's MOCK_VERSION/VERSION_KEY; same real
// fix just applied to mockCytologyReviewRecordService.ts): this
// dictionary gained real fields across several phases after this
// service first shipped — diagnosticRank/isUnsatisfactory (Phase 6),
// usage and the whole 'recommendation' section (Phase 5A). Anyone
// with cached localStorage data from before any of those phases would
// silently keep the OLD shape — missing exactly the fields
// classifyCytologyAgreement, resolveCytologySignOutGate, and the
// screening UI's own Primary/Additional filtering all depend on —
// without this real version guard.
const SEED_VERSION = '3'; // bumped: real, structural change — every entry now requires nomenclatureSystem (all 45 existing entries backfilled 'bethesda'), plus the real UK/RCPath (bscc_rcpath) dictionary added this phase. Stale cached data on version '2' would be missing this required field entirely on every entry.
const SEED_VERSION_KEY = 'pathscribe_cytology_categories_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORE_KEY, SEED);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = () => storageGet<CytologyCategoryEntry[]>(STORE_KEY, SEED);
const persist = (data: CytologyCategoryEntry[]) => storageSet(STORE_KEY, data);

let _cache: CytologyCategoryEntry[] = load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok    = <T>(data: T): ServiceResult<T>    => ({ ok: true,  data });
const err   = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });
const delay = () => new Promise(r => setTimeout(r, 60));
const sorted = (list: CytologyCategoryEntry[]) =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder);

// ─── Service ──────────────────────────────────────────────────────────────────

export const mockCytologyCategoryService: ICytologyCategoryService = {

  async getAll() {
    await delay();
    return ok(sorted(_cache).map(t => ({ ...t })));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache).filter(t => t.active).map(t => ({ ...t })));
  },

  async getBySection(section: CytologyCategorySection) {
    await delay();
    return ok(sorted(_cache).filter(t => t.section === section).map(t => ({ ...t })));
  },

  async getByNomenclatureSystem(system) {
    await delay();
    return ok(sorted(_cache).filter(t => t.nomenclatureSystem === system).map(t => ({ ...t })));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(t => t.id === id);
    return found ? ok({ ...found }) : err(`CytologyCategoryEntry ${id} not found`);
  },

  async add(entry: NewCytologyCategoryEntry) {
    await delay();
    const maxOrder = _cache.filter(t => t.section === entry.section).reduce((m, t) => Math.max(m, t.sortOrder), 0);
    const created: CytologyCategoryEntry = {
      ...entry,
      id:        'CYTO_CUSTOM_' + Date.now(),
      isSystem:  false,
      sortOrder: maxOrder + 1,
    };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<CytologyCategoryEntry>) {
    await delay();
    const idx = _cache.findIndex(t => t.id === id);
    if (idx === -1) return err(`CytologyCategoryEntry ${id} not found`);
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(t => t.id === id ? { ...t, ...safeChanges } : t);
    persist(_cache);
    return ok({ ..._cache.find(t => t.id === id)! });
  },

  async deactivate(id: ID) {
    return mockCytologyCategoryService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockCytologyCategoryService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(t => t.id === id);
    if (!target)         return err(`CytologyCategoryEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system category "${id}"`);
    _cache = _cache.filter(t => t.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

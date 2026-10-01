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
  { id: 'cyto-adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'bethesda', isUnsatisfactory: false, label: 'Satisfactory for Evaluation', labelFr: 'Satisfaisant pour évaluation', description: 'Endocervical/transformation zone component and any quality indicators (e.g. partially obscuring blood, inflammation) are described on the report.', descriptionFr: 'La composante endocervicale/zone de transformation et tout indicateur de qualité (par exemple sang ou inflammation masquant partiellement) sont décrits dans le compte rendu.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-adeq-rejected', section: 'adequacy', nomenclatureSystem: 'bethesda', isUnsatisfactory: true, label: 'Unsatisfactory — Specimen Rejected/Not Processed', labelFr: 'Non satisfaisant — Prélèvement rejeté/non traité', description: 'Specify the reason the specimen was rejected before processing.', descriptionFr: 'Préciser la raison du rejet du prélèvement avant traitement.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-adeq-processed-insufficient', section: 'adequacy', nomenclatureSystem: 'bethesda', isUnsatisfactory: true, label: 'Unsatisfactory — Processed, But Insufficient for Epithelial Abnormality Evaluation', labelFr: 'Non satisfaisant — Traité, mais insuffisant pour l\u2019évaluation d\u2019une anomalie épithéliale', description: 'Specimen was processed and examined but does not support a reliable epithelial abnormality assessment; specify the reason.', descriptionFr: 'Le prélèvement a été traité et examiné mais ne permet pas une évaluation fiable d\u2019une anomalie épithéliale ; préciser la raison.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },

  // ── General Categorization (optional per Bethesda) ──
  { id: 'cyto-gencat-nilm', section: 'general_categorization', nomenclatureSystem: 'bethesda', description: 'Negative for Intraepithelial Lesion or Malignancy (NILM).', descriptionFr: 'Absence de lésion malpighienne intra-épithéliale ou de signe de malignité (NIL/M).', label: 'Negative for Intraepithelial Lesion or Malignancy', labelFr: 'Absence de lésion malpighienne intra-épithéliale ou de signe de malignité', abbreviation: 'NILM', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-gencat-other', section: 'general_categorization', nomenclatureSystem: 'bethesda', label: 'Other', labelFr: 'Autres', description: 'E.g. endometrial cells present in a woman aged 40 or older — see Interpretation/Result.', descriptionFr: 'Par exemple, présence de cellules endométriales chez une femme âgée de 40 ans ou plus — voir Interprétation/Résultat.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-gencat-epithelial-squamous', section: 'general_categorization', nomenclatureSystem: 'bethesda', description: 'Epithelial Cell Abnormality — Squamous.', descriptionFr: 'Anomalies des cellules malpighiennes.', label: 'Epithelial Cell Abnormality — Squamous', labelFr: 'Anomalies des cellules malpighiennes', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-gencat-epithelial-glandular', section: 'general_categorization', nomenclatureSystem: 'bethesda', description: 'Epithelial Cell Abnormality — Glandular.', descriptionFr: 'Anomalies des cellules glandulaires.', label: 'Epithelial Cell Abnormality — Glandular', labelFr: 'Anomalies des cellules glandulaires', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 4 },

  // ── Interpretation/Result: NILM — Organisms ──
  { id: 'cyto-org-trichomonas', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Trichomonas vaginalis organisms identified.', descriptionFr: 'Présence d\u2019organismes Trichomonas vaginalis.', label: 'Trichomonas vaginalis', labelFr: 'Trichomonas vaginalis', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-org-candida', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Fungal organisms morphologically consistent with Candida species identified.', descriptionFr: 'Éléments mycéliens, par exemple évoquant le candida.', label: 'Fungal Organisms Morphologically Consistent With Candida spp.', labelFr: 'Éléments mycéliens morphologiquement compatibles avec le genre Candida', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-org-bv', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Shift in flora suggestive of bacterial vaginosis.', descriptionFr: 'Anomalies de la flore vaginale évoquant une vaginose bactérienne.', label: 'Shift in Flora Suggestive of Bacterial Vaginosis', labelFr: 'Modification de la flore évoquant une vaginose bactérienne', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-org-actinomyces', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Bacterial organisms morphologically consistent with Actinomyces species identified.', descriptionFr: 'Bactéries de type actinomyces.', label: 'Bacteria Morphologically Consistent With Actinomyces spp.', labelFr: 'Bactéries morphologiquement compatibles avec le genre Actinomyces', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-org-hsv', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Organisms', diagnosticRank: 0, description: 'Cellular changes consistent with Herpes simplex virus infection.', descriptionFr: 'Modifications cellulaires évoquant un herpès simplex.', label: 'Cellular Changes Consistent With Herpes Simplex Virus', labelFr: 'Modifications cellulaires évoquant un herpès simplex', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },

  // ── Interpretation/Result: NILM — Other Non-Neoplastic Findings ──
  { id: 'cyto-nonneo-reactive-inflammation', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Reactive cellular changes associated with inflammation (includes typical repair).', descriptionFr: 'Modifications réactionnelles associées à une inflammation (inclut la réparation typique).', label: 'Reactive Cellular Changes — Inflammation', labelFr: 'Modifications cellulaires réactionnelles — Inflammation', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-nonneo-reactive-radiation', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Reactive cellular changes associated with radiation.', descriptionFr: 'Modifications réactionnelles associées à une irradiation.', label: 'Reactive Cellular Changes — Radiation', labelFr: 'Modifications cellulaires réactionnelles — Irradiation', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-nonneo-reactive-iud', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Reactive cellular changes associated with an intrauterine contraceptive device (IUD).', descriptionFr: 'Modifications réactionnelles associées à un dispositif intra-utérin (DIU).', label: 'Reactive Cellular Changes — Intrauterine Device (IUD)', labelFr: 'Modifications cellulaires réactionnelles — Dispositif intra-utérin (DIU)', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-nonneo-posthyst', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Glandular cells present in a post-hysterectomy patient.', descriptionFr: 'Présence de cellules glandulaires bénignes chez une patiente post-hystérectomie.', label: 'Glandular Cells, Status Post-Hysterectomy', labelFr: 'Cellules glandulaires, statut post-hystérectomie', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-nonneo-atrophy', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Negative for Intraepithelial Lesion or Malignancy — Other Non-Neoplastic Findings', diagnosticRank: 0, description: 'Atrophic cellular pattern.', descriptionFr: 'Aspect cellulaire atrophique.', label: 'Atrophy', labelFr: 'Atrophie', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },

  // ── Interpretation/Result: Other ──
  { id: 'cyto-other-endometrial', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Other', diagnosticRank: 0, label: 'Endometrial Cells (Woman Aged 40 or Older)', labelFr: 'Cellules endométriales (femme âgée de 40 ans ou plus)', description: 'Specify if negative for squamous intraepithelial lesion.', descriptionFr: 'Préciser si négatif pour une lésion malpighienne intra-épithéliale.', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },

  // ── Interpretation/Result: Epithelial Cell Abnormality — Squamous ──
  { id: 'cyto-squam-ascus', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 1, description: 'Atypical squamous cells of undetermined significance (ASC-US).', descriptionFr: 'Atypies des cellules malpighiennes de signification indéterminée (ASC-US).', label: 'Atypical Squamous Cells of Undetermined Significance', labelFr: 'Atypies des cellules malpighiennes de signification indéterminée', abbreviation: 'ASC-US', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-squam-asch', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 3, description: 'Atypical squamous cells, cannot exclude high-grade squamous intraepithelial lesion (ASC-H).', descriptionFr: 'Atypies des cellules malpighiennes ne permettant pas d\u2019exclure une lésion malpighienne intra-épithéliale de haut grade (ASC-H).', label: 'Atypical Squamous Cells, Cannot Exclude HSIL', labelFr: 'Atypies des cellules malpighiennes ne permettant pas d\u2019exclure une lésion malpighienne intra-épithéliale de haut grade', abbreviation: 'ASC-H', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-squam-lsil', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 2, label: 'Low-Grade Squamous Intraepithelial Lesion', labelFr: 'Lésion malpighienne intra-épithéliale de bas grade', abbreviation: 'LSIL', description: 'Encompasses HPV cytopathic effect, mild dysplasia, and CIN 1.', descriptionFr: 'Regroupe l\u2019effet cytopathogène du HPV, la dysplasie légère et le CIN 1.', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-squam-hsil', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 4, label: 'High-Grade Squamous Intraepithelial Lesion', labelFr: 'Lésion malpighienne intra-épithéliale de haut grade', abbreviation: 'HSIL', description: 'Encompasses moderate and severe dysplasia, carcinoma in situ, and CIN 2/CIN 3.', descriptionFr: 'Regroupe les dysplasies modérée et sévère, le carcinome in situ, et les CIN 2/CIN 3.', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-squam-hsil-invasive', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 5, description: 'High-grade squamous intraepithelial lesion with features suspicious for invasion.', descriptionFr: 'Lésion malpighienne intra-épithéliale de haut grade avec présence d\u2019éléments faisant suspecter un processus invasif (sans autre précision).', label: 'HSIL, With Features Suspicious for Invasion', labelFr: 'Lésion malpighienne intra-épithéliale de haut grade, avec éléments faisant suspecter un processus invasif', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 5 },
  { id: 'cyto-squam-scc', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Squamous', diagnosticRank: 5, description: 'Squamous cell carcinoma.', descriptionFr: 'Carcinome malpighien.', label: 'Squamous Cell Carcinoma', labelFr: 'Carcinome malpighien', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 6 },

  // ── Interpretation/Result: Epithelial Cell Abnormality — Glandular ──
  { id: 'cyto-gland-atyp-endocervical', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 3, description: 'Atypical endocervical cells, not otherwise specified (NOS).', descriptionFr: 'Atypies des cellules endocervicales, sans autre précision.', label: 'Atypical Endocervical Cells, Not Otherwise Specified', labelFr: 'Atypies des cellules endocervicales, sans autre précision', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-gland-atyp-endometrial', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 3, description: 'Atypical endometrial cells.', descriptionFr: 'Atypies des cellules endométriales.', label: 'Atypical Endometrial Cells, Not Otherwise Specified', labelFr: 'Atypies des cellules endométriales, sans autre précision', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-gland-atyp-glandular-nos', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 3, description: 'Atypical glandular cells, not otherwise specified (NOS).', descriptionFr: 'Atypies des cellules glandulaires, sans autre précision.', label: 'Atypical Glandular Cells, Not Otherwise Specified', labelFr: 'Atypies des cellules glandulaires, sans autre précision (AGC-SAI)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Abnormal', active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-gland-atyp-endocervical-neo', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 4, description: 'Atypical endocervical cells, favor neoplastic.', descriptionFr: 'Atypies des cellules endocervicales en faveur d\u2019une néoplasie.', label: 'Atypical Endocervical Cells, Favor Neoplastic', labelFr: 'Atypies des cellules endocervicales en faveur d\u2019une néoplasie', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-gland-atyp-glandular-neo', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 4, description: 'Atypical glandular cells, favor neoplastic.', descriptionFr: 'Atypies des cellules glandulaires en faveur d\u2019une néoplasie.', label: 'Atypical Glandular Cells, Favor Neoplastic', labelFr: 'Atypies des cellules glandulaires en faveur d\u2019une néoplasie', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 5 },
  { id: 'cyto-gland-ais', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'both', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 4, description: 'Endocervical adenocarcinoma in situ (AIS).', descriptionFr: 'Adénocarcinome endocervical in situ (AIS).', label: 'Endocervical Adenocarcinoma In Situ', labelFr: 'Adénocarcinome endocervical in situ', abbreviation: 'AIS', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 6 },
  { id: 'cyto-gland-adenoca-endocervical', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Endocervical adenocarcinoma.', descriptionFr: 'Adénocarcinome endocervical.', label: 'Adenocarcinoma, Endocervical', labelFr: 'Adénocarcinome endocervical', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 7 },
  { id: 'cyto-gland-adenoca-endometrial', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Endometrial adenocarcinoma.', descriptionFr: 'Adénocarcinome endométrial.', label: 'Adenocarcinoma, Endometrial', labelFr: 'Adénocarcinome endométrial', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 8 },
  { id: 'cyto-gland-adenoca-extrauterine', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Extrauterine adenocarcinoma.', descriptionFr: 'Adénocarcinome extra-utérin.', label: 'Adenocarcinoma, Extrauterine', labelFr: 'Adénocarcinome extra-utérin', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 9 },
  { id: 'cyto-gland-adenoca-nos', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Epithelial Cell Abnormality — Glandular', diagnosticRank: 5, description: 'Adenocarcinoma, not otherwise specified (NOS).', descriptionFr: 'Adénocarcinome, d\u2019origine non précisée.', label: 'Adenocarcinoma, Not Otherwise Specified', labelFr: 'Adénocarcinome, sans autre précision', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 10 },

  // ── Interpretation/Result: Other Malignant Neoplasms ──
  { id: 'cyto-other-malignant', section: 'interpretation_result', nomenclatureSystem: 'bethesda', usage: 'primary', group: 'Other Malignant Neoplasms', diagnosticRank: 5, description: 'Other malignant neoplasm; specify.', descriptionFr: 'Autre néoplasie maligne ; à préciser.', label: 'Other Malignant Neoplasm (Specify)', labelFr: 'Autre néoplasie maligne (à préciser)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 1 },

  // ── Recommendations — real, standard clinical follow-up
  // recommendations drawn from ASCCP's own published risk-based
  // management guidance, paraphrased into standard report language
  // (not quoted verbatim). Same dictionary as the interpretation/
  // result categories above — a recommendation is selected and
  // displayed the same way an interpretation is, per direct guidance.
  { id: 'cyto-rec-routine-interval', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Routine screening at the recommended interval.', descriptionFr: 'Dépistage de routine selon l\u2019intervalle recommandé.', label: 'Routine Screening Interval per Current Guidelines', labelFr: 'Dépistage de routine selon l\u2019intervalle recommandé', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'cyto-rec-repeat-6mo', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Repeat cytology in 6 months.', descriptionFr: 'Nouvelle cytologie à 6 mois.', label: 'Repeat Cytology in 6 Months', labelFr: 'Nouvelle cytologie à 6 mois', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'cyto-rec-repeat-12mo', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Repeat cytology in 12 months.', descriptionFr: 'Nouvelle cytologie à 12 mois.', label: 'Repeat Cytology in 12 Months', labelFr: 'Nouvelle cytologie à 12 mois', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'cyto-rec-hpv-cotest-1yr', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'HPV testing (or cotesting) recommended in 1 year.', descriptionFr: 'Nouveau test HPV (ou co-test) recommandé à 1 an.', label: 'Repeat HPV Testing or Cotesting in 1 Year', labelFr: 'Nouveau test HPV ou co-test à 1 an', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'cyto-rec-hpv-cotest-3yr', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'HPV testing (or cotesting) recommended in 3 years.', descriptionFr: 'Nouveau co-test recommandé à 3 ans.', label: 'Repeat Cotesting in 3 Years', labelFr: 'Nouveau co-test à 3 ans', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },
  { id: 'cyto-rec-colposcopy', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Colposcopic evaluation recommended.', descriptionFr: 'Colposcopie recommandée.', label: 'Refer for Colposcopy', labelFr: 'Adresser pour colposcopie', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 6 },
  { id: 'cyto-rec-colposcopy-direct-hpv1618', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Direct referral to colposcopy recommended based on HPV genotype 16/18 positivity.', descriptionFr: 'Colposcopie d\u2019emblée recommandée en raison d\u2019une positivité HPV 16/18.', label: 'Direct Colposcopy Referral (HPV 16/18-Positive)', labelFr: 'Colposcopie d\u2019emblée (HPV 16/18 positif)', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 7 },
  { id: 'cyto-rec-hpv-genotyping', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'HPV genotyping (16/18 vs. other high-risk types) recommended to guide the choice between direct colposcopy referral and repeat cytology.', descriptionFr: 'Génotypage HPV (16/18 versus autres types à haut risque) recommandé pour orienter le choix entre colposcopie d\u2019emblée et nouvelle cytologie.', label: 'HPV Genotyping Recommended', labelFr: 'Génotypage HPV recommandé', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 11 },
  { id: 'cyto-rec-endometrial-biopsy', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Endometrial biopsy recommended.', descriptionFr: 'Biopsie de l\u2019endomètre recommandée.', label: 'Endometrial Biopsy Recommended', labelFr: 'Biopsie de l\u2019endomètre recommandée', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 8 },
  { id: 'cyto-rec-repeat-unsatisfactory', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Repeat cytologic sampling recommended due to unsatisfactory specimen.', descriptionFr: 'Nouveau prélèvement cytologique recommandé en raison d\u2019un échantillon non satisfaisant.', label: 'Repeat Testing Due to Unsatisfactory Specimen', labelFr: 'Nouveau prélèvement en raison d\u2019un échantillon non satisfaisant', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 9 },
  { id: 'cyto-rec-correlate-history', section: 'recommendation', nomenclatureSystem: 'bethesda', description: 'Correlate with clinical and prior cytologic/histologic history.', descriptionFr: 'Corréler avec les antécédents cliniques et la cytologie/histologie antérieures.', label: 'Correlate With Clinical History and Prior Cytology/Histology', labelFr: 'Corréler avec les antécédents cliniques et la cytologie/histologie antérieures', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 10 },

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

  // ── Germany — Münchner Nomenklatur III (MN III / "Munich Nomenclature
  // III"). Real, per direct guidance's own RFP terminology, this
  // system is referred to as "München IIIb" — real, direct research
  // (Deutsche Gesellschaft für Zytologie; AG-CPC; Die Pathologie 2017;
  // Deutsches Ärzteblatt 2014) found no distinct, separate "IIIb"
  // revision — the real, official, currently-binding standard (in
  // force since 1 July 2014, mandatory from 1 Jan 2015, replacing MN
  // II) is Münchner Nomenklatur III itself. `nomenclatureSystem:
  // 'munchen_iiib'` is kept as the real, already-established type
  // value from PS-173's own architecture; every entry's own real
  // label/description below uses the real, official "Münchner
  // Nomenklatur III" name, not an invented "IIIb" one.
  //
  // Real, researched diagnosticRank calibration — NOT a naive
  // Bethesda-equivalent copy. Real, published cumulative CIN2+ risk
  // data (Die Pathologie 2017, 3396-patient cohort) found Group III-p
  // (ambiguous, "cannot exclude high-grade") carries genuinely HIGHER
  // real risk (46.3% cumulative CIN2+) than the confirmed, lower-grade
  // IIID1 (17.1%) — the real reason Group III sits ABOVE IIID1 on this
  // dictionary's own rank scale, not below it as a naive "ASC-US-style
  // ambiguous call ranks lower than a confirmed LSIL" assumption would
  // suggest. This dictionary's own scale runs 0-7 (wider than
  // Bethesda/BSCC's 0-5) specifically so the real IVa/IVb distinction
  // (lower vs. higher real risk that invasion cannot be excluded) gets
  // its own, real, distinct rank — this works correctly with
  // classifyCytologyAgreement.ts's own shared HIGH_GRADE_RANK_THRESHOLD
  // (3), since Group III (rank 3) is the real, correct clinical
  // boundary here: everything from Group III up is genuinely treated
  // as needing serious follow-up (short-interval control or mandatory
  // hrHPV triage), matching this dictionary's own real recommendations
  // below.
  //
  // Real, honest gap: no German-specific specimen-adequacy terminology
  // was found in this research — the two adequacy entries below use
  // the same universal "adequate/inadequate for evaluation" concept
  // every real cytology system shares, not verbatim German wording.

  // Adequacy
  { id: 'mn3-adeq-satisfactory', section: 'adequacy', nomenclatureSystem: 'munchen_iiib', description: 'Adequate for cytologic evaluation.', label: 'Adequate for Evaluation', requiresPathologistReview: false, isUnsatisfactory: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'mn3-adeq-unsatisfactory', section: 'adequacy', nomenclatureSystem: 'munchen_iiib', description: 'Inadequate for cytologic evaluation — repeat sample required.', label: 'Inadequate for Evaluation', requiresPathologistReview: false, isUnsatisfactory: true, active: true, isSystem: true, sortOrder: 2 },

  // Interpretation / Result — real, official Münchner Nomenklatur III groups.
  { id: 'mn3-group-i', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group I', diagnosticRank: 0, description: 'Group I: Normal cytologic finding.', label: 'Group I — Normal', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'mn3-group-iia', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group II', diagnosticRank: 0, description: 'Group IIa: Unremarkable finding despite modifying or complicating clinical factors (e.g. atrophy, IUD) — clinical correlation required. A real, distinct group with no equivalent Bethesda category.', label: 'Group IIa — Unremarkable, Modifying Factors Present', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'mn3-group-iip', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group II', diagnosticRank: 1, description: 'Group II-p: Mild squamous atypia, less pronounced than Group III-p.', label: 'Group II-p — Mild Squamous Atypia', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 3 },
  { id: 'mn3-group-iig', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group II', diagnosticRank: 1, description: 'Group II-g: Mild glandular atypia.', label: 'Group II-g — Mild Glandular Atypia', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 4 },
  { id: 'mn3-group-iie', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group II', diagnosticRank: 1, description: 'Group II-e: Mild atypia of endometrial cells.', label: 'Group II-e — Mild Endometrial Atypia', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 5 },
  { id: 'mn3-group-iiid1', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group IIID', diagnosticRank: 2, description: 'Group IIID1: Findings consistent with mild dysplasia (suspected CIN1) — control after a longer interval is sufficient.', label: 'Group IIID1 — Mild Dysplasia (Suspected CIN1)', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 6 },
  { id: 'mn3-group-iiip', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group III', diagnosticRank: 3, description: 'Group III-p: Ambiguous/unclear squamous finding — a high-grade lesion cannot be excluded. Requires short-term follow-up or hrHPV triage.', label: 'Group III-p — Unclear Squamous Finding', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 7 },
  { id: 'mn3-group-iiig', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group III', diagnosticRank: 3, description: 'Group III-g: Ambiguous/unclear glandular finding — neoplasia cannot be excluded. Requires short-term follow-up.', label: 'Group III-g — Unclear Glandular Finding', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 8 },
  { id: 'mn3-group-iiie', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group III', diagnosticRank: 3, description: 'Group III-e: Ambiguous/unclear atypical endometrial finding. Requires short-term follow-up.', label: 'Group III-e — Unclear Endometrial Finding', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 9 },
  { id: 'mn3-group-iiid2', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'both', group: 'Group IIID', diagnosticRank: 4, description: 'Group IIID2: Findings consistent with moderate dysplasia (suspected CIN2) — shorter-interval control, possibly colposcopy.', label: 'Group IIID2 — Moderate Dysplasia (Suspected CIN2)', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 10 },
  { id: 'mn3-group-ivap', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group IV', diagnosticRank: 5, description: 'Group IVa-p: Severe squamous dysplasia / carcinoma in situ (suspected CIN3) — lower real risk that invasion cannot be excluded.', label: 'Group IVa-p — Severe Squamous Dysplasia / CIS', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 11 },
  { id: 'mn3-group-ivag', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group IV', diagnosticRank: 5, description: 'Group IVa-g: Adenocarcinoma in situ — lower real risk that invasion cannot be excluded.', label: 'Group IVa-g — Adenocarcinoma In Situ', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 12 },
  { id: 'mn3-group-ivbp', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group IV', diagnosticRank: 6, description: 'Group IVb-p: Severe squamous dysplasia / carcinoma in situ — a higher real risk that invasion cannot be excluded.', label: 'Group IVb-p — Severe Squamous Dysplasia / CIS, Invasion Not Excluded', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 13 },
  { id: 'mn3-group-ivbg', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group IV', diagnosticRank: 6, description: 'Group IVb-g: Adenocarcinoma in situ — a higher real risk that invasion cannot be excluded.', label: 'Group IVb-g — Adenocarcinoma In Situ, Invasion Not Excluded', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Critical', active: true, isSystem: true, sortOrder: 14 },
  { id: 'mn3-group-vp', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group V', diagnosticRank: 7, description: 'Group V-p: Squamous cell carcinoma.', label: 'Group V-p — Squamous Cell Carcinoma', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 15 },
  { id: 'mn3-group-vg', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group V', diagnosticRank: 7, description: 'Group V-g: Endocervical adenocarcinoma.', label: 'Group V-g — Endocervical Adenocarcinoma', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 16 },
  { id: 'mn3-group-ve', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group V', diagnosticRank: 7, description: 'Group V-e: Endometrial carcinoma.', label: 'Group V-e — Endometrial Carcinoma', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 17 },
  { id: 'mn3-group-vx', section: 'interpretation_result', nomenclatureSystem: 'munchen_iiib', usage: 'primary', group: 'Group V', diagnosticRank: 7, description: 'Group V-x: Malignant cells present, origin cannot be determined.', label: 'Group V-x — Malignant, Origin Undetermined', requiresPathologistReview: true, suggestedAbnormalSeverity: 'Malignant', active: true, isSystem: true, sortOrder: 18 },

  // Recommendations — real, per direct research (AG-CPC's own real,
  // published management guidance) and direct guidance's own RFP text
  // ("mandatory hrHPV triage for Group III or Group IIID1").
  { id: 'mn3-rec-routine-recall', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Return to routine screening interval.', label: 'Return to Routine Screening', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1 },
  { id: 'mn3-rec-control-longer-interval', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Control cytology after a longer interval — real, standard IIID1 management.', label: 'Control Cytology — Longer Interval', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2 },
  { id: 'mn3-rec-hpv-triage', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'hrHPV triage recommended.', label: 'hrHPV Triage', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 3 },
  { id: 'mn3-rec-cotest-12mo', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Repeat co-testing (cytology + hrHPV) in 12 months — real, standard G-BA management for a real hrHPV-positive result with Pap I/IIa cytology.', label: 'Repeat Co-Testing — 12 Months', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 4 },
  { id: 'mn3-rec-control-shorter-interval', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Control cytology after a shorter interval, possibly with colposcopy — real, standard IIID2 management.', label: 'Control Cytology — Shorter Interval, Consider Colposcopy', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 5 },
  { id: 'mn3-rec-colposcopy-biopsy', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Colposcopy with biopsy or excision recommended.', label: 'Colposcopy / Excision Biopsy', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 6 },
  { id: 'mn3-rec-urgent-referral', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Urgent gynecologic oncology referral.', label: 'Urgent Gynecologic Oncology Referral', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 7 },
  { id: 'mn3-rec-repeat-inadequate', section: 'recommendation', nomenclatureSystem: 'munchen_iiib', description: 'Repeat sample recommended due to an inadequate specimen.', label: 'Repeat Sample — Inadequate Specimen', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 8 },
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
const SEED_VERSION = '6'; // bumped: real, new Bethesda recommendation entry (cyto-rec-hpv-genotyping) added for the real Dutch CISOE-A BMD-range reflex triage rule.
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
    // Real, per ICytologyCategoryService.ts's own labelFr doc comment
    // — SFCC is not a separate classification structure; it's
    // Bethesda's own entries, real French text substituted in.
    // Returning a second, separately-seeded 'sfcc' set here would
    // misrepresent SFCC as structurally distinct and risk drifting
    // out of sync with Bethesda over time — this is the one, real,
    // shared source of truth for both.
    if (system === 'sfcc') {
      return ok(
        sorted(_cache)
          .filter(t => t.nomenclatureSystem === 'bethesda')
          .map(t => ({ ...t, label: t.labelFr ?? t.label, description: t.descriptionFr ?? t.description })),
      );
    }
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

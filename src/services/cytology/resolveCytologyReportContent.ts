// src/services/cytology/resolveCytologyReportContent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic assembling the real, defined, complete
// CytologyReportContent template (types/cytology/) from a chosen
// CytologyReviewRecord (the specimen's own Final Diagnosis) plus the
// real, already-available case/patient/specimen/dictionary data
// around it. Every real text line prefers CytologyCategoryEntry.description
// over `label`, per Phase 17's own "the contents of that description
// field is what is use to populate the reviews and report."
//
// Deliberately a pure function — no I/O, no formatting/letterhead, no
// PDF. The real caller (the sign-out action) gathers the real inputs
// and decides what to do with the result.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';
import type { ResolvedPrintBranding } from '@/types/config/FacilityBranding';

function describe(id: string, categories: CytologyCategoryEntry[]): string {
  const c = categories.find(x => x.id === id);
  if (!c) return id;
  return c.description ?? (c.abbreviation ? `${c.abbreviation} — ${c.label}` : c.label);
}

function withComment(id: string, comment: string | undefined, categories: CytologyCategoryEntry[]): string {
  const text = describe(id, categories);
  return comment ? `${text} (${comment})` : text;
}

/** Real, per direct guidance's own international workflow roadmap
 *  (Phase 1: US/CA — "Dual-result views that show cytological slide
 *  data and molecular HPV status side-by-side"): a real, report-ready
 *  HPV result string, incorporating genotype detail when the result
 *  is genuinely Positive and genotyping was performed. Real, per
 *  direct guidance's own South Korea information: also incorporates
 *  the real, distinct clinical reason the test was ordered — "the
 *  system should represent that clinical context, not just the
 *  result itself" — when one is on record, regardless of the result. */
function formatHpvResult(
  hpvResult: string | undefined,
  hpvGenotypeDetail: { hpv16: boolean; hpv18Or45: boolean; otherHighRisk: boolean } | undefined,
  hpvOrderReason: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance' | undefined,
): string | undefined {
  if (!hpvResult) return undefined;
  const details: string[] = [];
  if (hpvResult === 'Positive' && hpvGenotypeDetail) {
    if (hpvGenotypeDetail.hpv16) details.push('HPV 16');
    if (hpvGenotypeDetail.hpv18Or45) details.push('HPV 18/45');
    if (hpvGenotypeDetail.otherHighRisk) details.push('other high-risk HPV type');
  }
  if (hpvOrderReason === 'ascus_reflex') details.push('ASC-US reflex triage');
  if (hpvOrderReason === 'post_treatment_surveillance') details.push('post-treatment surveillance');
  // Real, deliberate: 'co_test' is the routine default and adds no
  // real information to the report — never appended.
  return details.length ? `${hpvResult} (${details.join(', ')})` : hpvResult;
}

export function resolveCytologyReportContent(
  review: Pick<CytologyReviewRecord,
    'adequacySelections' | 'generalCategorizationId' |
    'primaryInterpretationId' | 'primaryInterpretationComment' |
    'additionalInterpretations' | 'recommendations' | 'cisoeAScore' | 'requiresPathologistReview'>,
  categories: CytologyCategoryEntry[],
  patient: { name: string; dateOfBirth?: string; mrn?: string; lastMenstrualPeriod?: string; hormonalStatus?: 'premenopausal' | 'perimenopausal' | 'postmenopausal' | 'pregnant'; priorAbnormalPapHpvHistory?: string; iudOrContraceptionUse?: string },
  order: { accessionNumber: string; orderingProvider?: string },
  specimen: {
    typeDescription: string;
    collectedAt?: string;
    receivedAt?: string;
    preparationMethod?: 'Liquid-Based' | 'Conventional';
    computerAssistedScreening?: { used: boolean; system?: string };
    hpvResult?: string;
    hpvGenotypeDetail?: { hpv16: boolean; hpv18Or45: boolean; otherHighRisk: boolean };
    hpvOrderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance';
    educationalNotes?: string;
  },
  screenedBy: { name: string } | undefined,
  signedBy: { name: string; isPathologist: boolean },
  signedAt: string,
  /** Real, per PS-277 §1.2.2 — an optional, already-resolved trailing
   *  group, same "pure assembly, no resolution of its own" posture as
   *  this whole function's own header comment. The real caller
   *  resolves these (services/facilities/resolveFacilityPrintBranding.ts)
   *  and passes the result straight through; omitted entirely, this
   *  function's own output is byte-identical to before this batch. */
  printContext?: { printBranding?: ResolvedPrintBranding; componentSplitBillingType?: 'TC' | '26' | 'Global' },
): CytologyReportContent {
  return {
    patientName: patient.name,
    patientDateOfBirth: patient.dateOfBirth,
    patientMrn: patient.mrn,
    accessionNumber: order.accessionNumber,
    orderingProvider: order.orderingProvider,
    specimenCollectedAt: specimen.collectedAt,
    specimenReceivedAt: specimen.receivedAt,
    lastMenstrualPeriod: patient.lastMenstrualPeriod,
    hormonalStatus: patient.hormonalStatus,
    priorAbnormalPapHpvHistory: patient.priorAbnormalPapHpvHistory,
    iudOrContraceptionUse: patient.iudOrContraceptionUse,

    specimenTypeDescription: specimen.typeDescription,
    preparationMethod: specimen.preparationMethod,

    specimenAdequacy: (review.adequacySelections ?? []).map(s => withComment(s.categoryId, s.comment, categories)),

    generalCategorization: review.generalCategorizationId ? describe(review.generalCategorizationId, categories) : undefined,

    primaryInterpretation: withComment(review.primaryInterpretationId, review.primaryInterpretationComment, categories),
    additionalInterpretations: (review.additionalInterpretations ?? []).map(s => withComment(s.categoryId, s.comment, categories)),
    cisoeAScore: review.cisoeAScore,
    requiresPathologistReview: review.requiresPathologistReview,

    hpvResult: formatHpvResult(specimen.hpvResult, specimen.hpvGenotypeDetail, specimen.hpvOrderReason),
    computerAssistedScreening: specimen.computerAssistedScreening,

    recommendations: (review.recommendations ?? []).map(s => withComment(s.categoryId, s.comment, categories)),
    educationalNotes: specimen.educationalNotes,
    screenedBy,
    signedBy,
    signedAt,
    printBranding: printContext?.printBranding,
    componentSplitBillingType: printContext?.componentSplitBillingType,
  };
}

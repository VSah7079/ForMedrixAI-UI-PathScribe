// src/utils/search/caseSearchLabels.ts
// Batch 350: translation keys for the values Search shows (statuses,
// priorities, sexes, sort orders). The values themselves stay data; only
// their display goes through t().
import type { CaseStatus } from '@/types/case/CaseStatus';
import type { CasePriority } from '@/services/cases/ICaseService';
import type {
  CaseSearchAutopsyAuthority, CaseSearchAutopsyReport, CaseSearchCaseType, CaseSearchDateBasis, CaseSearchHoldType,
  CaseSearchIntake, CaseSearchPathologistRole, CaseSearchPendingWork, CaseSearchResultFlag, CaseSearchRevisionType,
  CaseSearchSex, CaseSearchSort,
} from '@/services/caseSearch/caseSearchTypes';

export const CASE_STATUS_LABEL_KEY: Record<CaseStatus, string> = {
  'draft':                   'searchPage.statusLabelKey.draft',
  'accessioned':             'searchPage.statusLabelKey.accessioned',
  'gross-complete':          'searchPage.statusLabelKey.grossComplete',
  'intraoperative-complete': 'searchPage.statusLabelKey.intraopComplete',
  'in-progress':             'searchPage.statusLabelKey.inProgress',
  'pending-review':          'searchPage.statusLabelKey.pendingReview',
  'pathologist-review':      'searchPage.statusLabelKey.pathologistReview',
  'ai-assisted':             'searchPage.statusLabelKey.aiAssisted',
  'pool':                    'searchPage.statusLabelKey.pool',
  'claiming':                'searchPage.statusLabelKey.claiming',
  'accepted':                'searchPage.statusLabelKey.accepted',
  'returned':                'searchPage.statusLabelKey.returned',
  'pending-countersign':     'searchPage.statusLabelKey.pendingCountersign',
  'finalizing':              'searchPage.statusLabelKey.finalizing',
  'finalized':               'searchPage.statusLabelKey.finalized',
  'pending-release':         'searchPage.statusLabelKey.pendingRelease',
  'closed':                  'searchPage.statusLabelKey.closed',
};

/** Status pill hues, matching the Worklist where the same status appears. */
export const CASE_STATUS_HUE: Record<CaseStatus, string> = {
  'draft': '#94a3b8', 'accessioned': '#38BDF8', 'gross-complete': '#14B8A6', 'intraoperative-complete': '#A855F7',
  'in-progress': '#0891B2', 'pending-review': '#F59E0B', 'pathologist-review': '#FB7185', 'ai-assisted': '#6366F1',
  'pool': '#F97316', 'claiming': '#F97316', 'accepted': '#22C55E', 'returned': '#B45309', 'pending-countersign': '#a78bfa',
  'finalizing': '#EC4899', 'finalized': '#10B981', 'pending-release': '#1C8DE3', 'closed': '#64748b',
};

export const CASE_PRIORITY_LABEL_KEY: Record<CasePriority, string> = {
  Routine: 'searchPage.priorityLabelKey.routine',
  Rush:    'searchPage.priorityLabelKey.rush',
  STAT:    'searchPage.priorityLabelKey.stat',
};
export const CASE_PRIORITY_HUE: Record<CasePriority, string> = { Routine: '#0891B2', Rush: '#f59e0b', STAT: '#ef4444' };

export const CASE_SEX_LABEL_KEY: Record<CaseSearchSex, string> = {
  M: 'searchPage.genderLabelKey.Male',
  F: 'searchPage.genderLabelKey.Female',
  U: 'searchPage.genderLabelKey.Unknown',
};

export function sortOptionKey(sort: CaseSearchSort): string {
  return `${sort.key}:${sort.direction}`;
}
export const CASE_SEARCH_SORT_LABEL_KEY: Record<string, string> = {
  'accessionDate:desc':  'searchPage.sort.accessionDateDesc',
  'accessionDate:asc':   'searchPage.sort.accessionDateAsc',
  'signedOutDate:desc':  'searchPage.sort.signedOutDateDesc',
  'lastUpdated:desc':    'searchPage.sort.lastUpdatedDesc',
  'patientName:asc':     'searchPage.sort.patientNameAsc',
  'accessionNumber:asc': 'searchPage.sort.accessionNumberAsc',
};

// ── Batch 351 ───────────────────────────────────────────────────────────────
export const DATE_BASIS_LABEL_KEY: Record<CaseSearchDateBasis, string> = {
  accessioned: 'searchPage.dateBasis.accessioned', signedOut: 'searchPage.dateBasis.signedOut', released: 'searchPage.dateBasis.released',
};
/** The summary's wording for a date range on each basis. */
export const DATE_RANGE_SUMMARY_KEY: Record<CaseSearchDateBasis, string> = {
  accessioned: 'searchPage.summaryParts.accessionRange', signedOut: 'searchPage.summaryParts.signedOutRange', released: 'searchPage.summaryParts.releasedRange',
};
export const CASE_TYPE_LABEL_KEY: Record<CaseSearchCaseType, string> = {
  surgical: 'searchPage.caseType.surgical', gynCytology: 'searchPage.caseType.gynCytology',
  nonGynCytology: 'searchPage.caseType.nonGynCytology', autopsy: 'searchPage.caseType.autopsy',
};
export const PATHOLOGIST_ROLE_LABEL_KEY: Record<CaseSearchPathologistRole, string> = {
  any: 'searchPage.pathologistRole.any', assigned: 'searchPage.pathologistRole.assigned', signedOut: 'searchPage.pathologistRole.signedOut',
  resident: 'searchPage.pathologistRole.resident', countersigner: 'searchPage.pathologistRole.countersigner', delegatedTo: 'searchPage.pathologistRole.delegatedTo',
};
export const REVISION_TYPE_LABEL_KEY: Record<CaseSearchRevisionType, string> = {
  amendment: 'caseStatusDisplay.revision.amendment', correction: 'caseStatusDisplay.revision.correction', addendum: 'caseStatusDisplay.revision.addendum',
};
export const HOLD_TYPE_LABEL_KEY: Record<CaseSearchHoldType, string> = {
  case: 'searchPage.holdType.case', retention: 'searchPage.holdType.retention', autopsyAncillary: 'searchPage.holdType.autopsyAncillary',
};
export const RESULT_FLAG_LABEL_KEY: Record<CaseSearchResultFlag, string> = {
  Abnormal: 'searchPage.resultFlag.abnormal', Critical: 'searchPage.resultFlag.critical', Malignant: 'searchPage.resultFlag.malignant',
};
export const RESULT_FLAG_HUE: Record<CaseSearchResultFlag, string> = { Abnormal: '#f59e0b', Critical: '#ef4444', Malignant: '#a855f7' };
export const PENDING_WORK_LABEL_KEY: Record<CaseSearchPendingWork, string> = {
  stains: 'searchPage.pendingWork.stains', ihc: 'searchPage.pendingWork.ihc', molecular: 'searchPage.pendingWork.molecular', addOns: 'searchPage.pendingWork.addOns',
};
export const INTAKE_LABEL_KEY: Record<CaseSearchIntake, string> = {
  standard: 'searchPage.intake.standard', downtime: 'searchPage.intake.downtime', outside: 'searchPage.intake.outside', referenceLab: 'searchPage.intake.referenceLab',
};
export const AUTOPSY_AUTHORITY_LABEL_KEY: Record<CaseSearchAutopsyAuthority, string> = {
  medicolegal_forensic: 'autopsyIntake.caseAuthority.medicolegal_forensic', hospital_consented: 'autopsyIntake.caseAuthority.hospital_consented',
};
export const AUTOPSY_REPORT_LABEL_KEY: Record<CaseSearchAutopsyReport, string> = {
  none: 'searchPage.autopsyReport.none', pad: 'searchPage.autopsyReport.pad', fad: 'searchPage.autopsyReport.fad',
};
/** Jurisdictions an autopsy can be under (types/systemConfig.ts Jurisdiction); names via jurisdictionNames.*. */
export const AUTOPSY_JURISDICTIONS = ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'AU', 'NZ', 'KR', 'BE', 'NL', 'DE', 'FR'] as const;

/** A status or priority code shown as its label, or the code itself when there is no label for it. */
export function labelOr(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

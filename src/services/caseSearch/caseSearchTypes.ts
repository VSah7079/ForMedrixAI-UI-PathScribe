// src/services/caseSearch/caseSearchTypes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 350 (Pete: "the search is largely broken … results should be paged
// so that the heavy lifting is done on the server side"): the contract for
// case search.
//
//   CaseSearchCriteria   what to match. Sent to the server as is.
//   CaseSearchRequest    criteria + sort + page. The server filters (with the
//                        user's access rules applied first), sorts, counts
//                        and returns one page.
//   CaseSearchPage       one page of cases and the total that matched.
//   CaseSearchDraft      what the user filled in on the Search page. It is
//                        what a saved search stores, and it is turned into
//                        criteria by utils/search/buildCaseSearchRequest.ts.
//
// The .NET API server implements the same contract; see
// docs/architecture/CASE_SEARCH_API.md.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { CaseStatus } from '@/types/case/CaseStatus';
import type { CasePriority } from '../cases/ICaseService';
import type { ClinicalCode } from '../codes/ICodeService';

/** Recorded patient sex codes (Patient.sex). */
export type CaseSearchSex = 'M' | 'F' | 'U';

// Batch 351 (section 3 of the Sep 27 gap analysis): new searchable case data.
/** Which date the date range applies to. */
export type CaseSearchDateBasis = 'accessioned' | 'signedOut' | 'released';
/** Surgical = neither cytology nor autopsy; cytology by the specimen dictionary's category. */
export type CaseSearchCaseType = 'surgical' | 'gynCytology' | 'nonGynCytology' | 'autopsy';
/** How the chosen pathologists must be on the case. */
export type CaseSearchPathologistRole = 'any' | 'assigned' | 'signedOut' | 'resident' | 'countersigner' | 'delegatedTo';
export type CaseSearchRevisionType = 'amendment' | 'correction' | 'addendum';
export type CaseSearchHoldType = 'case' | 'retention' | 'autopsyAncillary';
/** The case's abnormal-result marker (Case.abnormalDetectionStatus.severity). */
export type CaseSearchResultFlag = 'Abnormal' | 'Critical' | 'Malignant';
export type CaseSearchPendingWork = 'stains' | 'ihc' | 'molecular' | 'addOns';
export type CaseSearchIntake = 'standard' | 'downtime' | 'outside' | 'referenceLab';
export type CaseSearchAutopsyAuthority = 'medicolegal_forensic' | 'hospital_consented';
/** Which autopsy reports are signed: none yet, the provisional (PAD), the final (FAD). */
export type CaseSearchAutopsyReport = 'none' | 'pad' | 'fad';

export interface CaseSearchCriteria {
  /** A value that could be a name, MRN, accession or order number: matches any of them. */
  anyIdentifier?: string;
  /** Every word must appear in the patient's name (any order: "Smith, John" or "John Smith"). */
  patientName?: string;
  /** Part of the MRN. */
  mrn?: string;
  /** Master Patient Index id: exact. */
  mpiId?: string;
  /** Part of the accession number (PathScribe or external). */
  accessionNo?: string;
  /** Part of a requisition, external order or referral number. */
  orderNo?: string;

  /** Which date dateFrom/dateTo apply to (default: the accession date). */
  dateBasis?: CaseSearchDateBasis;
  /** Date range, inclusive, as facility-local calendar dates (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;

  sexes?: CaseSearchSex[];
  /** Date of birth range, inclusive (YYYY-MM-DD). */
  dobFrom?: string;
  dobTo?: string;
  /** Age in whole years on the search date, inclusive. */
  ageMin?: number;
  ageMax?: number;

  statuses?: CaseStatus[];
  priorities?: CasePriority[];
  /** Flag definition ids applied to the case (removed flags don't count). */
  caseFlagIds?: string[];
  /** Flag definition ids applied to any specimen on the case. */
  specimenFlagIds?: string[];
  /** Synoptic template ids used on the case. */
  synopticTemplateIds?: string[];
  /** Staff ids: the case matches if any of them is on it in pathologistRole (default: any role). */
  pathologistIds?: string[];
  pathologistRole?: CaseSearchPathologistRole;
  /** Ordering (attending) physician ids. */
  orderingPhysicianIds?: string[];
  /** Submitting facility (client) ids: Case.order.facilityId. */
  submittingFacilityIds?: string[];
  /** Words that must appear in a specimen's description (any of the terms). */
  specimenTerms?: string[];
  /** Words that must appear in the diagnosis text (any of the terms). */
  diagnosisTerms?: string[];
  /** SNOMED CT codes on the case or any specimen. */
  snomedCodes?: string[];
  /** ICD-10, ICD-11 or ICD-O codes on the case (a category matches its sub-codes). */
  icdCodes?: string[];

  // ── Batch 351 ─────────────────────────────────────────────────────────────
  caseTypes?: CaseSearchCaseType[];
  /** Amended, corrected or addended (on the case, a report, or a released amendment record). */
  revisionTypes?: CaseSearchRevisionType[];
  /** Active holds. */
  holdTypes?: CaseSearchHoldType[];
  resultFlags?: CaseSearchResultFlag[];
  /** Work still outstanding on the case. */
  pendingWork?: CaseSearchPendingWork[];
  /** Past its total turnaround target: still open after it, or signed out after it. */
  pastTatTarget?: boolean;
  /** The case's subspecialty: recorded, else from its protocols, else from specimen routing. */
  subspecialtyIds?: string[];
  /** The performing lab, resolved from the submitting facility. */
  performingLabIds?: string[];
  /** Ordering location (ward, clinic): Case.order.locationId. */
  locationIds?: string[];
  intakes?: CaseSearchIntake[];
  /** Part of the billing type or a payer's name (outside patients). */
  payer?: string;
  /** CPT codes on the case, a specimen or a block (a code prefix matches). */
  cptCodes?: string[];
  autopsyJurisdictions?: string[];
  autopsyAuthorities?: CaseSearchAutopsyAuthority[];
  autopsyReports?: CaseSearchAutopsyReport[];
}

export type CaseSearchSortKey = 'accessionDate' | 'signedOutDate' | 'lastUpdated' | 'patientName' | 'accessionNumber';
export type CaseSearchSortDirection = 'asc' | 'desc';
export interface CaseSearchSort { key: CaseSearchSortKey; direction: CaseSearchSortDirection }

export const CASE_SEARCH_SORT_OPTIONS: readonly CaseSearchSort[] = [
  { key: 'accessionDate',   direction: 'desc' },
  { key: 'accessionDate',   direction: 'asc'  },
  { key: 'signedOutDate',   direction: 'desc' },
  { key: 'lastUpdated',     direction: 'desc' },
  { key: 'patientName',     direction: 'asc'  },
  { key: 'accessionNumber', direction: 'asc'  },
];
export const DEFAULT_CASE_SEARCH_SORT: CaseSearchSort = CASE_SEARCH_SORT_OPTIONS[0];

export const CASE_SEARCH_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_CASE_SEARCH_PAGE_SIZE = 25;
export const MAX_CASE_SEARCH_PAGE_SIZE = 100;
/** The most cases one CSV export returns. */
export const CASE_SEARCH_EXPORT_LIMIT = 5000;

export interface CaseSearchRequest {
  criteria: CaseSearchCriteria;
  sort?: CaseSearchSort;
  /** 1-based. A page past the end returns the last page. */
  page?: number;
  pageSize?: number;
  /** IANA time zone used for "accession date" and "age": the facility's. Defaults to UTC. */
  timeZone?: string;
}

export interface CaseSearchPage {
  items: Case[];
  /** Every case that matched, across all pages. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** One exported row. Values are data (codes, ISO dates); the CSV builder translates and formats them. */
export interface CaseSearchExportRow {
  accession: string;
  patientName: string;
  mrn: string;
  sex: string;
  dateOfBirth: string;
  specimens: string[];
  accessionDate: string;
  /** When it was signed out (empty while open). */
  signedOutDate: string;
  orderingPhysician: string;
  priority: string;
  status: string;
  flags: string[];
}

export interface CaseSearchExport {
  rows: CaseSearchExportRow[];
  /** Every case that matched. More than rows.length when the export limit cut it short. */
  total: number;
  truncated: boolean;
}

// ── Options the Search page offers ──────────────────────────────────────────

/** Every case status, except 'claiming' (held for a moment while a pool case is claimed). */
export const CASE_SEARCH_STATUS_OPTIONS: readonly CaseStatus[] = [
  'draft', 'accessioned', 'gross-complete', 'intraoperative-complete', 'in-progress',
  'pending-review', 'pathologist-review', 'ai-assisted', 'pool', 'accepted', 'returned',
  'pending-countersign', 'finalizing', 'finalized', 'pending-release', 'closed',
];
export const CASE_SEARCH_PRIORITY_OPTIONS: readonly CasePriority[] = ['Routine', 'Rush', 'STAT'];
export const CASE_SEARCH_SEX_OPTIONS: readonly CaseSearchSex[] = ['M', 'F', 'U'];
export const CASE_SEARCH_DATE_BASES: readonly CaseSearchDateBasis[] = ['accessioned', 'signedOut', 'released'];
export const CASE_SEARCH_CASE_TYPES: readonly CaseSearchCaseType[] = ['surgical', 'gynCytology', 'nonGynCytology', 'autopsy'];
export const CASE_SEARCH_PATHOLOGIST_ROLES: readonly CaseSearchPathologistRole[] = ['any', 'assigned', 'signedOut', 'resident', 'countersigner', 'delegatedTo'];
export const CASE_SEARCH_REVISION_TYPES: readonly CaseSearchRevisionType[] = ['amendment', 'correction', 'addendum'];
export const CASE_SEARCH_HOLD_TYPES: readonly CaseSearchHoldType[] = ['case', 'retention', 'autopsyAncillary'];
export const CASE_SEARCH_RESULT_FLAGS: readonly CaseSearchResultFlag[] = ['Abnormal', 'Critical', 'Malignant'];
export const CASE_SEARCH_PENDING_WORK: readonly CaseSearchPendingWork[] = ['stains', 'ihc', 'molecular', 'addOns'];
export const CASE_SEARCH_INTAKES: readonly CaseSearchIntake[] = ['standard', 'downtime', 'outside', 'referenceLab'];
export const CASE_SEARCH_AUTOPSY_AUTHORITIES: readonly CaseSearchAutopsyAuthority[] = ['medicolegal_forensic', 'hospital_consented'];
export const CASE_SEARCH_AUTOPSY_REPORTS: readonly CaseSearchAutopsyReport[] = ['none', 'pad', 'fad'];

// ── The Search page's draft (and a saved search's contents) ─────────────────

export interface CaseSearchDraft {
  /** What was typed in the identifier box, and how it was read. */
  identifierText: string;
  patientName: string;
  mrn: string;
  mpiId: string;
  accessionNo: string;
  orderNo: string;
  anyIdentifier: string;
  dateFrom: string;
  dateTo: string;
  /** The user chose the dates; otherwise an identifier search covers every date. */
  datesChosen: boolean;
  sexes: CaseSearchSex[];
  dobFrom: string;
  dobTo: string;
  ageMin: string;
  ageMax: string;
  statuses: CaseStatus[];
  priorities: CasePriority[];
  caseFlagIds: string[];
  specimenFlagIds: string[];
  synopticTemplateIds: string[];
  pathologistIds: string[];
  orderingPhysicianIds: string[];
  submittingFacilityIds: string[];
  specimenTerms: string[];
  diagnosisTerms: string[];
  /** Kept whole so the chips can show each code's description. */
  snomedCodes: ClinicalCode[];
  icdCodes: ClinicalCode[];
  // Batch 351
  dateBasis: CaseSearchDateBasis;
  caseTypes: CaseSearchCaseType[];
  pathologistRole: CaseSearchPathologistRole;
  revisionTypes: CaseSearchRevisionType[];
  holdTypes: CaseSearchHoldType[];
  resultFlags: CaseSearchResultFlag[];
  pendingWork: CaseSearchPendingWork[];
  pastTatTarget: boolean;
  subspecialtyIds: string[];
  performingLabIds: string[];
  locationIds: string[];
  intakes: CaseSearchIntake[];
  payer: string;
  cptCodes: string[];
  autopsyJurisdictions: string[];
  autopsyAuthorities: CaseSearchAutopsyAuthority[];
  autopsyReports: CaseSearchAutopsyReport[];
}

export function emptyCaseSearchDraft(dateFrom: string, dateTo: string): CaseSearchDraft {
  return {
    identifierText: '', patientName: '', mrn: '', mpiId: '', accessionNo: '', orderNo: '', anyIdentifier: '',
    dateFrom, dateTo, datesChosen: false,
    sexes: [], dobFrom: '', dobTo: '', ageMin: '', ageMax: '',
    statuses: [], priorities: [], caseFlagIds: [], specimenFlagIds: [], synopticTemplateIds: [],
    pathologistIds: [], orderingPhysicianIds: [], submittingFacilityIds: [],
    specimenTerms: [], diagnosisTerms: [], snomedCodes: [], icdCodes: [],
    dateBasis: 'accessioned', caseTypes: [], pathologistRole: 'any', revisionTypes: [], holdTypes: [],
    resultFlags: [], pendingWork: [], pastTatTarget: false, subspecialtyIds: [], performingLabIds: [],
    locationIds: [], intakes: [], payer: '', cptCodes: [], autopsyJurisdictions: [], autopsyAuthorities: [],
    autopsyReports: [],
  };
}

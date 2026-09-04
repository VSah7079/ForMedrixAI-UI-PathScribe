/**
 * ICaseService
 *
 * Defines the contract that any case data source must satisfy —
 * whether that is a mock, a Firestore collection, an HL7 FHIR R4
 * endpoint, or a direct LIS database connection.
 *
 * Production implementations:
 *  - ILISCaseService  → wraps NHS FHIR DiagnosticReport / Task endpoints
 *  - IOrchCaseService → wraps PathScribe Firestore / PostgreSQL collections
 *
 * Each implementation is responsible for its own auth token management,
 * retry logic, and DSPT-compliant audit logging.  The CaseRouter façade
 * never holds credentials or touches patient data directly.
 */

import type { Case }       from '@/types/case/Case';
import type { CaseStatus } from '@/types/case/CaseStatus';   // local import — used in CaseFilterParams below
export type { CaseStatus } from '@/types/case/CaseStatus';   // re-export for consumers
import type { ServiceResult } from '../types';

// ─── Type aliases expected by services/index.ts and Worklist/types.ts ────────
/** Full case record — alias for Case (LIS-sourced) */
export type PathologyCase = Case;
/** Case scheduling priority */
export type CasePriority = 'Routine' | 'Rush' | 'STAT';
/** AI suggestion pipeline status */
export type AIStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'none';
/** Hex or named colour for a flag badge */
export type FlagColor = string;
/** Patient biological sex / gender identity */
export type CaseGender = 'Male' | 'Female' | 'Non-binary' | 'Other' | 'Unknown';

/** Lightweight flag reference attached to a case (not the full FlagService.Flag definition) */
export interface Flag {
  id:        string;
  name:      string;
  color?:    string;
  level:     'case' | 'specimen';
  severity?: number;
}

// ─── Filter parameter contract ────────────────────────────────────────────────
// Used by SearchPage → caseService.getAll() and WorklistPage → caseService.getAll().
// All fields are optional; omitting a field means "no restriction on that axis".

export interface CaseFilterParams {
  // ── Identifier / text search ───────────────────────────────────────────────
  /** Free-text search across accession number and patient name */
  search?: string;
  /** Exact or partial patient full-name match */
  patientName?: string;
  /** MRN / hospital identifier */
  hospitalId?: string;
  /**
   * Real Master Patient Index id (see services/patients/IPatientIndexService.ts) —
   * matched against patient.id, which AccessionPage.tsx's real MPI
   * resolution already populates with the deduplicated, per-organisation
   * identity (mpiResult.patientId), not a case-derived id. Exact match:
   * unlike MRN, which can collide across different source systems (see
   * PatientMatchCandidate.assigningAuthority's own reasoning), a real MPI
   * id is already the disambiguated, canonical identity.
   */
  patientId?: string;
  /** Accession number (full or partial) */
  accessionNo?: string;

  // ── Accession date range (specimen receivedAt or case createdAt) ───────────
  /** ISO date string, inclusive lower bound for accession date */
  dateFrom?: string;
  /** ISO date string, inclusive upper bound for accession date */
  dateTo?: string;

  // ── Patient demographics ───────────────────────────────────────────────────
  /** E.g. ['Male', 'Female', 'Non-binary'] — normalised to M/F in service */
  genderList?: ('Male' | 'Female' | 'Non-binary' | 'Other' | 'Unknown')[];
  /** ISO date string lower bound for patient date-of-birth */
  dobFrom?: string;
  /** ISO date string upper bound for patient date-of-birth */
  dobTo?: string;
  /** Minimum patient age in years (computed from DOB at query time) */
  ageMin?: number;
  /** Maximum patient age in years (computed from DOB at query time) */
  ageMax?: number;

  // ── Worklist / status ─────────────────────────────────────────────────────
  /** Single status — legacy worklist usage; prefer statusList for SearchPage */
  status?: CaseStatus | CaseStatus[];
  /** One or more workflow statuses to include */
  statusList?: CaseStatus[];
  /** One or more case priorities to include */
  priorityList?: ('Routine' | 'STAT')[];
  /** Filter to a single clinical subspecialty */
  specialty?: string;

  // ── Assignment ─────────────────────────────────────────────────────────────
  /** Pathologist IDs (e.g. 'PATH-001') matched against order.assignedTo */
  pathologistIds?: string[];
  /**
   * Requesting / attending provider names (full display name, e.g. 'Dr. Sarah Chen').
   * SearchPage maps att-N UI IDs → full names before passing; service matches
   * against order.requestingProvider with title-stripped contains logic.
   */
  attendingNames?: string[];

  // ── Clinical content ───────────────────────────────────────────────────────
  /** Partial specimen description keywords */
  specimenList?: string[];
  /** Free-text diagnosis keywords */
  diagnosisList?: string[];
  /**
   * SNOMED CT codes (numeric strings, e.g. '413448000').
   * Matched against case.coding.snomed[].
   */
  snomedCodes?: string[];
  /**
   * ICD-10/11 codes (e.g. 'C50.412').
   * Matched against case.coding.icd10[] with prefix tolerance so 'C50' matches 'C50.412'.
   */
  icdCodes?: string[];

  // ── Protocols & flags ─────────────────────────────────────────────────────
  /**
   * Resolved synoptic templateId values (e.g. 'breast_invasive').
   * SearchPage maps ALL_SYNOPTICS p-keys → templateId before passing.
   * Matched against case.synopticReports[].templateId.
   */
  synopticProtocolIds?: string[];
  /**
   * Case flag display names (e.g. 'STAT — Rush Processing').
   * Matched with name-contains logic so partial selections still connect.
   */
  flagIds?: string[];
  /**
   * Real, per direct guidance's own follow-up: computational flag
   * codes (Flag.tagClass === 'COMPUTATIONAL', a distinct category from
   * the manually-assigned case flags flagIds already matches above),
   * matched against a case's own real specimenFlags - true when ANY
   * specimen flag's lisCode, id, or label equals ANY of the given
   * codes. Previously applied client-side in SearchPage.tsx itself,
   * after the real page had already been fetched - moved here so
   * every real caller gets the same, correct, pre-pagination
   * filtering (mockCaseService.ts applies this before
   * applyCasePagination, same real pipeline order as every other
   * filter field here).
   */
  compFlagCodes?: string[];

  // ── Submitting client ──────────────────────────────────────────────────────
  /** Real client ids from clientService.getAll(), matched against order.facilityId */
  facilityIds?: string[];

  // ── Pagination ─────────────────────────────────────────────────────────────
  /**
   * Real, cursor-based pagination - deliberately not offset-based (a plain
   * "skip N, take pageSize" approach), since offset paging degrades badly at
   * scale: page 50 means the database still has to walk past the first 49
   * pages of skipped documents on every single request, getting slower the
   * deeper a user pages in. A cursor sidesteps that entirely - it's an
   * opaque pointer to "resume right after this exact document," which
   * Firestore's own startAfter() resolves in constant time regardless of
   * how deep into the result set it is. Optional and additive: a caller
   * that never sets pageSize gets today's existing, complete, unpaginated
   * result exactly as before - nothing about this changes default behavior.
   */
  pageSize?: number;
  /** Opaque cursor from a previous ServiceResult.meta.nextCursor - fetches the next page. Ignored if pageSize isn't also set. */
  cursor?: string;
}

// ─── Service contract ─────────────────────────────────────────────────────────

export interface ICaseService {
  /**
   * Retrieve a single case by its accession ID.
   * Returns null/undefined if not found; rejects only on infrastructure error.
   */
  getCase(caseId: string): Promise<Case | null | undefined>;

  /**
   * List and filter cases.
   * No params → returns all cases visible to the calling context.
   */
  getAll(params?: CaseFilterParams): Promise<ServiceResult<Case[]>>;

  /**
   * List all cases visible to the given user (worklist view).
   * userId should be the authenticated pathologist's system ID.
   */
  listCasesForUser(userId: string): Promise<Case[]>;

  /**
   * Persist partial updates to an existing case.
   * Used by the report editor, delegation flows, and flag management.
   *
   * expectedVersion (optional, added for the Case Hydration & Optimistic
   * Concurrency Control spec): when provided, the implementation must
   * perform a real compare-and-swap against the case's current
   * Case.version and throw ConcurrencyConflictError if it doesn't match —
   * see FirestoreCaseService.ts for the transactional implementation.
   * Omitted entirely, existing callers keep today's unconditional-write
   * behavior; this is an additive, backward-compatible parameter, not a
   * breaking change to every existing call site.
   */
  updateCase(caseId: string, updates: Partial<Case>, expectedVersion?: number): Promise<void>;

  /**
   * Persist a brand-new case. Caller is responsible for generating the
   * case's id (and, for Orchestration cases, ensuring it carries the
   * O26- prefix CaseRouter currently keys on — see CaseRouter.ts's own
   * note that this string-prefix check is a stand-in for a future Case
   * Registry lookup, S0-CF-08/09/10). Added for the Accession page
   * (Stage 0 Requirements §6.1) — no prior caller in this codebase
   * created cases through ICaseService; LIS cases arrive via FHIR
   * ServiceRequest ingestion in production, not this method.
   */
  createCase(caseData: Case): Promise<void>;
}

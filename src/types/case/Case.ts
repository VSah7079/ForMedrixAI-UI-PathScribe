// src/types/case/Case.ts
// ─────────────────────────────────────────────────────────────
// Authoritative Case domain model for PathScribe.
// FHIR-aligned (ServiceRequest, DiagnosticReport, Specimen, Task)
// ─────────────────────────────────────────────────────────────

import { Patient } from "./Patient";
import { Specimen } from "./Specimen";
import type { FlagInstance } from "../flagsRuntime";
import type { RetentionHold } from "./RetentionHold";
import type { CaseHold } from "./CaseHold";
import type { MatrixBlock } from "./MatrixBlock";
import { CaseComment } from "./CaseComment";
import type { Icd10Code } from "@/services/diagnosisCodes/IDiagnosisCodesService";
import type { RecordedClinicalHistoryEntry } from "@/types/clinicalHistory/RecordedClinicalHistoryEntry";
import type { OutsidePatientFinancialData } from "@/types/billing/OutsidePatientFinancialData";
import { CaseStatus } from "./CaseStatus";
import type { FieldLineageEntry } from '@/types/reports/FieldLineage';
import type { RevisionType } from '@/types/reports/AmendmentRecord';
import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';

export interface CaseCoding {
  icd10?: string[];
  icd11?: string[];
  icdO?: string[];
  snomed?: string[];
  loinc?: string[];
  cpt?: string[];
}

export interface AssignmentEvent {
  timestamp: string;
  assignedTo?: string;
  assignedBy?: string;
  reason?: string;
}

export interface OrderMetadata {
  /**
   * Fixed June 2026 — this used to be its own independent literal union
   * ("Routine" | "STAT" | "ASAP" | "Critical") that didn't match
   * CasePriority (services/cases/ICaseService.ts, 'Routine' | 'Rush' |
   * 'STAT') at all — two different, inconsistent priority vocabularies,
   * with "ASAP"/"Critical" values that never corresponded to anything
   * real anywhere in the app (no seed data, no PriorityLevel entry, no
   * UI ever offered them). Kept as a literal union here rather than
   * importing CasePriority directly, since ICaseService.ts imports Case
   * from this same file — a type-only circular import would likely
   * resolve fine, but duplicating three literal values is a smaller risk
   * than introducing a cross-module cycle this late. Keep in sync with
   * CasePriority if either changes.
   */
  priority: "Routine" | "Rush" | "STAT";
  requestingProvider?: string;
  /**
   * Stable physician ID, distinct from requestingProvider (which is a
   * display name). Feeds TemplateRoutingService's Pass 0b (Physician
   * Preference) and should match the ID space used by the Physician
   * Preferences admin screen (mockPhysicianService). Prefer this field over
   * requestingProvider wherever it's available — see contextBuilder.ts.
   */
  orderingPhysicianId?: string;
  /** ID reference to Facility Configuration — the institution that sent the specimen */
  facilityId?: string;
  /** Cached display name — avoids async lookup on every render */
  facilityName?: string;
  /**
   * Real feature, per direct confirmation: "add the Client and
   * Location as fields to be seen in the accession page." ID
   * reference to services/locations/ (Location) — which specific
   * ward/room/bed at facilityId this specimen came from. Optional: not
   * every specimen has a known, specific inpatient location (e.g.
   * outpatient/clinic specimens genuinely have none) — never
   * fabricated when not selected. Scoped to facilityId; a location
   * belongs to exactly one facility, so this should only ever be set
   * alongside a real facilityId.
   */
  locationId?: string;
  /** Cached display string ("Ward 3 / 101 / A") — same "avoid an
   *  async lookup on every render" reasoning as facilityName above. */
  locationDisplay?: string;
  /** Physical facility within originHospitalId's organisation — Site.id
   *  from Organisation.sites[] (e.g. 'SITE-MRI'), NOT a bare shortName
   *  like 'MRI'. Optional: not every accessioning flow captures this yet,
   *  and originHospitalId alone remains the org-level identity — this is
   *  additional, finer-grained routing info, not a replacement for it.
   *  Added for Mode A hardware dispatch (services/hardware/
   *  ModeAInterfaceService.ts) — an organisation with multiple physical
   *  sites (MFT has three: MRI, WYT, NMGH) may need to route to a
   *  different local Vantage/Cerebro instance per site, which
   *  originHospitalId alone can't distinguish. */
  siteId?: string;
  /**
   * LIS/requisition cross-reference fields — added June 2026. These
   * existed in seed data for a while but were never part of this type,
   * which is exactly how the duplicate `order:` key bug happened: a
   * second, differently-shaped `order: {...}` literal (the one actually
   * typed against this interface) silently won over a first one
   * carrying these fields, discarding them at runtime with no error,
   * since object literals with duplicate keys aren't rejected by
   * TypeScript the way you'd hope. Not consumed by any UI/logic yet —
   * typed now so they're real, validated fields instead of silently
   * discarded seed data.
   */
  requisitionNumber?: string;
  externalOrderId?: string;
  labNumber?: string;
  blockId?: string;
  referralNumber?: string | null;
  reasonCodes?: string[];
  /**
   * Order-level diagnosis codes — real ICD-10-CM, referencing the
   * dedicated Icd10Code dictionary (services/diagnosisCodes/IDiagnosisCodesService.ts).
   * An array since real orders often carry a primary diagnosis plus
   * secondary ones, not just one code. Left distinct from the
   * pre-existing, generic reasonCodes field above (which is unused
   * anywhere in the app today) rather than repurposing it, so this
   * field's meaning is unambiguous.
   */
  icd10Codes?: Icd10Code[];
  clinicalIndication?: string;
  /**
   * Real, per the uploaded "Structured Clinical History Dictionary &
   * Accessioning Integration" spec's own User Story 2 — the real,
   * structured clinical_history array a validated inbound accession
   * JSON payload carries, recorded here at the order level (same real
   * placement as clinicalIndication/reasonForStudy/icd10Codes above —
   * this is order-level metadata, not a per-specimen concept).
   */
  clinicalHistory?: RecordedClinicalHistoryEntry[];
  /**
   * Real, per the uploaded spec's own User Story 5, Acceptance
   * Criteria 2 ("Incomplete orders automatically set accession_status
   * = 'DEFICIENT'"). Real, per direct guidance's own explicit answer
   * to the real specimen-vs-order deficiency-scoping question ("New,
   * order-level deficiency status") — a genuinely new, order-level
   * concept, deliberately NOT folded into the existing, specimen-
   * scoped SpecimenDeficiency mechanism (services/deficiencies/),
   * which has no real way to represent a deficiency belonging to the
   * order as a whole rather than one specific specimen. Undefined on
   * every case accessioned before this field existed — never
   * defaulted to 'COMPLETE' retroactively, which would be a real,
   * fabricated claim about historical data this app has no way to
   * actually verify.
   */
  accessionStatus?: 'COMPLETE' | 'DEFICIENT';
  /**
   * Real, per direct guidance's own research: a real, standard HL7
   * field — OBR-31 "Reason for Study" (CWE), mapping directly to
   * FHIR's ServiceRequest.reasonCode — exists specifically to carry
   * why a test was ordered. Left distinct from both clinicalIndication
   * (free text) and the pre-existing, generic, unused reasonCodes
   * field above, for the same real reason clinicalIndication already
   * is: an unambiguous, structured field for a specific, real concept,
   * not a repurposed vague one. First real use: distinguishing a
   * routine, programme-invited screening test from a private or
   * opportunistic one, for real UK CSMS registry action-code dispatch
   * (resolveCsmsActionCode.ts) — undefined for every case where this
   * distinction doesn't apply.
   */
  reasonForStudy?: 'nhs_programme_invited' | 'private_or_opportunistic';
  /**
   * Whole-case comment thread — distinct from clinicalIndication (the
   * clinical reason, feeds AI template routing) and from the per-report/
   * per-grossing-instance comment fields elsewhere in this file
   * (SynopticReportInstance.comment, GrossingReportInstance.comment).
   *
   * Changed from a single string (accessionComment) to a real append-
   * only thread — the single-field version was silently overwritten by
   * whoever saved last, with no record of who wrote what or when. Each
   * entry is its own record; nothing here is ever edited or deleted
   * once posted, same "time-bounded, not editable after the fact"
   * reasoning as everything else audited in this app.
   */
  caseComments?: CaseComment[];
  receivedDate?: string;
  assignedTo?: string;
  /** Participation type of the assigned pathologist — e.g. 'primary', 'consultant' */
  assignedParticipationTypeId?: string;
  /**
   * Real, per direct guidance ("replace the checkbox with an explicit
   * Patient Origin / Intake Type selector"): the real, explicit
   * top-level accessioning mode. 'standard' is the real default —
   * Standard/EMR Order accessioning. 'downtime' is the existing,
   * unchanged temporary/placeholder-identity mode — same real
   * MasterPatientRecord.isDowntimeRecord/downtimeReasonCode submit
   * behavior as before this change
   * (services/patients/IPatientIndexService.ts), just now driven by
   * this explicit selector instead of a checkbox. 'outside' is the
   * new Outside/Contract Case mode — real, per direct guidance,
   * "completely bypassing the identity reconciliation queue" is real,
   * separate, larger work (see AccessionPage.tsx's own header comment
   * on why); for now this mode activates the real Outside Patient
   * Data tab and captures outsidePatientData below, while still going
   * through normal MPI resolution like every other accession.
   */
  intakeType?: 'standard' | 'downtime' | 'outside';
  /** Real, per direct guidance: only ever populated when intakeType
   *  is 'outside' — see OutsidePatientFinancialData.ts's own header
   *  for the full field-by-field account. */
  outsidePatientData?: OutsidePatientFinancialData;
}

export interface DiagnosticMetadata {
  primaryDiagnosis?: string;
  secondaryDiagnoses?: string[];
  diagnosisCodes?: string[];
  issuedDate?: string;
  finalizedBy?: string;
  synoptic?: {
    tumorType?: string;
    grade?: string;
    size?: string;
    margins?: string;
    lymphovascularInvasion?: string;
    biomarkers?: { er?: string; pr?: string; her2?: string; ki67?: string };
  };
  grossDescription?: string;
  microscopicDescription?: string;
  ancillaryStudies?: string;
  /** Real, per direct follow-up ("does a Preliminary Diagnosis Text
   *  Field exist?") — it didn't. Added here, matching the exact same
   *  case-level shape as grossDescription/microscopicDescription
   *  above, rather than the per-specimen repeat-group binding the
   *  Preliminary template originally (incorrectly) used — that
   *  binding had no real field behind it anywhere. The provisional,
   *  pre-ancillary-studies diagnostic impression recorded on a
   *  Preliminary report, distinct from primaryDiagnosis above (the
   *  Final report's own, later, fully-substantiated diagnosis). */
  preliminaryImpression?: string;
  /** Real, per the same follow-up — status text for pending ancillary
   *  studies, backing prelim_body_ancillary_status
   *  (services/reportParts/mockReportPartService.ts). Case-level,
   *  matching grossDescription/microscopicDescription's own shape —
   *  a case with multiple specimens shares one status line per study
   *  type, same as it already shares one grossDescription. */
  specialStainsStatus?: string;
  ihcStatus?: string;
  decalcificationStatus?: string;
  molecularStatus?: string;
  recutStatus?: string;
  /** Real, per the same follow-up — backing prelim_body_signoff's own
   *  reviewer-attestation and critical-value/verbal-notification log
   *  fields. */
  reviewerRole?: string;
  preliminaryRecordedAt?: string;
  criticalValueCommunicated?: string;
  criticalValueRecipient?: string;
  criticalValueNotifiedAt?: string;
  criticalValueNotes?: string;
}

export interface AccessionMetadata {
  accessionNumber: string;
  accessionPrefix?: string;
  accessionYear?: number;
  /** The human-facing accession identifier — what appears on labels,
   *  cassettes, and report headers (orchestratorEngine.ts's narrative
   *  header reads this field directly). Distinct from Case.id, which
   *  stays a stable, always-'O26-'-prefixed internal routing key —
   *  CaseRouter.isOrchCase() and friends key off Case.id specifically
   *  because it has to be resolvable before the Case object is even
   *  fetched, so it can never be allowed to vary with an org's mask
   *  config. fullAccession is what's actually driven by the real
   *  CaseMask record governing this case (services/caseRegistry/) —
   *  see AccessionPage.tsx's handleSubmit. */
  fullAccession?: string;
  /** Which mask pattern actually produced fullAccession — kept as its
   *  own field (not re-derived) specifically so that if an organisation
   *  changes their mask pattern later, historical cases still show
   *  which pattern generated their number rather than being silently
   *  reinterpreted under the new one. */
  formatPatternUsed?: string;
  accessionedAt?: string;
  accessionedBy?: string;
  caseNumber?: number;
  externalAccession?: string;
}

// ─────────────────────────────────────────────────────────────
// Synoptic Report Instance
// Represents one template attached to one specimen.
// A case can have many of these (multiple specimens × multiple templates).
// ─────────────────────────────────────────────────────────────
export type AiFieldVerification = 'unverified' | 'verified' | 'disputed';

export interface AiFieldSuggestion {
  value: string | string[];
  confidence: number;        // 0–100
  source: string;            // e.g. 'Gross: "2.3 × 1.8 × 1.5 cm"'
  verification: AiFieldVerification;
}

export interface SynopticReportInstance {
  /** Unique ID for this report instance */
  instanceId: string;
  /** Which specimen this report belongs to */
  specimenId: string;
  /** The template used (e.g. 'breast_invasive') */
  templateId: string;
  /** Human-readable template name (cached for sidebar display) */
  templateName: string;
  /** User's answers for this report */
  answers: Record<string, string | string[]>;
  /** AI-suggested values per field — keyed by fieldId */
  aiSuggestions?: Record<string, AiFieldSuggestion>;
  /** Draft | finalized */
  status: 'draft' | 'finalized' | 'pending-countersign';
  /** Per-report comment (html) */
  comment?: string;

  // ── Synoptic-level assignment (parent-child sign-off) ──────────────────
  /** Pathologist assigned to finalise this specific synoptic (may differ from case owner) */
  assignedTo?: string;
  /** Display name of assigned pathologist — cached for UI */
  assignedToName?: string;
  /** User ID of who assigned it */
  assignedBy?: string;
  /** When this synoptic was assigned */
  assignedAt?: string;
  /** Whether case owner must countersign after assignee finalises */
  requiresCountersign?: boolean;
  /** Who countersigned */
  countersignedBy?: string;
  /** When countersigned */
  countersignedAt?: string;
/** Note from the assigning pathologist */
  assignmentNote?: string;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;

  // ── Amendment reseed state ──────────────────────────────────────────
  /** Was in seed data already but never formally typed. Set when an
   *  amendment reseed opens this instance for editing — distinguishes
   *  a reseeded amendment-in-progress draft from a genuinely new draft. */
  pendingAmendmentId?: string;
  /** Real gap fixed alongside pendingAmendmentId above: the parallel
   *  addendum-in-progress marker, set when a new synoptic report instance
   *  is added to an already-finalized case (see handleAddSynopticReports
   *  in SynopticReportPage.tsx) and cleared when
   *  releasePendingAmendmentOrAddendum releases it. Was previously used
   *  throughout useAmendmentWorkflow.ts without ever being declared here —
   *  an oversight, not a deliberate omission, given it mirrors
   *  pendingAmendmentId's own lifecycle exactly. */
  pendingAddendumId?: string;
  /** Was in seed data already but never formally typed. True once this
   *  instance has been finalized at least once before. */
  previouslyFinalizedForAmendment?: boolean;
  /** The revision kind of the most recent release on this instance —
   *  'original' (never revised) | 'amendment' | 'correction' | 'addendum'.
   *  Source of truth for the Final (Amended)/(Corrected)/(Addendum)
   *  display label; set in releasePendingAmendmentOrAddendum
   *  (SynopticReportPage.tsx) from the released AmendmentRecord's own
   *  `type`. See AMENDMENT_STATUS_REDESIGN_BRIEF.md. */
  lastRevisionType?: RevisionType;
  /** NEW (DR-2) — field-level provenance for delta fields chosen during
   *  amendment reseeding. Only present for fields that differed across
   *  the version history being compared; unchanged fields' provenance
   *  is implicit in the ReportVersionRecord chain. See FieldLineage.ts. */
  fieldLineage?: Record<string, FieldLineageEntry>;
}

// ─────────────────────────────────────────────────────────────
// Grossing Report Instance
// Represents one Grossing Template instance attached to one specimen,
// filled out by the PA at the grossing bench — the data-shape equivalent
// of SynopticReportInstance, but for Stage 0/1 of the Orchestration
// workflow (case accession → Grossing Template assignment → PA completes
// Gross → AI evaluates and assigns diagnostic Synoptic Template(s)).
// See PathScribe_Orchestration_Workflow_Summary.md for the full lifecycle
// this supports.
//
// Deliberately kept structurally close to SynopticReportInstance so it
// flows through the same schema-driven renderer (RightSynopticPanel.tsx —
// confirmed generic over template kind, not hardcoded to diagnostic
// checklists) without requiring any new UI. Countersign/assignment fields
// from SynopticReportInstance are intentionally omitted here — grossing is
// PA-performed, single-sign-off work; add them back if a review/cosign
// workflow for grossing turns out to be needed later.
// ─────────────────────────────────────────────────────────────
/**
 * Real feature, per direct follow-up: "So after gross complete, then
 * the next logical step is to generate a Microscopic Description...
 * Perhaps a gap in our orchestration flow." Confirmed directly before
 * building this: Stage 1 (evaluateSynopticAssignment) only ever fires
 * at Gross Complete — before microscopic text can realistically
 * exist — and no real trigger anywhere re-evaluates template
 * assignment once it does, in either Orchestration OR Assist mode
 * (confirmed directly against every real inbound HL7/LIS handler in
 * this app; none reference microscopic text at all). This closes
 * that gap's own data-model half.
 *
 * Deliberately simple/free-text, not a structured checklist like
 * GrossingReportInstance — per direct decision, both dictation and
 * typed entry feed the SAME single narrative field ("both,
 * pathologist's choice, matches how Gross already works" — though
 * confirmed directly that Gross itself has no dedicated pre-template
 * dictation surface today either; this is genuinely the first real
 * instance of that pattern, not a mirror of an existing one).
 */
export interface MicroscopicReportInstance {
  instanceId: string;
  /** Which specimen this Microscopic narrative belongs to — same
   *  real per-specimen scope as GrossingReportInstance.specimenId,
   *  since different specimens on the same case can carry genuinely
   *  different microscopic findings and, downstream, different CAP
   *  template determinations. */
  specimenId: string;
  text: string;
  /**
   * 'draft' while actively being typed/dictated and not yet
   * explicitly confirmed; 'saved' once the pathologist confirms it
   * (even if left blank — a deliberate, reviewed skip, per direct
   * decision's own "Conditional Blocking" design; see
   * utils/evaluateMicroscopicFinalizeGate.ts). No stored
   * 'not-started' value — the genuine absence of any instance for a
   * specimen already means that on its own; callers building that
   * gate function's own input treat a missing instance as
   * 'not-started' rather than this type needing to represent it.
   */
  status: 'draft' | 'saved';
  /** Real, honest provenance — did this text arrive by dictation,
   *  typing, or a mix of both in the same session. Not used by the
   *  finalize gate itself (which only cares about status/content),
   *  kept for the same real audit-trail value entryMethod-style
   *  fields already carry elsewhere in this app. */
  entryMethod?: 'dictated' | 'typed' | 'mixed';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface GrossingReportInstance {
  /** Unique ID for this report instance */
  instanceId: string;
  /** Which specimen this Grossing report belongs to */
  specimenId: string;
  /** The Grossing template used (e.g. 'grossing_gold_standard_generic') */
  templateId: string;
  /** Human-readable template name (cached for sidebar display) */
  templateName: string;
  /** PA's answers for this Grossing checklist */
  answers: Record<string, string | string[]>;
  /**
   * AI-suggested values per field — keyed by fieldId. Mirrors
   * SynopticReportInstance.aiSuggestions. Populated once a Stage 0/1
   * evaluation service exists; harmless/empty until then.
   */
  aiSuggestions?: Record<string, AiFieldSuggestion>;
  /**
   * 'draft' while the PA is working; 'finalized' once Gross is marked
   * complete. Finalizing is the save action that triggers Stage 1
   * evaluation (AI assigns/re-evaluates the diagnostic Synoptic
   * Template(s) for this specimen) — see contextBuilder.ts /
   * evaluateSynopticAssignment in mockCaseService.ts.
   *
   * Can revert from 'finalized' back to 'draft' automatically — editing a
   * finalized instance's answers is itself what reopens it (no separate
   * "unlock" action; see SynopticReportPage.tsx's grossing-snapshot
   * useEffect). previouslyFinalized below survives that revert, so the UI
   * can tell "first time" apart from "correcting something already done"
   * even after status has reverted to 'draft'.
   */
  status: 'draft' | 'finalized';
  /**
   * True once this instance has been finalized at least once, even if it
   * later reverted to 'draft' via an edit. Never cleared. Drives whether
   * the action button reads "Gross Complete" (first time) or "Update
   * Gross" (correcting something already done) and whether a reason
   * prompt fires on re-finalize.
   */
  previouslyFinalized?: boolean;
  /** Optional free-text comment from the PA (html) */
  comment?: string;

  /**
   * Real feature, per direct follow-up: "Do we capture failed template
   * association? That might be a good quality measure." Confirmed
   * directly before adding this: nothing on this type (or anywhere
   * else in the real data model) ever persisted the AI's routing
   * confidence/reasoning/fallback status for the initial Grossing
   * Template assignment — it only ever existed transiently, in a toast
   * and in AccessionPage.tsx's own React state, gone the moment the
   * page was navigated away from. Genuinely absent (`undefined`) only
   * for the brief real window between Case creation and the
   * background AI evaluation resolving — see AccessionPage.tsx's own
   * `refineGrossingTemplatesInBackground()`, the one real writer of
   * this field. Every specimen gets one, real outcome, not just the
   * ones that changed from the default — a specimen where the AI
   * genuinely, confidently agreed with the default is a real,
   * different outcome from one where the AI call failed outright, and
   * both are real, distinct signals worth being able to tell apart
   * later.
   */
  templateAssignmentOutcome?: {
    /** 'ai' — a real, specific AI routing decision, at or above the
     *  confidence threshold. 'fallback' — the AI ran, but its
     *  confidence was below threshold (or it found no good match),
     *  and the configured fail-open default was used instead (S0-FR-05).
     *  'override' — a Pass G0 client-specific routing override applied;
     *  the AI never ran for this specimen at all. 'failed' — the real
     *  AI call itself failed (network/provider error) — this specimen
     *  is still using the safe, immediate default from Case creation,
     *  but was never actually evaluated. */
    outcome: 'ai' | 'fallback' | 'override' | 'failed';
    /** 0–100. Absent for 'override' (no AI evaluation ran) and 'failed'
     *  (no real result to report a confidence for). */
    confidence?: number;
    /** Plain-language reason from the real AI analysis, or the fixed
     *  "Pass G0 override" / fallback explanation
     *  evaluateGrossingTemplateAssignment itself already produces.
     *  Absent for 'failed'. */
    reason?: string;
    /** Real, honest error detail — only present for 'failed'. */
    errorMessage?: string;
    evaluatedAt: string;
  };

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Protocol Change — an AI-proposed change to a specimen's diagnostic
// Synoptic Template assignment. Relocated here from ProtocolChangeModal.tsx
// (a UI component file) so the AI service layer (IAIIntegrationService)
// can return this type without importing from a page-level modal — a
// service interface importing its return type from a modal component was
// backwards layering. ProtocolChangeModal.tsx and SynopticReportPage.tsx
// both import this from here now instead of defining/re-exporting it.
// ─────────────────────────────────────────────────────────────
export type ProtocolChangeAction = 'replace' | 'add' | 'remove';

export interface ProtocolChange {
  id:                   string;
  specimenId:           string;
  specimenLabel:        string;
  specimenDesc:         string;

  /**
   * What this proposal does to the specimen's synoptic assignment.
   * - 'replace': swap an existing synoptic for a different template
   * - 'add':     assign a synoptic where none existed for this specimen
   * - 'remove':  drop a previously-assigned synoptic that's no longer needed
   * Defaults to 'replace' if absent, for backward compatibility with any
   * caller written before this field existed.
   */
  action?:              ProtocolChangeAction;

  /**
   * The specific existing synoptic instance this change targets (for
   * 'replace' and 'remove'). Prefer this over matching by specimenId alone —
   * a specimen can carry more than one synoptic instance, and specimenId by
   * itself can't disambiguate which one a proposal means.
   */
  currentInstanceId?:   string;
  /** Absent for 'add', since there is no existing template to show. */
  currentTemplateId?:    string;
  currentTemplateName?:  string;
  /** Absent for 'remove', since there is no replacement template. */
  proposedTemplateId?:   string;
  proposedTemplateName?: string;

  /** Human-readable reason from AI analysis of the microscopic description */
  reason:               string;
  confidence:           number;  // 0–100

  /**
   * Persisted verification status, mirroring AiFieldSuggestion.verification
   * exactly ('unverified' | 'verified' | 'disputed' in that type) — same
   * confirm/override interaction language used for individual field
   * suggestions in RightSynopticPanel.tsx, applied here at the whole-
   * synoptic-assignment level instead of per-field. Renamed values to fit
   * this context's actual actions (accept the proposed template swap /
   * dismiss it) rather than reusing 'verified'/'disputed' verbatim, which
   * read oddly for "accept this proposed replacement template."
   *
   * 'pending'   — proposed, not yet reviewed (equivalent to 'unverified')
   * 'accepted'  — pathologist applied this change via ProtocolChangeModal
   * 'dismissed' — pathologist explicitly chose not to apply it
   *
   * Previously ProtocolChange existed only transiently as
   * evaluateSynopticAssignment's input/output — nothing persisted what
   * happened to a proposal after the modal closed. Needed now so a
   * Stage 2 background check (fires on Save Draft with non-empty
   * Microscopic content, separate from the blocking pre-finalize check)
   * can leave a quiet, PERSISTENT badge for the pathologist to review on
   * their own schedule, rather than only ever surfacing as an ephemeral
   * toast or a forced interruption.
   */
  reviewStatus?: 'pending' | 'accepted' | 'dismissed';
}
export interface Case {
  id: string;

  /** Real, per direct guidance on APAC-QA-01 (external proficiency
   *  testing — RCPAQAP/CAP-style EQA programs): "the synthetic cases
   *  are accessioned into the system and resulted. Those results are
   *  then sent to [the external provider]. Then a response is sent
   *  back showing the scores. The Lab didn't know what the actual
   *  result was until it was sent back." Set only on a real,
   *  synthetic proficiency-testing challenge case, accessioned the
   *  exact same real way as any real patient case — undefined for
   *  every real, genuine patient case. PathScribe never stores or
   *  computes the external provider's own known answer itself; the
   *  real scoring happens externally, and comes back later as a
   *  real, separate inbound event
   *  (CytologyProficiencyTestResultEventPayload.ts) — the same real
   *  "PathScribe publishes/ingests its own specification" split
   *  already established for hrHPV results and molecular batch
   *  results. */
  proficiencyTestContext?: { provider: string; challengeReferenceId: string };

  /** Real, per PS-289/PS-292's own "batch-manifest scanning with
   *  automatic control-slide appending" piece — same real "synthetic
   *  case, accessioned the exact same real way as any real patient
   *  case" pattern proficiencyTestContext above already establishes,
   *  applied to a different real purpose: a lab-owned positive
   *  control slide for a specific reagent lot, auto-created by
   *  shouldAutoAppendControl.ts's own real consumer
   *  (mockBatchService.ts) when a stain requiring one
   *  (StainType.requiresTargetControl) is added to a real 'Staining'
   *  batch with no real control for that same lot already in its own
   *  manifest. Undefined for every real, genuine patient case. */
  controlSlideContext?: { reagentLotId: string; stainTypeId: string };

  /** Real, per direct guidance (PS-105): the case's own real, confirmed
   *  abnormal-detection status — set only when a pathologist actually
   *  confirms a suggestion (records a real notification via
   *  handleRecordCriticalNotification, services/clinical/), never from
   *  an unconfirmed AI/discrete-rule suggestion alone. Denormalized
   *  here specifically so WorklistTable.tsx can render a real status
   *  indicator without re-running detection (an AI call, a real
   *  cost/latency concern) for every row on every render. null/undefined
   *  = no confirmed abnormal finding on this case. */
  abnormalDetectionStatus?: { severity: 'Abnormal' | 'Critical' | 'Malignant'; confirmedAt: string } | null;
  /** Real, per direct guidance: architecture-testing only, NEVER a
   *  real, licensed SNOMED CT / ICD-O-3 code — PS-130 (the real
   *  implementation) stays genuinely blocked on a real terminology
   *  source. See resolveSyntheticCoding.ts (services/abnormalDetection/)
   *  for the full safety reasoning — every real code value here is
   *  structurally, unmistakably fake even read completely alone,
   *  never relying on this field's own name/comment as the only
   *  safeguard. Set alongside abnormalDetectionStatus above, same
   *  real confirm moment, same lifecycle. */
  syntheticAbnormalCoding?: { system: 'TEST-SNOMED' | 'TEST-ICDO3'; code: string; display: string }[];

  /** When grossing was first, genuinely completed for this case - real
   *  fix, added specifically for TAT (turnaround time) calculation
   *  (components/Contribution/qualityCalculations.ts). Set once, at the
   *  case's first Gross Complete (see SynopticReportPage.tsx's
   *  handleGrossComplete) - deliberately NOT updated on a later
   *  correction/re-finalize of grossing, since this needs to stay a
   *  stable "when did routine grossing genuinely finish" milestone for
   *  turnaround-time purposes, not drift forward every time a
   *  post-handoff correction is made. Real fix, caught in a later pass:
   *  this was originally, mistakenly placed inside OrderMetadata
   *  (Case.order.grossCompletedAt) rather than here - every real read/
   *  write of this field already, consistently treats it as top-level,
   *  so the type definition was moved to match, not the other way
   *  around. */
  grossCompletedAt?: string;
  /** When this case was first, genuinely opened by anyone - real fix,
   *  added specifically for TAT (turnaround time) calculation
   *  (components/Contribution/qualityCalculations.ts, FIRST_TOUCH type).
   *  Set once, on the case-load effect in SynopticReportPage.tsx -
   *  idempotent, never overwritten on a later re-open. Same real fix as
   *  grossCompletedAt above - moved here from a mistaken placement
   *  inside OrderMetadata. */
  firstOpenedAt?: string;

  /**
   * Subspecialty identifier for this case (e.g. 'breast', 'gi', 'thoracic',
   * 'uro', 'derm'). Optional — feeds TemplateRoutingService's Pass 2
   * (Subspecialty Fallback). When not set, contextBuilder.ts derives a
   * best-effort value from the case's synoptic protocol ID instead; see
   * PROTOCOL_TO_SUBSPECIALTY in TemplateRoutingService.ts.
   */
  subspecialtyId?: string;

  // ── Multi-report synoptic system ──────────────────────────
  // Each entry is one template instance attached to one specimen.
  synopticReports?: SynopticReportInstance[];

  // ── Grossing report system (Orchestration Stage 0/1) ──────
  // Each entry is one Grossing Template instance attached to one specimen,
  // filled out by the PA before the diagnostic Synoptic Template(s) for
  // that specimen are assigned. Mirrors synopticReports[] structurally —
  // see GrossingReportInstance above.
  grossingReports?: GrossingReportInstance[];

  // ── Microscopic narrative system (Orchestration "Stage 1.5") ──
  // Each entry is one specimen's real, free-text Microscopic
  // Description — the real gap between Gross Complete and diagnostic
  // Synoptic Template determination, per direct follow-up. See
  // MicroscopicReportInstance above and
  // utils/evaluateMicroscopicFinalizeGate.ts for the real, conditional
  // finalize-blocking rules built against this field.
  microscopicReports?: MicroscopicReportInstance[];

  // ── Synoptic fit re-evaluation (Orchestration Stage 2) ─────
  // Persisted result of the most recent evaluateSynopticAssignment() run
  // triggered by the Stage 2 BACKGROUND check (Save Draft with non-empty
  // Microscopic content — see SynopticReportPage.tsx's handleSaveDraft).
  // Distinct from the Stage 2 BLOCKING check at pre-finalize time
  // (handlePreFinalConfirm), which surfaces its own ProtocolChangeModal
  // immediately and doesn't need to persist anything past that moment —
  // this field exists specifically so a quiet background-check result
  // survives until the pathologist chooses to look at it (this session's
  // stated design: persistent over ephemeral), shown as a badge in
  // Sidebar.tsx next to the affected specimen/synoptic row. Cleared (or
  // its entries marked 'accepted'/'dismissed') once the pathologist
  // reviews them via ProtocolChangeModal, opened on demand by clicking
  // the badge — see ProtocolChange.reviewStatus.
  pendingProtocolChanges?: ProtocolChange[];

  // ── Legacy single-report fields (kept for backwards compat) ──
  // Used by cases seeded before synopticReports[] was introduced.
  // New code should prefer synopticReports[].
  synopticTemplateId?: string;
  synopticAnswers?: Record<string, string | string[]>;

  accession: AccessionMetadata;
  originHospitalId: string;
  /** Real, per direct guidance — Phase 3 of the Organisation/Site ->
   *  Facility migration. Real, admin-editable Facility.id (a child of
   *  the origin Enterprise Facility, via parentId) — e.g.
   *  'c-site-mft-mri' for Manchester Royal Infirmary. Migrated from
   *  Site.id (Organisation.sites[]); Optional: most orgs today have
   *  exactly one real site, and originHospitalId alone is sufficient
   *  for anything that doesn't need facility-level routing. Only
   *  populated where it's actually captured — see AccessionPage.tsx.
   *  Added specifically for ModeAInterfaceService's site-level
   *  hardware routing (an enterprise like MFT can have multiple
   *  physical Vantage/Cerebro endpoints, one per site, which
   *  originHospitalId alone can't distinguish between). */
  originSiteId?: string;
  originEnterpriseId: string;
  isReferenceLabCase?: boolean;
  /** Real, per PathScribe Interface Specification v1.2 §2.6 (patient
   *  data minimization) - THIS case's own real
   *  resolveOrCreatePatient() outcome at accession, not the patient
   *  identity's permanent origin (MasterPatientRecord.establishedVia
   *  is patient-level and never changes after first creation - a
   *  later case for an already-known patient is a genuine 'matched'
   *  event for THAT case, even though the underlying identity itself
   *  was originally 'created' by an earlier, different case). Optional
   *  since cases accessioned before this field existed won't have it -
   *  callers should treat a missing value as 'full' scope (the safer
   *  of the two mistakes, same reasoning §2.6 itself uses for
   *  'ambiguous'), never assume 'reference' from absence. */
  patientMatchOutcome?: 'matched' | 'created' | 'ambiguous';

  patient: Patient;
  /** Real fix, per direct follow-up on the rest of Phase 0: the real,
   *  standalone Encounter this case's specimens were collected during
   *  - see services/encounters/IEncounterService.ts. Optional: a case
   *  accessioned without a real, resolved order (or one predating this
   *  field) genuinely has no encounter to reference. */
  encounterId?: string;
  specimens: Specimen[];
  /** Real, per direct guidance's own confirmed Autopsy Pathology
   *  Module work (PS-261, RFP-APLIS-2026-GLOBAL §3.1.C) — the real,
   *  missing link between Phase 1's own AutopsyCaseDetails type
   *  (case authority, forensic/consent records, PAD/FAD snapshots,
   *  organ retention, ancillary holds) and this app's own real,
   *  central Case entity. Undefined for every real, non-autopsy
   *  case. A real "temporary accession" — receiving and refrigerating
   *  a body before full legal paperwork exists — is simply a real
   *  Case created with a minimal, partial autopsy record (e.g. only
   *  jurisdiction + caseAuthority + a real, logged verbal order on
   *  forensicAuthorization) — the same real "the form already IS the
   *  draft accession the moment any field is filled" pattern already
   *  established elsewhere, never a separate, parallel accession
   *  mechanism of its own. */
  autopsy?: AutopsyCaseDetails;
  order: OrderMetadata;
  assignmentHistory?: AssignmentEvent[];
  diagnostic?: DiagnosticMetadata;
  coding?: CaseCoding;
  // Real, confirmed fix, per direct follow-up (Jira PS-57: "two
  // incompatible flag-tracking systems corrupt each other's data",
  // plus the follow-up "should be able to assign Flags at either a
  // Case or Specimen level"): was CaseFlag[]/SpecimenFlag[] — an
  // inline copy of a flag DEFINITION's own display fields (label,
  // color, lisCode) — but the only real, live workflow that applies a
  // flag to a case (FlagManagerModal.tsx, via caseFlagsApi.ts) has
  // always written FlagInstance[] instead: an application RECORD
  // referencing a real FlagDefinition by id (flagDefinitionId), with
  // real audit fields (appliedAt/appliedBy/source/deletedAt/
  // deletedBy) the old type never had room for.
  //
  // There is deliberately no case-level specimenFlags field —
  // specimen-level flags live only on each Specimen's own
  // specimenFlags (types/case/Specimen.ts), the only real way to know
  // which specimen a flag belongs to, since FlagInstance itself
  // carries no specimenId of its own. A prior, separate bug had
  // HeaderBar.tsx's LIS-sync path writing specimen-level flags to a
  // case-level specimenFlags field that the real flag-application
  // workflow never read from or wrote to at all — fixed alongside
  // this change to write to the correct, real location instead.
  caseFlags?: FlagInstance[];
  status: CaseStatus;
  /** Real gap fixed alongside pendingAddendumId: both finalizedAt and a
   *  top-level finalizedBy were already real, established, widely-used
   *  fields (finalizedAt in particular drives TAT calculations — see
   *  QualityTab.tsx's "receivedDate → finalizedAt" total-TAT metric —
   *  and useSignOutWorkflow.ts writes both directly) but neither was
   *  ever declared on this top-level Case interface. The only
   *  finalizedBy previously declared anywhere was nested under
   *  DiagnosticMetadata — a different field entirely from the one
   *  finalizeCase actually writes at the case root. */
  finalizedAt?: string;
  finalizedBy?: string;
  /** Real feature, per direct follow-up: "How will pathscribe know it
   *  needs to retain the patient's specimen? ... The hold Retention
   *  flag should be also on the accession screen." See
   *  types/case/RetentionHold.ts's own header for the full reasoning.
   *  Case-level (not per-specimen) — settable at accession, before
   *  individual specimens even exist yet. Multiple real holds can
   *  accumulate over a case's life (a patient request, later a
   *  litigation hold); none are ever deleted, only released. */
  retentionHolds?: RetentionHold[];
  /** Real feature, per direct follow-up: "putting a case on Hold at
   *  the case level makes sense if there is something truly wrong...
   *  add a tile in their worklist for Cases on Hold." See
   *  types/case/CaseHold.ts's own header for the full reasoning and
   *  why this is deliberately NOT the same thing as retentionHolds
   *  above. Gates finalize (useSignOutWorkflow.ts) while any entry is
   *  active — same "multiple can accumulate, none ever deleted" real
   *  history posture as retentionHolds. */
  caseHolds?: CaseHold[];
  /** Real, architectural fix, per direct follow-up: "the matrix block
   *  itself is the tracked asset." Case-level, not nested under any
   *  one Specimen — see types/case/MatrixBlock.ts's own header for
   *  the full reasoning. Each real, physical cassette shared by more
   *  than one specimen lives here, exactly once; a specimen with no
   *  shared tissue never touches this array at all. */
  matrixBlocks?: MatrixBlock[];
  /** Real feature, per direct specification: Post-Sign-Out Release Buffer.
   *  The real, buffer-aware moment this report actually became final and
   *  dispatch-eligible — set immediately (equal to finalizedAt) when no
   *  buffer applies (buffer disabled, or a real STAT-priority bypass),
   *  or at real buffer expiry / a real forced early release otherwise.
   *  Deliberately separate from finalizedAt — see CaseStatus's own
   *  'pending-release' doc comment for why finalizedAt must never be
   *  deferred by the buffer duration. Undefined for any case that has
   *  never gone through this real flow (i.e. every case finalized
   *  before this feature existed) — genuinely absent, not backfilled. */
  releasedAt?: string;
  /** The real, computed timestamp release-buffer auto-release should
   *  fire at (sign-out time + the real, resolved buffer duration) —
   *  present only while status is genuinely 'pending-release'. Cleared
   *  the moment the case leaves that status, by either path (recall or
   *  real release). */
  releaseBufferExpiresAt?: string;
  /** The real buffer duration actually applied at sign-out time —
   *  captured as a snapshot, not re-resolved from current config later,
   *  same "snapshot, don't re-resolve" reasoning as
   *  PatientEncounterSnapshot (types/reports/): a later admin config
   *  change must never retroactively change an already-signed case's
   *  own, real countdown. */
  releaseBufferDurationMinutes?: number;
  /** The real CaseStatus this case genuinely held immediately before
   *  entering 'pending-release' — restored exactly on recall, rather
   *  than guessing a single hardcoded fallback (e.g. always
   *  'in-progress'), since finalizeCase() is a real, shared entry point
   *  reachable from more than one real prior state. Cleared alongside
   *  releaseBufferExpiresAt the moment the case leaves 'pending-release'. */
  preReleaseBufferStatus?: CaseStatus;
  /** Denormalized mirror of the active/most-recently-touched synoptic
   *  instance's SynopticReportInstance.lastRevisionType — kept in sync
   *  at the same moment (releasePendingAmendmentOrAddendum in
   *  SynopticReportPage.tsx) purely so list views (WorklistPage,
   *  WorklistTable, SearchPage) can render the Final (Amended)/
   *  (Corrected)/(Addendum) badge without joining against amendment
   *  records for every row. The instance-level field is the source of
   *  truth for any per-instance question; this is a display convenience
   *  only. See AMENDMENT_STATUS_REDESIGN_BRIEF.md. */
  lastRevisionType?: RevisionType;
  createdAt: string;
  updatedAt: string;
  /**
   * Real feature, per direct follow-up: "Stamp every saved draft...
   * with... station_id captured at the exact moment of saving. I
   * only fixed the audit trail. The underlying case/report save
   * operations themselves still don't carry station attribution."
   * Confirmed directly: no equivalent of updatedBy even existed on
   * Case at all before this — auto-injected at the one, real choke
   * point every case write already passes through
   * (CaseRouter.updateCase(), getEffectiveScanStationId()), the same
   * pattern already proven for the audit trail. Genuinely absent (not
   * backfilled) for any case whose last write predates this field —
   * always reflects the REAL station of the most recent save, not a
   * history of every station that ever touched this case.
   */
  lastUpdatedFromStation?: string | null;
  /** Real, incrementing optimistic-concurrency version for the whole case
   *  record — per the Case Hydration & Optimistic Concurrency Control
   *  spec's §3.1. Distinct from OrchestratorSection.updatedAt (per-section
   *  version, used for sectional locking within Orchestration narrative
   *  content specifically) — this is the case-level rollup used for
   *  lightweight client staleness checks on load and the general
   *  compare-and-swap in FirestoreCaseService.updateCase. Starts at 1 on
   *  creation; the service increments it atomically inside a transaction
   *  on every successful write, never client-side. */
  version?: number;
  sharedWith?: string[];
  acceptedBy?: string;
  /** Real, per direct guidance ("Return to Trainee"/"Reject with
   *  Notes" — see CaseStatus.ts's own 'returned' entry for the full
   *  real account): the attending who rejected a resident's
   *  countersign submission and sent it back. Set alongside
   *  status: 'returned'. */
  returnedBy?: string;
  closedBy?: string;
  /** See ReportingMode's doc comment below for the full history of this
   *  field's value set (why 'pathscribe' and 'native' were dropped). */
  reportingMode?: ReportingMode;
  /** Structured multi-person team roster — formerly only writable via
   *  `as any` from CaseTeamModal.tsx with no declared type. See
   *  CaseParticipant below. order.assignedTo/assignedParticipationTypeId
   *  remain the indexed "who owns this case" fields that
   *  listCasesForUser() filters on — participants[] is kept in sync with
   *  them via syncPrimaryAssignee() (caseAssignmentSync.ts), not a
   *  replacement for them. */
  participants?: CaseParticipant[];
  /** Real, flat denormalization of participants — the specific staffIds
   *  currently eligible to finalize this case (active Primary/
   *  Attending), maintained automatically by CaseRouter.ts whenever a
   *  write touches participants (see
   *  services/auth/caseAccessControl.ts's deriveEligibleFinalizerIds()).
   *  Exists specifically because firestore.rules has no way to check a
   *  predicate against an array of objects like participants — only
   *  flat value arrays. This is what makes dimension-4 (case
   *  relationship) write-guard enforcement possible server-side, not
   *  just client-side. Never write this directly — it's derived, the
   *  same way a search index is derived from its source data, and
   *  hand-editing it would desync it from participants immediately. */
  eligibleFinalizerIds?: string[];
  /** Local workflow overlay for 'assist'-mode cases, where CaseStatus is
   *  LIS-owned and off-limits to PathScribe. NOTE: not yet wired to
   *  anything — no code in this pass reads or writes it. Added because
   *  it's been specified across several design-doc revisions, but same
   *  standard as the CaseStatus cleanup earlier in this project: an
   *  unused field is worth flagging, not silently shipping. Wire it up
   *  for real once something actually needs it, same as the other
   *  once-speculative fields that got seeded properly rather than left
   *  inert. */
  pathscribeWorkflowState?: 'idle' | 'ai_processing' | 'suggestions_ready' | 'draft_in_progress';
}

/** 'assist' = LIS owns the report, PathScribe is read-only on lifecycle —
 *  operates as a visual overlay / intelligent assistant only, mutating
 *  pathscribeWorkflowState, never CaseStatus. 'orchestrator' = PathScribe
 *  owns the full report lifecycle, native/owned CaseStatus, transitions
 *  only via explicit clinical actions (Sign-out, Submit for Review, Claim
 *  from Pool).
 *
 *  Renamed from 'copilot' (was the value here previously) for trademark
 *  safety — Microsoft holds a live registered trademark on COPILOT
 *  (USPTO Reg #6256123, Computer & Software Services class), and while
 *  the term has been used informally by other companies, this codebase's
 *  own use of "CoPilot" wasn't purely an internal code name — it
 *  surfaced in user-facing strings (a Contribution-dashboard label, a
 *  BottomActionBar tooltip). 'assist' was chosen specifically because
 *  it's a generic/descriptive word — legally the *safer* category, since
 *  generic terms are too weak to function as anyone's exclusive
 *  trademark, unlike a coined/stylized term like "Copilot" that reads as
 *  source-identifying. Not a substitute for real trademark clearance —
 *  a defensive rename made ahead of that, not instead of it.
 *
 *  Narrowed from the old 4-value union ("pathscribe" | "orchestrator" |
 *  "native" | "copilot") before this rename — 'native' had zero real
 *  usage anywhere in the app, and 'pathscribe' was already dead for
 *  detecting Orchestration mode (mockOrchestratorCaseService.ts switched
 *  to 'orchestrator' for that; see contextBuilder.ts's fallback, also
 *  fixed). */
export type ReportingMode = 'assist' | 'orchestrator';

// ── Case Team / Delegation domain types ─────────────────────────────────────
// Formalizes what was previously a locally-declared, `as any`-cast-only type
// inside CaseTeamModal.tsx (the only place it existed) into a real, shared
// domain type — per the Case Assignment Synchronization TDS. Real seeded
// participation type IDs today: 'primary', 'attending', 'consultant',
// 'resident', 'cytotechnologist', 'frozen', 'grossing', 'second_opinion'
// (see mockParticipationTypeService.ts) — participationTypeIds should only
// ever contain values from that set, not invented strings.
export interface CaseParticipant {
  staffId: string;
  staffName: string;
  externalId?: string;
  externalIdType?: 'GMC' | 'NPI';
  source: 'system' | 'manual';
  participationTypeIds: string[];
  addedBy: string;
  addedAt: string;
  status: 'active' | 'removed';
}

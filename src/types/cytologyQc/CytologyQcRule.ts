// src/types/cytologyQc/CytologyQcRule.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Automated Cytopathology QC Assignment
// Engine" spec, plus direct follow-up resolving the two open design
// questions (ROSE/FNA discrepancy dual-landing, unified Peer Review
// Queue with priority sorting). This is the core data model — the
// real evolution of the existing, simpler CytologyQcSettingsConfig
// (two flat negative/non-negative percentages) into a genuinely
// general, multi-criteria, priority-ordered rule engine. The two
// existing rates become two default rules under this model, not a
// second, parallel mechanism living alongside it.
//
// Real, deliberate split confirmed directly: the existing CT-driven
// routine rescreen pool (resolveCytologyRandomQcSelection.ts) stays
// exactly as-is on the Cytotechnologist's own worklist page — this
// engine's own real, new surface is the Pathologist-facing unified
// Peer Review Queue, which a CT escalation, a rule match, or a ROSE
// discrepancy can all land a case into, each tagged with why.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

/** Real, per spec §2.1's own three sampling modes. Only one is ever
 *  active per rule — kept as a discriminated union rather than three
 *  optional fields on one flat object, so a rule can never claim to
 *  be both "10% of cases" and "every 5th case" at once. */
export type QcSamplingLogic =
  | { type: 'percentage'; ratePercent: number }
  | { type: 'interval'; everyNthCase: number }
  | { type: 'fixed_volume'; firstNCases: number };

/** Real, per spec §2.1's own named criteria groups. Every field is
 *  optional — an unset field means "not filtered on this dimension,"
 *  never "matches nothing." A rule's real, effective scope is the
 *  intersection of every field it does set. */
export interface QcRuleCriteria {
  /** Real, per direct guidance ("basic rule set for our international
   *  facilities") — jurisdiction-level matching, reusing the same
   *  real Jurisdiction type (types/systemConfig.ts) already
   *  confirmed to cover all 13 real jurisdictions this app supports.
   *  Genuinely distinct from performingFacilityIds below — a
   *  jurisdiction-wide default rule applies regardless of which
   *  specific facility a case comes from, while a facility-scoped
   *  rule targets one real, named site. */
  jurisdictions?: Jurisdiction[];
  performingFacilityIds?: string[];
  laboratoryUnitIds?: string[];
  satelliteSiteIds?: string[];
  primarySignOutProviderIds?: string[];
  /** Real, per spec — genuinely new concept, no existing staff record
   *  field for this today. */
  providerOnboardingStatus?: ('new_hire' | 'probationary')[];
  providerRole?: ('pathologist' | 'cytotechnologist')[];
  /** Real, per direct guidance's own confirmed naming correction:
   *  "requiredCapabilities... because CYTO_ADVANCED_SPECIALIST isn't
   *  actually the credential held by the person. It's the normalized
   *  capability derived from one or more credentials." A rule never
   *  references a real, raw, jurisdiction-specific credential string
   *  directly here — only the one, real, normalized system capability
   *  key (e.g. "CYTO_ADVANCED_SPECIALIST") that one or more real,
   *  raw credentials (the UK's IBMS_ASD, the Netherlands' own
   *  NL_KCA_ADVANCED, Germany's own DE_ZYTO_ASSISTENT_ADV) each
   *  independently normalize to
   *  (resolveNormalizedCredentialCapabilities.ts). Matched by
   *  any-overlap (same posture as highRiskFlags below) — a rule
   *  requiring one of several real capabilities matches a provider
   *  holding any one of them, not all. Undefined/empty means no real
   *  capability requirement — any provider of the matched role
   *  qualifies. */
  requiredCapabilities?: string[];
  specimenCategory?: ('gyn_pap' | 'non_gyn_fluid' | 'fna')[];
  anatomicSite?: string[];
  sampleAdequacy?: ('satisfactory' | 'unsatisfactory' | 'limited')[];
  /** Real, per spec's own named examples — kept as plain strings, not
   *  a closed union: a real site's own high-risk flag vocabulary is
   *  admin-configurable elsewhere in this app (the flag dictionary),
   *  not something this rule engine should re-invent or constrain. */
  highRiskFlags?: string[];
  snomedConceptCodes?: string[];
  bethesdaClassifications?: string[];
  internalDiagnosisCodes?: string[];
  /** Real, per this app's own existing, established distinction
   *  (CytologyQcSettingsConfig's own two independent rates) — reused
   *  here rather than re-derived from Bethesda classification lists,
   *  since enumerating every non-negative Bethesda category would be
   *  both tedious and a real source of drift as categories evolve.
   *  A single boolean, not a list — a real case is either negative
   *  or it isn't. */
  resultIsNegative?: boolean;
}

/** Real, per direct resolution of "is Peer Review one queue or many"
 *  — the real Urgency Matrix a matched or triggered case is sorted
 *  by within the one, real, unified Peer Review Queue. Never a
 *  property of a routine CT-side rescreen pool entry, which never
 *  enters this queue at all. */
export type QcPeerReviewPriorityTier =
  | 'high_escalation'
  | 'targeted_high_consequence'
  | 'routine_random';

export interface CytologyQcRule {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  /** Real, per spec §2.2 — "evaluates the case against active QC
   *  rules in order of defined rule priority." Real, per direct,
   *  provided seed data's own convention: HIGHER number evaluates
   *  first (e.g. a real 110 evaluates before a real 70) — the more
   *  intuitive convention for an admin ("higher priority number
   *  matters more"), corrected here from this file's own earlier,
   *  arbitrary ascending choice. The first genuinely matching AND
   *  selected rule wins — a case is never double-counted against two
   *  rules at once. */
  evaluationPriority: number;
  criteria: QcRuleCriteria;
  samplingLogic: QcSamplingLogic;
  /** Which real urgency tier a case this rule matches lands in,
   *  once routed to the unified Peer Review Queue. */
  /** Real, per direct, provided seed data's own "routing.
   *  target_reviewer_role" — which real reviewer roles/seniority
   *  levels are eligible for a case this rule matches (e.g. a real
   *  "SENIOR_CT" or "CONSULTANT_HISTOPATHOLOGIST" pool, distinct from
   *  a general "PATHOLOGIST" pool). Plain strings, not a closed
   *  union — a real site's own reviewer-role taxonomy is a real,
   *  separate admin concern this rule engine has no reason to
   *  constrain. Undefined means no real role restriction beyond the
   *  universal, always-on self-review exclusion
   *  (resolveQcReviewerEligibility.ts). */
  eligibleReviewerRoles?: string[];
  peerReviewPriorityTier: QcPeerReviewPriorityTier;
  /** Real, per spec §2.3 — real, configurable per rule (e.g. 24h
   *  routine GYN vs. 4h urgent/FNA), not one global constant. */
  slaHours: number;
}

/** Real, per spec §3's own exact state names — kept verbatim, never
 *  renamed or abbreviated, since these are the real states an
 *  external audit or a real future backend integration would expect
 *  to see by these exact names. */
export type QcWorkflowState =
  | 'PRIMARY_COMPLETE'
  | 'QC_EVALUATION'
  | 'QC_PENDING'
  | 'FINAL_APPROVED'
  | 'QC_IN_REVIEW'
  | 'QC_RESOLVED'
  | 'QC_DISCREPANCY_REVISE';

/** Real, per direct resolution of the ROSE/FNA discrepancy question
 *  — three genuinely distinct real reasons a case ends up in the
 *  queue, each real and separately meaningful for the badge/tab
 *  filtering the unified queue needs. Never collapsed into one
 *  generic "flagged" boolean — the reason IS the badge. */
export type QcTriggerSource = 'rule_match' | 'ct_escalation' | 'rose_discrepancy';

/** Real, per spec §4 — "primary vs. secondary diagnostic codes,
 *  discrepancy severity (Major vs. Minor)." Only ever populated once
 *  a real QC_RESOLVED (discrepancy branch) or QC_DISCREPANCY_REVISE
 *  transition has genuinely happened — undefined before that, never
 *  a placeholder "no discrepancy yet" value. */
export interface QcDiscrepancyRecord {
  primaryDiagnosticCode: string;
  secondaryDiagnosticCode: string;
  severity: 'major' | 'minor';
  reviewerCommentary?: string;
  loggedAt: string;
}

/** Real, per spec §2.3's own "authorized supervisor bypass to
 *  prevent clinical delays." Only ever populated once a real bypass
 *  genuinely happens — never a silent, unlogged override. */
export interface QcSupervisorBypassRecord {
  supervisorId: string;
  justification: string;
  bypassedAt: string;
}

export interface CytologyQcCaseAssignment {
  id: string;
  caseId: string;
  specimenId: string;
  triggerSource: QcTriggerSource;
  /** Present when, and only when, triggerSource is 'rule_match' or
   *  'ct_escalation' — a real, matched rule's own id. A
   *  'rose_discrepancy' entry is a real, always-on system behavior
   *  per spec's own resolution ("the system automatically flags"),
   *  not something an admin-configured rule produces. */
  matchedRuleId?: string;
  priorityTier: QcPeerReviewPriorityTier;
  /** Real, per direct resolution — the real, visible indicator pill
   *  text (e.g. "ROSE Discrepancy"). Plain strings, not a closed
   *  union: real badge text is a real, evolving UI concern, not a
   *  fixed taxonomy this type should constrain. */
  badges: string[];
  state: QcWorkflowState;
  /** Real, per spec §2.2's own "Self-Review Prevention" — the real
   *  primary sign-out provider this case's QC review must never be
   *  assigned back to. See resolveQcReviewerEligibility.ts. */
  primarySignOutProviderId: string;
  assignedReviewerId?: string;
  slaDeadline: string;
  discrepancy?: QcDiscrepancyRecord;
  /** Real, per spec §4's own "reviewer commentary" — the concurrence
   *  case's own equivalent note, kept separate from
   *  QcDiscrepancyRecord.reviewerCommentary since a concurrence never
   *  produces a discrepancy record at all. */
  concurrenceCommentary?: string;
  supervisorBypass?: QcSupervisorBypassRecord;
  /** Real, per spec §2.3's own "reassign the case to an available
   *  reviewer" — kept as a real, honest count of how many times this
   *  case has been auto-escalated back to QC_PENDING for SLA breach,
   *  since this app has no real "available reviewer" tracking to
   *  reassign to directly (see resolveQcSlaEscalation.ts's own
   *  header for the real, honest scope this reflects). */
  slaEscalationCount: number;
  createdAt: string;
  resolvedAt?: string;
}

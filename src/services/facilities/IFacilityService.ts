// src/services/facilities/IFacilityService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Canonical Facility type + service interface. Replaces IClientService.ts's
// Client entirely (renamed, not a new type sitting alongside the old one).
//
// Real feature, per direct confirmation: "One record per facility. Multiple
// roles attached to that record... Example: Facility: Fenwick General
// Hospital — Role: Performing Lab, Role: Internal Submitting Location,
// Role: Internal Ordering Client (if applicable), Role: HL7/FHIR Routing
// Endpoint (if applicable). This keeps the identity unified while allowing
// the system to treat the facility differently depending on context."
//
// Replaces the old clientType: 'internal' | 'external' toggle (which forced
// a facility to be exactly one of two things, and drove the domain leakage
// this whole redesign started from — AI/timeout settings living on every
// Client regardless of type) with `roles: FacilityRole[]`. Config sections
// are now gated by role membership, not by a fixed internal/external
// branch: HL7 settings only apply when hl7_routing_endpoint is present, AI
// Orchestrator/Model/idle-timeout only apply when performing_lab is
// present (confirmed directly: "AI inference is strictly part of the
// performing lab's diagnostic workflow... AI configuration should be gated
// exclusively by the performing_lab role"), report delivery/TAT/escalation
// only apply when an ordering-client role is present.
//
// The AI/timeout settings that briefly lived in their own
// services/performingLabs/IPerformingLabService.ts (a real, separate
// service + its own admin screen) are folded directly back onto Facility
// here — that split solved the domain-leakage problem but created a real
// workflow problem instead ("I would need to go to the client dictionary
// to create the internal client, update those settings, then go to the
// performing lab section to apply those responses, not very good
// workflow"). One record, one screen, sections gated by role checkboxes,
// is the actual fix for both problems at once.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import type { Jurisdiction } from '../../types/systemConfig';

export type FacilityRole =
  | 'performing_lab'
  | 'internal_submitting_location'
  | 'internal_ordering_client'
  | 'external_ordering_client'
  | 'hl7_routing_endpoint';

export const FACILITY_ROLE_LABELS: Record<FacilityRole, string> = {
  performing_lab: 'Performing Lab',
  internal_submitting_location: 'Internal Submitting Location',
  internal_ordering_client: 'Internal Ordering Client',
  external_ordering_client: 'External Ordering Client',
  hl7_routing_endpoint: 'HL7/FHIR Routing Endpoint',
};

export interface FacilityHL7Settings {
  sendingFacility: string;    // MSH-4
  receivingFacility: string;  // MSH-6
  hl7Version: string;         // e.g. "2.5.1"
  enabled: boolean;
}

export interface FacilityReportingPreferences {
  reportFormat: 'PDF' | 'HL7' | 'Both';
  deliveryMethod: 'Email' | 'Fax' | 'Portal' | 'HL7';
  autoRelease: boolean;
  copyToReferring: boolean;
}

export interface Facility {
  id: ID;
  name: string;
  /** HL7v2/FHIR Assigning Authority — the organizational namespace/
   *  facility/system that assigns identifiers (case numbers, accession
   *  numbers, local specimen IDs) for this facility. Same field, same
   *  crosswalk role (matched against
   *  IncomingOrder.externalAssigningAuthority) as before the rename. */
  assigningAuthority: string;
  address: string;
  /** Optional — not populated by existing seed data or most consumers. */
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  fax: string;
  email: string;

  // ── Contact person name — medical-grade schema, same model as
  // Patient/Physician. All optional since a facility's contact person is
  // itself optional data. See utils/personName.ts.
  contactNamePrefix?: string;
  contactGivenNames?: string;
  contactFamilyNames?: string;
  contactPreferredName?: string;
  contactNameSuffix?: string;
  /** @deprecated Use contactGivenNames/contactFamilyNames. Derived
   *  display string, kept for FacilityTable.tsx and any other consumer
   *  reading a single contact name string. */
  contactName?: string;
  contactTitle?: string;
  notes?: string;

  /** Real feature, per direct confirmation: "One record per facility.
   *  Multiple roles attached to that record." Replaces the old
   *  clientType: 'internal' | 'external' toggle — a facility can hold
   *  any combination of roles simultaneously (e.g. performing_lab +
   *  internal_submitting_location on the same record). Every config
   *  section below that used to be gated by clientType === 'internal'
   *  or 'external' is now gated by roles.includes(...) instead — see
   *  each section's own doc comment for which role(s) it depends on.
   *  Defaults to ['external_ordering_client'] for a brand-new facility
   *  — the common case (most facilities added by an admin are
   *  external ordering clients); revisit per real facility. */
  roles: FacilityRole[];
  /** General "parent facility" relationship — an affiliate points to
   *  its parent institution's Facility.id. Not specific to any one
   *  role: a facility's parent might itself hold different roles than
   *  the affiliate does. */
  parentId?: string;
  /**
   * Which facility's lab actually performs work ordered by this
   * facility. Real, admin-configured data — set once, deliberately —
   * never inferred from who happens to be logged in or accessioning at
   * the time. Resolution: this field if set, else the facility's own id
   * if it holds the performing_lab role, else undefined (a facility
   * with no performing_lab role and no override has no lab of its own
   * by definition, and must have this set explicitly).
   *
   * This is administrative/default attribution only — which facility is
   * nominally responsible for another's work. Deliberately separate
   * from real-time physical specimen tracking (where a given block
   * actually sits right now), which is a real, larger, separate
   * concept, flagged as future work, not built here.
   */
  performingLabFacilityId?: string;
  /** Only meaningful when roles includes 'hl7_routing_endpoint' —
   *  otherwise present but unused/not surfaced in the editor. */
  hl7: FacilityHL7Settings;
  /** Only meaningful when roles includes 'internal_ordering_client' or
   *  'external_ordering_client' — otherwise present but unused/not
   *  surfaced in the editor. */
  reporting: FacilityReportingPreferences;

  /**
   * Per-facility jurisdiction — drives patient ID validation (NHS Number
   * vs CHI Number vs US MRN, etc.), date/time locale, and terminology
   * (SNOMED/ICD-10 variant). SystemConfig.jurisdiction remains the
   * fallback default for contexts with no facility resolved yet.
   */
  jurisdiction: Jurisdiction;

  /**
   * Which of the two CAP/NSH-recognized specimen/block labeling patterns
   * this facility's accessioning uses. See the original doc comment
   * (preserved from Client) for the full CAP/RCPath reasoning — a single
   * enum, not two independent alpha/numeric toggles, since that
   * guideline exists specifically to prevent a block ID ever being
   * mistakable for a specimen ID at a glance:
   *   'alpha-specimen'   — Specimen A, B, C... / Block A1, A2, A3...
   *   'numeric-specimen' — Specimen 1, 2, 3... / Block 1A, 1B, 1C...
   * Defaults to 'alpha-specimen'.
   */
  specimenLabelStyle?: 'alpha-specimen' | 'numeric-specimen';

  /**
   * Real feature, per direct confirmation: "AI configuration should be
   * gated exclusively by the performing_lab role." Only meaningful when
   * roles includes 'performing_lab' — resolution still goes through
   * resolvePerformingLabFacilityId() below to whichever facility
   * actually performs the work, same as every other performing-lab-
   * scoped setting. null/undefined = inherit the org-level default (see
   * components/Config/AI/orchestratorModeConfig.ts).
   */
  internalAiOrchestratorEnabled?: boolean | null;
  /** Only meaningful when roles includes 'performing_lab'. Deliberately
   *  gated, not freely settable: per direct product decision, this can
   *  only be set to a model this exact facility has a `reported`
   *  ValidationStudy for, graded PASS. See
   *  resolveClientAiModel.ts's hasPassingValidationForModel(). */
  internalAiModelId?: string | null;
  /** Only meaningful when roles includes 'performing_lab'. Resolved via
   *  resolvePerformingLabFacilityId() against whichever facility is
   *  actually performing the work on the currently-open case. */
  idleTimeoutMinutesOverride?: number | null;
  /** Real, per direct guidance's own Code Review Pool design - only
   *  meaningful when roles includes 'performing_lab'. Resolved via
   *  resolvePerformingLabFacilityId(), same as idleTimeoutMinutesOverride
   *  above. A real percentage (0-100) rolled once per case at real
   *  sign-out (finalizeCase()) - null/undefined means no random
   *  sampling for this lab, same "absence means off" convention as
   *  idleTimeoutMinutesOverride. Deliberately separate from the
   *  manual flagging path (CodeReviewPoolEntry.source) - a case can
   *  land in the pool via either path independently, never both
   *  conflated into one signal. */
  codeReviewSamplingRatePercent?: number | null;
  /** Real, per direct guidance's own Feature Specification refinement
   *  (Pathology Billing Rules Engine & Audit Logging, "Opt-in Core"):
   *  when true, a real charge created for this facility's own
   *  performing lab starts as DRAFT (ServiceChargeRecord.approvalStatus)
   *  and genuinely requires a real, different approver before it can
   *  ever export - the Four-Eyes Principle, enforced at charge
   *  creation. False/undefined (the real, default state) preserves
   *  today's existing behavior exactly: a charge is created with no
   *  approvalStatus at all, treated by getEffectiveChargeStatus
   *  (mockServiceChargeService.ts) as already-cleared - same "absence
   *  means off" convention as codeReviewSamplingRatePercent above.
   *  Resolved via resolvePerformingLabFacilityId(), same real
   *  resolution as that field too - a lab-wide policy, not a
   *  per-order or per-pathologist one. */
  requireBillingApproval?: boolean;
  /**
   * Real feature, per direct specification: Post-Sign-Out Release
   * Buffer, Phase 2. Facility-level override for the org-wide default —
   * resolved via resolvePerformingLabFacilityId(), same as every other
   * performing-lab-scoped setting above. Deliberately an explicit
   * inheritSystemDefault flag, NOT the simpler "null/undefined means
   * inherit" shape idleTimeoutMinutesOverride above uses — per direct
   * specification's own, explicit "Inherit System Default: Toggle
   * (ON/OFF) — Facility Level Only" UI requirement: one clear switch an
   * admin can see and flip, not an implicit "leave it blank" convention.
   * enabled/durationMinutes/bypassForStat are only meaningful when
   * inheritSystemDefault is false.
   */
  releaseBufferOverride?: {
    inheritSystemDefault: boolean;
    enabled: boolean;
    durationMinutes: number;
    bypassForStat: boolean;
  } | null;

  status: 'Active' | 'Inactive' | 'Unverified';
  /** True if this facility was auto-created by order-intake resolution
   *  (crosswalk had no match for the facility code on an incoming
   *  order) rather than configured by an admin. */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /** Free-text note left by whatever created a pending facility — e.g.
   *  the raw facility code/name string from the source order that
   *  didn't match anything. */
  autoCreatedNote?: string;

  /** Only meaningful for ordering-client roles. Age threshold (in
   *  years) below which a patient is considered pediatric. Null = not
   *  configured — admin must verify with this facility before enabling. */
  pediatricAgeThreshold: number | null;
  /** User IDs explicitly approved to report pediatric cases from this
   *  facility. Both this AND canViewPediatric on the user record must
   *  be true (Option C). */
  authorizedPediatricPathologistIds: string[];
  // ── TAT configuration — only meaningful for ordering-client roles ──────────
  /** Hours from receivedDate before a first-touch escalation fires.
   *  Null = use system default (SystemConfig.defaults.tatFirstTouchHours). */
  tatFirstTouchHours: number | null;
  /** Total case TAT target in hours (receivedDate → finalizedAt).
   *  Null = use system default (SystemConfig.defaults.tatTotalHours). */
  tatTotalHours: number | null;
  /** Roles to notify when a TAT threshold is breached. Empty = no
   *  notifications. (Notification roles — unrelated to FacilityRole
   *  above, kept as its own separate union same as before the rename.) */
  escalationTargets: ('pathGroup' | 'admin' | 'referrer')[];
  /** Urgency level applied to escalation alerts for this facility. */
  escalationPriority: 'high' | 'critical';

  createdAt?: string;
  updatedAt?: string;
}

export type FacilityInput = Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Resolves which facility's lab performs work ordered by the given
 * facility. Pure and data-only — reads exactly two stored facts
 * (performingLabFacilityId, roles), nothing derived from session/login
 * context. See Facility.performingLabFacilityId's own doc comment for
 * the full reasoning.
 *
 * Returns undefined for a facility with no performing_lab role and no
 * override set — that's a real configuration gap, worth surfacing
 * rather than silently guessing.
 */
export function resolvePerformingLabFacilityId(facility: Facility): string | undefined {
  if (facility.performingLabFacilityId) return facility.performingLabFacilityId;
  if (facility.roles.includes('performing_lab')) return facility.id;
  return undefined;
}

export interface IFacilityService {
  getAll(): Promise<ServiceResult<Facility[]>>;
  getById(id: ID): Promise<ServiceResult<Facility>>;
  add(facility: Omit<Facility, 'id'>): Promise<ServiceResult<Facility>>;
  update(id: ID, changes: Partial<Omit<Facility, 'id'>>): Promise<ServiceResult<Facility>>;
  deactivate(id: ID): Promise<ServiceResult<Facility>>;
  reactivate(id: ID): Promise<ServiceResult<Facility>>;
  /** Flips an Unverified facility to Active — the admin-approval step. */
  verify(id: ID): Promise<ServiceResult<Facility>>;
  /**
   * Called by order-intake / crosswalk resolution. No exact crosswalk
   * match on the order's facility code → creates an Unverified,
   * autoCreated facility so processing can continue immediately,
   * defaulting to no pediatric/TAT configuration (safest default —
   * forces explicit admin setup rather than silently inheriting another
   * facility's settings) until an admin reconciles it. Mirrors
   * IPhysicianService.findOrCreateByNpi and
   * ISpecimenCategoryService.findOrCreateByName exactly.
   */
  findOrCreateByAssigningAuthority(assigningAuthority: string, name: string, note?: string): Promise<ServiceResult<Facility>>;
}

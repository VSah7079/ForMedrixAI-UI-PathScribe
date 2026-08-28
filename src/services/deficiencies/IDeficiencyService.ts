// src/services/deficiencies/IDeficiencyService.ts
// ─────────────────────────────────────────────────────────────
// The general-purpose Specimen/Requisition Deficiency pattern — modeled
// on CoPathPlus's Specimen/Requisition Deficiency + Resolution dictionary
// pair, reviewed earlier this session. First concrete use: "Could Not
// Match Specimen to Dictionary" (Accession page order import), but the
// pattern is deliberately generic — any future deficiency type (label
// mismatch, container damaged, insufficient volume, missing requisition)
// reuses this same engine, not a bespoke flag per scenario.
//
// Two small admin-curated dictionaries (DeficiencyType, ResolutionType)
// plus the actual records (SpecimenDeficiency) raised against a specimen
// and resolved by whoever has the context to resolve it — deliberately
// NOT the "unblock now, admin approves later" governance pattern used
// for Physician/Client/SpecimenCategory. That pattern fits an unrecognized
// *code* with an unambiguous key to dedupe against (NPI, Client.assigningAuthority).
// A deficiency doesn't have that — it's a workflow event, not an entity
// needing deduplication — and per the design discussion, the person
// best positioned to resolve it (the accessioner, looking at the actual
// specimen and order) should do so directly, not defer to an admin queue.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

// ─── Deficiency Type dictionary ─────────────────────────────────────────────

export interface DeficiencyType {
  id: ID;
  name: string;
  description?: string;
  status: 'Active' | 'Inactive';
  /** Which context this deficiency type is meaningful in — a case-wide
   *  issue (e.g. "Missing Requisition," which covers the whole order's
   *  paperwork, not any one specimen) isn't the same thing as a
   *  specimen-specific one (e.g. "Container Damaged"). Filters which
   *  types show up in ReportDeficiencyModal depending on whether it
   *  was opened from the case-level or specimen-level trigger — a real,
   *  confirmed gap found during the Accession page bug-list review,
   *  where every type showed up in both contexts regardless of whether
   *  it actually applied. Optional and defaults to 'both' when absent
   *  (existing/external data that predates this field, or a type an
   *  admin hasn't classified yet) — the safe, permissive default rather
   *  than silently hiding a type nobody's explicitly scoped. */
  level?: 'case' | 'specimen' | 'both';
}

export interface IDeficiencyTypeService {
  getAll(): Promise<ServiceResult<DeficiencyType[]>>;
  add(type: Omit<DeficiencyType, 'id'>): Promise<ServiceResult<DeficiencyType>>;
  update(id: ID, changes: Partial<Omit<DeficiencyType, 'id'>>): Promise<ServiceResult<DeficiencyType>>;
  deactivate(id: ID): Promise<ServiceResult<DeficiencyType>>;
  reactivate(id: ID): Promise<ServiceResult<DeficiencyType>>;
}

// ─── Resolution Type dictionary ─────────────────────────────────────────────

export interface ResolutionType {
  id: ID;
  name: string;
  description?: string;
  status: 'Active' | 'Inactive';
}

export interface IResolutionTypeService {
  getAll(): Promise<ServiceResult<ResolutionType[]>>;
  add(type: Omit<ResolutionType, 'id'>): Promise<ServiceResult<ResolutionType>>;
  update(id: ID, changes: Partial<Omit<ResolutionType, 'id'>>): Promise<ServiceResult<ResolutionType>>;
  deactivate(id: ID): Promise<ServiceResult<ResolutionType>>;
  reactivate(id: ID): Promise<ServiceResult<ResolutionType>>;
}

// ─── The actual deficiency record ───────────────────────────────────────────

export interface SpecimenDeficiency {
  id: ID;
  caseId: string;
  /** Real, per direct guidance's own decision ahead of the Firestore
   *  CAPA foundation build: added now, deliberately optional — making
   *  this required would break every existing raise()/raiseAndResolve()
   *  call site across the app (fixative-time gate, tissue discrepancy,
   *  pre-analytic date gate, dictionary-mismatch), none of which
   *  currently populate it. Real, going forward: every NEW real write
   *  (especially FirestoreSpecimenDeficiencyService's own and any real
   *  backend-raised deficiency) should populate this — retrofitting a
   *  scoping field onto already-written Firestore documents later is
   *  real, avoidable migration work this app doesn't have yet, so this
   *  is added before the first real document exists, not after. */
  organisationId?: string;
  /** Same real reasoning as organisationId above — optional for the
   *  same existing-call-site reason, but a specimen deficiency is
   *  usually resolvable to a real Site via its own case's
   *  originSiteId/originHospitalId when a caller has that context. */
  siteId?: string;
  /**
   * Optional as of a previous pass — not every real deficiency is tied
   * to one specific specimen. "Missing Requisition" is the clearest
   * example: the paperwork covers the whole case/order, not one
   * particular specimen. Omit both fields entirely for a genuinely
   * case-level issue; the UI shows "Case-level" wherever these would
   * otherwise display a specimen name.
   */
  specimenId?: string;
  /** Denormalized for display without a join — the specimen label at the
   *  time the deficiency was raised (e.g. "A"). Omitted for case-level
   *  deficiencies — see specimenId's own comment. */
  specimenLabel?: string;

  deficiencyTypeId: string;
  /** Free-text context captured when raised — e.g. the raw order text
   *  that didn't match anything. Distinct from the specimen's own
   *  accessioner-entered `comment` field. */
  comment?: string;

  /**
   * Real 3-stage CAPA lifecycle, not a simple open/closed flag —
   * matches ISO 15189:2022 Clause 8.7, which requires a genuine
   * effectiveness check after a corrective action, not just marking
   * something done and moving on.
   *   open                 — raised, no corrective action taken yet.
   *   pending-verification — corrective action taken, sitting until
   *                          someone actually confirms it worked.
   *   closed               — effectiveness verified. Actually done.
   * If verification finds the issue recurred, status goes back to
   * 'open' (see reopenCount) rather than introducing a fourth status —
   * a reopened issue needs exactly the same corrective-action treatment
   * a fresh one does, so it belongs back in the same queue.
   *
   * raiseAndResolve() still exists and still goes straight to 'closed'
   * — deliberately skips this lifecycle. The auto-detected/auto-fixed
   * flows (dictionary mismatch resolved on the spot, fixative time
   * documented, a post-hoc field correction) don't have anything
   * meaningful to verify later: the fix and the record of the fix are
   * the same action. The verification stage is for real open issues
   * that sat unresolved for a while, raised via raise() alone.
   */
  status: 'open' | 'pending-verification' | 'closed';
  /** 'system' for auto-detected deficiencies (e.g. no dictionary match
   *  found during order import) — vs a user id if a person raised it
   *  manually. */
  raisedBy: string;
  raisedAt: string;

  // ── Corrective action — captured moving open → pending-verification, ────
  // ── or immediately at raiseAndResolve() time for instant-fix flows ──────
  resolutionTypeId?: string;
  /** General comment on how this was resolved — used by the instant
   *  raiseAndResolve() flows (dictionary match, fixative time, post-hoc
   *  correction), where the fix and the record of the fix are the same
   *  action. For the multi-stage manual flow, correctiveAction/
   *  preventiveAction below are the more structured equivalent. */
  resolutionComment?: string;
  /** What was actually done to fix this specific occurrence — the
   *  multi-stage manual flow's equivalent of resolutionComment. */
  correctiveAction?: string;
  /** Real, per Epic reference document, Section 3 ("Root Cause
   *  Analysis (RCA)") and per direct guidance: why this actually
   *  happened - distinct from correctiveAction (what was done about
   *  this one occurrence) and preventiveAction (what stops it
   *  recurring). Only meaningful for the escalation path (resolve()
   *  below) - an immediately-contained item (containImmediately())
   *  never gets this deep, by design: it's the quick, no-further-
   *  follow-up path specifically for issues that don't warrant a
   *  formal root-cause analysis at all. */
  rootCause?: string;
  /** What prevents this from recurring — distinct from correctiveAction,
   *  which only fixes the one instance in front of you. Optional: not
   *  every deficiency type has a meaningful systemic prevention step. */
  preventiveAction?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  /** Target date for the effectiveness check — when someone should come
   *  back and confirm the corrective action actually worked. Only
   *  meaningful for the multi-stage manual flow — instant
   *  raiseAndResolve() flows go straight to 'closed', nothing to verify
   *  later. */
  verificationDueDate?: string;

  // ── Effectiveness check — captured moving pending-verification → ────────
  // ── closed (or back to open, if it recurred) ────────────────────────────
  verifiedBy?: string;
  verifiedAt?: string;
  verificationOutcome?: 'effective' | 'recurred';
  verificationComment?: string;
  /** How many times this specific record has been reopened after a
   *  failed effectiveness check — 0 for anything still on its first
   *  pass through the lifecycle. Visible context for anyone deciding
   *  how seriously to take a lingering issue. */
  reopenCount?: number;

  /**
   * Back-reference to the ManagementReview batch this record was
   * included in — undefined means "closed, but not yet covered by a
   * management review." ISO 15189's Management Review is a periodic,
   * top-level activity that looks at trends across a batch of records
   * at once, not a per-item sign-off — see ManagementReview below.
   */
  managementReviewId?: string;
}

/**
 * A single Management Review session — ISO 15189's own required
 * periodic activity, distinct from resolving or verifying any one
 * deficiency. Reviews a batch of closed records at once (everything
 * closed since the last review, typically) looking for patterns —
 * "closed 14 deficiencies this quarter, no systemic pattern" is the
 * real shape of this activity, not 14 separate checkmarks. This is
 * also what makes a real Management Review report possible later:
 * a batch review naturally has a date, a reviewer, and a scope, which
 * is exactly what that document needs.
 */
export interface ManagementReview {
  id: ID;
  /** Same real reasoning as SpecimenDeficiency.organisationId — added
   *  now, before the Firestore CAPA foundation build, so real reviews
   *  are scoped from their first real write rather than retrofitted
   *  later. Deliberately no siteId here — ISO 15189 Management Review
   *  is a lab/organisation-level activity by nature, and a real review
   *  can legitimately span multiple sites within one organisation. */
  organisationId?: string;
  reviewedBy: string;
  reviewedAt: string;
  /** Which closed deficiencies were included in this review's scope. */
  deficiencyIds: string[];
  /** Overall pattern/trend observations — the actual point of doing
   *  this as a batch rather than per-item. */
  findings: string;
}

export interface IManagementReviewService {
  getAll(): Promise<ServiceResult<ManagementReview[]>>;
  /** Creates a review covering the given deficiency ids, and stamps
   *  managementReviewId onto each of those SpecimenDeficiency records
   *  so "closed but unreviewed" can be queried directly. */
  create(review: Omit<ManagementReview, 'id' | 'reviewedAt'>): Promise<ServiceResult<ManagementReview>>;
}

export interface ISpecimenDeficiencyService {
  getAll(): Promise<ServiceResult<SpecimenDeficiency[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<SpecimenDeficiency[]>>;
  getBySpecimenId(specimenId: string): Promise<ServiceResult<SpecimenDeficiency[]>>;
  /** Creates an open deficiency. */
  raise(deficiency: Omit<SpecimenDeficiency, 'id' | 'status' | 'raisedAt' | 'resolutionTypeId' | 'resolutionComment' | 'correctiveAction' | 'preventiveAction' | 'resolvedBy' | 'resolvedAt' | 'verificationDueDate' | 'verifiedBy' | 'verifiedAt' | 'verificationOutcome' | 'verificationComment' | 'reopenCount'>): Promise<ServiceResult<SpecimenDeficiency>>;
  /**
   * Moves an open deficiency to 'pending-verification' — NOT closed.
   * Captures the corrective action taken and a target date to actually
   * come back and check it worked. This is the real multi-stage manual
   * flow — the "Escalate to CAPA" action; see verifyEffectiveness()
   * for the step that actually closes something out.
   */
  resolve(id: ID, resolution: {
    resolutionTypeId: string; correctiveAction: string; rootCause: string; preventiveAction?: string;
    resolvedBy: string; verificationDueDate?: string;
  }): Promise<ServiceResult<SpecimenDeficiency>>;
  /**
   * Real, per direct guidance: the "Immediate Containment" action —
   * resolves an EXISTING open deficiency straight to 'closed',
   * deliberately skipping pending-verification and never asking for
   * rootCause. Same real posture raiseAndResolve() already has for a
   * brand-new deficiency (the fix and the record of the fix are the
   * same action, nothing meaningful to verify later) — this is that
   * same shape, for an issue that was already open rather than one
   * just detected. Not every open issue warrants a full RCA/
   * escalation; this is the quick, contained-on-the-spot path for the
   * ones that don't.
   */
  containImmediately(id: ID, resolution: {
    resolutionTypeId: string; resolutionComment: string; resolvedBy: string;
  }): Promise<ServiceResult<SpecimenDeficiency>>;
  /**
   * The effectiveness check itself — ISO 15189:2022 Clause 8.7's actual
   * requirement, not just a formality. 'effective' closes the record
   * for good. 'recurred' sends it back to 'open' (not a new status —
   * a reopened issue needs the same corrective-action treatment a fresh
   * one does) and increments reopenCount, so a pattern of failed fixes
   * stays visible rather than looking identical to a first occurrence.
   */
  verifyEffectiveness(id: ID, verification: {
    outcome: 'effective' | 'recurred'; comment?: string; verifiedBy: string;
  }): Promise<ServiceResult<SpecimenDeficiency>>;
  /**
   * Convenience for the common case where resolution happens in the same
   * breath as detection (e.g. Accession page: the deficiency is detected
   * and resolved within one session, before the specimen record even
   * exists yet as anything other than a form draft) — raises and closes
   * in one call rather than two round-trips. Deliberately skips the
   * pending-verification stage entirely — see SpecimenDeficiency.status's
   * own doc comment for why: the fix and the record of the fix are the
   * same action here, nothing meaningful to verify later.
   */
  raiseAndResolve(
    deficiency: Omit<SpecimenDeficiency, 'id' | 'status' | 'raisedAt' | 'resolutionTypeId' | 'resolutionComment' | 'correctiveAction' | 'preventiveAction' | 'resolvedBy' | 'resolvedAt' | 'verificationDueDate' | 'verifiedBy' | 'verifiedAt' | 'verificationOutcome' | 'verificationComment' | 'reopenCount'>,
    resolution: { resolutionTypeId: string; resolutionComment?: string; resolvedBy: string }
  ): Promise<ServiceResult<SpecimenDeficiency>>;
  /** Stamps managementReviewId onto the given records — called by
   *  IManagementReviewService.create(), not meant to be called directly
   *  from UI code. Kept on this service (rather than the review one)
   *  since it's a write to SpecimenDeficiency records specifically. */
  markReviewed(deficiencyIds: string[], managementReviewId: string): Promise<ServiceResult<void>>;
}

// src/types/autopsy/AutopsyCaseDetails.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Comprehensive Requirements Specification:
// Autopsy Pathology Module" (direct guidance). This is Phase 1 of an
// 8-phase build — the core data model everything else (jurisdiction
// rules, PAD/FAD generation, HTA retention, worklist integration)
// attaches to.
//
// Real, deliberate architectural fit confirmed before writing this:
// autopsy cases are real Case records (types/case/Case.ts), flowing
// through the SAME real WorklistPage.tsx/SynopticReportPage.tsx
// pipeline every other specimen category already uses — per direct
// guidance's own expectation ("that will likely touch the worklist
// and the synoptic report page"), NOT a fully separate, parallel flow
// the way Cytology got its own dedicated screening page. Autopsy is
// distinguished via a new SpecimenCategory entry (the same real,
// established mechanism this app already uses for "what kind of case
// is this, and what workflow does it need" — never a second, parallel
// case-type discriminator invented here), with this real, autopsy-
// specific detail structure attached to the Case when that category
// applies.
//
// Real, confirmed reuse: Jurisdiction (types/systemConfig.ts) already
// covers all 13 real jurisdictions this spec names (US, CA, GB_EW,
// GB_SCT, GB_NIR, IE, AU, NZ, KR, BE, NL, DE, FR) — no new
// jurisdiction enum needed anywhere in this module.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

/** Real, per spec §2 — the two fundamentally different real legal
 *  workflows. Medicolegal/forensic cases proceed under a judicial
 *  order with no NOK consent requirement or override right;
 *  hospital/consented cases require real, revocable NOK
 *  authorization. These are never blended — a case is one or the
 *  other, determined at case creation, not something that can be
 *  silently reclassified later without a real, deliberate case
 *  transfer (out of scope for this pass — see this module's own
 *  README for the real, remaining open questions this spec doesn't
 *  resolve). */
export type AutopsyCaseAuthority = 'medicolegal_forensic' | 'hospital_consented';

/** Real, per spec §2.A's own named examples — kept as a plain string
 *  rather than a closed union: the spec's own list ("Medical
 *  Examiners (US/CA), Coroners (UK, NZ, AU), Procurators Fiscal
 *  (Scotland), Examining Magistrates/Police (EU, KR)") is real and
 *  jurisdiction-specific, but a real site's own local terminology may
 *  vary in ways this module has no reason to reject outright. */
export type ForensicInitiatingAuthorityType = string;

export interface ForensicAuthorization {
  /** Real, per spec — the real person/office that issued the legal
   *  mandate this case proceeds under. */
  authorityType: ForensicInitiatingAuthorityType;
  authorityName?: string;
  /** Real, per direct guidance's own confirmed research across all 14
   *  real jurisdictions: "In urgent, weekend, or after-hours
   *  situations, the authority... may issue a verbal directive to
   *  secure the scene, transport the body, or begin preliminary
   *  non-invasive procedures. The verbal instruction must always be
   *  followed by formal written authorization." This is real,
   *  distinct authorization for the temporary-accession/intake stage
   *  — logged the moment the call happens, well before written
   *  paperwork exists — never sufficient on its own for gross
   *  examination (resolveAutopsyGrossExaminationGate.ts checks
   *  orderReference/orderDate below, never these two, for exactly
   *  that reason: "Forensic pathologists will not make incisions...
   *  without signed written authorization in hand or on file"). */
  verbalOrderReceivedAt?: string;
  verbalOrderReceivedFrom?: string;
  /** Real, per spec §2.A — "Judicial order or legal mandate." A real,
   *  traceable reference (case/order number), never a free-text
   *  justification standing in for an actual legal authorization.
   *  Real, per direct guidance's own confirmed research: the real,
   *  mandatory WRITTEN order (e.g. Form 6 in England & Wales, a
   *  Coroner Order/Form 1 in Canada, an Ordonnance aux fins
   *  d'autopsie in France) — required before gross examination, even
   *  when a real verbal order already authorized intake above. */
  orderReference: string;
  orderDate: string;
}

/** Real, per spec §2.B — who consented, on what basis, and whether
 *  that consent has since been narrowed or withdrawn. The actual
 *  jurisdiction-specific PRIORITY rules governing which relative may
 *  consent (US state law vs. UK HTA 2004 vs. NZ Coroners Act 2006)
 *  are real, pure decision logic — see
 *  resolveConsentingRelativePriority.ts, Phase 2 of this build — kept
 *  deliberately OUT of this type: a type should record what actually
 *  happened, not encode the rule that made it valid. */
export interface HospitalConsentRecord {
  consentingRelativeName: string;
  /** e.g. 'spouse', 'adult_child', 'parent', 'sibling' — the real
   *  relationship this consent's own priority was validated against. */
  consentingRelativeRelationship: string;
  consentGivenAt: string;
  /** Real, per spec §2.B — consent can be scoped (e.g. "diagnostic
   *  tissue only, no organ retention") rather than blanket. Plain
   *  strings, not a closed union — a real consent form's own scope
   *  language varies by site and jurisdiction. */
  consentScope: string[];
  /** Real, per spec §2.B — "Consent can be withdrawn or narrowed by
   *  NOK at any point prior to procedure completion." Undefined until
   *  a real withdrawal/narrowing genuinely happens.
   *
   *  TODO — Real, known technical debt (subsequent pass, not this
   *  one): this one field conflates two genuinely different real
   *  events — a full revocation (must hard-block gross exam) and a
   *  mere scope narrowing (should only constrain what's examined/
   *  retained, e.g. "no brain retention," never block gross exam
   *  itself) — with only a free-text revocationNote to (unreliably)
   *  tell them apart. resolveAutopsyGrossExaminationGate.ts cannot
   *  safely distinguish the two from this shape today, so it blocks
   *  on either, conservatively. Real, recommended fix: replace this
   *  with a real, structured `status: 'ACTIVE' | 'NARROWED' |
   *  'REVOKED'`, separate `revokedAt`/`narrowedAt` timestamps, and a
   *  real `scopeConstraints: string[]` — so a real NARROWED consent
   *  can return allowed: true with its own real constraints surfaced
   *  on the gross-exam workbench banner, while only REVOKED
   *  hard-blocks. */
  revokedOrNarrowedAt?: string;
  revocationNote?: string;
}

/** Real, per spec §6 — determines which grossing template and
 *  cross-scope validation rules apply (hard-blocks / warnings for
 *  specimens outside the selected scope). */
export type AutopsyScope = 'full' | 'head_neck_only' | 'trunk_visceral_only';

export type AutopsyReportTier = 'PAD' | 'FAD';

/** Real, per spec §1's own "Architectural Foundation & Data Flow" —
 *  "Upon electronic signature, LIMS freezes the JSON data payload."
 *  `frozenPayload` is deliberately typed as `unknown` here rather
 *  than a named AutopsyReportContent type: that type is Phase 5 of
 *  this build (the PAD/FAD report-generation phase) and doesn't exist
 *  yet — this snapshot's own real job (recording that a freeze
 *  happened, by whom, when) doesn't depend on that type existing
 *  first. Real, deliberate: never re-narrow this to a real type
 *  without updating every existing reader, since a genuinely frozen
 *  historical payload's own shape must never silently change meaning
 *  after the fact. */
export interface AutopsyReportSnapshot {
  tier: AutopsyReportTier;
  frozenPayload: unknown;
  signedBy: { name: string; isPathologist: boolean };
  signedAt: string;
}

/** Real, per spec §3's own Addenda Architecture — "Post-sign-off
 *  findings... attached as timestamped addenda without mutating the
 *  signed original FAD payload." Never edits or replaces
 *  `fadSnapshot.frozenPayload` — always additive. */
export interface AutopsyAddendum {
  id: string;
  content: string;
  reason: string;
  addedBy: { name: string; isPathologist: boolean };
  addedAt: string;
}

/** Real, per spec §5 — only real/applicable for HTA-governed
 *  jurisdictions (UK HTA 2004, Scotland HTA 2006, NZ Coroners Act
 *  2006) — resolveHtaApplicability.ts, Phase 2, is the real, pure
 *  gate for whether this field means anything at all for a given
 *  case's own jurisdiction. Genuinely undefined, never a default
 *  'tier_0', for a non-HTA jurisdiction — a real absence, not a real
 *  answer of "nothing retained." */
export type OrganRetentionTier =
  | 'tier_0_no_retention'
  | 'tier_1_diagnostic_tissue_only'
  | 'tier_2_full_organ_retention'
  | 'tier_3_education_research_genomic';

export interface OrganRetentionDisposalRecord {
  disposalMethod: 'cremation' | 'incineration';
  disposalTimestamp: string;
  /** Real, per spec §5 — "audited log of disposal timestamps,
   *  certificates." A real, traceable certificate reference, not a
   *  bare "yes we disposed of it" boolean. */
  certificateReference: string;
}

/** Real, per spec §4's own Ancillary Hold Logic — "SLA timers pause
 *  (In-Ancillary-Hold) when waiting on external laboratory
 *  toxicology or specialized fixed-brain neuropathology slicing,
 *  segregating external delays from internal lab velocity." */
export interface AncillaryHoldState {
  active: boolean;
  reason?: string;
  startedAt?: string;
  /** Real, per spec — a hold can end (external result returns)
   *  without the case itself resolving yet; kept separate from
   *  `active` flipping back to false so a real, historical record of
   *  how long each hold lasted survives past the hold's own end. */
  endedAt?: string;
}

export interface AutopsyCaseDetails {
  jurisdiction: Jurisdiction;
  caseAuthority: AutopsyCaseAuthority;
  /** Present when, and only when, caseAuthority is
   *  'medicolegal_forensic'. */
  forensicAuthorization?: ForensicAuthorization;
  /** Present when, and only when, caseAuthority is
   *  'hospital_consented'. */
  hospitalConsent?: HospitalConsentRecord;
  scope: AutopsyScope;
  padSnapshot?: AutopsyReportSnapshot;
  fadSnapshot?: AutopsyReportSnapshot;
  /** Real, per spec §3 — only ever appended to, only ever real after
   *  a real fadSnapshot already exists. */
  addenda: AutopsyAddendum[];
  organRetentionTier?: OrganRetentionTier;
  organRetentionDisposal?: OrganRetentionDisposalRecord;
  ancillaryHold: AncillaryHoldState;
}

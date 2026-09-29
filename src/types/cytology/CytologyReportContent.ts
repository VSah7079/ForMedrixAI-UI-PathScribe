// src/types/cytology/CytologyReportContent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "I don't believe we have a defined
// template defined" — followed by the real, authoritative Bethesda
// System/CAP/CLIA standard structure for a complete, compliant GYN
// cytology report, supplied directly. Seven real, mandatory/standard
// sections; this type mirrors them exactly:
//   1. Administrative & Patient Identifiers
//   2. Specimen Type
//   3. Specimen Adequacy
//   4. General Categorization
//   5. Interpretation / Diagnostic Result
//   6. Adjunctive Testing & Integrated Results
//   7. Educational Notes, Comments, & Sign-Off
//
// Real, per direct guidance's own follow-up: the three real, standard
// §1 sub-items once noted as a real, honest gap here — hormonal
// status, prior abnormal-Pap/HPV/procedure history, IUD/contraception
// use — now have a genuine data source (Patient.ts), captured at real
// accessioning alongside lastMenstrualPeriod. All three below.
//
// Real, standard §7 sign-off requirement: "Name and signature/
// electronic sign-off of the reviewing Cytotechnologist (if screened
// and finalized as NILM) and/or Pathologist (mandatory for any
// abnormal, suspicious, or high-risk findings)." Real, per this app's
// own review-history model (Phase 5): the Cytotechnologist who
// performed the real, initial primary_screen and the person who
// actually signed out are genuinely two different real attributions,
// captured separately here — never collapsed into one "signed by."
// ─────────────────────────────────────────────────────────────────────────────

import type { CisoeAScore } from './CisoeAScore';
import type { ImageAssociation } from '@/types/imageAssociation/ImageAssociation';
import type { ResolvedPrintBranding } from '@/types/config/FacilityBranding';

export interface CytologyReportContent {
  // ── 1. Administrative & Patient Identifiers ─────────────────────────────
  patientName: string;
  patientDateOfBirth?: string;
  patientMrn?: string;
  accessionNumber: string;
  orderingProvider?: string;
  specimenCollectedAt?: string;
  specimenReceivedAt?: string;
  lastMenstrualPeriod?: string;
  hormonalStatus?: 'premenopausal' | 'perimenopausal' | 'postmenopausal' | 'pregnant';
  priorAbnormalPapHpvHistory?: string;
  iudOrContraceptionUse?: string;

  // ── 2. Specimen Type ─────────────────────────────────────────────────────
  /** Real, per the specimen's own real dictionary entry — covers both
   *  the specimen type and its real anatomic origin (e.g. "Cervical/
   *  Vaginal Pap Smear, liquid-based"), not a separately-modeled field. */
  specimenTypeDescription: string;
  preparationMethod?: 'Liquid-Based' | 'Conventional';

  // ── 3. Specimen Adequacy ─────────────────────────────────────────────────
  specimenAdequacy: string[];

  // ── 4. General Categorization ────────────────────────────────────────────
  generalCategorization?: string;

  // ── 5. Interpretation / Diagnostic Result ────────────────────────────────
  primaryInterpretation: string;
  additionalInterpretations: string[];
  /** Real, per direct guidance: only ever populated for a real CISOE-A
   *  (PALGA/Netherlands) review — the raw, native 6-component matrix,
   *  captured here at real sign-out time alongside the Bethesda-
   *  translated `primaryInterpretation` above (never instead of it),
   *  since every existing resolver still reads the translated field.
   *  Snapshot posture matches this whole type's own real "always
   *  written, never edited" rule: if the underlying review is later
   *  changed, this sign-out's own real, historical score never moves. */
  cisoeAScore?: CisoeAScore;
  /** Real, per direct guidance's own UK CSMS registry work: a robust,
   *  explicit signal for deriving a real registry action code, rather
   *  than fragile string-matching on `primaryInterpretation`'s own
   *  display text. Mirrors the underlying review's own real field
   *  directly. */
  requiresPathologistReview: boolean;

  // ── 6. Adjunctive Testing & Integrated Results ───────────────────────────
  hpvResult?: string;
  computerAssistedScreening?: { used: boolean; system?: string };
  /** Real, per direct correction ("Cytology cases can have addendums...
   *  addendums are an essential standard for appending supplemental
   *  information to an already completed or signed-out case without
   *  altering the original signed text") — free-text supplemental
   *  content added after the original sign-out: reflex/ancillary
   *  testing (HPV co-testing beyond the structured hpvResult above,
   *  cell-block IHC, flow cytometry, NGS/molecular markers), an
   *  external consultation or second opinion, clinical correlation
   *  with later imaging/biopsy, or findings from delayed material
   *  review. Only ever set on a real addendum record
   *  (releaseCytologyAddendum.ts); undefined on every original sign-out
   *  and every real correction — this is additive content, never a
   *  replacement for primaryInterpretation, which stays exactly what
   *  it was on the record this addendum adds to. */
  addendumText?: string;

  // ── 7. Educational Notes, Comments, & Sign-Off ───────────────────────────
  recommendations: string[];
  educationalNotes?: string;
  /** The real Cytotechnologist who performed the initial, real
   *  primary_screen review — undefined only if that review is
   *  genuinely missing (should not happen for a real, signed-out
   *  case, but this type does not assume it). */
  screenedBy?: { name: string };
  /** Who actually signed this report out, and when — the real,
   *  attributable act itself (CytologySignOutRecord's own
   *  responsibility to populate correctly). */
  signedBy: { name: string; isPathologist: boolean };
  signedAt: string;
  /** Real, per direct follow-up on the image/PDF architecture
   *  scoping's own item 5 — real images and PDF attachments to embed
   *  into the generated report (e.g. a gross photo, a referral
   *  consult PDF). Each entry's own `imageUrl` is a real,
   *  already-resolved reference (services/imageAssociation/) — this
   *  type never carries the binary payload itself, same reference-
   *  only posture as everywhere else in this app. */
  imageAssociations?: ImageAssociation[];

  /** Real, per PS-277 §1.2.2 (Master Template Engine — conditional
   *  branding & header overrides). A pre-resolved reference, same
   *  posture as imageAssociations above — this type never resolves a
   *  Facility/Department/Enterprise hierarchy itself
   *  (services/facilities/resolveFacilityPrintBranding.ts is the real
   *  caller's own job, same as this file's header comment's existing
   *  "no formatting/letterhead... real caller decides" rule). Absent
   *  = render the plain, no-branding header exactly as before this
   *  batch — a real, honest "branding is optional" default, never a
   *  hard requirement. */
  printBranding?: ResolvedPrintBranding;
  /** Real, per PS-277 §1.2.2's own architecture guidance #2 — the
   *  case's own, already-existing component-split billing status
   *  (types/billing/ServiceChargeRecord.ts's billingType), threaded
   *  through so the renderer can toggle which branding fields actually
   *  print (see resolveFacilityPrintBranding.ts's own doc comment for
   *  the real, disclosed TC/26/Global distinction this drives).
   *  Undefined behaves exactly like 'Global'/'26' — the common case,
   *  full branding shown. */
  componentSplitBillingType?: 'TC' | '26' | 'Global';
  /** Real, per PS-277 §1.2.3 — this report's own performing lab's real,
   *  admin-configured print policy (Facility.forceAddendumOnDedicatedPagePrintPolicy),
   *  pre-resolved by the real caller. Only meaningful when addendumText
   *  above is actually set — a report with no addendum has nothing to
   *  force onto a page regardless of this flag. */
  forceAddendumOnDedicatedPage?: boolean;
}

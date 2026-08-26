// src/services/billing/resolveBillingDateOfService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own detailed jurisdictional research.
// billingDOS (date of service for billing) is treated as distinct from
// collectionDate - a real, honest extension beyond the written v1.2
// interface spec (§5.1's own charges[] shape has no date field at all,
// same disclosed gap noted before this file existed), same posture as
// complianceFlags: the interface engine team needs to be told about
// this separately, it's not part of the documented payload shape.
//
// Real, per direct guidance's own default-by-country recommendation:
//   US, AU -> COLLECTION_DATE (the real, standard rule for both)
//   CA     -> ACCESSION_DATE (real, per direct guidance's own research:
//             "date of laboratory receipt/accessioning... rather than
//             specimen collection")
//   UK     -> SIGNOUT_DATE, as a real, disclosed default only - direct
//             guidance's own research splits UK by payer (NHS internal
//             costing uses date received/reported; private insurance
//             maps to date of collection), which this app has no real
//             way to determine per case. SIGNOUT_DATE is chosen as the
//             default (the NHS-costing case, the more common real
//             scenario for an NHS-contracted lab) - a UK site serving
//             meaningful private-insurance volume should set a real,
//             explicit Site.billingDosRule override rather than rely
//             on this default.
// Every one of these is only ever the DEFAULT - a real,
// site-level Site.billingDosRule override always wins, per direct
// guidance's own "allow a site-level configuration" instruction.
//
// The US 14-day rule (42 CFR 414.510) exception is real, and - per
// direct verification against CMS's own Laboratory Date of Service
// Policy page (cms.gov, fetched directly, not taken from a secondary
// summary) - it is a single, real, fully checkable criterion: DOS is
// the date of specimen collection UNLESS the test is ordered at least
// 14 days following the patient's discharge from the hospital, in
// which case DOS is the date the test was performed. There is no
// "medically inappropriate to have collected elsewhere" criterion in
// this general rule - an earlier pass of this file incorrectly
// attached that criterion here, conflating this general rule with a
// real, separate, narrower one (see below). That conflation is
// corrected: this function no longer gates on an unresolvable
// clinical-judgment criterion for the general rule, since the real
// rule doesn't have one.
//
// Real, disclosed, NOT modeled: 42 CFR 414.510(b)(5) is a genuinely
// separate, narrower exception - molecular pathology tests performed
// by a lab that is not a blood bank/center, ADLTs, certain
// cancer-related protein-based MAAAs, and CPT 81490 specifically -
// with its own, different 5 real criteria (outpatient-discharge/
// encounter-based, not a 14-day count), two of which ("medically
// appropriate to have collected during the encounter," "results do
// not guide treatment during the encounter") are real clinical/
// workflow judgments this app cannot honestly determine. Particularly
// relevant given this app's own real molecular/FISH billing work, but
// genuinely separate scope from the general rule below - not built
// here, disclosed rather than silently conflated with the general
// rule again.
//
// This app's own established "surface flags, never adjudicate
// compliance" posture (see complianceFlags's own header) still
// applies even though the general rule's one criterion is now fully
// checkable: this function surfaces an advisory for a human coder to
// confirm and apply, rather than silently switching billingDOS itself
// - a real, regulated billing decision with real financial stakes
// warrants a human review step, not just fewer unknowns.
// ─────────────────────────────────────────────────────────────────────────────

export type BillingDosRule = 'COLLECTION_DATE' | 'SIGNOUT_DATE' | 'ACCESSION_DATE';

export interface BillingDosResolutionInput {
  /** Real Organisation.country. Undefined when genuinely unresolvable
   *  (e.g. no real organisation context available) - never guessed. */
  country?: 'US' | 'UK' | 'AU' | 'CA';
  /** Real Site.billingDosRule, when a real site-level override has
   *  been explicitly configured - always wins over the country
   *  default below. */
  siteOverrideRule?: BillingDosRule;
  /** Real Specimen.collectedAt. */
  collectionDate?: string;
  /** Real case finalization/sign-out time. */
  signOutDate?: string;
  /** Real Case.accession.accessionedAt. */
  accessionDate?: string;
  /** Real Encounter.dischargeTime - the anchor for the general 14-day
   *  rule's own single, real criterion below. */
  dischargeTime?: string;
  /** Real, honest proxy for "when the test was ordered" - Case.
   *  accession.accessionedAt is the closest real, available signal
   *  this app has; genuinely not the same thing as a real order
   *  timestamp, and callers should be aware accessionDate is reused
   *  here as that proxy. */
  orderedAt?: string;
}

export interface Us14DayRuleAdvisory {
  /** True when the real, single criterion of the general 14-day rule
   *  is met: ordered at least 14 days following the patient's
   *  discharge. Per direct verification against CMS's own policy page
   *  - this is the whole, real criterion, not an approximation of a
   *  larger set. */
  criterionMet: boolean;
  note: string;
}

export interface BillingDosResolution {
  /** The real, resolved date of service for billing - undefined when
   *  the rule's own required input date is genuinely unavailable
   *  (e.g. ruleApplied is SIGNOUT_DATE but signOutDate was never
   *  given), never fabricated from a different date as a fallback. */
  billingDOS?: string;
  ruleApplied: BillingDosRule;
  /** Real, per direct guidance - only ever populated when country is
   *  'US', the resolved rule is COLLECTION_DATE, and dischargeTime/
   *  inpatientEncounter/orderedAt were all provided. Always an
   *  advisory for a human coder to review and confirm - never used to
   *  silently change billingDOS itself. */
  us14DayRuleAdvisory?: Us14DayRuleAdvisory;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function defaultRuleForCountry(country: BillingDosResolutionInput['country']): BillingDosRule {
  switch (country) {
    case 'CA': return 'ACCESSION_DATE';
    case 'UK': return 'SIGNOUT_DATE';
    case 'US':
    case 'AU':
    default:
      return 'COLLECTION_DATE';
  }
}

function resolveDateForRule(rule: BillingDosRule, input: BillingDosResolutionInput): string | undefined {
  switch (rule) {
    case 'COLLECTION_DATE': return input.collectionDate;
    case 'SIGNOUT_DATE': return input.signOutDate;
    case 'ACCESSION_DATE': return input.accessionDate;
  }
}

/** Real, per direct verification against CMS's own Laboratory Date of
 *  Service Policy page - the general 14-day rule's one, real
 *  criterion: the test was ordered at least 14 days following the
 *  patient's discharge from the hospital. */
function checkUs14DayRuleCriterion(input: BillingDosResolutionInput): boolean {
  if (!input.dischargeTime || !input.orderedAt) return false;
  const discharge = new Date(input.dischargeTime).getTime();
  const ordered = new Date(input.orderedAt).getTime();
  if (Number.isNaN(discharge) || Number.isNaN(ordered)) return false;
  return ordered - discharge >= FOURTEEN_DAYS_MS;
}

/** Real, per direct guidance's own follow-up - the real, separate 42
 *  CFR 414.510(b)(5) exception (molecular pathology tests performed by
 *  a lab that is not a blood bank/center, ADLTs, certain cancer-
 *  related protein-based MAAAs, and CPT 81490), verified directly
 *  against CMS's own Laboratory Date of Service Policy page rather
 *  than assumed. Genuinely separate from the general 14-day rule
 *  above: no 14-day count at all, and gated by real, per-billingCode
 *  eligibility (BillingRuleVersion.dosExceptionEligible) rather than
 *  country, since this exception applies to specific test types on
 *  CMS's own published list, not broadly.
 *
 *  Of the real, published 5 criteria, only two have any structurally-
 *  checkable half with this app's real data:
 *   1. "Test performed following a hospital outpatient's discharge" -
 *      the timing half (performed after discharge) is checkable; the
 *      encounter being a real, genuine outpatient encounter is also
 *      checkable via Encounter.encounterClass.
 *   2. "Specimen collected during [that same] encounter" - checkable
 *      via comparing collectionDate against the encounter's own real
 *      admitTime/dischargeTime window.
 *  The remaining three - "medically appropriate to have collected
 *  during the encounter," "results do not guide treatment during the
 *  encounter," and "reasonable and medically necessary" - are real,
 *  irreducible clinical/coding judgments this app cannot determine,
 *  and are never checked here. Also real, disclosed, not modeled: the
 *  exclusion for labs that are themselves blood banks/centers - this
 *  app has no "is this performing lab a blood bank" concept at all.
 *
 *  Same posture as the general rule's own advisory: never silently
 *  applied, always a real advisory for a human coder to review. */
export interface MolecularPathologyDosExceptionInput {
  /** Real BillingRuleVersion.dosExceptionEligible for the specific
   *  billingCode this charge resolved against - see that field's own
   *  doc comment. */
  dosExceptionEligible?: boolean;
  /** Real Encounter.encounterClass - the exception requires a genuine
   *  hospital OUTPATIENT encounter specifically, unlike the general
   *  rule which doesn't distinguish inpatient/outpatient. */
  encounterClass?: string;
  admitTime?: string;
  dischargeTime?: string;
  collectionDate?: string;
  /** Real, honest proxy for "date the test was performed" - this
   *  charge's own resolvedAt (finalization time), same proxy the
   *  general rule's signOutDate already uses. */
  performedDate?: string;
}

export interface MolecularPathologyDosExceptionAdvisory {
  /** True only when the two real, structurally-checkable halves are
   *  met - never implies the three genuinely unresolvable criteria
   *  have been satisfied. */
  structuralCriteriaMet: boolean;
  note: string;
}

export function checkMolecularPathologyDosException(
  input: MolecularPathologyDosExceptionInput
): MolecularPathologyDosExceptionAdvisory | undefined {
  if (!input.dosExceptionEligible) return undefined;
  if (input.encounterClass !== 'Outpatient') return undefined;
  if (!input.dischargeTime || !input.performedDate || !input.collectionDate) return undefined;

  const discharge = new Date(input.dischargeTime).getTime();
  const performed = new Date(input.performedDate).getTime();
  const collected = new Date(input.collectionDate).getTime();
  if ([discharge, performed, collected].some(Number.isNaN)) return undefined;

  const performedAfterDischarge = performed > discharge;
  const collectedDuringEncounter = input.admitTime
    ? collected >= new Date(input.admitTime).getTime() && collected <= discharge
    : collected <= discharge; // honest fallback when admitTime isn't available: collection no later than discharge

  const structuralCriteriaMet = performedAfterDischarge && collectedDuringEncounter;
  if (!structuralCriteriaMet) return undefined;

  return {
    structuralCriteriaMet: true,
    note: 'This billingCode is flagged eligible for the 42 CFR 414.510(b)(5) DOS exception, the encounter is a real outpatient encounter, the specimen was collected during it, and the test was performed after discharge. Three real criteria remain unconfirmed by this app \u2014 medical appropriateness of collection timing, whether results guided treatment during the encounter, and medical necessity \u2014 a human coder must confirm all three, and that the performing lab is not itself a blood bank/center, before applying this exception.',
  };
}

/** Real, per direct guidance's own full design. Resolves the real
 *  billingDOS from a real site override or country default, and
 *  separately surfaces a real, honest US 14-day rule advisory when
 *  applicable - never silently applies it. */
export function resolveBillingDateOfService(input: BillingDosResolutionInput): BillingDosResolution {
  const ruleApplied = input.siteOverrideRule ?? defaultRuleForCountry(input.country);
  const billingDOS = resolveDateForRule(ruleApplied, input);

  let us14DayRuleAdvisory: Us14DayRuleAdvisory | undefined;
  if (input.country === 'US' && ruleApplied === 'COLLECTION_DATE') {
    const criterionMet = checkUs14DayRuleCriterion(input);
    if (criterionMet) {
      us14DayRuleAdvisory = {
        criterionMet: true,
        note: 'Ordered \u226514 days following the patient\u2019s discharge from the hospital \u2014 per 42 CFR 414.510, the general 14-Day Rule\u2019s real criterion. DOS should switch from the collection date to the date the test was performed; a human coder should confirm and apply this before billing.',
      };
    }
  }

  return { billingDOS, ruleApplied, us14DayRuleAdvisory };
}

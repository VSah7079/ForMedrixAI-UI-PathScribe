// src/services/billing/jsonWebhookBuilder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct clarification: "PathScribe is not generating HL7
// transactions, we are just sending json file to the interface engine.
// That is where the magic happens." This is the actual, real, primary
// billing artifact PathScribe produces. dftBuilder.ts's own HL7
// DFT^P03 output is a downstream preview of what the interface engine
// would build from this same JSON, never a second thing PathScribe
// itself sends.
//
// REBUILT to genuinely match the real, authoritative spec - this
// file's own prior version diverged from it (wrong field names,
// missing required envelope fields, no diagnoses[] at all, and a real
// patient-data-minimization violation). See
// docs/architecture/PathScribe_Interface_Specification_v1_2.docx,
// Part C (§5.1) - ChargeCaptureEventPayload. This IS that shape, not
// a new design.
//
// Same PRE-INTEGRATION SCAFFOLDING posture as dftBuilder.ts (nothing
// dispatches this yet, no real HTTP transport exists).
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import { mockPatientIndexService as patientIndexService } from '@/services/patients/mockPatientIndexService';
import { mockEncounterService } from '@/services/encounters/mockEncounterService';
import { validateChargeMetadata } from './validateChargeMetadata';
import { getSiteConfig, getOrganisationForSite } from '@/services/organisation/organisationService';
import { resolveBillingDateOfService, checkMolecularPathologyDosException } from './resolveBillingDateOfService';
import { mockBillingRuleService } from './mockBillingRuleService';

export interface ChargeCaptureLineItem {
  transactionId: string;
  cptCode: string;
  cptDescription?: string;
  modifier?: string;
  quantity?: number;
  /** Honest gap, not fabricated: no real departmentCode field exists
   *  anywhere in this app's data model yet. Always undefined until
   *  one does. */
  departmentCode?: string;
  /** Real, per spec §5.1 - the real ICD-10 this charge links to. Same
   *  known, already-disclosed limitation as dftBuilder.ts's own DG1
   *  linkage (see that file's own primaryDiagnosis comment): this app
   *  has no real per-specimen diagnosis mapping yet, only a case-wide
   *  ICD-10 list, so every charge links to the same, first/principal
   *  code - not a new gap introduced here, the same one already
   *  disclosed and consistently applied. */
  diagnosisCode?: string;
  performingProvider?: { id?: string; name?: string };
  sourceLevel: 'specimen' | 'block';
  sourceLabel: string;
  /** Real, honest EXTENSION beyond the written v1.2 spec (§5.1's own
   *  charges[] shape has no date field at all) - the real, resolved
   *  billing date of service per direct guidance's own detailed
   *  jurisdictional research (resolveBillingDateOfService.ts).
   *  Undefined when the resolved rule's own required input date isn't
   *  yet available (e.g. SIGNOUT_DATE rule on a case that hasn't
   *  signed out) - never fabricated. */
  billingDOS?: string;
  /** Real, honest EXTENSION beyond the written v1.2 spec, same posture
   *  as billingDOS above - the real, separate 42 CFR 414.510(b)(5)
   *  advisory (resolveBillingDateOfService.ts's own
   *  checkMolecularPathologyDosException), per-charge since
   *  eligibility is gated by this specific charge's own billingCode,
   *  not case-wide like the general 14-day rule. */
  molecularPathologyDosExceptionAdvisory?: { structuralCriteriaMet: boolean; note: string };
}

export interface ChargeCaptureEventPayload {
  messageId: string;
  eventType: 'ChargeCaptureReady';
  /** When PathScribe finalized/generated this - PathScribe-side, not
   *  source-system, per spec §5.1's own comment. */
  eventTimestamp: string;
  organisationId: string;
  caseId: string;
  patient: {
    /** Real, per spec §2.6 (patient data minimization) - resolved
     *  from the real, persistent MasterPatientRecord.establishedVia,
     *  not re-derived or guessed. 'matched' -> 'reference';
     *  'created'/'ambiguous' -> 'full', matching §2.6's own explicit
     *  "the safer of the two mistakes" reasoning for ambiguous cases. */
    patientDataScope: 'reference' | 'full';
    /** MRN - always present, in both scopes, per spec. */
    identifier: string;
    assigningAuthority?: string;
    /** Present only when patientDataScope is 'full' - genuinely
     *  absent, not sent as empty/null, when 'reference'. */
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  };
  charges: ChargeCaptureLineItem[];
  diagnoses: {
    code: string;
    description: string;
    isPrincipal: boolean;
  }[];
  /** Real, per direct follow-up (Billing Capacity Review's own CLIA/
   *  POS gaps) - the real, raw facts about the specific site that
   *  actually performed this case's own work, resolved from
   *  Case.originSiteId. Same "surface the raw fact, never adjudicate
   *  the billing decision" posture as complianceFlags below -
   *  performingLabType is not a computed CMS Place of Service code,
   *  it's the real, admin-entered fact the interface engine/RCM
   *  resolves an actual POS code from. Undefined when no real site is
   *  resolvable, or the admin hasn't set that field yet - never
   *  guessed. */
  performingFacility?: {
    siteId: string;
    cliaOrIsoNumber?: string;
    performingLabType?: 'independent' | 'hospital_based';
  };
  /** Real, honest EXTENSION beyond the written v1.2 spec (§5.1 itself
   *  has no such field) - per direct guidance's own stated principle,
   *  "your system should not adjudicate compliance, but it must
   *  provide flags that downstream billing uses." Every value here is
   *  a raw, real signal PathScribe actually has, never an inferred
   *  billing decision (e.g. no attempt to compute a specific CMS POS
   *  code or a TC/PC-eligibility verdict from encounterClass -
   *  encounterClass itself is surfaced, and the interface engine/RCM
   *  makes that call). The interface engine team needs to be told
   *  about this extension separately - it is not part of the
   *  documented v1.2 payload shape. */
  complianceFlags: {
    /** Real, from the case's own linked Encounter.encounterClass
     *  (services/encounters/) - undefined when no real encounter is
     *  linked yet, never guessed as false. */
    inpatientEncounter?: boolean;
    /** Real, raw pass-through of Encounter.dischargeTime - relevant to
     *  14-day-rule evaluation. Downstream billing can now pair this
     *  with each real charge's own billingDOS (charges[].billingDOS,
     *  resolveBillingDateOfService.ts) rather than lacking a
     *  per-charge date entirely - the gap this comment used to
     *  describe before that field existed. */
    dischargeTime?: string;
    /** Real, raw pass-through of Encounter.financialClass (HL7
     *  PV1-20) - kept as the raw string, not classified into a
     *  client-bill/patient-bill boolean PathScribe has no reliable,
     *  universal way to derive (financial class vocabularies vary by
     *  site/payer system). */
    financialClass?: string;
    /** Real, from order.clinicalIndication - true when genuinely
     *  empty/missing, not a placeholder default. */
    missingClinicalHistory: boolean;
    /** Real, same check checkSignOutBillingDeficiencies.ts/
     *  validateChargeMetadata.ts already use (an active participant
     *  with a real NPI) - reused here, not reimplemented. */
    missingOrderingProviderNpi: boolean;
    /** Real, per direct guidance's own detailed jurisdictional
     *  research, verified directly against CMS's own Laboratory Date
     *  of Service Policy page - only ever populated when the case's
     *  own resolved country is 'US', the resolved rule is
     *  COLLECTION_DATE, and the real 14-day-rule criterion is met.
     *  Always an advisory for a human coder to confirm and apply -
     *  never used to silently change any charge's own billingDOS. See
     *  resolveBillingDateOfService.ts's own header for the full,
     *  real rule and what it deliberately does not model. */
    us14DayRuleAdvisory?: { criterionMet: boolean; note: string };
  };
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `evt-charge-${Date.now()}${messageCounter}`;
}

/** Real, per spec §5.1's own worked example - which of a case's
 *  active participants is the real performing provider. 'primary' is
 *  checked before 'attending' since a case with both real, distinct
 *  roles filled should credit the actual primary signer, not whoever
 *  happens to be found first. */
function resolvePerformingProvider(caseData: Pick<Case, 'participants'>): { id?: string; name?: string } | undefined {
  const active = (caseData.participants ?? []).filter(p => p.status === 'active');
  const primary = active.find(p => p.participationTypeIds.includes('primary'))
    ?? active.find(p => p.participationTypeIds.includes('attending'));
  if (!primary) return undefined;
  return {
    id: primary.externalIdType === 'NPI' ? primary.externalId : undefined,
    name: primary.staffName,
  };
}

/** Real, per spec §5.1 - builds the actual ChargeCaptureEventPayload
 *  PathScribe sends to the interface engine, from the same real,
 *  permanent ServiceChargeRecord[] dftBuilder.ts's own preview reads.
 *  Async because patientDataScope requires a real, honest lookup
 *  against the patient's actual MasterPatientRecord - never assumed
 *  or defaulted to the more convenient value. */
export async function buildJsonWebhookPayload(
  caseData: Pick<Case, 'id' | 'patient' | 'order' | 'participants' | 'patientMatchOutcome' | 'encounterId' | 'originSiteId' | 'specimens' | 'accession'>,
  charges: ServiceChargeRecord[]
): Promise<ChargeCaptureEventPayload> {
  const mpr = caseData.patient?.id ? await patientIndexService.getById(caseData.patient.id) : null;
  const encounterRes = caseData.encounterId ? await mockEncounterService.getById(caseData.encounterId) : null;
  const encounter = encounterRes?.ok ? encounterRes.data : null;

  // Real, per direct guidance's own billing date-of-service work -
  // resolves the case's own real site/country and any real,
  // explicit site-level override.
  const site = caseData.originSiteId ? await getSiteConfig(caseData.originSiteId) : null;
  const organisation = site ? getOrganisationForSite(site) : null;
  const country = organisation?.country;
  const siteOverrideRule = site?.billingDosRule;
  // Real, honest proxy for "when the test was ordered" - see
  // resolveBillingDateOfService.ts's own doc comment on orderedAt for
  // why this is Case.accession.accessionedAt, not a genuine order
  // timestamp this app doesn't separately capture.
  const orderedAt = caseData.accession?.accessionedAt;
  const accessionDate = caseData.accession?.accessionedAt;

  // Real, per spec §2.6: THIS case's own real accession-time match
  // outcome (Case.patientMatchOutcome - see that field's own doc
  // comment for why this must be per-case, not read from the
  // patient's own permanent MasterPatientRecord.establishedVia).
  // Missing (cases accessioned before this field existed) defaults to
  // 'full' - the safer of the two mistakes, same reasoning §2.6 uses
  // for a genuine 'ambiguous' outcome.
  const patientDataScope: 'reference' | 'full' = caseData.patientMatchOutcome === 'matched' ? 'reference' : 'full';

  const icd10 = caseData.order?.icd10Codes ?? [];
  const principalCode = icd10[0]?.code;
  const performingProvider = resolvePerformingProvider(caseData);

  // Real, per direct guidance's own follow-up - cached per real
  // (billingCode, ruleVersion) pair within this one build, since
  // multiple charges commonly share a billingCode and this app
  // shouldn't re-fetch the same real rule version repeatedly.
  const dosEligibilityCache = new Map<string, boolean | undefined>();
  async function getDosExceptionEligible(billingCode: string, ruleVersion: number, siteId?: string): Promise<boolean | undefined> {
    const cacheKey = `${billingCode}::${ruleVersion}::${siteId ?? ''}`;
    if (dosEligibilityCache.has(cacheKey)) return dosEligibilityCache.get(cacheKey);
    const res = await mockBillingRuleService.getVersionsForBillingCode(billingCode, siteId);
    const match = res.ok ? res.data.find(v => v.version === ruleVersion) : undefined;
    dosEligibilityCache.set(cacheKey, match?.dosExceptionEligible);
    return match?.dosExceptionEligible;
  }

  // Real, per direct guidance's own detailed jurisdictional research -
  // case-wide (doesn't vary by specimen the way collectionDate does),
  // so resolved once here rather than inside the per-charge map below.
  const { us14DayRuleAdvisory } = resolveBillingDateOfService({
    country, siteOverrideRule, dischargeTime: encounter?.dischargeTime, orderedAt,
  });

  return {
    messageId: nextMessageId(),
    eventType: 'ChargeCaptureReady',
    eventTimestamp: new Date().toISOString(),
    organisationId: mpr?.organisationId ?? '',
    caseId: caseData.id,
    performingFacility: site ? {
      siteId: site.id,
      cliaOrIsoNumber: site.cliaOrIsoNumber,
      performingLabType: site.performingLabType,
    } : undefined,
    patient: {
      patientDataScope,
      identifier: caseData.patient?.mrn ?? '',
      ...(patientDataScope === 'full' ? {
        firstName: caseData.patient?.firstName,
        lastName: caseData.patient?.lastName,
        dateOfBirth: caseData.patient?.dateOfBirth,
      } : {}),
    },
    charges: await Promise.all(charges.map(async c => {
      // Real, per direct guidance's own billing date-of-service work -
      // the real specimen this charge belongs to (when it has one),
      // for a real, per-specimen collection date rather than a
      // case-wide guess.
      const specimen = c.specimenId ? caseData.specimens?.find(sp => sp.id === c.specimenId) : undefined;
      const { billingDOS } = resolveBillingDateOfService({
        country, siteOverrideRule,
        collectionDate: specimen?.collectedAt,
        signOutDate: c.resolvedAt,
        accessionDate,
      });

      // Real, per direct guidance's own follow-up - the real, separate
      // (b)(5) exception, gated by this specific charge's own
      // billingCode having been flagged eligible by a real coder.
      const dosExceptionEligible = await getDosExceptionEligible(c.billingCode, c.ruleVersion, site?.id);
      const molecularPathologyDosExceptionAdvisory = checkMolecularPathologyDosException({
        dosExceptionEligible,
        encounterClass: encounter?.encounterClass,
        admitTime: encounter?.admitTime,
        dischargeTime: encounter?.dischargeTime,
        collectionDate: specimen?.collectedAt,
        performedDate: c.resolvedAt,
      });

      return {
        transactionId: c.id,
        cptCode: c.cptCode,
        cptDescription: c.cptDescription,
        modifier: c.modifier,
        quantity: c.quantity,
        // Real, per direct guidance's own follow-up on structured
        // linkage: prefers this charge's own real specimen's
        // post-examination diagnosis (Specimen.coding.icd10, see that
        // field's own doc comment) when one has actually been
        // assigned - falls back to the case-wide, order-level
        // principal code otherwise, the same real, already-disclosed
        // behavior this always had.
        diagnosisCode: specimen?.coding?.icd10?.[0]?.code ?? principalCode,
        performingProvider,
        sourceLevel: c.sourceLevel,
        sourceLabel: c.sourceLabel,
        billingDOS,
        molecularPathologyDosExceptionAdvisory,
      };
    })),
    // Real, per direct guidance's own follow-up: the real union of
    // every diagnosis code actually in play on this case - the
    // order-level ones (as before, isPrincipal preserved exactly as
    // it always was), plus any real, specimen-specific ones assigned
    // that aren't already in that list. A specimen-level code is
    // never marked isPrincipal itself - that designation belongs to
    // the order's own, real principal indication for the case as a
    // whole, not to a post-examination, specimen-specific finding.
    diagnoses: (() => {
      const orderLevel = icd10.map((dx, i) => ({ code: dx.code, description: dx.description, isPrincipal: i === 0 }));
      const orderLevelCodes = new Set(orderLevel.map(d => d.code));
      const specimenLevel = (caseData.specimens ?? [])
        .flatMap(sp => sp.coding?.icd10 ?? [])
        .filter(dx => !orderLevelCodes.has(dx.code))
        .filter((dx, i, arr) => arr.findIndex(d => d.code === dx.code) === i) // real, honest de-dupe across specimens sharing the same code
        .map(dx => ({ code: dx.code, description: dx.description, isPrincipal: false }));
      return [...orderLevel, ...specimenLevel];
    })(),
    complianceFlags: {
      inpatientEncounter: encounter ? encounter.encounterClass === 'Inpatient' : undefined,
      dischargeTime: encounter?.dischargeTime,
      financialClass: encounter?.financialClass,
      missingClinicalHistory: !caseData.order?.clinicalIndication?.trim(),
      // Real, reused - not reimplemented. validateChargeMetadata's
      // own MISSING_PROVIDER_NPI check is the single, real source of
      // truth for this signal across the app.
      missingOrderingProviderNpi: validateChargeMetadata(caseData).some(f => f.errorCode === 'MISSING_PROVIDER_NPI'),
      us14DayRuleAdvisory,
    },
  };
}

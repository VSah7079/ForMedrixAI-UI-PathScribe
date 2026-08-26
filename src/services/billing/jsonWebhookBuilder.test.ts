// src/services/billing/jsonWebhookBuilder.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Real, working in-memory localStorage stub, same established pattern
// as mockPatientIndexService.test.ts - this test environment is plain
// Node, no browser storage natively available. buildJsonWebhookPayload
// genuinely calls the real mockPatientIndexService internally now
// (per spec §2.6), so this needs a real store, not a mocked one.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { buildJsonWebhookPayload } = await import('./jsonWebhookBuilder');
const { mockPatientIndexService } = await import('../patients/mockPatientIndexService');
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

const ORG = 'ORG-DVMC';

const baseCharge = (over: Partial<ServiceChargeRecord>): ServiceChargeRecord => ({
  id: 'chg-1', caseId: 'CASE-1', transactionType: 'charge',
  sourceLevel: 'specimen', sourceLabel: 'A',
  billingCode: '88305', cptCode: '88305', cptDescription: 'Code 88305 — Specimen Level',
  level: 'specimen', billingType: 'Global',
  ruleVersion: 1, resolvedAt: '2026-08-24T00:00:00.000Z', resolvedBy: 'system',
  ...over,
});

describe('buildJsonWebhookPayload — real, direct verification against the real spec', () => {
  beforeEach(() => { store.clear(); });

  it('resolves patientDataScope to reference when THIS case\'s own accession matched an existing patient', async () => {
    const created = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: ORG, mrn: '100009', firstName: 'Beatrice', lastName: 'Holloway', dateOfBirth: '1926-01-03',
    });
    const patientId = (created as any).patientId;

    // Real, per Case.patientMatchOutcome's own doc comment: THIS
    // specific case's own accession-time outcome, independent of how
    // the underlying identity was originally established.
    const caseData = { id: 'CASE-1', patientMatchOutcome: 'matched' as const, patient: { id: patientId, mrn: '100009', firstName: 'Beatrice', lastName: 'Holloway', dateOfBirth: '1926-01-03' } as any, order: { icd10Codes: [] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({})]);
    expect(payload.patient.patientDataScope).toBe('reference');
    expect(payload.patient.firstName).toBeUndefined();
    expect(payload.patient.identifier).toBe('100009');
    expect(payload.organisationId).toBe(ORG);
  });

  it('defaults to full when patientMatchOutcome is missing (a case accessioned before this field existed) - the safer of the two mistakes', async () => {
    const caseData = { id: 'CASE-1b', patient: { id: undefined, mrn: '100011', firstName: 'Legacy', lastName: 'Case', dateOfBirth: '1970-01-01' } as any, order: { icd10Codes: [] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({})]);
    expect(payload.patient.patientDataScope).toBe('full');
    expect(payload.patient.firstName).toBe('Legacy');
  });

  it('resolves patientDataScope to full for a genuinely new patient, and includes real demographics', async () => {
    const created = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: ORG, mrn: '100010', firstName: 'New', lastName: 'Patient', dateOfBirth: '1980-01-01',
    });
    const patientId = (created as any).patientId;
    const caseData = { id: 'CASE-2', patient: { id: patientId, mrn: '100010', firstName: 'New', lastName: 'Patient', dateOfBirth: '1980-01-01' } as any, order: { icd10Codes: [] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({})]);
    expect(payload.patient.patientDataScope).toBe('full');
    expect(payload.patient.firstName).toBe('New');
    expect(payload.patient.lastName).toBe('Patient');
  });

  it('builds a real diagnoses[] array from order.icd10Codes, with the first marked principal', async () => {
    const caseData = { id: 'CASE-3', patient: undefined as any, order: { icd10Codes: [{ code: 'C50.911', description: 'Malignant neoplasm of breast' }, { code: 'Z85.3', description: 'Personal history of breast cancer' }] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({})]);
    expect(payload.diagnoses).toHaveLength(2);
    expect(payload.diagnoses[0].isPrincipal).toBe(true);
    expect(payload.diagnoses[1].isPrincipal).toBe(false);
    expect(payload.diagnoses[0].code).toBe('C50.911');
  });

  it('links every charge to the real principal diagnosisCode', async () => {
    const caseData = { id: 'CASE-4', patient: undefined as any, order: { icd10Codes: [{ code: 'C18.9', description: 'Malignant neoplasm of colon' }] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({ id: 'chg-a' }), baseCharge({ id: 'chg-b' })]);
    expect(payload.charges).toHaveLength(2);
    expect(payload.charges.every(c => c.diagnosisCode === 'C18.9')).toBe(true);
  });

  it('resolves a real performingProvider from the active primary participant\'s NPI', async () => {
    const caseData = {
      id: 'CASE-5', patient: undefined as any, order: { icd10Codes: [] } as any,
      participants: [{ staffId: 'PATH-001', staffName: 'Dr. Pete Nimmo', externalId: '1234567890', externalIdType: 'NPI' as const, source: 'manual' as const, participationTypeIds: ['primary'], addedBy: 'PATH-001', addedAt: '2026-01-01T00:00:00.000Z', status: 'active' as const }],
    };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({})]);
    expect(payload.charges[0].performingProvider).toEqual({ id: '1234567890', name: 'Dr. Pete Nimmo' });
  });

  it('uses real envelope fields matching the spec exactly, not the old, wrong shape', async () => {
    const caseData = { id: 'CASE-6', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.eventType).toBe('ChargeCaptureReady');
    expect(payload.caseId).toBe('CASE-6');
    expect(payload.messageId).toMatch(/^evt-charge-/);
    expect(typeof payload.eventTimestamp).toBe('string');
  });

  it('flags missingClinicalHistory true when order.clinicalIndication is genuinely empty', async () => {
    const caseData = { id: 'CASE-7', patient: undefined as any, order: { icd10Codes: [], clinicalIndication: '   ' } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.complianceFlags.missingClinicalHistory).toBe(true);
  });

  it('flags missingClinicalHistory false when a real clinical indication is present', async () => {
    const caseData = { id: 'CASE-8', patient: undefined as any, order: { icd10Codes: [], clinicalIndication: 'Suspicious breast mass, left upper outer quadrant.' } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.complianceFlags.missingClinicalHistory).toBe(false);
  });

  it('flags missingOrderingProviderNpi using the same real check validateChargeMetadata uses, not a reimplementation', async () => {
    const withNpi = { id: 'CASE-9', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [{ staffId: 'p1', staffName: 'Dr. A', externalId: '1234567890', externalIdType: 'NPI' as const, source: 'manual' as const, participationTypeIds: ['primary'], addedBy: 'p1', addedAt: '2026-01-01T00:00:00.000Z', status: 'active' as const }] };
    const withoutNpi = { id: 'CASE-10', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [] };
    const payloadWith = await buildJsonWebhookPayload(withNpi as any, []);
    const payloadWithout = await buildJsonWebhookPayload(withoutNpi as any, []);
    expect(payloadWith.complianceFlags.missingOrderingProviderNpi).toBe(false);
    expect(payloadWithout.complianceFlags.missingOrderingProviderNpi).toBe(true);
  });

  it('leaves inpatientEncounter/dischargeTime/financialClass undefined when no real encounter is linked, never guessed', async () => {
    const caseData = { id: 'CASE-11', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.complianceFlags.inpatientEncounter).toBeUndefined();
    expect(payload.complianceFlags.dischargeTime).toBeUndefined();
    expect(payload.complianceFlags.financialClass).toBeUndefined();
  });

  it('resolves real inpatientEncounter/dischargeTime/financialClass from a real, linked Encounter', async () => {
    const { mockEncounterService } = await import('../encounters/mockEncounterService');
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: ORG, patientId: 'PAT-TEST', encounterNumber: 'ENC-1', encounterClass: 'Inpatient',
    });
    expect(created.ok).toBe(true);
    const encounterId = (created as any).data.id;
    await mockEncounterService.updateMetadata(encounterId, { financialClass: 'Self-Pay' }, new Date().toISOString());
    await mockEncounterService.updateStatus(encounterId, 'Discharged', new Date().toISOString(), '2026-08-20T00:00:00.000Z');

    const caseData = { id: 'CASE-12', encounterId, patient: undefined as any, order: { icd10Codes: [] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.complianceFlags.inpatientEncounter).toBe(true);
    expect(payload.complianceFlags.financialClass).toBe('Self-Pay');
    expect(payload.complianceFlags.dischargeTime).toBe('2026-08-20T00:00:00.000Z');
  });
});

describe('buildJsonWebhookPayload - real billing date-of-service wiring', () => {
  it('resolves a real, per-specimen billingDOS on each charge from the specimen\'s own collectedAt', async () => {
    const caseData = {
      id: 'CASE-DOS-1', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      originSiteId: 'SITE-MRI', // real, seeded UK site - see organisationService.ts
      specimens: [{ id: 'SP-1', label: 'A', description: 'Test specimen', collectedAt: '2026-08-01T00:00:00.000Z' }],
      accession: { accessionedAt: '2026-08-02T00:00:00.000Z' } as any,
    };
    const charge = baseCharge({ id: 'chg-dos-1', specimenId: 'SP-1', resolvedAt: '2026-08-05T00:00:00.000Z' });
    const payload = await buildJsonWebhookPayload(caseData as any, [charge]);
    // SITE-MRI resolves to a real UK organisation -> SIGNOUT_DATE default per resolveBillingDateOfService.ts
    expect(payload.charges[0].billingDOS).toBe('2026-08-05T00:00:00.000Z');
  });

  it('surfaces the real US 14-day rule advisory in complianceFlags when the real criterion is met', async () => {
    const { mockEncounterService } = await import('../encounters/mockEncounterService');
    const created = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-DVMC', patientId: 'PAT-DOS-TEST', encounterNumber: 'ENC-DOS-1', encounterClass: 'Inpatient',
    });
    const encounterId = (created as any).data.id;
    await mockEncounterService.updateStatus(encounterId, 'Discharged', new Date().toISOString(), '2026-07-01T00:00:00.000Z');

    const caseData = {
      id: 'CASE-DOS-2', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      originSiteId: 'SITE-DVMC-MAIN', // real, seeded US site
      encounterId,
      accession: { accessionedAt: '2026-07-20T00:00:00.000Z' } as any, // 19 real days post-discharge
    };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.complianceFlags.us14DayRuleAdvisory?.criterionMet).toBe(true);
  });
});

describe('buildJsonWebhookPayload - real diagnosis-to-specimen structured linkage', () => {
  it('a charge whose specimen has its own, real diagnosis code uses that code, not the case-wide order principal', async () => {
    const caseData = {
      id: 'CASE-LINK-1', patient: undefined as any, order: { icd10Codes: [{ code: 'Z12.31', description: 'Screening mammogram' }] } as any, participants: [],
      specimens: [{ id: 'sp-1', label: 'A', description: 'Left breast', coding: { icd10: [{ code: 'C50.911', description: 'Malignant neoplasm of breast' }] } }],
    };
    const charge = baseCharge({ specimenId: 'sp-1', sourceLabel: 'A' });
    const payload = await buildJsonWebhookPayload(caseData as any, [charge]);
    expect(payload.charges[0].diagnosisCode).toBe('C50.911');
  });

  it('a charge whose specimen has no real diagnosis of its own falls back to the case-wide order principal, exactly as before', async () => {
    const caseData = {
      id: 'CASE-LINK-2', patient: undefined as any, order: { icd10Codes: [{ code: 'Z12.31', description: 'Screening mammogram' }] } as any, participants: [],
      specimens: [{ id: 'sp-1', label: 'A', description: 'Left breast' }],
    };
    const charge = baseCharge({ specimenId: 'sp-1', sourceLabel: 'A' });
    const payload = await buildJsonWebhookPayload(caseData as any, [charge]);
    expect(payload.charges[0].diagnosisCode).toBe('Z12.31');
  });

  it('a charge with no specimenId at all (case-level) still uses the order principal', async () => {
    const caseData = { id: 'CASE-LINK-3', patient: undefined as any, order: { icd10Codes: [{ code: 'Z12.31', description: 'Screening mammogram' }] } as any, participants: [] };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({})]);
    expect(payload.charges[0].diagnosisCode).toBe('Z12.31');
  });

  it('diagnoses[] includes real, specimen-specific codes not already on the order, correctly marked non-principal', async () => {
    const caseData = {
      id: 'CASE-LINK-4', patient: undefined as any, order: { icd10Codes: [{ code: 'Z12.31', description: 'Screening mammogram' }] } as any, participants: [],
      specimens: [
        { id: 'sp-1', label: 'A', description: 'Left breast', coding: { icd10: [{ code: 'C50.911', description: 'Malignant neoplasm of breast' }] } },
        { id: 'sp-2', label: 'B', description: 'Right breast', coding: { icd10: [{ code: 'D24.1', description: 'Benign neoplasm of breast' }] } },
      ],
    };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({ specimenId: 'sp-1' })]);
    expect(payload.diagnoses).toHaveLength(3);
    expect(payload.diagnoses.find(d => d.code === 'Z12.31')?.isPrincipal).toBe(true);
    expect(payload.diagnoses.find(d => d.code === 'C50.911')?.isPrincipal).toBe(false);
    expect(payload.diagnoses.find(d => d.code === 'D24.1')?.isPrincipal).toBe(false);
  });

  it('diagnoses[] never duplicates a real code that already exists at the order level', async () => {
    const caseData = {
      id: 'CASE-LINK-5', patient: undefined as any, order: { icd10Codes: [{ code: 'C50.911', description: 'Malignant neoplasm of breast' }] } as any, participants: [],
      specimens: [{ id: 'sp-1', label: 'A', description: 'Left breast', coding: { icd10: [{ code: 'C50.911', description: 'Malignant neoplasm of breast' }] } }],
    };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({ specimenId: 'sp-1' })]);
    expect(payload.diagnoses).toHaveLength(1);
  });

  it('diagnoses[] never duplicates a real code shared across two specimens', async () => {
    const caseData = {
      id: 'CASE-LINK-6', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      specimens: [
        { id: 'sp-1', label: 'A', description: 'x', coding: { icd10: [{ code: 'K63.5', description: 'Polyp of colon' }] } },
        { id: 'sp-2', label: 'B', description: 'y', coding: { icd10: [{ code: 'K63.5', description: 'Polyp of colon' }] } },
      ],
    };
    const payload = await buildJsonWebhookPayload(caseData as any, [baseCharge({ specimenId: 'sp-1' })]);
    expect(payload.diagnoses).toHaveLength(1);
  });
});

describe('buildJsonWebhookPayload — real, per direct follow-up: performingFacility (CLIA/POS gaps)', () => {
  it('resolves performingFacility from the real, seeded site when Case.originSiteId matches one', async () => {
    const caseData = {
      id: 'CASE-FACILITY-1', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      specimens: [], originSiteId: 'SITE-DVMC-MAIN',
    };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.performingFacility?.siteId).toBe('SITE-DVMC-MAIN');
  });

  it('a real, admin-set cliaOrIsoNumber and performingLabType are genuinely reflected in the payload', async () => {
    const { updateSiteFacilitySetup } = await import('@/services/organisation/organisationService');
    await updateSiteFacilitySetup('SITE-DVMC-MAIN', { cliaOrIsoNumber: '05D1234567', performingLabType: 'hospital_based', updatedBy: 'test-admin' });
    const caseData = {
      id: 'CASE-FACILITY-2', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      specimens: [], originSiteId: 'SITE-DVMC-MAIN',
    };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.performingFacility?.cliaOrIsoNumber).toBe('05D1234567');
    expect(payload.performingFacility?.performingLabType).toBe('hospital_based');
  });

  it('performingFacility is genuinely undefined - never fabricated - when the case has no real, resolvable originSiteId', async () => {
    const caseData = {
      id: 'CASE-FACILITY-3', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      specimens: [], originSiteId: undefined,
    };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.performingFacility).toBeUndefined();
  });

  it('cliaOrIsoNumber/performingLabType are genuinely undefined - never fabricated - when a real site exists but hasn\'t had these fields set', async () => {
    const caseData = {
      id: 'CASE-FACILITY-4', patient: undefined as any, order: { icd10Codes: [] } as any, participants: [],
      specimens: [], originSiteId: 'SITE-MRI',
    };
    const payload = await buildJsonWebhookPayload(caseData as any, []);
    expect(payload.performingFacility?.siteId).toBe('SITE-MRI');
    expect(payload.performingFacility?.cliaOrIsoNumber).toBeUndefined();
    expect(payload.performingFacility?.performingLabType).toBeUndefined();
  });
});

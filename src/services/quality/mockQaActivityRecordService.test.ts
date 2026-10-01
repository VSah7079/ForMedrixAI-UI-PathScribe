import { describe, it, expect, beforeEach } from 'vitest';
import { mockQaActivityRecordService } from './mockQaActivityRecordService';
import { mockQaActivityTypeService } from './mockQaActivityTypeService';
import { mockSpecimenDeficiencyService } from '../deficiencies/mockSpecimenDeficiencyService';

// Real, minimal localStorage mock - same established pattern every
// other storage-backed service test in this app uses.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockQaActivityRecordService', () => {

  // Real, per direct guidance's own Stage 3 decision: the seed data is
  // now the full, faithful migration of mockReconciliationService.ts's
  // own real 175-record seed (7 discordant + 130 concordant + 38
  // teaching-case), plus the one real Cytology-Histology illustrative
  // record kept from Stage 2 - 176 total. Verified against the exact,
  // real counts confirmed directly in mockReconciliationService.ts's
  // own source, not assumed.
  it('seeds the real, full migration (176 records: 175 from Reconciliation + 1 Cytology-Histology)', async () => {
    const res = await mockQaActivityRecordService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBe(176);
  });

  it('migrated 10 real discordant, 165 real concordant records under Frozen vs Final (175 total, matching the real Reconciliation seed exactly)', async () => {
    const res = await mockQaActivityRecordService.getAll();
    if (!res.ok) return;
    const frozenFinal = res.data.filter(r => r.activityTypeId === 'qa-activity-frozen-final');
    // 7 original discordant seed + 3 real teaching-case discordant
    // entries (1 in the breast branch, i === 21 → teach-breast-22; 2
    // in the GI branch, i === 13/14 → teach-gi-14/teach-gi-15).
    expect(frozenFinal.filter(r => r.outcome === 'discordant').length).toBe(10);
    // 130 original concordant seed + 35 real teaching-case concordant
    // entries (21 of 22 breast + 14 of 16 GI).
    expect(frozenFinal.filter(r => r.outcome === 'concordant').length).toBe(165);
    expect(frozenFinal.filter(r => r.isTeachingOnboardingCase === true).length).toBe(38);
    expect(frozenFinal.length).toBe(175);
  });

  it('a real, known discordant record (disc-001) preserves its exact id and discrepancy detail through the migration', async () => {
    const res = await mockQaActivityRecordService.getAll();
    if (!res.ok) return;
    const disc001 = res.data.find(r => r.id === 'disc-001');
    expect(disc001).toBeDefined();
    expect(disc001?.delta).toBe('upgrade');
    expect(disc001?.severity).toBe('high');
    expect(disc001?.rootCause).toBe('sampling_error');
    // Real, honest fact about the actual seed data, confirmed directly:
    // the original disc-001..disc-007 entries predate the modal's own
    // mandatory-comment requirement and never had a comments field at
    // all - the migration faithfully preserves that real absence,
    // rather than fabricating one.
    expect(disc001?.comments).toBeUndefined();
  });

  it('a real teaching-case discordant record DOES carry a real comments narrative, faithfully preserved', async () => {
    const res = await mockQaActivityRecordService.getAll();
    if (!res.ok) return;
    // Real, known id from the actual teaching seed's own GI branch
    // (i === 13, the first of the two real invasive-adenocarcinoma
    // discordant entries).
    const teachGi14 = res.data.find(r => r.id === 'teach-gi-14');
    expect(teachGi14).toBeDefined();
    expect(teachGi14?.outcome).toBe('discordant');
    expect(teachGi14?.comments).toContain('Invasive component identified only on permanent deeper levels');
    expect(teachGi14?.isTeachingOnboardingCase).toBe(true);
    expect(teachGi14?.reviewerFeedback).toContain('classic teaching point');
    expect(teachGi14?.draftedBy?.userName).toBe('Oliver Pemberton');
  });

  it('the activity-specific comparison data lives in fieldValues, not as fixed properties', async () => {
    const res = await mockQaActivityRecordService.getAll();
    if (!res.ok) return;
    const record = res.data.find(r => r.id === 'disc-001');
    expect(record?.fieldValues.frozenCategory).toBe('atypical_suspicious');
    expect(record?.fieldValues.finalDx).toBe('DCIS, low grade');
    expect((record as any).frozenCategory).toBeUndefined();
    expect((record as any).finalDx).toBeUndefined();
  });

  it('proves genuine cross-activity-type use — a real record exists under the second, Cytology-Histology type', async () => {
    const res = await mockQaActivityRecordService.getAll();
    if (!res.ok) return;
    const cytoHisto = res.data.find(r => r.activityTypeId === 'qa-activity-cyto-histo');
    expect(cytoHisto).toBeDefined();
    expect(cytoHisto?.fieldValues.cytologyDx).toBeDefined();
  });

  it('create() generates a real id and recordedAt, prepending to the list', async () => {
    const before = await mockQaActivityRecordService.getAll();
    if (!before.ok) return;

    const res = await mockQaActivityRecordService.create({
      activityTypeId: 'qa-activity-frozen-final', caseId: 'CASE-NEW', caseType: 'Skin Shave',
      fieldValues: { frozenCategory: 'benign', finalCategory: 'benign', frozenDx: 'Nevus', finalDx: 'Nevus' },
      outcome: 'concordant', recordedBy: { userId: 'user-1', userName: 'Dr. Test' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.id).toBeTruthy();
    expect(res.data.recordedAt).toBeTruthy();

    const after = await mockQaActivityRecordService.getAll();
    if (!after.ok) return;
    expect(after.data.length).toBe(before.data.length + 1);
    expect(after.data[0].id).toBe(res.data.id);
  });

  describe('real, per direct guidance (PS-134) — generic capaTriggerRule consumption, never actually built anywhere before this', () => {
    // Real, per direct correction ("when would a CAPA be needed?"):
    // the real activity this mechanism was originally built for
    // (Abnormal/Critical Finding Confirmation) turned out to be the
    // wrong real-world fit for an automatic CAPA trigger — a primary
    // pathologist confirming their own finding is not a
    // nonconformity — so it no longer carries a capaTriggerRule at
    // all (see mockQaActivityTypeService.ts's own, fuller account).
    // The generic trigger-consumption logic itself is still real and
    // correct; this creates a genuinely new, dedicated test-only
    // activity type via the real, public add() API to exercise it in
    // isolation, rather than either resurrecting the removed rule or
    // unilaterally deciding a different, real seed activity should
    // carry one.
    let testActivityTypeId: string;
    beforeEach(async () => {
      const res = await mockQaActivityTypeService.add({
        name: 'Test-Only CAPA Trigger Fixture',
        tabScope: 'custom',
        fields: [{ id: 'note', label: 'Note', type: 'text', required: false, options: [] }],
        teachingOnboardingEnabled: false,
        active: true,
        createdBy: 'test-fixture',
        capaTriggerRule: { triggerSeverities: ['high'], deficiencyTypeId: 'def-confirmed-high-risk-finding' },
      });
      if (!res.ok) throw new Error('Test fixture setup failed');
      testActivityTypeId = res.data.id;
    });

    it('a discordant, high-severity record for an activity with a matching capaTriggerRule auto-raises a real CAPA deficiency', async () => {
      const before = await mockSpecimenDeficiencyService.getAll();
      if (!before.ok) return;

      const res = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-TEST',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'x' },
        outcome: 'discordant',
        severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      expect(res.ok).toBe(true);

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      expect(after.data.length).toBe(before.data.length + 1);
      const raised = after.data.find(d => d.caseId === 'CASE-CAPA-TEST');
      expect(raised).toBeDefined();
      expect(raised?.deficiencyTypeId).toBe('def-confirmed-high-risk-finding');
      expect(raised?.raisedBy).toBe('PATH-001');
    });

    it('PS-119: the review\'s own rootCause is wired through structurally onto the raised deficiency, not just buried in the comment', async () => {
      await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-ROOTCAUSE',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'x' },
        outcome: 'discordant',
        severity: 'high',
        rootCause: 'sampling_error',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      const raised = after.data.find(d => d.caseId === 'CASE-CAPA-ROOTCAUSE');
      expect(raised?.rootCause).toBe('Sampling error');
    });

    it('PS-119: when rootCause is "other", the review\'s own rootCauseNote is used as the deficiency\'s rootCause verbatim', async () => {
      await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-ROOTCAUSE-OTHER',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'x' },
        outcome: 'discordant',
        severity: 'high',
        rootCause: 'other',
        rootCauseNote: 'Freezer malfunction overnight.',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      const raised = after.data.find(d => d.caseId === 'CASE-CAPA-ROOTCAUSE-OTHER');
      expect(raised?.rootCause).toBe('Freezer malfunction overnight.');
    });

    it('PS-119: a discordant record with no rootCause recorded leaves the deficiency\'s rootCause genuinely absent, never a placeholder', async () => {
      await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-NO-ROOTCAUSE',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'x' },
        outcome: 'discordant',
        severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      const raised = after.data.find(d => d.caseId === 'CASE-CAPA-NO-ROOTCAUSE');
      expect(raised?.rootCause).toBeUndefined();
    });

    it('a concordant record never checks the trigger rule at all — nothing to grade', async () => {
      const before = await mockSpecimenDeficiencyService.getAll();
      if (!before.ok) return;

      await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-CONCORDANT', caseType: 'Skin Shave',
        fieldValues: { note: 'x' },
        outcome: 'concordant',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      expect(after.data.length).toBe(before.data.length);
    });

    it('never raises a duplicate CAPA when an open deficiency of the same type already exists for this case', async () => {
      const first = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-DEDUPE',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'first occurrence' },
        outcome: 'discordant', severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      expect(first.ok).toBe(true);

      const afterFirst = await mockSpecimenDeficiencyService.getAll();
      if (!afterFirst.ok) return;
      const countAfterFirst = afterFirst.data.filter(d => d.caseId === 'CASE-CAPA-DEDUPE').length;
      expect(countAfterFirst).toBe(1);

      // Real, per direct guidance: a second discordant, high-severity
      // record lands on the SAME case while the first deficiency is
      // still open — this must never raise a second, duplicate CAPA
      // record for the same real, unresolved issue.
      const second = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-DEDUPE',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'second, still-unresolved occurrence' },
        outcome: 'discordant', severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      expect(second.ok).toBe(true);

      const afterSecond = await mockSpecimenDeficiencyService.getAll();
      if (!afterSecond.ok) return;
      expect(afterSecond.data.filter(d => d.caseId === 'CASE-CAPA-DEDUPE').length).toBe(1);
    });

    it('raises a genuinely new CAPA once the earlier one for the same case/type has actually been closed', async () => {
      const first = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-REOPEN',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'first occurrence' },
        outcome: 'discordant', severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      if (!first.ok) return;

      const afterFirst = await mockSpecimenDeficiencyService.getAll();
      if (!afterFirst.ok) return;
      const raised = afterFirst.data.find(d => d.caseId === 'CASE-CAPA-REOPEN');
      expect(raised).toBeDefined();

      // Real, full close-out: resolve then verify effective.
      const resolved = await mockSpecimenDeficiencyService.resolve(raised!.id, {
        resolutionTypeId: 'res-1', correctiveAction: 'fixed', rootCause: 'x', resolvedBy: 'PATH-001',
      });
      expect(resolved.ok).toBe(true);
      const verified = await mockSpecimenDeficiencyService.verifyEffectiveness(raised!.id, {
        outcome: 'effective', verifiedBy: 'PATH-001',
      });
      expect(verified.ok).toBe(true);

      const second = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-REOPEN',
        caseType: 'Breast Core Bx',
        fieldValues: { note: 'genuinely new occurrence, after the first was closed' },
        outcome: 'discordant', severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      expect(second.ok).toBe(true);

      const afterSecond = await mockSpecimenDeficiencyService.getAll();
      if (!afterSecond.ok) return;
      expect(afterSecond.data.filter(d => d.caseId === 'CASE-CAPA-REOPEN').length).toBe(2);
    });

    it('does not treat an open deficiency on the same case but a DIFFERENT specimen as a duplicate', async () => {
      const first = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-MULTISPEC', caseType: 'Breast Core Bx',
        fieldValues: { note: 'x' },
        outcome: 'discordant', severity: 'high', specimenId: 'SPEC-A',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      expect(first.ok).toBe(true);

      const second = await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-MULTISPEC', caseType: 'Breast Core Bx',
        fieldValues: { note: 'x' },
        outcome: 'discordant', severity: 'high', specimenId: 'SPEC-B',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });
      expect(second.ok).toBe(true);

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      expect(after.data.filter(d => d.caseId === 'CASE-CAPA-MULTISPEC').length).toBe(2);
    });

    it('a discordant record with a non-matching severity never raises a deficiency', async () => {
      const before = await mockSpecimenDeficiencyService.getAll();
      if (!before.ok) return;

      await mockQaActivityRecordService.create({
        activityTypeId: testActivityTypeId,
        caseId: 'CASE-CAPA-LOW', caseType: 'Skin Shave',
        fieldValues: { note: 'x' },
        outcome: 'discordant', severity: 'low',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      expect(after.data.length).toBe(before.data.length);
    });

    it('a discordant, high-severity record for an activity type with NO configured capaTriggerRule (e.g. real Frozen/Final, or the real Abnormal/Critical Finding Confirmation activity) never raises anything', async () => {
      const before = await mockSpecimenDeficiencyService.getAll();
      if (!before.ok) return;

      await mockQaActivityRecordService.create({
        activityTypeId: 'qa-activity-frozen-final',
        caseId: 'CASE-CAPA-NORULE', caseType: 'Skin Shave',
        fieldValues: { frozenCategory: 'malignant', finalCategory: 'benign', frozenDx: 'x', finalDx: 'y' },
        outcome: 'discordant', severity: 'high',
        recordedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
      });

      const after = await mockSpecimenDeficiencyService.getAll();
      if (!after.ok) return;
      expect(after.data.length).toBe(before.data.length);
    });
  });
});

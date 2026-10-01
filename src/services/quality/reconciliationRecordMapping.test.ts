import { describe, it, expect } from 'vitest';
import { mapReconciliationRecordToQaActivityRecord, FROZEN_FINAL_ACTIVITY_TYPE_ID } from './reconciliationRecordMapping';
import type { ReconciliationRecord } from '@/types/quality/ReconciliationRecord';

function makeReconciliationRecord(overrides: Partial<ReconciliationRecord> = {}): ReconciliationRecord {
  return {
    id: 'rec-test-001', caseId: 'CASE-1', specimenId: 'SPEC-1', caseType: 'Breast Core Bx',
    frozenCategory: 'benign', finalCategory: 'benign',
    frozenDx: 'Fibroadenoma', finalDx: 'Fibroadenoma',
    outcome: 'concordant',
    recordedAt: '2026-01-01T00:00:00.000Z', recordedBy: { userId: 'user-1', userName: 'Dr. Test' },
    ...overrides,
  };
}

describe('mapReconciliationRecordToQaActivityRecord', () => {
  it('preserves the real, source id and recordedAt exactly, not regenerated', () => {
    const source = makeReconciliationRecord({ id: 'disc-007', recordedAt: '2026-03-13T00:00:00.000Z' });
    const mapped = mapReconciliationRecordToQaActivityRecord(source);
    expect(mapped.id).toBe('disc-007');
    expect(mapped.recordedAt).toBe('2026-03-13T00:00:00.000Z');
  });

  it('assigns the real, stable Frozen vs Final activity type id', () => {
    const mapped = mapReconciliationRecordToQaActivityRecord(makeReconciliationRecord());
    expect(mapped.activityTypeId).toBe(FROZEN_FINAL_ACTIVITY_TYPE_ID);
    expect(mapped.activityTypeId).toBe('qa-activity-frozen-final');
  });

  it('moves the activity-specific comparison fields into fieldValues, not as fixed top-level properties', () => {
    const source = makeReconciliationRecord({
      frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
      frozenDx: 'Atypical, favor benign', finalDx: 'DCIS, low grade',
    });
    const mapped = mapReconciliationRecordToQaActivityRecord(source);
    expect(mapped.fieldValues).toEqual({
      frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
      frozenDx: 'Atypical, favor benign', finalDx: 'DCIS, low grade',
    });
    expect((mapped as any).frozenCategory).toBeUndefined();
    expect((mapped as any).finalDx).toBeUndefined();
  });

  it('carries the generic, structural discrepancy-detail fields forward unchanged when discordant', () => {
    const source = makeReconciliationRecord({
      outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'sampling_error',
      rootCauseNote: undefined, escalationRequired: true, comments: 'A real narrative explanation.',
    });
    const mapped = mapReconciliationRecordToQaActivityRecord(source);
    expect(mapped.outcome).toBe('discordant');
    expect(mapped.delta).toBe('upgrade');
    expect(mapped.severity).toBe('high');
    expect(mapped.rootCause).toBe('sampling_error');
    expect(mapped.escalationRequired).toBe(true);
    expect(mapped.comments).toBe('A real narrative explanation.');
  });

  it('leaves discrepancy-detail fields undefined for a concordant record', () => {
    const mapped = mapReconciliationRecordToQaActivityRecord(makeReconciliationRecord({ outcome: 'concordant' }));
    expect(mapped.delta).toBeUndefined();
    expect(mapped.severity).toBeUndefined();
    expect(mapped.rootCause).toBeUndefined();
    expect(mapped.comments).toBeUndefined();
  });

  it('renames the Teaching & Onboarding fields per direct guidance - isTeachingCase/attendingFeedback become isTeachingOnboardingCase/reviewerFeedback', () => {
    const source = makeReconciliationRecord({
      isTeachingCase: true,
      draftedBy: { userId: 'user-2', userName: 'Dr. Trainee' },
      attendingFeedback: 'Good call on the frozen given limited tissue.',
    });
    const mapped = mapReconciliationRecordToQaActivityRecord(source);
    expect(mapped.isTeachingOnboardingCase).toBe(true);
    expect(mapped.reviewerFeedback).toBe('Good call on the frozen given limited tissue.');
    expect(mapped.draftedBy).toEqual({ userId: 'user-2', userName: 'Dr. Trainee' });
    expect((mapped as any).isTeachingCase).toBeUndefined();
    expect((mapped as any).attendingFeedback).toBeUndefined();
  });

  it('leaves the Teaching & Onboarding fields undefined for a non-teaching record', () => {
    const mapped = mapReconciliationRecordToQaActivityRecord(makeReconciliationRecord({ isTeachingCase: undefined, draftedBy: undefined, attendingFeedback: undefined }));
    expect(mapped.isTeachingOnboardingCase).toBeUndefined();
    expect(mapped.reviewerFeedback).toBeUndefined();
    expect(mapped.draftedBy).toBeUndefined();
  });

  it('carries caseId/specimenId/caseType/subspecialtyId/recordedBy forward unchanged', () => {
    const source = makeReconciliationRecord({
      caseId: 'S26-4403', specimenId: 'S26-4403-SP-1', caseType: 'Lung Wedge', subspecialtyId: 'thoracic',
      recordedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    const mapped = mapReconciliationRecordToQaActivityRecord(source);
    expect(mapped.caseId).toBe('S26-4403');
    expect(mapped.specimenId).toBe('S26-4403-SP-1');
    expect(mapped.caseType).toBe('Lung Wedge');
    expect(mapped.subspecialtyId).toBe('thoracic');
    expect(mapped.recordedBy).toEqual({ userId: 'PATH-001', userName: 'Pete Nimmo' });
  });
});

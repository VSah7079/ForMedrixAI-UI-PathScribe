import { describe, it, expect } from 'vitest';
import { resolveFieldRequirements } from '../fieldRequirements/fieldRequirementRules';
import { buildDiscordanceRecord, type DiscordanceEntry } from './discordanceRecord';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from './mockQaActivityTypeService';

// Batch 382: the record the reconciliation modal saves (was built inside the component).
const requirements = resolveFieldRequirements('report');
const context = {
  caseId: 'C1', specimenId: 'S1', caseType: 'surgical', subspecialtyId: 'breast',
  frozenCategory: 'malignant' as const, frozenDx: 'Suspicious for carcinoma',
  recordedBy: { userId: 'U1', userName: 'Dr Attending' },
};
const entry = (over: Partial<DiscordanceEntry> = {}): DiscordanceEntry => ({
  finalDiagnosis: ' Invasive ductal carcinoma ', finalCategory: 'malignant', delta: '', severity: '', rootCause: '', rootCauseNote: '', comments: '', attendingFeedback: '', ...over,
});

describe('buildDiscordanceRecord', () => {
  it('a concordant call stores the categories and diagnoses only', () => {
    const r = buildDiscordanceRecord(context, entry(), requirements)!;
    expect(r).toMatchObject({
      activityTypeId: FROZEN_FINAL_ACTIVITY_TYPE_ID, outcome: 'concordant', caseId: 'C1', specimenId: 'S1', subspecialtyId: 'breast',
      fieldValues: { frozenCategory: 'malignant', finalCategory: 'malignant', frozenDx: 'Suspicious for carcinoma', finalDx: 'Invasive ductal carcinoma' },
      isTeachingOnboardingCase: false,
    });
    expect(r.delta).toBeUndefined();
    expect(r.escalationRequired).toBeUndefined();
    expect(r.comments).toBeUndefined();
  });

  it('a discordant call stores the delta, impact, root cause and comment; a high impact needs escalation', () => {
    const r = buildDiscordanceRecord(context, entry({
      finalCategory: 'benign', delta: 'downgrade', severity: 'high', rootCause: 'other', rootCauseNote: ' Cautery ', comments: ' Sampling. ',
    }), requirements)!;
    expect(r).toMatchObject({ outcome: 'discordant', delta: 'downgrade', severity: 'high', rootCause: 'other', rootCauseNote: 'Cautery', comments: 'Sampling.', escalationRequired: true });
    expect(buildDiscordanceRecord(context, entry({ finalCategory: 'benign', delta: 'upgrade', severity: 'low', rootCause: 'sampling_error', comments: 'x' }), requirements)!.escalationRequired).toBe(false);
  });

  it('builds nothing while a required field is missing, or before a category is chosen', () => {
    expect(buildDiscordanceRecord(context, entry({ finalCategory: '' }), requirements)).toBeNull();
    expect(buildDiscordanceRecord(context, entry({ finalDiagnosis: ' ' }), requirements)).toBeNull();
    expect(buildDiscordanceRecord(context, entry({ finalCategory: 'benign', delta: 'downgrade', severity: 'low', rootCause: 'sampling_error' }), requirements)).toBeNull();
    expect(buildDiscordanceRecord(context, entry({ finalCategory: 'benign', delta: 'downgrade', severity: 'low', rootCause: 'other', comments: 'x' }), requirements)).toBeNull();
  });

  it('a case drafted by someone else is a teaching case and keeps the reviewer feedback', () => {
    const draftedBy = { userId: 'R1', userName: 'Dr Resident' };
    const r = buildDiscordanceRecord({ ...context, draftedBy }, entry({ attendingFeedback: ' Good call. ' }), requirements)!;
    expect(r).toMatchObject({ isTeachingOnboardingCase: true, draftedBy, reviewerFeedback: 'Good call.' });
    expect(buildDiscordanceRecord({ ...context, draftedBy: context.recordedBy }, entry(), requirements)!.isTeachingOnboardingCase).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveFieldRequirements } from './fieldRequirementRules';
import {
  specimenEditProblems, revisionMissingFields, revisionNotificationShown, criticalNotificationMissing,
  reportFieldRequired, REPORT_DEFAULT_REQUIREMENTS,
  discordanceStage, discordanceMissing, billingChangeMissing, correctedCodeCheck,
} from './reportPageChecks';

const defaults = resolveFieldRequirements('report');
const specimenForm = (over: Record<string, unknown> = {}) => ({
  label: 'C', description: 'Left breast core', bodySite: '', laterality: '', method: '', container: '',
  complexity: undefined, snomedTypeCode: '', snomedSiteCode: '', ...over,
}) as any;

describe('Case report page: Add/Edit specimen (Batch 380)', () => {
  it('by default needs exactly what the modal needed before: a unique label and a description', () => {
    expect(specimenEditProblems(specimenForm(), ['A', 'B'], defaults)).toEqual({ label: null, missing: [] });
    expect(specimenEditProblems(specimenForm({ label: ' ' }), ['A'], defaults).label).toBe('required');
    expect(specimenEditProblems(specimenForm({ label: 'b' }), ['A', 'B'], defaults).label).toBe('exists');
    expect(specimenEditProblems(specimenForm({ description: '  ' }), [], defaults).missing).toEqual(['specimenDescription']);
  });
  it('an organisation can require the other details; they are listed in catalog order', () => {
    const strict = resolveFieldRequirements('report', { anatomicSite: true, laterality: true, complexity: true, snomedTypeCode: true });
    expect(specimenEditProblems(specimenForm(), [], strict).missing).toEqual(['anatomicSite', 'laterality', 'complexity', 'snomedTypeCode']);
    expect(specimenEditProblems(specimenForm({ bodySite: 'Breast', laterality: 'Left', complexity: 'GROSS_ONLY', snomedTypeCode: '122737007' }), [], strict).missing).toEqual([]);
  });
  it('the label and description can\'t be switched off', () => {
    const tried = resolveFieldRequirements('report', { specimenLabel: false, specimenDescription: false });
    expect(reportFieldRequired(tried, 'specimenLabel')).toBe(true);
    expect(reportFieldRequired(tried, 'specimenDescription')).toBe(true);
  });
});

const revision = (over: Record<string, string> = {}) => ({ reasonId: 'r1', text: 'Changed margin status', addendumTitle: '', clinicianName: '', method: '', ...over });

describe('Case report page: amendments and addenda (Batch 380)', () => {
  it('by default: a major amendment needs a reason, text and the clinician notification; minor needs reason and text; an addendum also needs a title', () => {
    expect(revisionMissingFields('amendment', revision(), defaults)).toEqual(['amendmentNotification']);
    expect(revisionMissingFields('amendment', revision({ clinicianName: 'Dr Lee', method: 'verbal_phone' }), defaults)).toEqual([]);
    expect(revisionMissingFields('amendment', revision({ clinicianName: 'Dr Lee' }), defaults)).toEqual(['amendmentNotification']);
    expect(revisionMissingFields('correction', revision(), defaults)).toEqual([]);
    expect(revisionMissingFields('correction', revision({ reasonId: '', text: ' ' }), defaults)).toEqual(['revisionReason', 'revisionText']);
    expect(revisionMissingFields('addendum', revision(), defaults)).toEqual(['addendumTitle']);
  });
  it('the notification section shows for a major amendment always, and for the others only when the organisation requires it', () => {
    expect(revisionNotificationShown('amendment', defaults)).toBe(true);
    expect(revisionNotificationShown('correction', defaults)).toBe(false);
    expect(revisionNotificationShown('addendum', defaults)).toBe(false);
    const notifyAll = resolveFieldRequirements('report', { correctionNotification: true, addendumNotification: true });
    expect(revisionNotificationShown('correction', notifyAll)).toBe(true);
    expect(revisionMissingFields('correction', revision(), notifyAll)).toEqual(['correctionNotification']);
    expect(revisionMissingFields('addendum', revision({ addendumTitle: 'IHC results', clinicianName: 'Dr Lee', method: 'fax' }), notifyAll)).toEqual([]);
  });
  it('the major-amendment notification is locked', () => {
    expect(reportFieldRequired(resolveFieldRequirements('report', { amendmentNotification: false }), 'amendmentNotification')).toBe(true);
  });
});

describe('Case report page: critical findings (Batch 380)', () => {
  const form = (over: Record<string, unknown> = {}) => ({ clinicianName: 'Dr Lee', method: 'verbal_phone', notifiedByName: 'Pete Nimmo', readBackConfirmed: false, ...over }) as any;
  it('by default needs the clinician, the method and who notified, not read-back', () => {
    expect(criticalNotificationMissing(form(), defaults)).toEqual([]);
    expect(criticalNotificationMissing(form({ clinicianName: '', method: '', notifiedByName: ' ' }), defaults)).toEqual(['criticalClinician', 'criticalMethod', 'criticalNotifiedBy']);
  });
  it('an organisation can require read-back', () => {
    const readBack = resolveFieldRequirements('report', { criticalReadBack: true });
    expect(criticalNotificationMissing(form(), readBack)).toEqual(['criticalReadBack']);
    expect(criticalNotificationMissing(form({ readBackConfirmed: true }), readBack)).toEqual([]);
  });
  it('the defaults used before settings load are the page defaults', () => {
    expect(REPORT_DEFAULT_REQUIREMENTS.map(f => [f.id, f.required])).toEqual(defaults.map(f => [f.id, f.required]));
  });
});

import {
  holdMissing, commentMissing, delegationMissing, delegationNoteShown, biopsyArrayMissing,
  chosenReason, blockCancelMissing, restainMissing,
} from './reportPageChecks';

describe('Case report page, group 2 (Batch 381)', () => {
  it('holds need their note to be placed and released; the notes are locked', () => {
    expect(holdMissing('case', 'place', ' ', defaults)).toEqual(['caseHoldNote']);
    expect(holdMissing('retention', 'release', '', defaults)).toEqual(['retentionHoldReleaseNote']);
    expect(holdMissing('case', 'release', 'Re-cut received', defaults)).toEqual([]);
    expect(reportFieldRequired(resolveFieldRequirements('report', { caseHoldNote: false }), 'caseHoldNote')).toBe(true);
  });
  it('a comment is empty when the editor holds no text', () => {
    expect(commentMissing('<p></p>', defaults)).toEqual(['commentText']);
    expect(commentMissing('<p>&nbsp; </p>', defaults)).toEqual(['commentText']);
    expect(commentMissing('<p>Called the OR</p>', defaults)).toEqual([]);
  });
  const deleg = (over: Record<string, unknown> = {}) => ({
    delegationType: 'SECOND_OPINION', recipientId: 'U2', synopticChoiceNeeded: false, synopticInstanceId: null, note: '', typeRequiresNote: false, ...over,
  }) as any;
  it('delegation: type and recipient always; the synoptic only when there is one to choose; the note per type or organisation', () => {
    expect(delegationMissing(deleg(), defaults)).toEqual([]);
    expect(delegationMissing(deleg({ delegationType: null, recipientId: null }), defaults)).toEqual(['delegationType', 'delegationRecipient']);
    expect(delegationMissing(deleg({ synopticChoiceNeeded: true }), defaults)).toEqual(['delegationSynoptic']);
    expect(delegationMissing(deleg({ typeRequiresNote: true }), defaults)).toEqual(['delegationNote']);
    const noteAlways = resolveFieldRequirements('report', { delegationNote: true });
    expect(delegationMissing(deleg(), noteAlways)).toEqual(['delegationNote']);
    expect(delegationNoteShown(deleg(), defaults)).toBe(false);
    expect(delegationNoteShown(deleg(), noteAlways)).toBe(true);
    expect(delegationNoteShown(deleg({ delegationType: null }), noteAlways)).toBe(false);
  });
  it('a biopsy array needs a label and two specimens', () => {
    expect(biopsyArrayMissing('', 1, defaults)).toEqual(['arrayCassetteLabel', 'arraySpecimens']);
    expect(biopsyArrayMissing('A1-ARRAY', 2, defaults)).toEqual([]);
  });
  it('cancelling a block needs a reason; a restain needs a stain and a reason ("Other" needs its detail)', () => {
    expect(chosenReason('Other', '  ')).toBe('');
    expect(chosenReason('Other', ' Tissue exhausted ')).toBe('Tissue exhausted');
    expect(blockCancelMissing(chosenReason('Other', ''), defaults)).toEqual(['blockCancelReason']);
    expect(blockCancelMissing('Duplicate block', defaults)).toEqual([]);
    expect(restainMissing('', 'Weak stain', defaults)).toEqual(['restainStain']);
    expect(restainMissing('H&E', '', defaults)).toEqual(['restainReason']);
  });
});

describe('Case report page, group 3 (Batch 382): reconciliation and billing changes', () => {
  const form = (over: Record<string, string> = {}) => ({
    finalDiagnosis: 'Invasive ductal carcinoma', finalCategory: 'malignant', delta: '', severity: '', rootCause: '', rootCauseNote: '', comments: '', ...over,
  });
  it('lists every rule as locked, with a reason, so nothing can be switched off', () => {
    const ids = ['discordanceFinalDiagnosis', 'discordanceFinalCategory', 'discordanceDelta', 'discordanceSeverity', 'discordanceRootCause',
      'discordanceRootCauseNote', 'discordanceComments', 'postSignoutBillingReason', 'postSignoutBillingComment', 'correctedBillingCode'];
    const tried = resolveFieldRequirements('report', Object.fromEntries(ids.map(id => [id, false])));
    for (const id of ids) {
      const f = tried.find(x => x.id === id);
      expect(f, id).toMatchObject({ locked: true, required: true });
      expect(f?.lockReason, id).toBeTruthy();
    }
  });
  it('the stage follows the categories: none chosen, the same as frozen, or different', () => {
    expect(discordanceStage('malignant', '')).toBe('undecided');
    expect(discordanceStage('malignant', 'malignant')).toBe('concordant');
    expect(discordanceStage('malignant', 'benign')).toBe('discordant');
  });
  it('a concordant call needs only the diagnosis and the category', () => {
    expect(discordanceMissing('malignant', form(), defaults)).toEqual([]);
    expect(discordanceMissing('malignant', form({ finalDiagnosis: '  ' }), defaults)).toEqual(['discordanceFinalDiagnosis']);
    expect(discordanceMissing('malignant', form({ finalCategory: '' }), defaults)).toEqual(['discordanceFinalCategory']);
  });
  it('a discordant call also needs the delta, impact, root cause and a comment, in catalog order', () => {
    expect(discordanceMissing('malignant', form({ finalCategory: 'benign' }), defaults))
      .toEqual(['discordanceDelta', 'discordanceSeverity', 'discordanceRootCause', 'discordanceComments']);
    const done = form({ finalCategory: 'benign', delta: 'downgrade', severity: 'low', rootCause: 'sampling_error', comments: 'Sampling.' });
    expect(discordanceMissing('malignant', done, defaults)).toEqual([]);
  });
  it('the explanation is needed only when the root cause is Other', () => {
    const other = form({ finalCategory: 'benign', delta: 'downgrade', severity: 'low', rootCause: 'other', comments: 'Sampling.' });
    expect(discordanceMissing('malignant', other, defaults)).toEqual(['discordanceRootCauseNote']);
    expect(discordanceMissing('malignant', { ...other, rootCauseNote: ' Cautery artefact ' }, defaults)).toEqual([]);
  });
  it('a billing change after sign-out needs a reason and a comment', () => {
    expect(billingChangeMissing('', '', defaults)).toEqual(['postSignoutBillingReason', 'postSignoutBillingComment']);
    expect(billingChangeMissing('WRONG_CODE', '   ', defaults)).toEqual(['postSignoutBillingComment']);
    expect(billingChangeMissing('WRONG_CODE', 'Billed 88305 in error.', defaults)).toEqual([]);
  });
  it('a corrected code is needed and must differ from the original', () => {
    expect(correctedCodeCheck('', '88305', defaults)).toEqual({ missing: ['correctedBillingCode'], sameAsOriginal: false });
    expect(correctedCodeCheck(' 88305 ', '88305', defaults)).toEqual({ missing: [], sameAsOriginal: true });
    expect(correctedCodeCheck('88307', '88305', defaults)).toEqual({ missing: [], sameAsOriginal: false });
  });
});

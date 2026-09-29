// src/services/fieldRequirements/reportPageChecks.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-359, Batch 380. What the case report page's modals need before they can
// save, per the organisation's Field Requirements (page "report"):
//   - Add/Edit specimen       specimenEditProblems
//   - Amendment/correction/addendum   revisionMissingFields, revisionNotificationShown
//   - Critical findings       criticalNotificationMissing
//   - Group 2 (Batch 381)     holds, comments, delegation, biopsy arrays, block changes
//   - Group 3 (Batch 382)     discordanceMissing, billingChangeMissing, correctedCodeCheck
// Each modal used to decide this inline; the locked fields reproduce exactly
// what it required before, so nothing changes until an organisation changes
// a setting.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import { missingRequiredFields, resolveFieldRequirements, type FieldGroup, type ResolvedFieldRequirement } from './fieldRequirementRules';

const filled = (v: unknown): string => (typeof v === 'string' ? v.trim() : v ? 'yes' : '');

/** Before an organisation's settings load, the page's defaults apply. */
export const REPORT_DEFAULT_REQUIREMENTS: readonly ResolvedFieldRequirement[] = resolveFieldRequirements('report');

const inGroup = (requirements: readonly ResolvedFieldRequirement[], group: FieldGroup) =>
  requirements.filter(f => f.group === group);

/** Whether a field of the report page is required (drives the "*" beside a label). */
export function reportFieldRequired(requirements: readonly ResolvedFieldRequirement[], fieldId: string): boolean {
  return requirements.find(f => f.id === fieldId)?.required ?? false;
}

// ── Add/Edit specimen ────────────────────────────────────────────────────────

export interface SpecimenEditForm {
  label: string;
  description: string;
  bodySite: string;
  laterality: string;
  method: string;
  container: string;
  complexity?: string;
  snomedTypeCode: string;
  snomedSiteCode: string;
}

export interface SpecimenEditProblems {
  /** The label is empty, or another specimen on the case already has it. */
  label: 'required' | 'exists' | null;
  /** Required fields with no value, other than the label, in catalog order. */
  missing: string[];
}

export function specimenEditProblems(
  form: SpecimenEditForm,
  otherSpecimenLabels: readonly string[],
  requirements: readonly ResolvedFieldRequirement[],
): SpecimenEditProblems {
  const label = form.label.trim().toUpperCase();
  const labelProblem = !label ? 'required' : otherSpecimenLabels.some(l => l.toUpperCase() === label) ? 'exists' : null;
  const values: Record<string, unknown> = {
    specimenLabel: label,
    specimenDescription: filled(form.description),
    anatomicSite: filled(form.bodySite),
    laterality: filled(form.laterality),
    collectionMethod: filled(form.method),
    containerType: filled(form.container),
    complexity: filled(form.complexity ?? ''),
    snomedTypeCode: filled(form.snomedTypeCode),
    snomedSiteCode: filled(form.snomedSiteCode),
  };
  const missing = missingRequiredFields(inGroup(requirements, 'specimenDetails'), values)
    .map(f => f.id)
    .filter(id => id !== 'specimenLabel');
  return { label: labelProblem, missing };
}

// ── Amendment, correction, addendum ──────────────────────────────────────────

export type RevisionMode = 'amendment' | 'correction' | 'addendum';

/** Which revision types each field applies to. */
const REVISION_FIELD_MODES: Readonly<Record<string, readonly RevisionMode[]>> = {
  revisionReason: ['amendment', 'correction', 'addendum'],
  revisionText: ['amendment', 'correction', 'addendum'],
  addendumTitle: ['addendum'],
  amendmentNotification: ['amendment'],
  correctionNotification: ['correction'],
  addendumNotification: ['addendum'],
};

const NOTIFICATION_FIELD: Readonly<Record<RevisionMode, string>> = {
  amendment: 'amendmentNotification',
  correction: 'correctionNotification',
  addendum: 'addendumNotification',
};

/** The clinician-notification section shows when this revision type requires it (always for an amendment). */
export function revisionNotificationShown(mode: RevisionMode, requirements: readonly ResolvedFieldRequirement[]): boolean {
  return mode === 'amendment' || reportFieldRequired(requirements, NOTIFICATION_FIELD[mode]);
}

export interface RevisionForm {
  reasonId: string;
  text: string;
  addendumTitle: string;
  clinicianName: string;
  method: string;
}

/** Required fields with no value for this revision type, in catalog order. */
export function revisionMissingFields(mode: RevisionMode, form: RevisionForm, requirements: readonly ResolvedFieldRequirement[]): string[] {
  const notified = form.clinicianName.trim() && form.method ? 'yes' : '';
  const values: Record<string, unknown> = {
    revisionReason: filled(form.reasonId),
    revisionText: filled(form.text),
    addendumTitle: filled(form.addendumTitle),
    amendmentNotification: notified,
    correctionNotification: notified,
    addendumNotification: notified,
  };
  const applicable = inGroup(requirements, 'revisions').filter(f => REVISION_FIELD_MODES[f.id]?.includes(mode));
  return missingRequiredFields(applicable, values).map(f => f.id);
}

// ── Critical findings ────────────────────────────────────────────────────────

export interface CriticalNotificationForm {
  clinicianName: string;
  method: string;
  notifiedByName: string;
  readBackConfirmed: boolean;
}

/** Required fields with no value, in catalog order. */
export function criticalNotificationMissing(form: CriticalNotificationForm, requirements: readonly ResolvedFieldRequirement[]): string[] {
  const values: Record<string, unknown> = {
    criticalClinician: filled(form.clinicianName),
    criticalMethod: filled(form.method),
    criticalNotifiedBy: filled(form.notifiedByName),
    criticalReadBack: form.readBackConfirmed ? 'yes' : '',
  };
  return missingRequiredFields(inGroup(requirements, 'criticalFindings'), values).map(f => f.id);
}

// ── Group 2 (Batch 381) ──────────────────────────────────────────────────────
// Pete chose to list each modal's fixed fields as locked. The only switch is
// a note on every delegation.

export type HoldKind = 'case' | 'retention';
export type HoldStep = 'place' | 'release';

const HOLD_FIELD: Readonly<Record<HoldKind, Readonly<Record<HoldStep, string>>>> = {
  case:      { place: 'caseHoldNote',      release: 'caseHoldReleaseNote' },
  retention: { place: 'retentionHoldNote', release: 'retentionHoldReleaseNote' },
};

/** Placing or releasing a hold: the note it needs, if missing. */
export function holdMissing(kind: HoldKind, step: HoldStep, note: string, requirements: readonly ResolvedFieldRequirement[]): string[] {
  const id = HOLD_FIELD[kind][step];
  return missingRequiredFields(inGroup(requirements, 'holds').filter(f => f.id === id), { [id]: filled(note) }).map(f => f.id);
}

/** A comment is empty when it has no text (the editor's empty paragraph counts as empty). */
export function commentMissing(html: string, requirements: readonly ResolvedFieldRequirement[]): string[] {
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return missingRequiredFields(inGroup(requirements, 'comments'), { commentText: text }).map(f => f.id);
}

export interface DelegationForm {
  delegationType: string | null;
  recipientId: string | null;
  /** The type hands over one synoptic report and the case has some to choose from. */
  synopticChoiceNeeded: boolean;
  synopticInstanceId: string | null;
  note: string;
  /** The delegation type's own setting (Delegation Types). */
  typeRequiresNote: boolean;
}

/** Whether the note field shows: the organisation requires one on every delegation, or the chosen type does. */
export function delegationNoteShown(form: Pick<DelegationForm, 'delegationType' | 'typeRequiresNote'>, requirements: readonly ResolvedFieldRequirement[]): boolean {
  return !!form.delegationType && (form.typeRequiresNote || reportFieldRequired(requirements, 'delegationNote'));
}

export function delegationMissing(form: DelegationForm, requirements: readonly ResolvedFieldRequirement[]): string[] {
  const applicable = inGroup(requirements, 'delegation')
    .filter(f => f.id !== 'delegationSynoptic' || form.synopticChoiceNeeded)
    .map(f => (f.id === 'delegationNote' && form.typeRequiresNote ? { ...f, required: true } : f));
  return missingRequiredFields(applicable, {
    delegationType: filled(form.delegationType ?? ''),
    delegationRecipient: filled(form.recipientId ?? ''),
    delegationSynoptic: filled(form.synopticInstanceId ?? ''),
    delegationNote: filled(form.note),
  }).map(f => f.id);
}

/** A biopsy array needs a cassette label and at least two specimens. */
export function biopsyArrayMissing(cassetteLabel: string, specimenCount: number, requirements: readonly ResolvedFieldRequirement[]): string[] {
  return missingRequiredFields(inGroup(requirements, 'biopsyArray'), {
    arrayCassetteLabel: filled(cassetteLabel),
    arraySpecimens: specimenCount >= 2 ? 'yes' : '',
  }).map(f => f.id);
}

/** The reason recorded: the chosen one, or the detail typed for "Other". */
export function chosenReason(choice: string, otherDetail: string): string {
  return choice === 'Other' ? otherDetail.trim() : choice;
}

export function blockCancelMissing(reason: string, requirements: readonly ResolvedFieldRequirement[]): string[] {
  return missingRequiredFields(inGroup(requirements, 'blockChanges').filter(f => f.id === 'blockCancelReason'), { blockCancelReason: filled(reason) }).map(f => f.id);
}

export function restainMissing(stainName: string, reason: string, requirements: readonly ResolvedFieldRequirement[]): string[] {
  return missingRequiredFields(inGroup(requirements, 'blockChanges').filter(f => f.id !== 'blockCancelReason'), {
    restainStain: filled(stainName), restainReason: filled(reason),
  }).map(f => f.id);
}

// ── Group 3 (Batch 382) ──────────────────────────────────────────────────────
// Every field here is locked, as Pete chose for group 2: the settings screen
// lists each rule the modal applies.

/** What the reconciliation modal is asking for, from the categories chosen. */
export type DiscordanceStage = 'undecided' | 'concordant' | 'discordant';

/** No final category yet: only the diagnosis and category are asked for. Same as the frozen category: concordant. Otherwise discordant. */
export function discordanceStage(frozenCategory: string, finalCategory: string): DiscordanceStage {
  if (!finalCategory) return 'undecided';
  return finalCategory === frozenCategory ? 'concordant' : 'discordant';
}

export interface DiscordanceForm {
  finalDiagnosis: string;
  finalCategory: string;
  delta: string;
  severity: string;
  rootCause: string;
  rootCauseNote: string;
  comments: string;
}

/** Required fields with no value at this stage, in catalog order. */
export function discordanceMissing(frozenCategory: string, form: DiscordanceForm, requirements: readonly ResolvedFieldRequirement[]): string[] {
  const stage = discordanceStage(frozenCategory, form.finalCategory);
  const discordant = stage === 'discordant';
  const applicable = inGroup(requirements, 'discordance').filter(f => {
    if (f.id === 'discordanceFinalDiagnosis' || f.id === 'discordanceFinalCategory') return true;
    if (f.id === 'discordanceRootCauseNote') return discordant && form.rootCause === 'other';
    return discordant;
  });
  return missingRequiredFields(applicable, {
    discordanceFinalDiagnosis: filled(form.finalDiagnosis),
    discordanceFinalCategory: filled(form.finalCategory),
    discordanceDelta: filled(form.delta),
    discordanceSeverity: filled(form.severity),
    discordanceRootCause: filled(form.rootCause),
    discordanceRootCauseNote: filled(form.rootCauseNote),
    discordanceComments: filled(form.comments),
  }).map(f => f.id);
}

/** The reason and comment a change to billing after sign-out needs. */
export function billingChangeMissing(reasonId: string, comment: string, requirements: readonly ResolvedFieldRequirement[]): string[] {
  return missingRequiredFields(inGroup(requirements, 'billingChanges').filter(f => f.id !== 'correctedBillingCode'), {
    postSignoutBillingReason: filled(reasonId),
    postSignoutBillingComment: filled(comment),
  }).map(f => f.id);
}

export interface CorrectedCodeCheck {
  /** Required fields with no value. */
  missing: string[];
  /** A code was typed but it is the code being corrected, so nothing would change. */
  sameAsOriginal: boolean;
}

/** The replacement code for an applied billing code: needed, and different from the original. */
export function correctedCodeCheck(newCode: string, originalCode: string, requirements: readonly ResolvedFieldRequirement[]): CorrectedCodeCheck {
  const code = newCode.trim();
  return {
    missing: missingRequiredFields(inGroup(requirements, 'billingChanges').filter(f => f.id === 'correctedBillingCode'), { correctedBillingCode: code }).map(f => f.id),
    sameAsOriginal: code !== '' && code === originalCode,
  };
}

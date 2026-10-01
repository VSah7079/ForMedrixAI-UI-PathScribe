// src/services/fieldRequirements/fieldRequirementRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-359 (Batch 376). Pete: "The User may need to have control over what
// fields on a page are required before saving. Field Configuration that is
// grouped by Pages … Some fields should always be required, and should be
// uneditable."
//
// The catalog below is the only list of configurable pages and fields.
// Each field is:
//   locked    always required; no organisation can switch it off (the reason
//             is shown beside it)
//   required  required unless the organisation switches it off
//   optional  not required unless the organisation switches it on
// The defaults reproduce what each page required before this feature, so
// nothing changes until an administrator changes it. (Grossing's "protocol"
// rule, Batch 379, is new: before it, a protocol-less specimen simply
// couldn't get blocks on the Grossing screen, so its case couldn't complete.)
//
// Settings are per organisation only: no enterprise or performing-facility
// overrides (Pete, Sep 28, 2026).
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldRequirementPageId = 'accession' | 'grossing' | 'report';
export type FieldGroup = 'patient' | 'order' | 'specimens' | 'blocks' | 'fixation'
  | 'specimenDetails' | 'revisions' | 'criticalFindings'
  | 'holds' | 'comments' | 'delegation' | 'biopsyArray' | 'blockChanges'
  | 'discordance' | 'billingChanges';
export type FieldDefault = 'locked' | 'required' | 'optional';
export type LockReason = 'patientIdentification' | 'routing' | 'orderingProvider' | 'specimen'
  | 'specimenIdentity' | 'specimenDescription' | 'revisionRecord' | 'amendmentNotification' | 'criticalResult'
  | 'holdAccountability' | 'retentionHold' | 'commentText' | 'delegationRouting' | 'biopsyArray' | 'materialTraceability'
  | 'discordanceRecord' | 'billingAudit' | 'billingCodeCorrection';
/** Extra guidance shown beside a field on the Field Requirements screen (Batch 379). */
export type FieldHint = 'blocksScope' | 'protocolOff' | 'delegationNoteByType';

export interface FieldRequirementDefinition {
  /** Stable id, stored in settings. Never change a published id. */
  readonly id: string;
  readonly group: FieldGroup;
  readonly default: FieldDefault;
  /** Why a locked field can't be switched off. */
  readonly lockReason?: LockReason;
  /** The value is one per specimen: required means every specimen has one. */
  readonly perSpecimen?: boolean;
  /** The value is one per block: required means every block has one (Batch 378). */
  readonly perBlock?: boolean;
  /** Left blank, the page fills it in when saving (Accession's Patient ID),
   *  so a blank value still counts as supplied. If filling it in fails, the
   *  page stops and says so (Pete, Batch 377). */
  readonly autoFilled?: boolean;
  /** Guidance shown beside the field in place of the per-specimen/per-block note. */
  readonly hint?: FieldHint;
}

export const FIELD_REQUIREMENT_PAGES: Readonly<Record<FieldRequirementPageId, readonly FieldRequirementDefinition[]>> = {
  // Accession: before PS-359 the page required the patient's names and date
  // of birth, the client, the requesting provider and a described specimen.
  accession: [
    { id: 'givenNames',          group: 'patient',   default: 'locked',   lockReason: 'patientIdentification' },
    { id: 'familyNames',         group: 'patient',   default: 'locked',   lockReason: 'patientIdentification' },
    { id: 'dateOfBirth',         group: 'patient',   default: 'locked',   lockReason: 'patientIdentification' },
    { id: 'mrn',                 group: 'patient',   default: 'optional', autoFilled: true },
    { id: 'client',              group: 'order',     default: 'locked',   lockReason: 'routing' },
    { id: 'requestingProvider',  group: 'order',     default: 'locked',   lockReason: 'orderingProvider' },
    { id: 'location',            group: 'order',     default: 'optional' },
    { id: 'assignedPathologist', group: 'order',     default: 'optional' },
    { id: 'clinicalIndication',  group: 'order',     default: 'optional' },
    { id: 'specimenDescription', group: 'specimens', default: 'locked',   lockReason: 'specimen', perSpecimen: true },
    { id: 'collectedAt',         group: 'specimens', default: 'optional', perSpecimen: true },
    { id: 'processedAt',         group: 'specimens', default: 'optional', perSpecimen: true },
  ],
  // Grossing (Batch 378): checked when grossing is completed (Complete
  // grossing), since each edit on the Grossing screen saves as it's made.
  // Batch 379 (Pete): "protocol" is the organisation's Require-protocol-for-
  // grossing-completion switch, on by default. Switched off, a specimen
  // without a protocol can be completed after a confirmation and is routed
  // for secondary review (services/grossing/grossingCompletion.ts). "blocks"
  // moved from locked to required-by-default, and applies only to specimens
  // whose protocol makes blocks (not cytology preparations).
  grossing: [
    { id: 'protocol',               group: 'specimens', default: 'required', perSpecimen: true, hint: 'protocolOff' },
    { id: 'blocks',                 group: 'specimens', default: 'required', perSpecimen: true, hint: 'blocksScope' },
    { id: 'pieceCount',             group: 'blocks',    default: 'optional', perBlock: true },
    { id: 'fixationEndedAt',        group: 'fixation',  default: 'optional', perSpecimen: true },
    { id: 'fixativeRatioConfirmed', group: 'fixation',  default: 'optional', perSpecimen: true },
  ],
  // Case report page (Batch 380, Pete: "move on to the Synoptic Report page
  // and its related modals"), group 1: the Add/Edit specimen modal, the
  // amendment/correction/addendum modal and the critical-findings modal.
  // Checked when that modal saves (services/fieldRequirements/reportPageChecks.ts).
  // Locked fields are the ones each modal already required, which laboratory
  // standards require (CAP for amended reports and their clinician
  // notification, CLIA 42 CFR 493.1291(g) for critical results). A
  // synoptic template's own required answers stay with the template.
  report: [
    { id: 'specimenLabel',          group: 'specimenDetails',  default: 'locked',   lockReason: 'specimenIdentity' },
    { id: 'specimenDescription',    group: 'specimenDetails',  default: 'locked',   lockReason: 'specimenDescription' },
    { id: 'anatomicSite',           group: 'specimenDetails',  default: 'optional' },
    { id: 'laterality',             group: 'specimenDetails',  default: 'optional' },
    { id: 'collectionMethod',       group: 'specimenDetails',  default: 'optional' },
    { id: 'containerType',          group: 'specimenDetails',  default: 'optional' },
    { id: 'complexity',             group: 'specimenDetails',  default: 'optional' },
    { id: 'snomedTypeCode',         group: 'specimenDetails',  default: 'optional' },
    { id: 'snomedSiteCode',         group: 'specimenDetails',  default: 'optional' },
    { id: 'revisionReason',         group: 'revisions',        default: 'locked',   lockReason: 'revisionRecord' },
    { id: 'revisionText',           group: 'revisions',        default: 'locked',   lockReason: 'revisionRecord' },
    { id: 'addendumTitle',          group: 'revisions',        default: 'locked',   lockReason: 'revisionRecord' },
    { id: 'amendmentNotification',  group: 'revisions',        default: 'locked',   lockReason: 'amendmentNotification' },
    { id: 'correctionNotification', group: 'revisions',        default: 'optional' },
    { id: 'addendumNotification',   group: 'revisions',        default: 'optional' },
    { id: 'criticalClinician',      group: 'criticalFindings', default: 'locked',   lockReason: 'criticalResult' },
    { id: 'criticalMethod',         group: 'criticalFindings', default: 'locked',   lockReason: 'criticalResult' },
    { id: 'criticalNotifiedBy',     group: 'criticalFindings', default: 'locked',   lockReason: 'criticalResult' },
    { id: 'criticalReadBack',       group: 'criticalFindings', default: 'optional' },
    // Group 2 (Batch 381). Pete chose to list these fixed fields as locked,
    // so the settings screen shows every rule each modal applies. The one
    // switch is a note on every delegation (a delegation type can already
    // require one of its own, in Delegation Types).
    { id: 'caseHoldNote',             group: 'holds',        default: 'locked',   lockReason: 'holdAccountability' },
    { id: 'caseHoldReleaseNote',      group: 'holds',        default: 'locked',   lockReason: 'holdAccountability' },
    { id: 'retentionHoldNote',        group: 'holds',        default: 'locked',   lockReason: 'retentionHold' },
    { id: 'retentionHoldReleaseNote', group: 'holds',        default: 'locked',   lockReason: 'retentionHold' },
    { id: 'commentText',              group: 'comments',     default: 'locked',   lockReason: 'commentText' },
    { id: 'delegationType',           group: 'delegation',   default: 'locked',   lockReason: 'delegationRouting' },
    { id: 'delegationRecipient',      group: 'delegation',   default: 'locked',   lockReason: 'delegationRouting' },
    { id: 'delegationSynoptic',       group: 'delegation',   default: 'locked',   lockReason: 'delegationRouting' },
    { id: 'delegationNote',           group: 'delegation',   default: 'optional', hint: 'delegationNoteByType' },
    { id: 'arrayCassetteLabel',       group: 'biopsyArray',  default: 'locked',   lockReason: 'biopsyArray' },
    { id: 'arraySpecimens',           group: 'biopsyArray',  default: 'locked',   lockReason: 'biopsyArray' },
    { id: 'blockCancelReason',        group: 'blockChanges', default: 'locked',   lockReason: 'materialTraceability' },
    { id: 'restainStain',             group: 'blockChanges', default: 'locked',   lockReason: 'materialTraceability' },
    { id: 'restainReason',            group: 'blockChanges', default: 'locked',   lockReason: 'materialTraceability' },
    // Group 3 (Batch 382), first part: the frozen-versus-final discordance
    // record and the two billing modals. Pete's group 2 choice again: list
    // each modal's fixed fields as locked. The delta, severity, root cause
    // and comment apply only when the final category differs from the frozen
    // one; the root-cause explanation only when the root cause is "Other".
    { id: 'discordanceFinalDiagnosis', group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'discordanceFinalCategory',  group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'discordanceDelta',          group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'discordanceSeverity',       group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'discordanceRootCause',      group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'discordanceRootCauseNote',  group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'discordanceComments',       group: 'discordance',    default: 'locked',   lockReason: 'discordanceRecord' },
    { id: 'postSignoutBillingReason',  group: 'billingChanges', default: 'locked',   lockReason: 'billingAudit' },
    { id: 'postSignoutBillingComment', group: 'billingChanges', default: 'locked',   lockReason: 'billingAudit' },
    { id: 'correctedBillingCode',      group: 'billingChanges', default: 'locked',   lockReason: 'billingCodeCorrection' },
  ],
};

export const FIELD_REQUIREMENT_PAGE_IDS = Object.keys(FIELD_REQUIREMENT_PAGES) as FieldRequirementPageId[];

/** An organisation's choices for one page: field id → required. Only fields it changed. */
export type FieldRequirementOverrides = Readonly<Record<string, boolean>>;

export interface ResolvedFieldRequirement extends FieldRequirementDefinition {
  required: boolean;
  locked: boolean;
  /** true when the organisation's choice differs from the default. */
  changed: boolean;
}

/** The page's fields with the organisation's choices applied. Choices for locked or unknown fields are ignored. */
export function resolveFieldRequirements(page: FieldRequirementPageId, overrides: FieldRequirementOverrides = {}): ResolvedFieldRequirement[] {
  return FIELD_REQUIREMENT_PAGES[page].map(f => {
    const locked = f.default === 'locked';
    const byDefault = f.default !== 'optional';
    const chosen = !locked && typeof overrides[f.id] === 'boolean' ? overrides[f.id] : byDefault;
    return { ...f, locked, required: locked || chosen, changed: !locked && chosen !== byDefault };
  });
}

export type OverrideProblem = 'unknownPage' | 'unknownField' | 'locked';

/** Why this change can't be made, or null. */
export function overrideProblem(page: string, fieldId: string): OverrideProblem | null {
  const fields = FIELD_REQUIREMENT_PAGES[page as FieldRequirementPageId];
  if (!fields) return 'unknownPage';
  const f = fields.find(x => x.id === fieldId);
  if (!f) return 'unknownField';
  return f.default === 'locked' ? 'locked' : null;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * The required fields with no value, in catalog order. A per-specimen field
 * takes one value per specimen and is missing if there are no specimens or
 * any specimen lacks it. A field filled in automatically when blank is never
 * missing here; the save checks that filling it in worked.
 */
export function missingRequiredFields(requirements: readonly ResolvedFieldRequirement[], values: Readonly<Record<string, unknown>>): ResolvedFieldRequirement[] {
  return requirements.filter(f => {
    if (!f.required || f.autoFilled) return false;
    const v = values[f.id];
    if (f.perSpecimen || f.perBlock) return !Array.isArray(v) || v.length === 0 || v.some(isEmpty);
    return isEmpty(v);
  });
}

/** The audit entry for a change (literal English: audit records are compliance artifacts, not UI). */
export function fieldRequirementChangeAudit(
  page: FieldRequirementPageId, fieldId: string, required: boolean, organisationName: string, actorName: string,
): { type: 'user'; event: string; detail: string; user: string; caseId: null; confidence: null } {
  return {
    type: 'user',
    event: 'Field requirement changed',
    detail: `${organisationName}: ${page} field "${fieldId}" is now ${required ? 'required' : 'not required'}.`,
    user: actorName,
    caseId: null,
    confidence: null,
  };
}

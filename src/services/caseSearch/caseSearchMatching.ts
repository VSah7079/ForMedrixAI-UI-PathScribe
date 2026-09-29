// src/services/caseSearch/caseSearchMatching.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 350: the rules for whether a case matches a search, how results are
// ordered, and how a page is cut. Pure; the case search service
// (createCaseSearchService.ts) runs them, and the .NET API server follows the
// same rules in SQL (docs/architecture/CASE_SEARCH_API.md).
//
// Fixes to the filters the Search page offered before this batch
// (they lived in services/cases/caseFilterUtils.ts):
//   • Diagnosis read fields that aren't on a case, so it never matched.
//     It now reads the case's diagnostic text.
//   • Requisition / order numbers were compared to accession numbers only.
//   • Pathologist matched only the assigned pathologist, not the one who
//     signed the case or the participants on it.
//   • ICD matched ICD-10 only, though the picker offers ICD-11 and ICD-O.
//   • Synoptic protocols matched against a hard-coded list whose template
//     ids mostly weren't the ones cases use.
//   • A case with no date (or no date of birth) passed a date (or age)
//     filter. It no longer does: nothing shows it is in range.
//   • Flags matched by definition only, so the older flag records most
//     demo cases carry (a name, no definition id) never matched. Both
//     forms match now.
//
// Batch 351 adds the new searchable case data (section 3 of the Sep 27 gap
// analysis): case type, sign-out and release dates, the pathologist's role
// on the case, revisions, holds, the abnormal-result marker, pending work,
// turnaround, subspecialty, performing lab, location, intake, payer, CPT
// codes and autopsy details. Reference data the server would join (the
// specimen dictionary, amendments, countersigns, delegations, TAT targets …)
// arrives in the match context.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { SpecimenEntry } from '../specimenDictionary/specimenTypes';
import { resolveCaseDisciplineBranch } from '../specimenDictionary/resolveCaseDisciplineBranch';
import { resolveCaseHasSpecimenCategory } from '../specimenDictionary/resolveCaseHasSpecimenCategory';
import { getFacilityDateParts } from '@/utils/facilityTime';
import { withDescendantFacilityIds } from '../facilities/facilityHierarchy';
import type {
  CaseSearchCaseType, CaseSearchCriteria, CaseSearchPathologistRole, CaseSearchPendingWork, CaseSearchSort, CaseSearchSex,
} from './caseSearchTypes';

export interface CaseSearchFlagInfo { name: string; lisCode?: string }

/** Data the server joins while matching. Everything is optional: a missing piece just can't match. */
export interface CaseSearchReferenceData {
  /** Ordering physicians' names by id, to match cases that record the physician by name only. */
  physicianNamesById: ReadonlyMap<string, readonly string[]>;
  /** Flag definitions by id, to match older flag records that carry a name or LIS code instead of a definition id. */
  flagsById?: ReadonlyMap<string, CaseSearchFlagInfo>;
  /** Specimen dictionary entries (id and category), for case type. */
  specimenDictionary?: ReadonlyArray<Pick<SpecimenEntry, 'id' | 'specimenCategory'>>;
  /** Submitting facility id → performing lab id. */
  performingLabByFacilityId?: ReadonlyMap<string, string>;
  /** Facility id → parent facility id (Batch 354): a Trust's sites, for organisation filters. */
  parentFacilityIdById?: ReadonlyMap<string, string>;
  /** Stain dictionary: lower-case stain name → category ('IHC', 'Molecular' …). */
  stainCategoryByName?: ReadonlyMap<string, string>;
  /** Case id → the types of its released amendment records. */
  revisionTypesByCaseId?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Case id → its countersign records' resident and attending. */
  countersignsByCaseId?: ReadonlyMap<string, ReadonlyArray<{ residentId?: string; attendingId?: string }>>;
  /** Case id → staff the case is delegated to (open delegations). */
  delegateesByCaseId?: ReadonlyMap<string, ReadonlySet<string>>;
  /** The case's subspecialty when the case doesn't record one (protocols, specimen routing). */
  subspecialtyOf?: (c: Case, performingLabId: string | undefined) => string | undefined;
  /** The case's total turnaround target in hours, or null when none applies. */
  tatTargetHoursOf?: (c: Case, context: { performingLabId?: string; subspecialtyId?: string }) => number | null;
}

export interface CaseSearchMatchContext extends CaseSearchReferenceData {
  timeZone: string;
  /** "Today", for ages and turnaround. */
  now: Date;
}

// ── Small helpers ───────────────────────────────────────────────────────────

const lower = (s: string | undefined | null) => (s ?? '').toLowerCase();
/** For identifiers: case and punctuation don't matter ("s26-4403" = "S264403"). */
const compact = (s: string | undefined | null) => lower(s).replace(/[^a-z0-9]/g, '');
const containsId = (value: string | undefined | null, query: string) => {
  const q = compact(query);
  return q.length > 0 && compact(value).includes(q);
};
const words = (s: string) => lower(s).split(/[\s,]+/).filter(Boolean);
const nonEmpty = <T>(list: readonly T[] | undefined): list is readonly T[] => !!list && list.length > 0;

/** Facility-local calendar date (YYYY-MM-DD) of an instant; date-only values are returned as is. */
export function toFacilityDate(value: string | undefined, timeZone: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const { year, month, day } = getFacilityDateParts(d, timeZone);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * When the case was accessioned: the accession timestamp, else the order's
 * received date, else the earliest specimen receipt, else when the record
 * was created.
 */
export function caseAccessionInstant(c: Case): string | undefined {
  const receipts = (c.specimens ?? [])
    .map(s => s.receivedAt)
    .filter((v): v is string => !!v)
    .sort();
  return c.accession?.accessionedAt ?? c.order?.receivedDate ?? receipts[0] ?? c.createdAt;
}

export function patientNameText(c: Case): string {
  const p = c.patient;
  if (!p) return '';
  return [p.givenNames, p.familyNames, p.firstName, p.lastName, p.preferredName].filter(Boolean).join(' ');
}

/** "Surname, Given" for sorting and export. */
export function patientSortName(c: Case): string {
  const p = c.patient;
  const family = p?.familyNames ?? p?.lastName ?? '';
  const given = p?.givenNames ?? p?.firstName ?? '';
  return family && given ? `${family}, ${given}` : (family || given);
}

function ageOn(dob: string, today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!m || !t) return null;
  const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const stripTitle = (s: string) => lower(s).replace(/^(dr|mr|mrs|ms|mx|prof)\.?\s+/, '').replace(/\s+/g, ' ').trim();

function sexCode(value: string | undefined): CaseSearchSex {
  const v = lower(value);
  if (v === 'm' || v === 'male') return 'M';
  if (v === 'f' || v === 'female') return 'F';
  return 'U';
}

// ── Batch 351: dates, roles, work ───────────────────────────────────────────

const SIGNED_OUT_STATUSES = new Set(['finalized', 'closed', 'pending-release']);
const RELEASED_STATUSES = new Set(['finalized', 'closed']);

/**
 * When the case was signed out: Case.finalizedAt (written at sign-out), else
 * the autopsy's final report signature, else, for a signed-out case, the
 * report's issued date. An open case has none.
 */
export function caseSignedOutInstant(c: Case): string | undefined {
  if (c.finalizedAt) return c.finalizedAt;
  if (c.autopsy?.fadSnapshot?.signedAt) return c.autopsy.fadSnapshot.signedAt;
  return SIGNED_OUT_STATUSES.has(c.status) ? c.diagnostic?.issuedDate : undefined;
}

/** When the report was released: Case.releasedAt, else the sign-out time once the case is finalized (no release buffer). */
export function caseReleasedInstant(c: Case): string | undefined {
  if (c.releasedAt) return c.releasedAt;
  return RELEASED_STATUSES.has(c.status) ? caseSignedOutInstant(c) : undefined;
}

/** Who signed the case out, for a signed-out case. */
function caseSignerId(c: Case): string | undefined {
  if (c.finalizedBy) return c.finalizedBy;
  return caseSignedOutInstant(c) ? c.diagnostic?.finalizedBy : undefined;
}

function participantIds(c: Case, typeId: string): string[] {
  return (c.participants ?? []).filter(p => (p.participationTypeIds ?? []).includes(typeId)).map(p => p.staffId);
}

/** Staff on the case in the given role. */
export function caseStaffInRole(c: Case, role: CaseSearchPathologistRole, ctx: CaseSearchReferenceData): Set<string> {
  const ids = new Set<string>();
  const add = (v: string | null | undefined) => { if (v) ids.add(v); };
  const countersigns = ctx.countersignsByCaseId?.get(c.id) ?? [];
  if (role === 'assigned' || role === 'any') add(c.order?.assignedTo);
  if (role === 'signedOut' || role === 'any') add(caseSignerId(c));
  if (role === 'resident' || role === 'any') {
    participantIds(c, 'resident').forEach(add);
    countersigns.forEach(r => add(r.residentId));
  }
  if (role === 'countersigner' || role === 'any') {
    participantIds(c, 'attending').forEach(add);
    countersigns.forEach(r => add(r.attendingId));
  }
  if (role === 'delegatedTo' || role === 'any') (ctx.delegateesByCaseId?.get(c.id) ?? new Set<string>()).forEach(add);
  if (role === 'any') {
    add(c.diagnostic?.finalizedBy);
    add(c.acceptedBy);
    for (const p of c.participants ?? []) add(p.staffId);
    for (const r of c.synopticReports ?? []) add((r as { assignedTo?: string }).assignedTo);
  }
  return ids;
}

export function caseTypesOf(c: Case, dictionary: CaseSearchReferenceData['specimenDictionary']): Set<CaseSearchCaseType> {
  const dict = (dictionary ?? []) as Pick<SpecimenEntry, 'id' | 'specimenCategory'>[];
  const types = new Set<CaseSearchCaseType>();
  if (c.autopsy) types.add('autopsy');
  if (resolveCaseHasSpecimenCategory(c.specimens, dict, 'GYN_CYTOLOGY')) types.add('gynCytology');
  if (resolveCaseHasSpecimenCategory(c.specimens, dict, 'NON_GYN_CYTOLOGY')) types.add('nonGynCytology');
  if (resolveCaseDisciplineBranch(c.specimens, dict, !!c.autopsy) === 'surgpath') types.add('surgical');
  return types;
}

/** A stain order is done once coverslipped, ready for review, or cancelled. */
const FINISHED_STAIN_STATUSES = new Set(['Coverslipped', 'Ready for Review', 'Cancelled']);

type StainLike = {
  stainName?: string; status?: string; addOnPriority?: string; addOnPanelId?: string;
  orderedByPathologistId?: string; exception?: { status?: string };
};

function stainOrdersOf(c: Case): StainLike[] {
  return (c.specimens ?? []).flatMap(s => [
    ...(s.blocks ?? []).flatMap(b => (b.stains ?? []) as StainLike[]),
    ...(s.decants ?? []).flatMap(d => (d.stains ?? []) as StainLike[]),
  ]);
}

export function casePendingWork(c: Case, stainCategoryByName: CaseSearchReferenceData['stainCategoryByName']): Set<CaseSearchPendingWork> {
  const work = new Set<CaseSearchPendingWork>();
  for (const o of stainOrdersOf(c)) {
    const open = !FINISHED_STAIN_STATUSES.has(o.status ?? '');
    const isAddOn = !!(o.orderedByPathologistId || o.addOnPriority || o.addOnPanelId);
    if (isAddOn && (open || o.exception?.status === 'pending_pathologist_review')) work.add('addOns');
    if (!open) continue;
    work.add('stains');
    const category = stainCategoryByName?.get(lower(o.stainName));
    if (category === 'IHC' || category === 'Immunofluorescence') work.add('ihc');
    if (category === 'Molecular') work.add('molecular');
  }
  return work;
}

function cptCodesOf(c: Case): string[] {
  const fromSpecimens = (c.specimens ?? []).flatMap(s => [
    ...(s.coding?.cpt ?? []),
    ...((s as { matrixBlockCoding?: { cpt?: { code: string }[] } }).matrixBlockCoding?.cpt ?? []).map(x => x.code),
    ...(s.blocks ?? []).flatMap(b => (b.coding?.cpt ?? []).map(x => x.code)),
  ]);
  return [...(c.coding?.cpt ?? []), ...fromSpecimens].map(x => lower(x));
}

/** Past the total turnaround target: signed out after it, or still open after it. */
export function isPastTatTarget(c: Case, ctx: CaseSearchMatchContext, performingLabId: string | undefined, subspecialtyId: string | undefined): boolean {
  const target = ctx.tatTargetHoursOf?.(c, { performingLabId, subspecialtyId });
  if (target === null || target === undefined) return false;
  const start = c.order?.receivedDate ?? caseAccessionInstant(c);
  if (!start) return false;
  const signed = caseSignedOutInstant(c);
  const open = !SIGNED_OUT_STATUSES.has(c.status);
  const end = signed ?? (open ? ctx.now.toISOString() : undefined);
  if (!end) return false;
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours > target;
}

// ── Matching ────────────────────────────────────────────────────────────────

/**
 * Whether a flag record on a case is one of the chosen flag definitions.
 * Current records reference the definition by id (FlagInstance). Older
 * records (much of the demo data, and flags that arrived inline from an
 * LIS) carry the flag's own name or LIS code instead; those match the
 * definition with that name or code. A removed flag never matches.
 */
function flagRecordMatches(record: unknown, ids: readonly string[], flagsById: ReadonlyMap<string, CaseSearchFlagInfo> | undefined): boolean {
  const r = (record ?? {}) as { flagDefinitionId?: string; deletedAt?: string | null; id?: string; name?: string; lisCode?: string };
  if (r.deletedAt) return false;
  if (r.flagDefinitionId) return ids.includes(r.flagDefinitionId);
  return ids.some(id => {
    const def = flagsById?.get(id);
    if (!def) return r.id === id;
    return (!!r.name && lower(r.name) === lower(def.name)) || (!!r.lisCode && !!def.lisCode && r.lisCode === def.lisCode);
  });
}

/** Requisition, external order, referral, lab and block numbers (Batch 351 added lab and block). */
function orderNumbersOf(c: Case): Array<string | undefined | null> {
  const o = c.order as (Case['order'] & { labNumber?: string | null; blockId?: string | null }) | undefined;
  return [o?.requisitionNumber, o?.externalOrderId, o?.referralNumber, o?.labNumber, o?.blockId];
}

function matchesAnyIdentifier(c: Case, q: string): boolean {
  if (containsId(c.accession?.fullAccession, q) || containsId(c.accession?.externalAccession, q)) return true;
  if (containsId(c.patient?.mrn, q) || c.patient?.id === q.trim()) return true;
  if (orderNumbersOf(c).some(n => containsId(n, q))) return true;
  const name = lower(patientNameText(c));
  const ws = words(q);
  return ws.length > 0 && ws.every(w => name.includes(w));
}

function diagnosisText(c: Case): string {
  const d = c.diagnostic;
  if (!d) return '';
  return lower([
    d.primaryDiagnosis, ...(d.secondaryDiagnoses ?? []), d.microscopicDescription,
    d.preliminaryImpression, d.synoptic?.tumorType, d.synoptic?.grade,
    // Batch 351: biomarker results too ("ER positive", "HER2 3+").
    ...Object.entries(d.synoptic?.biomarkers ?? {}).map(([k, v]) => (v ? `${k} ${v}` : '')),
  ].filter(Boolean).join(' \n '));
}

function icdCodesOf(c: Case): string[] {
  const coding = c.coding ?? {};
  const fromSpecimens = (c.specimens ?? []).flatMap(s => [
    ...(s.coding?.icd10 ?? []).map(x => x.code),
    ...(s.coding?.icdO ?? []).map(x => x.code),
  ]);
  return [...(coding.icd10 ?? []), ...(coding.icd11 ?? []), ...(coding.icdO ?? []), ...(c.order?.icd10Codes ?? []).map(x => (typeof x === 'string' ? x : x.code)), ...fromSpecimens]
    .map(x => lower(x));
}

function snomedCodesOf(c: Case): Set<string> {
  return new Set([
    ...(c.coding?.snomed ?? []),
    ...(c.specimens ?? []).flatMap(s => (s.coding?.snomed ?? []).map(x => x.code)),
  ]);
}

/**
 * Batch 354: a chosen organisation includes everything under it. Choosing an
 * NHS Trust as the submitting facility or performing lab also matches its
 * hospital sites (Facility.parentId, at any depth). Run once per search,
 * before matching.
 */
export function expandOrganisationCriteria(
  criteria: CaseSearchCriteria, parentIdById: ReadonlyMap<string, string> | undefined,
): CaseSearchCriteria {
  if (!parentIdById?.size) return criteria;
  const out = { ...criteria };
  if (criteria.submittingFacilityIds?.length) out.submittingFacilityIds = withDescendantFacilityIds(criteria.submittingFacilityIds, parentIdById);
  if (criteria.performingLabIds?.length) out.performingLabIds = withDescendantFacilityIds(criteria.performingLabIds, parentIdById);
  return out;
}

/** Whether one case matches every criterion given (criteria are ANDed; values within one are ORed). */
export function matchesCaseSearch(c: Case, criteria: CaseSearchCriteria, ctx: CaseSearchMatchContext): boolean {
  const k = criteria;

  if (k.anyIdentifier?.trim() && !matchesAnyIdentifier(c, k.anyIdentifier)) return false;
  if (k.patientName?.trim()) {
    const name = lower(patientNameText(c));
    if (!words(k.patientName).every(w => name.includes(w))) return false;
  }
  if (k.mrn?.trim() && !containsId(c.patient?.mrn, k.mrn)) return false;
  if (k.mpiId?.trim() && c.patient?.id !== k.mpiId.trim()) return false;
  if (k.accessionNo?.trim()
    && !containsId(c.accession?.fullAccession, k.accessionNo)
    && !containsId(c.accession?.externalAccession, k.accessionNo)) return false;
  if (k.orderNo?.trim() && !orderNumbersOf(c).some(n => containsId(n, k.orderNo!))) return false;

  if (k.dateFrom || k.dateTo) {
    const instant = k.dateBasis === 'signedOut' ? caseSignedOutInstant(c)
      : k.dateBasis === 'released' ? caseReleasedInstant(c)
      : caseAccessionInstant(c);
    const day = toFacilityDate(instant, ctx.timeZone);
    if (!day) return false;
    if (k.dateFrom && day < k.dateFrom) return false;
    if (k.dateTo && day > k.dateTo) return false;
  }

  if (nonEmpty(k.sexes) && !k.sexes.includes(sexCode(c.patient?.sex))) return false;

  const dob = c.patient?.dateOfBirth?.slice(0, 10);
  if (k.dobFrom || k.dobTo) {
    if (!dob) return false;
    if (k.dobFrom && dob < k.dobFrom) return false;
    if (k.dobTo && dob > k.dobTo) return false;
  }
  if (k.ageMin !== undefined || k.ageMax !== undefined) {
    const today = toFacilityDate(ctx.now.toISOString(), ctx.timeZone) ?? '';
    const age = dob ? ageOn(dob, today) : null;
    if (age === null) return false;
    if (k.ageMin !== undefined && age < k.ageMin) return false;
    if (k.ageMax !== undefined && age > k.ageMax) return false;
  }

  if (nonEmpty(k.statuses) && !k.statuses.includes(c.status)) return false;
  if (nonEmpty(k.priorities)) {
    const p = lower(c.order?.priority ?? 'Routine');
    if (!k.priorities.some(x => lower(x) === p)) return false;
  }

  if (nonEmpty(k.caseFlagIds)
    && !(c.caseFlags ?? []).some(f => flagRecordMatches(f, k.caseFlagIds!, ctx.flagsById))) return false;
  if (nonEmpty(k.specimenFlagIds)
    && !(c.specimens ?? []).flatMap(s => s.specimenFlags ?? []).some(f => flagRecordMatches(f, k.specimenFlagIds!, ctx.flagsById))) return false;
  if (nonEmpty(k.synopticTemplateIds)) {
    const used = (c.synopticReports ?? []).map(r => r.templateId);
    if (!k.synopticTemplateIds.some(id => used.includes(id))) return false;
  }
  if (nonEmpty(k.pathologistIds)) {
    const staff = caseStaffInRole(c, k.pathologistRole ?? 'any', ctx);
    if (!k.pathologistIds.some(id => staff.has(id))) return false;
  }
  if (nonEmpty(k.orderingPhysicianIds)) {
    const byId = c.order?.orderingPhysicianId;
    const provider = stripTitle(c.order?.requestingProvider ?? '');
    const hit = k.orderingPhysicianIds.some(id =>
      id === byId
      || (!!provider && (ctx.physicianNamesById.get(id) ?? []).some(n => stripTitle(n) === provider)));
    if (!hit) return false;
  }
  if (nonEmpty(k.submittingFacilityIds) && !k.submittingFacilityIds.includes(c.order?.facilityId ?? '')) return false;

  if (nonEmpty(k.specimenTerms)) {
    const texts = (c.specimens ?? []).map(s => lower([s.description, s.label, s.displayName].filter(Boolean).join(' ')));
    if (!k.specimenTerms.some(term => texts.some(t => t.includes(lower(term).trim())))) return false;
  }
  if (nonEmpty(k.diagnosisTerms)) {
    const text = diagnosisText(c);
    if (!text || !k.diagnosisTerms.some(term => text.includes(lower(term).trim()))) return false;
  }
  if (nonEmpty(k.snomedCodes)) {
    const codes = snomedCodesOf(c);
    if (!k.snomedCodes.some(code => codes.has(code))) return false;
  }
  if (nonEmpty(k.icdCodes)) {
    const codes = icdCodesOf(c);
    // A category matches its sub-codes: C50 finds C50.412.
    if (!k.icdCodes.some(q => codes.some(code => code === lower(q) || code.startsWith(lower(q))))) return false;
  }

  // ── Batch 351 ─────────────────────────────────────────────────────────────
  if (nonEmpty(k.caseTypes)) {
    const types = caseTypesOf(c, ctx.specimenDictionary);
    if (!k.caseTypes.some(x => types.has(x))) return false;
  }
  if (nonEmpty(k.revisionTypes)) {
    const released = ctx.revisionTypesByCaseId?.get(c.id);
    const onCase = [c.lastRevisionType, ...(c.synopticReports ?? []).map(r => r.lastRevisionType)];
    if (!k.revisionTypes.some(x => onCase.includes(x) || !!released?.has(x))) return false;
  }
  if (nonEmpty(k.holdTypes)) {
    const held = {
      case: (c.caseHolds ?? []).some(h => h.active),
      retention: (c.retentionHolds ?? []).some(h => h.active),
      autopsyAncillary: !!c.autopsy?.ancillaryHold?.active,
    };
    if (!k.holdTypes.some(x => held[x])) return false;
  }
  if (nonEmpty(k.resultFlags)) {
    const severity = c.abnormalDetectionStatus?.severity;
    if (!severity || !k.resultFlags.includes(severity)) return false;
  }
  if (nonEmpty(k.pendingWork)) {
    const work = casePendingWork(c, ctx.stainCategoryByName);
    if (!k.pendingWork.some(x => work.has(x))) return false;
  }
  const performingLabId = ctx.performingLabByFacilityId?.get(c.order?.facilityId ?? '');
  if (nonEmpty(k.performingLabIds) && (!performingLabId || !k.performingLabIds.includes(performingLabId))) return false;
  const needsSubspecialty = nonEmpty(k.subspecialtyIds) || k.pastTatTarget === true;
  const subspecialtyId = needsSubspecialty ? (c.subspecialtyId ?? ctx.subspecialtyOf?.(c, performingLabId)) : undefined;
  if (nonEmpty(k.subspecialtyIds) && (!subspecialtyId || !k.subspecialtyIds.includes(subspecialtyId))) return false;
  if (k.pastTatTarget === true && !isPastTatTarget(c, ctx, performingLabId, subspecialtyId)) return false;
  if (nonEmpty(k.locationIds) && !k.locationIds.includes(c.order?.locationId ?? '')) return false;
  if (nonEmpty(k.intakes)) {
    const intake = c.order?.intakeType ?? 'standard';
    const hit = k.intakes.some(x => x === 'referenceLab' ? c.isReferenceLabCase === true : x === intake);
    if (!hit) return false;
  }
  if (k.payer?.trim()) {
    const o = c.order?.outsidePatientData;
    const text = lower([o?.accountBillingType, o?.primaryPayerName, o?.secondaryPayerName].filter(Boolean).join(' '));
    if (!text.includes(lower(k.payer).trim())) return false;
  }
  if (nonEmpty(k.cptCodes)) {
    const codes = cptCodesOf(c);
    if (!k.cptCodes.some(q => codes.some(code => code.startsWith(lower(q).trim())))) return false;
  }
  if (nonEmpty(k.autopsyJurisdictions) || nonEmpty(k.autopsyAuthorities) || nonEmpty(k.autopsyReports)) {
    const a = c.autopsy;
    if (!a) return false;
    if (nonEmpty(k.autopsyJurisdictions) && !k.autopsyJurisdictions.includes(a.jurisdiction)) return false;
    if (nonEmpty(k.autopsyAuthorities) && !k.autopsyAuthorities.includes(a.caseAuthority)) return false;
    if (nonEmpty(k.autopsyReports)) {
      const stage = { none: !a.padSnapshot && !a.fadSnapshot, pad: !!a.padSnapshot, fad: !!a.fadSnapshot };
      if (!k.autopsyReports.some(x => stage[x])) return false;
    }
  }
  return true;
}

// ── Ordering and paging ─────────────────────────────────────────────────────

export function compareCases(sort: CaseSearchSort): (a: Case, b: Case) => number {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const keyOf = (c: Case): string => {
    switch (sort.key) {
      case 'accessionDate':   return caseAccessionInstant(c) ?? '';
      case 'signedOutDate':   return caseSignedOutInstant(c) ?? '';
      case 'lastUpdated':     return c.updatedAt ?? '';
      case 'patientName':     return lower(patientSortName(c));
      case 'accessionNumber': return lower(c.accession?.fullAccession ?? c.id);
    }
  };
  return (a, b) => {
    const ka = keyOf(a); const kb = keyOf(b);
    // Cases with no value sort last either way.
    if (!ka !== !kb) return ka ? -1 : 1;
    const byKey = ka < kb ? -1 : ka > kb ? 1 : 0;
    if (byKey !== 0) return byKey * dir;
    // Stable tiebreak, so a case never appears on two pages.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** Clamps the page to what exists (a page past the end returns the last page). */
export function pageBounds(total: number, page: number, pageSize: number): { page: number; pageCount: number; start: number; end: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (p - 1) * pageSize;
  return { page: p, pageCount, start, end: Math.min(start + pageSize, total) };
}

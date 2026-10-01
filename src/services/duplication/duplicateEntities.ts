// src/services/duplication/duplicateEntities.ts
// ─────────────────────────────────────────────────────────────────────────────
// Entity-specific "Duplicate" rules (PS-73). Each function turns an existing
// record into the pre-filled draft an Add form opens with. It is never saved
// as-is: the admin reviews it, changes what makes it different, and Save goes
// through the screen's ordinary add()/create() path, which assigns the real id.
//
// Shared rules for every function here:
//   1. Pure. No storage, no clock, no randomness unless injected, and no
//      React. Components call these and render the result.
//   2. The copy never shares an id with its source. It carries
//      DUPLICATE_PLACEHOLDER_ID until the service's add() replaces it (every
//      add()/create() behind these screens assigns its own id; see the README).
//   3. Nested lists and objects are deep-copied (structuredClone), so editing
//      the copy's conditions, targets or pathways can never mutate the source.
//   4. The copy's display name is marked in the USER'S language through the
//      caller-supplied CopyNameFormatter (`t('common.copyOfName', { name })`).
//      It is stored as data, so it must never be a hard-coded English suffix.
//   5. Identity fields are cleared, not copied. These are fields that identify
//      one real-world thing or act as a matching key (accession prefixes, CLIA
//      numbers, printer IPs, specimen codes, gene symbols). A copied key is an
//      instant collision or, worse, a silent mis-match.
//   6. Built-in/system status never carries over. A duplicate is always a
//      custom, editable record.
//
// Which screens may offer Duplicate at all is decided in duplicatePolicy.ts,
// not here.
// ─────────────────────────────────────────────────────────────────────────────

import type { CopyNameFormatter } from '@/utils/duplicateEntry';
import { prepareDuplicate } from '@/utils/duplicateEntry';
import type { SpecimenCategory } from '@/services/specimenCategories/ISpecimenCategoryService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import type { RoutingRule } from '@/services/cases/casePoolAssignmentService';
import type { CassetteRoutingRule } from '@/services/cassetteRouting/ICassetteRoutingRuleService';
import type { AbnormalTriggerRule } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { WorkstationGroup } from '@/services/workstationGroups/IWorkstationGroupService';
import type { ActionGroup } from '@/services/actionGroups/IActionGroupService';
import type { ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { StainType, SectioningProtocol, StainOrderMacro } from '@/services/stains/IStainService';
import type { MolecularTarget } from '@/types/billing/MolecularBillingRule';
import type { Protocol as ProcessingProtocol } from '@/services/protocols/IProtocolService';
import { isPlatformOnly } from '../authorization/capabilityCatalog';

export type { CopyNameFormatter };

/** Id a draft copy carries until the service's add()/create() assigns a real one.
 *  Any code that sees this id is looking at an unsaved duplicate. */
export const DUPLICATE_PLACEHOLDER_ID = '__clone__';

/** Injectable id source for nested records (pathway/task ids) so tests are deterministic. */
export type IdGenerator = (prefix: string) => string;

export const defaultIdGenerator: IdGenerator = prefix =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Deep copy + placeholder id + localized copy name. The base for every function below. */
function baseCopy<T extends { id: string }>(source: T, nameKey: keyof T, copyName: CopyNameFormatter): T {
  return { ...prepareDuplicate(structuredClone(source), nameKey, copyName), id: DUPLICATE_PLACEHOLDER_ID };
}

// ─── Template entities ──────────────────────────────────────────────────────

/** Specimen category. Accession numbering (prefix + series) identifies which counter a case
 *  draws from, so a copy must not silently share it. Order-intake auto-create markers are
 *  cleared: the copy is a deliberate, admin-created record. */
export function duplicateSpecimenCategory(source: SpecimenCategory, copyName: CopyNameFormatter): SpecimenCategory {
  return {
    ...baseCopy(source, 'name', copyName),
    accessionPrefix: undefined,
    numberSeries: undefined,
    status: 'Active',
    autoCreated: undefined,
    autoCreatedAt: undefined,
    autoCreatedNote: undefined,
  };
}

/** Specimen dictionary entry. specimenCode is the spreadsheet re-import matching key and
 *  synonyms drive order-intake matching, so both would make two entries claim the same
 *  incoming order text. Audit fields reset. */
export function duplicateSpecimenEntry(source: SpecimenEntry, copyName: CopyNameFormatter): SpecimenEntry {
  return {
    ...baseCopy(source, 'name', copyName),
    specimenCode: undefined,
    synonyms: [],
    version: 1,
    updatedBy: '',
    updatedAt: '',
    autoCreated: undefined,
    autoCreatedAt: undefined,
    autoCreatedNote: undefined,
  };
}

/** Test panel / stain type. Every field is reusable configuration (antibody clone, vendor,
 *  billing, default targets); the copy just needs its own name and version history. */
export function duplicateStainType(source: StainType, copyName: CopyNameFormatter): StainType {
  return { ...baseCopy(source, 'name', copyName), version: 1, updatedBy: '', updatedAt: '' };
}

export function duplicateSectioningProtocol(source: SectioningProtocol, copyName: CopyNameFormatter): SectioningProtocol {
  return { ...baseCopy(source, 'name', copyName), version: 1, updatedBy: '', updatedAt: '' };
}

export function duplicateStainOrderMacro(source: StainOrderMacro, copyName: CopyNameFormatter): StainOrderMacro {
  return { ...baseCopy(source, 'label', copyName), version: 1, updatedBy: '', updatedAt: '' };
}

/** Molecular target. The symbol IS the target's identity (a gene/probe symbol such as
 *  "ERBB2"), and "ERBB2 (Copy)" is not a real symbol, so it is cleared for the admin to
 *  enter. The copy keeps detail, target type and billing model. */
export function duplicateMolecularTarget(source: MolecularTarget): MolecularTarget {
  return { ...structuredClone(source), id: DUPLICATE_PLACEHOLDER_ID, symbol: '' };
}

/** Processing protocol (Protocol Dictionary). Pathways and tasks get fresh ids so the copy's
 *  workflow steps can never be confused with the source's; version history starts over. */
export function duplicateProcessingProtocol(
  source: ProcessingProtocol,
  copyName: CopyNameFormatter,
  newId: IdGenerator = defaultIdGenerator,
): ProcessingProtocol {
  const copy = baseCopy(source, 'name', copyName);
  return {
    ...copy,
    pathways: copy.pathways.map(pw => ({
      ...pw,
      id: newId('track'),
      tasks: pw.tasks.map(task => ({ ...task, id: newId('task') })),
    })),
    version: 1,
    history: [],
    updatedBy: '',
    updatedAt: '',
  };
}

// ─── Complex configuration / rulesets ───────────────────────────────────────

/** Case-pool routing rule (shared by Routing Rules and Case Pool Assignment). A rule has no
 *  name; the admin note is its label. The copy is always custom and takes the next free
 *  priority, so it never collides with (or silently outranks) its source. */
export function duplicateRoutingRule(source: RoutingRule, allRules: RoutingRule[], copyName: CopyNameFormatter): RoutingRule {
  return {
    ...baseCopy(source, 'note', copyName),
    builtIn: false,
    priority: nextFreePriority(allRules.map(r => r.priority), source.priority),
  };
}

/** Lowest unused integer priority strictly after `after`. */
export function nextFreePriority(used: number[], after: number): number {
  const taken = new Set(used);
  let p = after + 1;
  while (taken.has(p)) p += 1;
  return p;
}

/** Cassette routing rule. Conditions are deep-copied. The copy starts INACTIVE: an
 *  unchanged copy would match exactly the same orders as its source, so it must not start
 *  routing real cassettes until the admin has made the change it was copied for. */
export function duplicateCassetteRoutingRule(source: CassetteRoutingRule, copyName: CopyNameFormatter): CassetteRoutingRule {
  return { ...baseCopy(source, 'name', copyName), active: false, createdAt: '', updatedAt: '' };
}

/** Abnormal-result trigger rule. fieldLabel is a MATCHING KEY (compared to the synoptic
 *  field's label), so it is not renamed. The usual reason to copy is a lab-scoped variant,
 *  and the Add form's fieldLabel + lab uniqueness check forces a real difference before save.
 *  Starts Inactive for the same reason as cassette routing. */
export function duplicateAbnormalTriggerRule(source: AbnormalTriggerRule): AbnormalTriggerRule {
  return { ...structuredClone(source), id: DUPLICATE_PLACEHOLDER_ID, status: 'Inactive' };
}

/** TAT / escalation target. No name field; the copy keeps every scoping dimension so the
 *  admin changes one (lab, facility, specimen, role…). The form's conflict check blocks an
 *  unchanged save. A system entry's "System default" note would be false on a custom copy,
 *  so it is cleared. */
export interface TatRuleLike {
  id: string;
  notes: string;
  createdAt: string;
  active: boolean;
}
export function duplicateTatEntry<T extends TatRuleLike>(source: T, isSystemEntry: boolean): T {
  return {
    ...structuredClone(source),
    id: DUPLICATE_PLACEHOLDER_ID,
    notes: isSystemEntry ? '' : source.notes,
    createdAt: '',
    active: true,
  };
}

/** Role. Permissions, facility access and participation types are exactly what makes a
 *  role expensive to set up, so they all carry. A copy is always a custom role, never a
 *  second role claiming built-in status. Generic because the Role Dictionary screen types
 *  its own Role shape. */
export function duplicateRole<T extends { id: string; name: string; builtIn: boolean }>(source: T, copyName: CopyNameFormatter): T {
  // PS-355: a copy keeps the capabilities (the reason to duplicate) but is an
  // ordinary custom role: assignable to staff even when the source isn't
  // (Superadmin), and with no record of built-in seeds offered.
  const copy = { ...baseCopy(source, 'name', copyName), builtIn: false } as T & { assignable?: boolean; seededCapabilities?: string[] };
  delete copy.assignable;
  delete copy.seededCapabilities;
  // Batch 371: a copy is a hospital role, so it can't carry ForMedrixAI
  // platform capabilities (a copy of Superadmin keeps everything else).
  const caps = (copy as { capabilities?: string[] }).capabilities;
  if (caps) (copy as { capabilities?: string[] }).capabilities = caps.filter(k => !isPlatformOnly(k));
  return copy;
}

/** QA activity / supervision type. Duplicate is how a site creates a Custom type from a
 *  Standard one: the copy always lands in the Custom tab, active, with its lineage recorded
 *  in duplicatedFromId. The QA screen upserts by id (an existing id means EDIT), so this
 *  one returns a real, fresh id rather than the placeholder: reusing the source id would
 *  silently overwrite the curated Standard entry. */
export function duplicateQaType<T extends { id: string; name: string; tabScope: 'standard' | 'custom'; duplicatedFromId?: string; active: boolean }>(
  source: T,
  idPrefix: 'qa-activity' | 'qa-supervision-type',
  copyName: CopyNameFormatter,
  now: () => number = Date.now,
): T {
  return {
    ...baseCopy(source, 'name', copyName),
    id: `${idPrefix}-${now().toString(36)}`,
    tabScope: 'custom',
    duplicatedFromId: source.id,
    active: true,
  };
}

// ─── Multi-site variants ────────────────────────────────────────────────────

/** Printer profile. Model/DPI/ZPL settings are the reusable part. printerId and ipAddress
 *  identify one physical device on the network: a copy that kept them would send labels
 *  to the source's printer. */
export function duplicatePrinterProfile(source: PrinterProfile): PrinterProfile {
  // Batch 359: the register device is a physical printer too, so it isn't copied.
  return { ...structuredClone(source), id: DUPLICATE_PLACEHOLDER_ID, printerId: '', ipAddress: undefined, equipmentId: undefined, createdAt: '', updatedAt: '' };
}

/** Workstation group. Discipline, functional area, QC mode and allowed action groups carry
 *  over; the usual edit is the performing lab. */
export function duplicateWorkstationGroup(source: WorkstationGroup, copyName: CopyNameFormatter): WorkstationGroup {
  return { ...baseCopy(source, 'name', copyName), status: 'Active', createdAt: '', createdBy: '' };
}

export function duplicateActionGroup(source: ActionGroup, copyName: CopyNameFormatter): ActionGroup {
  return { ...baseCopy(source, 'name', copyName), status: 'Active', createdAt: '', createdBy: '' };
}

/** Participation type. Capability flags, colour, jurisdiction scope and each country's
 *  authority flags and regulatory note carry over. Not copied:
 *   - abbreviation: must be unique (the Add form enforces it);
 *   - facility authorityOverrides: each is an audited, justified break-glass decision
 *     about ONE role at ONE lab (who/when/why). Copying it would put an override on
 *     record that nobody made for this role;
 *   - each country's local `label`: it names the SOURCE role (e.g. the UK title for a
 *     resident), and a copy showing the same regional title would look identical in
 *     that country;
 *   - isSystem: a copy is always custom. */
export function duplicateParticipationType(source: ParticipationTypeRecord, copyName: CopyNameFormatter): ParticipationTypeRecord {
  const copy = baseCopy(source, 'label', copyName);
  const profiles = copy.jurisdictionProfiles
    ? Object.fromEntries(
        Object.entries(copy.jurisdictionProfiles).map(([j, p]) => {
          const { label: _regionalTitle, ...rest } = p ?? {};
          return [j, rest];
        }),
      ) as ParticipationTypeRecord['jurisdictionProfiles']
    : undefined;
  return { ...copy, abbreviation: '', authorityOverrides: undefined, jurisdictionProfiles: profiles, isSystem: false };
}

/** Facility. The reusable part is the org-level configuration: roles, jurisdiction,
 *  reporting, TAT/escalation, AI settings, LIS routing, identifier formats, print and
 *  release settings. Cleared:
 *   - assigningAuthority: the key order intake resolves a facility by;
 *   - cliaOrIsoNumber, legacyTenantIds: identify one accredited site / one migrated tenant;
 *   - address/city/state/zip, phone/fax/email, contact* fields, directorName, notes: belong
 *     to one location or one person;
 *   - authorizedPediatricPathologistIds: a per-site authorization of named people;
 *   - interfaceEngineConnection.endpoint and credentialConfigured: the connection SHAPE
 *     (HL7 version, auth type, status ownership) carries, but the copy has no endpoint and
 *     no credentials yet, and must not claim it does;
 *   - status/autoCreated*: a fresh, staff-created record. */
export function duplicateFacility(source: Facility, copyName: CopyNameFormatter): Facility {
  const copy = baseCopy(source, 'name', copyName);
  return {
    ...copy,
    assigningAuthority: '',
    cliaOrIsoNumber: undefined,
    legacyTenantIds: undefined,
    address: '',
    city: undefined,
    state: undefined,
    zip: undefined,
    phone: '',
    fax: '',
    email: '',
    contactNamePrefix: '',
    contactGivenNames: '',
    contactFamilyNames: '',
    contactPreferredName: '',
    contactNameSuffix: '',
    contactName: '',
    contactTitle: '',
    directorName: undefined,
    notes: '',
    authorizedPediatricPathologistIds: [],
    interfaceEngineConnection: copy.interfaceEngineConnection
      ? { ...copy.interfaceEngineConnection, endpoint: '', credentialConfigured: false }
      : copy.interfaceEngineConnection,
    status: 'Active',
    autoCreated: false,
    autoCreatedAt: undefined,
    autoCreatedNote: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  };
}

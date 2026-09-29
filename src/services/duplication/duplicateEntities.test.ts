import { describe, it, expect } from 'vitest';
import {
  DUPLICATE_PLACEHOLDER_ID,
  duplicateSpecimenCategory,
  duplicateSpecimenEntry,
  duplicateStainType,
  duplicateSectioningProtocol,
  duplicateStainOrderMacro,
  duplicateMolecularTarget,
  duplicateProcessingProtocol,
  duplicateRoutingRule,
  nextFreePriority,
  duplicateCassetteRoutingRule,
  duplicateAbnormalTriggerRule,
  duplicateTatEntry,
  duplicatePrinterProfile,
  duplicateWorkstationGroup,
  duplicateActionGroup,
  duplicateParticipationType,
  duplicateFacility,
} from './duplicateEntities';
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
import type { Protocol } from '@/services/protocols/IProtocolService';

/** Stand-in for t('common.copyOfName', { name }) in French — proves the marker is the caller's, not English. */
const fr = (name: string) => `${name} (copie)`;

describe('every duplicate gets a placeholder id and never shares nested objects with its source', () => {
  it('specimen category', () => {
    const src = { id: 'cat-1', name: 'Surgical', defaultGrossingTemplateId: 'g1', status: 'Inactive', retentionOverrideDays: { BLOCK: 3650 } } as unknown as SpecimenCategory;
    const copy = duplicateSpecimenCategory(src, fr);
    expect(copy.id).toBe(DUPLICATE_PLACEHOLDER_ID);
    expect(copy.retentionOverrideDays).toEqual(src.retentionOverrideDays);
    expect(copy.retentionOverrideDays).not.toBe(src.retentionOverrideDays);
  });

  it('cassette routing conditions are deep-copied', () => {
    const src = { id: 'route-1', name: 'STAT', conditions: { priorities: ['STAT'] }, colorId: 'c1', priorityWeight: 5, active: true, createdAt: 'x', updatedAt: 'y' } as unknown as CassetteRoutingRule;
    const copy = duplicateCassetteRoutingRule(src, fr);
    (copy.conditions as unknown as { priorities: string[] }).priorities.push('ROUTINE');
    expect((src.conditions as unknown as { priorities: string[] }).priorities).toEqual(['STAT']);
  });
});

describe('template entities', () => {
  it('specimen category: localized name, accession numbering and auto-create markers cleared, Active', () => {
    const src = { id: 'cat-1', name: 'Surgical', defaultGrossingTemplateId: 'g1', accessionPrefix: 'S', numberSeries: 'surg', status: 'Unverified', autoCreated: true, autoCreatedAt: '2026-01-01', autoCreatedNote: 'ORD-9', performingLabFacilityId: 'lab-1' } as SpecimenCategory;
    const copy = duplicateSpecimenCategory(src, fr);
    expect(copy.name).toBe('Surgical (copie)');
    expect(copy.accessionPrefix).toBeUndefined();
    expect(copy.numberSeries).toBeUndefined();
    expect(copy.status).toBe('Active');
    expect(copy.autoCreated).toBeUndefined();
    expect(copy.autoCreatedNote).toBeUndefined();
    expect(copy.defaultGrossingTemplateId).toBe('g1');
    expect(copy.performingLabFacilityId).toBe('lab-1');
  });

  it('specimen entry: matching keys (code, synonyms) cleared, clinical defaults kept, version reset', () => {
    const src = { id: 'sp-1', name: 'Breast core biopsy', type: 'Biopsy', procedure: 'Core', normalizedLabel: 'breast core', synonyms: ['BCB'], specimenCode: 'BR-CORE', active: true, version: 7, updatedBy: 'a', updatedAt: 'b', defaultBaseCptCode: '88305', defaultStains: ['H&E', 'ER'] } as SpecimenEntry;
    const copy = duplicateSpecimenEntry(src, fr);
    expect(copy.name).toBe('Breast core biopsy (copie)');
    expect(copy.specimenCode).toBeUndefined();
    expect(copy.synonyms).toEqual([]);
    expect(copy.version).toBe(1);
    expect(copy.defaultBaseCptCode).toBe('88305');
    expect(copy.defaultStains).toEqual(['H&E', 'ER']);
  });

  it('stain type keeps its configuration and default targets (deep), resets version', () => {
    const src = { id: 'st-1', name: 'HER2 FISH', category: 'Molecular', antibodyClone: '4B5', defaultTargets: [{ id: 't1', symbol: 'ERBB2', targetType: 'GENE', active: true }], active: true, version: 3, updatedBy: 'a', updatedAt: 'b' } as unknown as StainType;
    const copy = duplicateStainType(src, fr);
    expect(copy.name).toBe('HER2 FISH (copie)');
    expect(copy.antibodyClone).toBe('4B5');
    expect(copy.version).toBe(1);
    expect(copy.defaultTargets).toEqual(src.defaultTargets);
    expect(copy.defaultTargets).not.toBe(src.defaultTargets);
  });

  it('sectioning protocol and order macro', () => {
    const sp = { id: 'p1', name: 'Levels x3', active: true, version: 2, updatedBy: 'a', updatedAt: 'b' } as SectioningProtocol;
    expect(duplicateSectioningProtocol(sp, fr).name).toBe('Levels x3 (copie)');
    const macro = { id: 'm1', label: 'Deeper levels', stainTypeId: 's', sectioningProtocolId: 'p', sortOrder: 1, active: true, version: 4, updatedBy: 'a', updatedAt: 'b' } as StainOrderMacro;
    const mc = duplicateStainOrderMacro(macro, fr);
    expect(mc.label).toBe('Deeper levels (copie)');
    expect(mc.version).toBe(1);
  });

  it('molecular target: the gene symbol is its identity, so it is cleared rather than suffixed', () => {
    const copy = duplicateMolecularTarget({ id: 't1', symbol: 'ERBB2', detail: 'HER2', targetType: 'GENE', active: true });
    expect(copy.symbol).toBe('');
    expect(copy.detail).toBe('HER2');
    expect(copy.id).toBe(DUPLICATE_PLACEHOLDER_ID);
  });

  it('processing protocol: fresh pathway/task ids from the injected generator, history cleared', () => {
    let n = 0;
    const ids = (p: string) => `${p}-${++n}`;
    const src = {
      id: 'proto-1', name: 'Renal biopsy', requiresTriage: true, active: true, version: 5, updatedBy: 'a', updatedAt: 'b',
      pathways: [{ id: 'track-a', pathwayName: 'LM', tasks: [{ id: 'task-a' }, { id: 'task-b' }] }],
      history: [{ version: 4 }],
    } as unknown as Protocol;
    const copy = duplicateProcessingProtocol(src, fr, ids);
    expect(copy.name).toBe('Renal biopsy (copie)');
    expect(copy.pathways[0].id).toBe('track-1');
    expect(copy.pathways[0].tasks.map(t => t.id)).toEqual(['task-2', 'task-3']);
    expect(src.pathways[0].id).toBe('track-a');
    expect(copy.history).toEqual([]);
    expect(copy.version).toBe(1);
  });
});

describe('rulesets', () => {
  it('routing rule: custom, localized note, next free priority after the source', () => {
    const rules = [
      { id: 'r1', subspecialtyId: 'gi', keywords: ['colon'], builtIn: true, active: true, priority: 10, note: 'Colorectal' },
      { id: 'r2', subspecialtyId: 'gi', keywords: ['gastric'], builtIn: true, active: true, priority: 11 },
    ] as RoutingRule[];
    const copy = duplicateRoutingRule(rules[0], rules, fr);
    expect(copy.builtIn).toBe(false);
    expect(copy.note).toBe('Colorectal (copie)');
    expect(copy.priority).toBe(12);
    expect(copy.keywords).toEqual(['colon']);
    expect(copy.keywords).not.toBe(rules[0].keywords);
  });

  it('nextFreePriority skips every taken value', () => {
    expect(nextFreePriority([1, 2, 3, 5], 1)).toBe(4);
    expect(nextFreePriority([], 9)).toBe(10);
  });

  it('cassette routing and abnormal trigger copies start inactive', () => {
    const cr = { id: 'x', name: 'STAT', conditions: {}, colorId: 'c', priorityWeight: 1, active: true, createdAt: 'a', updatedAt: 'b' } as unknown as CassetteRoutingRule;
    expect(duplicateCassetteRoutingRule(cr, fr).active).toBe(false);
    const atr = { id: 'atr-1', fieldLabel: 'Margin Status', triggerValues: ['Positive'], severity: 'critical', status: 'Active' } as unknown as AbnormalTriggerRule;
    const copy = duplicateAbnormalTriggerRule(atr);
    expect(copy.status).toBe('Inactive');
    expect(copy.fieldLabel).toBe('Margin Status'); // matching key — never renamed
  });

  it('TAT entry: keeps every scoping dimension, clears a system note only', () => {
    const sys = { id: 'sys-so-r', type: 'SIGN_OUT', targetHours: 4, roleId: 'Resident', notes: 'System default', createdAt: '2024', active: false };
    const copy = duplicateTatEntry(sys, true);
    expect(copy.roleId).toBe('Resident');
    expect(copy.notes).toBe('');
    expect(copy.active).toBe(true);
    expect(copy.id).toBe(DUPLICATE_PLACEHOLDER_ID);
    expect(duplicateTatEntry({ ...sys, id: 'tat-1', notes: 'Contract B' }, false).notes).toBe('Contract B');
  });
});

describe('multi-site variants', () => {
  it('printer profile: the physical device (printerId, IP) is not copied', () => {
    const src = { id: 'pp-1', printerId: 'ZT411-BENCH3', model: 'ZT411', dpi: 300, ipAddress: '10.0.0.4', port: 9100, vendor: 'Zebra', active: true, createdAt: 'a', updatedAt: 'b' } as unknown as PrinterProfile;
    const copy = duplicatePrinterProfile(src);
    expect(copy.printerId).toBe('');
    expect(copy.ipAddress).toBeUndefined();
    expect(copy.model).toBe('ZT411');
    expect(copy.port).toBe(9100);
  });

  it('workstation and action groups: localized name, deep-copied id lists', () => {
    const wg = { id: 'wg-1', name: 'Grossing bench', discipline: 'HISTOLOGY', functionalArea: 'Grossing', performingLabFacilityId: 'lab-1', allowedActionGroupIds: ['ag-1'], status: 'Inactive', createdAt: 'a', createdBy: 'b' } as unknown as WorkstationGroup;
    const wc = duplicateWorkstationGroup(wg, fr);
    expect(wc.name).toBe('Grossing bench (copie)');
    expect(wc.allowedActionGroupIds).not.toBe(wg.allowedActionGroupIds);
    const ag = { id: 'ag-1', name: 'Embedding', actionIds: ['a1'], status: 'Active', createdAt: 'a', createdBy: 'b' } as ActionGroup;
    expect(duplicateActionGroup(ag, fr).name).toBe('Embedding (copie)');
  });

  it('participation type: never system, no abbreviation, no facility overrides, no regional titles — but keeps country authority flags', () => {
    const src = {
      id: 'resident', label: 'Resident / Fellow', description: 'd', color: '#60a5fa', allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
      abbreviation: 'RES', requiresCountersign: true, canFinalize: false,
      authorityOverrides: { 'lab-1': { canFinalize: true, overriddenBy: { userId: 'u', userName: 'U' }, overriddenAt: 'x', justification: 'j' } },
      jurisdictionProfiles: { GB_EW: { label: 'Specialty Registrar', regulatoryNote: 'RCPath', requiresCountersign: true } },
      scopedJurisdictions: ['GB_EW'],
    } as unknown as ParticipationTypeRecord;
    const copy = duplicateParticipationType(src, fr);
    expect(copy.label).toBe('Resident / Fellow (copie)');
    expect(copy.isSystem).toBe(false);
    expect(copy.abbreviation).toBe('');
    expect(copy.authorityOverrides).toBeUndefined();
    expect(copy.jurisdictionProfiles?.GB_EW).toEqual({ regulatoryNote: 'RCPath', requiresCountersign: true });
    expect(copy.scopedJurisdictions).toEqual(['GB_EW']);
    expect(src.jurisdictionProfiles?.GB_EW?.label).toBe('Specialty Registrar');
  });

  it('facility: org configuration carries, site/person identity does not', () => {
    const src = {
      id: 'f1', name: 'North Lab', assigningAuthority: 'NLAB', address: '1 Main', city: 'Leeds', state: 'WY', zip: 'LS1', phone: 'p', fax: 'f', email: 'e',
      contactGivenNames: 'Ann', contactFamilyNames: 'Lee', notes: 'n', roles: ['PERFORMING_LAB'], jurisdiction: 'GB_EW', reporting: { x: 1 },
      cliaOrIsoNumber: 'ISO-15189-1', directorName: 'Dr Lee', legacyTenantIds: ['t1'], authorizedPediatricPathologistIds: ['u9'],
      interfaceEngineConnection: { endpoint: 'mllp://a', hl7Version: '2.5.1', authType: 'basic', credentialConfigured: true },
      lisRouting: { mode: 'x' }, status: 'Unverified', autoCreated: true, pediatricAgeThreshold: 16, tatFirstTouchHours: 4, tatTotalHours: 48,
      escalationTargets: ['admin'], escalationPriority: 'high',
    } as unknown as Facility;
    const copy = duplicateFacility(src, fr);
    expect(copy.name).toBe('North Lab (copie)');
    expect(copy.id).toBe(DUPLICATE_PLACEHOLDER_ID);
    for (const k of ['assigningAuthority', 'address', 'phone', 'fax', 'email', 'contactGivenNames', 'contactFamilyNames', 'notes'] as const) expect(copy[k]).toBe('');
    for (const k of ['cliaOrIsoNumber', 'directorName', 'legacyTenantIds', 'city', 'state', 'zip'] as const) expect(copy[k]).toBeUndefined();
    expect(copy.authorizedPediatricPathologistIds).toEqual([]);
    expect(copy.interfaceEngineConnection).toEqual({ endpoint: '', hl7Version: '2.5.1', authType: 'basic', credentialConfigured: false });
    expect(copy.lisRouting).toEqual(src.lisRouting);
    expect(copy.lisRouting).not.toBe(src.lisRouting);
    expect(copy.jurisdiction).toBe('GB_EW');
    expect(copy.tatTotalHours).toBe(48);
    expect(copy.status).toBe('Active');
    expect(copy.autoCreated).toBe(false);
  });
});

describe('duplicateRole (PS-355)', async () => {
  const { duplicateRole } = await import('./duplicateEntities');
  it('keeps the capabilities, but the copy is an ordinary, assignable custom role', () => {
    const copy = duplicateRole(
      { id: 'superadmin', name: 'Superadmin', builtIn: true, assignable: false, capabilities: ['qa:fppe-tracking:export'], seededCapabilities: ['qa:fppe-tracking:export'] },
      n => `Copy of ${n}`,
    );
    expect(copy).toMatchObject({ name: 'Copy of Superadmin', builtIn: false, capabilities: ['qa:fppe-tracking:export'] });
    expect('assignable' in copy).toBe(false);
    expect('seededCapabilities' in copy).toBe(false);
  });
  it('a copy of Superadmin drops the ForMedrixAI platform capabilities (Batch 371)', () => {
    const copy = duplicateRole(
      { id: 'superadmin', name: 'Superadmin', builtIn: true, assignable: false, capabilities: ['qa:fppe-tracking:export', 'platform:governing-bodies:manage'] },
      n => `Copy of ${n}`,
    );
    expect(copy.capabilities).toEqual(['qa:fppe-tracking:export']);
  });
});

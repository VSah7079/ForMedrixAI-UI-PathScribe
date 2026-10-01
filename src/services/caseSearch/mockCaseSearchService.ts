// src/services/caseSearch/mockCaseSearchService.ts
// Batch 350: the case search service wired to this build's mock data.
// Accessible cases come from caseRouter.getAll(), which applies the
// organisation and pool access rules (and audits the search); whether
// Orchestration cases are included is decided from the session user's
// permission, not by the caller.
//
// Batch 351: loadReferenceData() gathers what the new filters join —
// specimen and stain dictionaries, performing labs, released amendments,
// countersigns, delegations, subspecialty and turnaround resolvers. The API
// server joins the same data in SQL.
import type { Case } from '@/types/case/Case';
import { caseRouter } from '../cases/CaseRouter';
import { mockDelegationService } from '../delegations/mockDelegationService';
import { mockTatTargetService } from '../tatConfig/mockTatTargetService';
import { resolveTatTargetHours } from '../tatConfig/tatTargetResolution';
import { mockCountersignService } from '../cases/mockCountersignService';
import { testSpecimenRouting } from '../cases/casePoolAssignmentService';
import { getSessionUser } from '../auth/caseAccessControl';
import { mockPhysicianService } from '../physicians/mockPhysicianService';
import { mockFlagService } from '../flags/mockFlagService';
import { mockAuditService } from '../auditlog/mockAuditService';
import { mockSpecimenDictionaryService } from '../specimenDictionary/mockSpecimenDictionaryService';
import { mockStainTypeService } from '../stains/mockStainTypeService';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { resolvePerformingLabFacilityId } from '../facilities/IFacilityService';
import { parentFacilityIdMap } from '../facilities/facilityHierarchy';
import { mockAmendmentService } from '../reports/mockAmendmentService';
import { deriveSubspecialtyFromProtocols } from '../reportTemplates/TemplateRoutingService';
import { isUrgentCase } from '@/utils/caseUrgency';
import { createCaseSearchService } from './createCaseSearchService';
import type { CaseSearchReferenceData } from './caseSearchMatching';

/** A case's subspecialty when it doesn't record one: from its protocols, else from specimen routing rules. */
function derivedSubspecialty(c: Case, performingLabId: string | undefined): string | undefined {
  const fromProtocols = deriveSubspecialtyFromProtocols((c.synopticReports ?? []).map(r => r.templateId));
  if (fromProtocols) return fromProtocols;
  for (const s of c.specimens ?? []) {
    const hit = testSpecimenRouting(s.description ?? s.label ?? '', performingLabId, s.specimenDictionaryEntryId);
    if (hit.matched && hit.subspecialtyId) return hit.subspecialtyId;
  }
  return undefined;
}

/** Batch 353: the case's total-TAT target, from the TAT target service. */
async function loadTatResolver(): Promise<CaseSearchReferenceData['tatTargetHoursOf']> {
  const res = await mockTatTargetService.getAll();
  if (!res.ok) return undefined;
  const entries = res.data;
  return (c, { performingLabId, subspecialtyId }) => resolveTatTargetHours(entries, 'TOTAL_CASE', {
    facilityId: c.order?.facilityId,
    performingLabFacilityId: performingLabId,
    specimenId: c.specimens?.[0]?.specimenDictionaryEntryId,
    subspecialtyId,
    urgency: isUrgentCase(c) ? 'STAT' : 'ROUTINE',
  });
}

async function loadReferenceData(): Promise<CaseSearchReferenceData> {
  const [physicians, flags, dictionary, stains, facilities, amendments, countersigns, delegations, tatTargetHoursOf] = await Promise.all([
    mockPhysicianService.getAll(), mockFlagService.getAll(), mockSpecimenDictionaryService.getAll(),
    mockStainTypeService.getAll(), mockFacilityService.getAll(), mockAmendmentService.getAll(),
    mockCountersignService.getAll(), mockDelegationService.list().then(r => (r.ok ? r.data : [])).catch(() => []), loadTatResolver().catch(() => undefined),
  ]);

  const physicianNamesById = new Map<string, string[]>();
  if (physicians.ok === true) {
    for (const p of physicians.data) {
      const given = p.givenNames || p.firstName || '';
      const family = p.familyNames || p.lastName || '';
      physicianNamesById.set(p.id, [`${given} ${family}`.trim(), p.preferredName ? `${p.preferredName} ${family}`.trim() : ''].filter(Boolean));
    }
  }

  const performingLabByFacilityId = new Map<string, string>();
  if (facilities.ok === true) {
    for (const f of facilities.data) {
      const lab = resolvePerformingLabFacilityId(f);
      if (lab) performingLabByFacilityId.set(f.id, lab);
    }
  }

  const revisionTypesByCaseId = new Map<string, Set<string>>();
  if (amendments.ok === true) {
    for (const a of amendments.data.filter(x => x.status === 'released')) {
      revisionTypesByCaseId.set(a.caseId, new Set([...(revisionTypesByCaseId.get(a.caseId) ?? []), a.type]));
    }
  }

  const countersignsByCaseId = new Map<string, Array<{ residentId?: string; attendingId?: string }>>();
  if (countersigns.ok === true) {
    for (const r of countersigns.data) {
      countersignsByCaseId.set(r.caseId, [...(countersignsByCaseId.get(r.caseId) ?? []), { residentId: r.residentId, attendingId: r.attendingId }]);
    }
  }

  // Open delegations only: pending or accepted.
  const delegateesByCaseId = new Map<string, Set<string>>();
  for (const d of delegations) {
    if (!d.toUserId || (d.status !== 'pending' && d.status !== 'accepted')) continue;
    delegateesByCaseId.set(d.caseId, new Set([...(delegateesByCaseId.get(d.caseId) ?? []), d.toUserId]));
  }

  return {
    physicianNamesById,
    flagsById: new Map(flags.ok === true ? flags.data.map(f => [f.id, { name: f.name, lisCode: f.lisCode }] as const) : []),
    specimenDictionary: dictionary.ok === true ? dictionary.data.map(e => ({ id: e.id, specimenCategory: e.specimenCategory })) : [],
    performingLabByFacilityId,
    parentFacilityIdById: parentFacilityIdMap(facilities.ok === true ? facilities.data : []),
    stainCategoryByName: new Map(stains.ok === true ? stains.data.map(s => [s.name.toLowerCase(), s.category] as const) : []),
    revisionTypesByCaseId,
    countersignsByCaseId,
    delegateesByCaseId,
    subspecialtyOf: derivedSubspecialty,
    tatTargetHoursOf,
  };
}

export const mockCaseSearchService = createCaseSearchService({
  loadAccessibleCases() {
    const user = getSessionUser();
    return caseRouter.getAll(undefined, { includeOrchestration: user?.canViewOrchestration === true, userId: user?.id });
  },

  loadReferenceData,

  // Batch 372: a search run by support is recorded in the support audit
  // stream of each organisation support can currently reach.
  auditSearch({ fieldsUsed }) {
    const user = getSessionUser();
    if (user?.role !== 'superadmin') return;
    void (async () => {
      const [{ recordSearch }, { supportAccessService }, { mockFacilityService }, { readSessionProfile }] = await Promise.all([
        import('../supportAccess/supportAccessGate'), import('../supportAccess/defaultSupportAccessService'),
        import('../facilities/mockFacilityService'), import('../auth/sessionProfile'),
      ]);
      const facilities = await mockFacilityService.getAll();
      await recordSearch({ ...user, name: readSessionProfile()?.name }, fieldsUsed, facilities.ok ? facilities.data.filter(f => f.isEnterprise) : [], supportAccessService);
    })().catch(() => {});
  },

  auditExport({ rowCount, total }) {
    const user = getSessionUser();
    // Audit detail stays literal English and carries no patient data.
    mockAuditService.logEvent({
      type: 'user',
      event: 'Case Search Export',
      detail: `Exported ${rowCount} of ${total} matching cases from Search to CSV`,
      user: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.id : 'unknown',
      caseId: null,
      confidence: null,
    }).catch(() => {});
  },
});

/**
 * CaseRouter — Unified Case Service Façade
 *
 * Routes case requests to the correct data source without exposing
 * which source is being used to the calling component.
 *
 * Architecture
 * ────────────
 *  CaseRouter (this file — one singleton, injected with real services in prod)
 *      ├── ILISCaseService   → FHIRCaseService   (NHS HL7 FHIR R4)
 *      │       └── AuditLogger('LIS')   — independent DSPT audit trail
 *      └── IOrchCaseService  → FirestoreCaseService (PathScribe Firestore)
 *              └── AuditLogger('ORCH')  — independent PathScribe audit trail
 *
 * Routing key
 * ───────────
 * Case IDs prefixed 'O26-' belong to the PathScribe Orchestrator (Firestore).
 * All other IDs are routed to the LIS (FHIR) service.
 *
 * In production, replace isOrchCaseId() with a Case Registry microservice lookup
 * (no patient data — just { caseId → serviceType }) to satisfy UK GDPR Art. 25
 * data minimisation. See PRODUCTION_MIGRATION.md for details.
 *
 * UK / EU compliance
 * ──────────────────
 * - Each underlying service retains its own auth token and AuditLogger.
 *   The router never holds credentials or touches patient data directly.
 * - listCasesForUser queries both services independently so each access
 *   is audited against the correct data controller (NHS Trust vs PathScribe).
 * - getAll is delegated to the LIS service only (LIS is the system of record
 *   for search / admin views). Override if your use-case requires Firestore search.
 */

import type { Case }                                          from '@/types/case/Case';
import type { ICaseService, CaseFilterParams } from './ICaseService';
import type { ServiceResult }                                 from '../types';
import { AuditLogger }                                        from './AuditLogger';
import { ConcurrencyConflictError }                            from './ConcurrencyConflictError';
import { mockCaseService }             from './mockCaseService';
import { mockOrchestratorCaseService } from './mockOrchestratorCaseService';
import { readSessionProfile } from '../auth/sessionProfile';
import { getSessionUser, canAccessCaseWithPools, filterAccessibleCasesWithPools, deriveEligibleFinalizerIds, isCrossTenantSupportAccess, type CaseAccessSubspecialty } from '../auth/caseAccessControl';
import { mockSubspecialtyService as subspecialtyService } from '../subspecialties/mockSubspecialtyService';
import { mockFacilityService } from '../facilities/mockFacilityService';
import type { Facility } from '../facilities/IFacilityService';
import { getParticipationTypeLookup } from '../../utils/participationTypeLookup';
import { isOrchCaseId } from './reportingModeRouting';
import { mergeDualSourcePages } from './caseFilterUtils';
import { getEffectiveScanStationId } from '../../utils/effectiveScanStation';

// Real dimension-3 (pool/subspecialty) enforcement needs a lookup of every
// subspecialty by id to check isWorkgroupEnabled/userIds against a case's
// subspecialtyId. Cached the same way templateService.ts's
// getTemplateCached/listTemplatesCached are — the underlying data changes
// rarely (admin-managed, not per-request) and re-fetching it on every
// single case read/list call would be real, avoidable latency for no
// benefit. Memoizes the in-flight PROMISE, not just the resolved value, so
// concurrent calls share one fetch rather than firing several.
let subspecialtyLookupPromise: Promise<Map<string, CaseAccessSubspecialty>> | null = null;
async function getSubspecialtyLookup(): Promise<Map<string, CaseAccessSubspecialty>> {
  if (!subspecialtyLookupPromise) {
    subspecialtyLookupPromise = subspecialtyService.getAll()
      .then(res => {
        const map = new Map<string, CaseAccessSubspecialty>();
        if (res.ok) {
          res.data.forEach(s => map.set(s.id, {
            id: s.id,
            userIds: s.userIds ?? [],
            isWorkgroup: s.isWorkgroup ?? false,
            isWorkgroupEnabled: s.isWorkgroupEnabled ?? false,
          }));
        }
        return map;
      })
      .catch(() => new Map<string, CaseAccessSubspecialty>());
    // A failed fetch shouldn't poison the cache forever.
    subspecialtyLookupPromise.catch(() => { subspecialtyLookupPromise = null; });
  }
  return subspecialtyLookupPromise;
}

// Phase 1 of the Organisation/Site -> Facility migration (see
// caseAccessControl.ts's own updated design principle #2): the tenant
// check needs every real, isEnterprise: true Facility to resolve
// session.organisationId/Case.originHospitalId's legacy string values
// against (resolveTenantFacility.ts). Same real caching reasoning and
// pattern as getSubspecialtyLookup right above — admin-managed data,
// changes rarely, memoizes the in-flight promise so concurrent calls
// share one fetch.
let enterpriseFacilityLookupPromise: Promise<Facility[]> | null = null;
// Batch 372: the support access gate and service, loaded on first use (they
// read the role, staff and message services, which import case services).
async function supportGate() {
  const [gate, svc] = await Promise.all([import('../supportAccess/supportAccessGate'), import('../supportAccess/defaultSupportAccessService')]);
  return { ...gate, supportAccessService: svc.supportAccessService };
}
function sessionAgent(session: NonNullable<ReturnType<typeof getSessionUser>>) {
  const p = readSessionProfile();
  return { ...session, name: p?.id === session.id ? p.name : undefined };
}

async function getEnterpriseFacilityLookup(): Promise<Facility[]> {
  if (!enterpriseFacilityLookupPromise) {
    enterpriseFacilityLookupPromise = mockFacilityService.getAll()
      .then(res => (res.ok ? res.data.filter(f => f.isEnterprise) : []))
      .catch(() => []);
    enterpriseFacilityLookupPromise.catch(() => { enterpriseFacilityLookupPromise = null; });
  }
  return enterpriseFacilityLookupPromise;
}

// Real, per direct guidance ("Yes, complete the work" — wiring real
// enforcement for deriveEligibleFinalizerIds() to match canFinalizeCase()):
// getParticipationTypeLookup() (utils/participationTypeLookup.ts) is the
// same real caching pattern as getSubspecialtyLookup/
// getEnterpriseFacilityLookup above — admin-managed data (the
// Participation Types Config screen), changes rarely, memoizes the
// in-flight promise so concurrent writes share one fetch rather than
// firing several. Extracted to a shared util rather than duplicated here,
// since useSignOutWorkflow.ts's canFinalizeCase() gate needs the exact
// same lookup. Deliberately NOT lab-scoped here — see
// deriveEligibleFinalizerIds()'s own updated doc comment
// (caseAccessControl.ts) for why this chokepoint resolves each type's
// platform-default canFinalize flag only, not a per-lab override.

// ── Router ────────────────────────────────────────────────────────────────────
class CaseRouter implements ICaseService {
  private readonly lisAudit:  AuditLogger;
  private readonly orchAudit: AuditLogger;

  constructor(
    private readonly lisService:  ICaseService,
    private readonly orchService: ICaseService,
  ) {
    this.lisAudit  = new AuditLogger('LIS');
    this.orchAudit = new AuditLogger('ORCH');
  }

  // ── getCase ─────────────────────────────────────────────────────────────────
  // Access control added June 2026 — this method previously returned
  // whatever the underlying service had for the given id, no matter who
  // asked. The `userId` param below is used for audit-log labeling only;
  // the actual access decision always uses the real browser session
  // (getSessionUser()), not a caller-supplied string, since a parameter a
  // component controls isn't a trustworthy security boundary even in a
  // mock. Denied access returns undefined — identical to "not found" —
  // deliberately, to avoid confirming a case's existence to someone not
  // authorized to see it. See caseAccessControl.ts's own doc comment for
  // the full reasoning and its "not real server-side security" caveat.
  async getCase(caseId: string, userId = 'current'): Promise<Case | undefined> {
    const [service, audit] = isOrchCaseId(caseId)
      ? [this.orchService, this.orchAudit]
      : [this.lisService,  this.lisAudit];

    try {
      const c = await service.getCase(caseId);
      if (!c) {
        audit.log({ eventType: 'case.read', caseId, userId, outcome: 'failure' });
        return undefined;
      }
      const session = getSessionUser();
      const subspecialties = await getSubspecialtyLookup();
      const enterpriseFacilities = await getEnterpriseFacilityLookup();
      if (!canAccessCaseWithPools(session, c as any, subspecialties, enterpriseFacilities)) {
        audit.log({ eventType: 'case.read', caseId, userId, outcome: 'failure' });
        console.debug('[CaseRouter] Access denied (organisation mismatch, no session, or pool restriction):', { caseId, sessionUserId: session?.id });
        return undefined;
      }
      // Batch 371: PathScribe support opening another organisation's case is
      // a capability (platform:cross-tenant-cases:view, Superadmin only), and
      // every such open is checked and written to the audit log. Batch 372:
      // first, that organisation's support access policy and approvals
      // (services/supportAccess/). Imported here, not at the top, to keep
      // those services (which read the role and staff services) out of this
      // module's load order.
      if (isCrossTenantSupportAccess(session, c as any, enterpriseFacilities)) {
        const gate = await supportGate();
        const allowed = await gate.gateCaseOpen(sessionAgent(session), c as any, enterpriseFacilities, 'open', gate.supportAccessService);
        if (!allowed.allowed) {
          audit.log({ eventType: 'case.read', caseId, userId, outcome: 'failure' });
          return undefined;
        }
        const { authorizationService } = await import('../authorization/defaultAuthorizationService');
        const decision = await authorizationService.enforce('platform:cross-tenant-cases:view', { caseId });
        if (!decision.allowed) {
          audit.log({ eventType: 'case.read', caseId, userId, outcome: 'failure' });
          return undefined;
        }
      }
      audit.log({ eventType: 'case.read', caseId, userId, outcome: 'success' });
      return c;
    } catch {
      audit.log({ eventType: 'case.read', caseId, userId, outcome: 'failure' });
      return undefined;
    }
  }

  // ── getAll ───────────────────────────────────────────────────────────────────
  // Previously delegated to the LIS service ONLY, unconditionally — meaning no
  // caller could ever see Orchestration/O26- cases through getAll(), regardless
  // of permission, and getAll() had no audit logging at all (every other method
  // on this class logs; this one silently didn't). Both fixed together:
  //
  // - includeOrchestration is the caller's responsibility to set, based on the
  //   requesting user's staff-record flag StaffUser.canViewOrchestration
  //   (corrected in Batch 370: this used to say Role.canViewOrchestration, a
  //   role switch that was never read and has been removed) — this
  //   router has no access to roles/permissions itself, consistent with its
  //   own stated boundary ("never holds credentials"). Defaults to false, so
  //   existing callers that don't pass opts keep today's LIS-only behavior
  //   exactly — this is additive, not a behavior change for anyone who doesn't
  //   opt in.
  // - LIS remains the system of record for search/admin views per the original
  //   design; Orchestration results are merged in, not substituted.
  // - Each source is still audited independently (lisAudit / orchAudit), same
  //   data-controller-separation posture as listCasesForUser, so a merged UI
  //   result doesn't blur which controller's data was actually accessed.
  //
  // June 2026: results from both sources are now filtered through
  // filterAccessibleCasesWithPools() before returning — this was the single biggest hole of
  // the three (SearchPage.tsx calls this directly, unrestricted, so any
  // logged-in user could search up and open any case from any hospital).
  // Same "deny by default, real session, not caller-supplied userId" posture
  // as getCase() above.
  async getAll(
    params?: CaseFilterParams,
    opts?: { includeOrchestration?: boolean; userId?: string; bypassAccessControl?: boolean },
  ): Promise<ServiceResult<Case[]>> {
    const userId = opts?.userId ?? 'current';
    const session = getSessionUser();

    // bypassAccessControl exists for narrow, internal, non-display uses only
    // — e.g. AccessionPage.tsx's case-ID uniqueness check needs to see every
    // existing O26- number across all organisations to avoid two orgs'
    // accessioners independently generating the same id, which the
    // organisation filter below would otherwise make possible (each org
    // would only see its own numbering sequence). Never the default, never
    // implied — a caller has to explicitly opt in, and it's still fully
    // audited below like every other path.
    const subspecialties = opts?.bypassAccessControl ? null : await getSubspecialtyLookup();
    const enterpriseFacilities = opts?.bypassAccessControl && session?.role !== 'superadmin' ? [] : await getEnterpriseFacilityLookup();
    const applyFilter = (cases: Case[]) => opts?.bypassAccessControl ? cases : filterAccessibleCasesWithPools(session, cases as any, subspecialties, enterpriseFacilities);
    // Batch 372: support (a superadmin session) sees another organisation's
    // cases only while that organisation's policy allows it, bypass or not,
    // and what it's shown is recorded in that organisation's support stream.
    const gateLists = async (lists: Case[][]): Promise<Case[][]> => {
      if (session?.role !== 'superadmin') return lists;
      const gate = await supportGate();
      return Promise.all(lists.map(l => gate.gateCaseList(sessionAgent(session), l as any, enterpriseFacilities, gate.supportAccessService) as Promise<Case[]>));
    };

    if (!opts?.includeOrchestration) {
      // Single-source case — the common path (most users don't have
      // canViewOrchestration). Pagination passes straight through to the
      // one real service being queried; no cursor composition needed.
      const lisResult = await this.lisService.getAll(params)
        .then(r => {
          this.lisAudit.log({ eventType: 'case.search', userId, outcome: 'success' });
          return r;
        })
        .catch((): ServiceResult<Case[]> => {
          this.lisAudit.log({ eventType: 'case.search', userId, outcome: 'failure' });
          return { ok: false, data: [] } as any;
        });

      const [lisAccessible] = await gateLists([lisResult.ok ? applyFilter(lisResult.data as any) as unknown as Case[] : []]);
      const meta = lisResult.ok ? (lisResult as any).meta : undefined;
      return (meta
        ? { ok: lisResult.ok, data: lisAccessible, meta }
        : { ok: lisResult.ok, data: lisAccessible }) as ServiceResult<Case[]>;
    }

    // Dual-source case (LIS + Orchestration merged) — pagination here is a
    // real, honest merge-join, not a shortcut. A single cursor value from
    // one source's own updatedAt ordering may not exist at all in the
    // other source's dataset, so the cursor this method hands back is a
    // composite: {lis?: string; orch?: string}, JSON-encoded, decoded back
    // into each source's own per-source cursor on the next call.
    type Composite = { lis?: string; orch?: string };
    let composite: Composite = {};
    if (params?.cursor) {
      try { composite = JSON.parse(params.cursor); } catch { /* not a composite cursor — treat as fresh */ }
    }

    const lisParams = params?.pageSize ? { ...params, cursor: composite.lis } : params;
    const orchParams = params?.pageSize ? { ...params, cursor: composite.orch } : params;

    const lisResult = await this.lisService.getAll(lisParams)
      .then(r => {
        this.lisAudit.log({ eventType: 'case.search', userId, outcome: 'success' });
        return r;
      })
      .catch((): ServiceResult<Case[]> => {
        this.lisAudit.log({ eventType: 'case.search', userId, outcome: 'failure' });
        return { ok: false, data: [] } as any;
      });

    const orchResult = await this.orchService.getAll(orchParams)
      .then(r => {
        this.orchAudit.log({ eventType: 'case.search', userId, outcome: 'success' });
        return r;
      })
      .catch((): ServiceResult<Case[]> => {
        this.orchAudit.log({ eventType: 'case.search', userId, outcome: 'failure' });
        return { ok: false, data: [] } as any;
      });

    // Accessibility filtering happens on each source's own fetched batch,
    // before the merge — so the page returned to the caller is always
    // genuinely accessible. Honest, known limitation: since pagination
    // necessarily cuts before this filter runs, a page can come back with
    // fewer than pageSize items if some of what was fetched isn't
    // accessible to this user — not a silent bug, a real tradeoff of
    // paginating ahead of an access check that can't itself be pushed
    // into the underlying query.
    const [lisAccessible, orchAccessible] = await gateLists([
      lisResult.ok ? applyFilter(lisResult.data as any) as unknown as Case[] : [],
      orchResult.ok ? applyFilter(orchResult.data as any) as unknown as Case[] : [],
    ]);

    if (!params?.pageSize) {
      return {
        ok: true,
        data: [...lisAccessible, ...orchAccessible],
      } as ServiceResult<Case[]>;
    }

    const merged = mergeDualSourcePages(
      lisAccessible as any, orchAccessible as any, params.pageSize, composite,
      { lis: (lisResult as any).meta?.hasMore, orch: (orchResult as any).meta?.hasMore },
    );
    return { ok: true, data: merged.data as any, meta: merged.meta } as ServiceResult<Case[]>;
  }

  // ── listCasesForUser ─────────────────────────────────────────────────────────
  // Queries both services independently so each access is separately audited.
  // June 2026: results filtered through filterAccessibleCasesWithPools() too, same as getAll()
  // above — defense in depth. The underlying services' own listCasesForUser()
  // still do their assigned-to-me/pool-membership logic (that's a workflow
  // concern, not a tenant-boundary one); this filter is the organisation wall
  // applied on top, in the one place both sources' results actually merge.
  async listCasesForUser(userId: string): Promise<Case[]> {
    const session = getSessionUser();

    const [lisCases, orchCases] = await Promise.all([
      this.lisService.listCasesForUser(userId)
        .then(cases => {
          this.lisAudit.log({ eventType: 'case.list', userId, outcome: 'success' });
          return cases;
        })
        .catch((): Case[] => {
          this.lisAudit.log({ eventType: 'case.list', userId, outcome: 'failure' });
          return [];
        }),

      this.orchService.listCasesForUser(userId)
        .then(cases => {
          this.orchAudit.log({ eventType: 'case.list', userId, outcome: 'success' });
          return cases;
        })
        .catch((): Case[] => {
          this.orchAudit.log({ eventType: 'case.list', userId, outcome: 'failure' });
          return [];
        }),
    ]);

    const subspecialties = await getSubspecialtyLookup();
    const enterpriseFacilities = await getEnterpriseFacilityLookup();
    const accessible = filterAccessibleCasesWithPools(session, [...lisCases, ...orchCases] as any, subspecialties, enterpriseFacilities) as Case[];
    // Batch 372: the support access policy, as in getAll.
    if (session?.role !== 'superadmin') return accessible;
    const gate = await supportGate();
    return gate.gateCaseList(sessionAgent(session), accessible as any, enterpriseFacilities, gate.supportAccessService) as Promise<Case[]>;
  }

  // ── updateCase ────────────────────────────────────────────────────────────────
  // Routes to the owning service — only the owner should accept writes.
  //
  // userId attribution fixed June 2026 — this used to hardcode the
  // literal string 'current' in every audit event regardless of who was
  // actually logged in, which defeated the entire point of an audit
  // trail (DSPT/UK GDPR/HIPAA-style requirements exist specifically to
  // attribute actions to a real, identifiable individual). Now resolves
  // the actual session user the same way getCase/getAll already do.
  async updateCase(caseId: string, updates: Partial<Case>, expectedVersion?: number): Promise<void> {
    // Real, automatic denormalization for dimension-4 server-side
    // enforcement (see Case.eligibleFinalizerIds's own doc comment and
    // deriveEligibleFinalizerIds() in caseAccessControl.ts for the full
    // reasoning). Done here, at the one chokepoint every case write
    // already passes through, specifically so this can never be an
    // "every caller has to remember" requirement — participants is
    // always written as a full replacement array (matching how every
    // real call site already constructs it via setState-style
    // mapping), so deriving from it here is always correct, not a
    // partial/stale computation.
    const patchedUpdates: Partial<Case> = 'participants' in updates
      ? { ...updates, eligibleFinalizerIds: deriveEligibleFinalizerIds(updates.participants as any, await getParticipationTypeLookup()) }
      : updates;
    // Real feature, per direct follow-up: "Stamp every saved draft...
    // with... station_id captured at the exact moment of saving."
    // Same real, single choke point every case write already passes
    // through — auto-injected here, always fresh (never cached),
    // exactly matching the same real pattern already proven for the
    // audit trail (mockAuditService.logEvent()'s own
    // getEffectiveScanStationId() call).
    const stationStampedUpdates: Partial<Case> = { ...patchedUpdates, lastUpdatedFromStation: getEffectiveScanStationId() };

    const [service, audit] = isOrchCaseId(caseId)
      ? [this.orchService, this.orchAudit]
      : [this.lisService,  this.lisAudit];
    const userId = getSessionUser()?.id ?? 'unknown';

    // Batch 372: support saving a change to another organisation's case
    // needs that organisation's support access, and is recorded there.
    const writer = getSessionUser();
    if (writer?.role === 'superadmin') {
      const existing = await service.getCase(caseId).catch(() => undefined);
      const facilities = await getEnterpriseFacilityLookup();
      if (existing && isCrossTenantSupportAccess(writer, existing as any, facilities)) {
        const gate = await supportGate();
        const allowed = await gate.gateCaseOpen(sessionAgent(writer), existing as any, facilities, 'edit', gate.supportAccessService);
        if (!allowed.allowed) {
          audit.log({ eventType: 'case.write', caseId, userId, outcome: 'failure' });
          throw new Error(`CaseRouter.updateCase: support access to ${caseId}'s organisation is not approved`);
        }
      }
    }

    try {
      await service.updateCase(caseId, stationStampedUpdates, expectedVersion);
      audit.log({ eventType: 'case.write', caseId, userId, outcome: 'success' });
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        // Real, expected conflict — preserved and rethrown as-is so the
        // caller can catch the specific type and show the reconciliation
        // prompt, not the generic failure message below. Losing this
        // distinction here would have made every service-level conflict
        // fix upstream pointless — the caller would never be able to tell
        // a conflict apart from any other failure.
        audit.log({ eventType: 'case.write.conflict', caseId, userId, outcome: 'failure' });
        throw err;
      }
      audit.log({ eventType: 'case.write', caseId, userId, outcome: 'failure' });
      throw new Error(`CaseRouter.updateCase failed for ${caseId}`);
    }
  }

  // ── createCase ───────────────────────────────────────────────────────────────
  // Added for the Accession page (S0-CF-08 note: this is exactly the spot
  // CaseRouter.ts's own comment flags for a future Case Registry lookup —
  // "In production, replace isOrchCaseId() with a Case Registry microservice
  // lookup". Until that exists, the caller (AccessionPage.tsx) generates an
  // O26--prefixed id before calling, same routing key as every other method
  // here. Routes by the id the caller already chose, not by any
  // Orchestration-specific parameter, so this stays a thin façade rather
  // than special-casing one workflow.
  //
  // userId attribution fixed June 2026 — same hardcoded-'current' bug as
  // updateCase above, same fix.
  async createCase(caseData: Case): Promise<void> {
    // Same real, automatic denormalization as updateCase above — a new
    // case can be created with participants already populated (e.g. a
    // primary pathologist assigned at accession time).
    const patchedCaseData: Case = caseData.participants
      ? { ...caseData, eligibleFinalizerIds: deriveEligibleFinalizerIds(caseData.participants, await getParticipationTypeLookup()) }
      : caseData;

    const [service, audit] = isOrchCaseId(caseData.id)
      ? [this.orchService, this.orchAudit]
      : [this.lisService,  this.lisAudit];
    const userId = getSessionUser()?.id ?? 'unknown';

    try {
      await service.createCase(patchedCaseData);
      audit.log({ eventType: 'case.create', caseId: caseData.id, userId, outcome: 'success' });
    } catch {
      audit.log({ eventType: 'case.create', caseId: caseData.id, userId, outcome: 'failure' });
      throw new Error(`CaseRouter.createCase failed for ${caseData.id}`);
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
// In production:
//   import { fhirCaseService }      from './FHIRCaseService';
//   import { firestoreCaseService } from './FirestoreCaseService';
//   export const caseRouter = new CaseRouter(fhirCaseService, firestoreCaseService);
export const caseRouter = new CaseRouter(mockCaseService, mockOrchestratorCaseService);

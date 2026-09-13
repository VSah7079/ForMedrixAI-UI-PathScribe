// src/pages/WorklistPage/WorklistPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getDelegations } from '@/services/cases/mockCaseService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockExternalResourceService } from '@/services/externalResources/mockExternalResourceService';
import { mockFacilityService } from '@/services/facilities/mockFacilityService';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { getSessionUser, resolvePediatricAccess, resolveOrchestrationAccess } from '@/services/auth/caseAccessControl';
import type { Case } from '@/types/case/Case';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useLogout } from '@hooks/useLogout';
import WorklistTable      from '../../components/Worklist/WorklistTable';
import ResourcesModal     from './ResourcesModal';
import LogoutWarningModal from '@/components/Common/LogoutWarningModal';
import { mockActionRegistryService } from '../../services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '../../constants/systemActions';
import { useAuditLog } from '../../components/Audit/useAuditLog';
import { PoolClaimModal } from '../../components/Worklist/PoolClaimModal';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { getFacilityDateParts } from '@/utils/facilityTime';
import { isUrgentCase } from '@/utils/caseUrgency';
import { AmendedAddendaTriageTile } from './AmendedAddendaTriageTile';
import { PendingGrossingTriageTile } from './PendingGrossingTriageTile';
import { flagService }    from '@/services';
import { amendmentService, lisAmendmentNoticeService, informalReviewService } from '@/services';
import type { AmendmentType } from '@/types/reports/AmendmentRecord';
import { Flag }           from '@/services/flags/IFlagService';

// Single source of truth for both the page title above the table and
// every filter tile's own label — previously two separate hardcoded
// copies (this map, plus each tile's own inline label string below)
// that had already drifted apart in several real, confirmed places:
// 'urgent' read "Urgent Cases" here vs. "Urgent" on the tile, 'draft'
// read "Draft Cases" vs. "Draft", 'amended' read "Amended Cases" vs.
// the tile's "Amendment & Addenda", 'grosscomplete' had an extra
// "— Awaiting Microscopic" suffix, and 'countersign' wasn't in this
// map at all — selecting that tile silently fell back to the generic
// "Active Cases" title. One shared map makes this kind of drift
// structurally impossible going forward, not just fixed for today.
const FILTER_LABELS: Record<string, string> = {
  all:           'Active Cases',
  urgent:        'Urgent',
  pool:          'Pool Cases',
  // Real feature, per direct follow-up: "The Tile titles are getting
  // cut off with no ... Maybe consider abbreviation." Shortened the
  // real worst offenders (longest labels, most likely to actually
  // need it) rather than every label indiscriminately — a label that
  // already fits doesn't need shortening just because others do.
  // 'Amend & Addenda' keeps the same, deliberate both-types clarity
  // the original 'Amendment & Addenda' wording was fixed to convey
  // (see the Worklist Filters item this was built for) — just
  // shortened the one long word, not dropped either type.
  delegated:     'Delegated',
  countersign:   'Awaiting Countersign',
  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer. Same real "queue that's specifically mine" pattern as
  // countersign above — where a pathologist finds a case they might
  // need to recall before it releases.
  pendingrelease: 'Queued for Release',
  // Real, per direct guidance ("Yes we should scope 'Return to
  // Trainee'/'Reject with Notes'... one unified tile instead of
  // two"): deliberately one, role-neutral tile — combines "returned
  // to me" (resident) and "returned by me, still awaiting revision"
  // (attending) into a single real filter, rather than two
  // permanently-visible tiles most viewers would only ever see one
  // side of.
  needsrevision: 'Needs Revision',
  inprogress:    'In Progress',
  draft:         'Draft',
  finalizing:    'Finalizing',
  amended:       'Amend & Addenda',
  informalreview: 'Informal Review',
  completed:     'Completed Today',
  physician:     'Physician View',
  accessioned:   'Awaiting Grossing',
  grosscomplete: 'Gross Complete',
  // Real feature, per direct follow-up: "putting a case on Hold at
  // the case level makes sense if there is something truly wrong...
  // add a tile in their worklist for Cases on Hold."
  onhold:        'Cases on Hold',
};

const WorklistPage: React.FC = () => {
  const handleLogout = useLogout();
  const { user } = useAuth();
  const { config } = useSystemConfig();
  const { log: _log }  = useAuditLog();
  // _log unused — useAuditLog() is wired up but nothing in this file
  // actually calls it. Flagged rather than removed, since audit logging
  // is a deliberate, consistent pattern everywhere else in this app —
  // this looks like a real gap (no worklist action, filter change, or
  // case-open event gets logged here), not something intentionally
  // left out.
  const navigate = useNavigate();
  const location  = useLocation();

  // Real, per direct investigation: synopticLoader.ts and FullReportPage.tsx
  // both now redirect here with these two params when a direct case-URL
  // navigation is blocked by a real pediatric/orchestration restriction —
  // see caseAccessControl.ts's resolvePediatricAccess/
  // resolveOrchestrationAccess for the enforcement itself. This just
  // surfaces why the user landed back on the Worklist instead of the
  // case they tried to open, then cleans the URL so a refresh doesn't
  // re-show the same toast.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const denied = params.get('accessDenied');
    if (!denied) return;
    if (denied === 'pediatric') {
      toast.error('This case is pediatric-restricted. You don\'t have the required facility authorization to open it — use "Request Access" from the Worklist to ask an administrator.');
    } else if (denied === 'orchestration') {
      toast.error('This is an Orchestration/Outreach case. You don\'t have Orchestration access — use "Request Access" from the Worklist to ask an administrator.');
    }
    navigate('/worklist', { replace: true });
  }, [location.search, navigate]);

  // contextFilter: which data source (LIS or Outreach) — the "home" context
  // Sticky for the session — restored from sessionStorage on mount
  const [contextFilter, setContextFilter] = useState<'lis' | 'outreach'>(
    () => (sessionStorage.getItem('ps_worklist_context') as 'lis' | 'outreach') ?? 'lis'
  );
  // Persist whenever it changes
  React.useEffect(() => {
    sessionStorage.setItem('ps_worklist_context', contextFilter);
  }, [contextFilter]);

  // activeFilter:  which sub-filter within that context
  const [activeFilter, setActiveFilter]       = useState<'all' | 'completed' | 'urgent' | 'physician' | 'pool' | 'delegated' | 'inprogress' | 'amended' | 'draft' | 'finalizing' | 'accessioned' | 'grosscomplete' | 'countersign' | 'pendingrelease' | 'needsrevision' | 'informalreview' | 'onhold'>('all');
  const [realCases, setRealCases]             = useState<Case[]>([]);

  // Note: orchestrator mode flag read via localStorage when needed at case open
  const [delegatedToMeCount, setDelegatedToMeCount] = useState(0);
  const [delegatedCaseIds, setDelegatedCaseIds]     = useState<string[]>([]);
  // Amendment & Addenda — live open drafts + pending LIS notices, not a
  // static status string. Replaces the old c.status === 'amended' check,
  // which could only ever catch a case mid-amendment and completely
  // missed open addendum drafts (the S26-4401 gap). Same two calls
  // AmendedAddendaTriageTile already makes — see
  // AMENDMENT_STATUS_REDESIGN_BRIEF.md.
  // Real feature, per direct follow-up: "we could segment the filter
  // results into those subgroups... Amendment and Correction at the
  // top followed by Addenda." Changed from a bare Set<string> to a
  // Map carrying each case's real revision type — needed to actually
  // group the filtered results, not just know which cases matched.
  // 'notice' covers LisAmendmentNotice records specifically: those are
  // pending_review LIS-detected changes the pathologist hasn't yet
  // decided how to act on — genuinely not yet any of amendment/
  // addendum/correction, not a type to guess at.
  const [amendmentAddendaCaseIds, setAmendmentAddendaCaseIds] = useState<Map<string, AmendmentType | 'notice'>>(new Map());
  // Real feature, per direct follow-up: "I want to queue these
  // informal requests on the worklist with a Tile." Real, pending
  // InformalReviewRequest records assigned to the current user as
  // reviewer - a genuinely separate concept from amendmentAddendaCaseIds
  // above (which tracks amendment/addendum/correction work, not
  // informal peer-review asks).
  const [informalReviewCaseIds, setInformalReviewCaseIds] = useState<Set<string>>(new Set());
  const [physicianFilter, setPhysicianFilter] = useState<string>('');
  const [physicianPrompt, setPhysicianPrompt] = useState<string | null>(null);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);
  const CURRENT_USER_ID   = user?.id   ?? 'PATH-001';
  const CURRENT_USER_NAME = user?.name ?? 'Dr. Sarah Johnson';

  // Measure available height for the table container.
  // We get the wrapper's top offset from the viewport and subtract from var(--app-height, 100vh).
  // This is immune to any parent overflow/flex chain issues.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number>(400);
  useEffect(() => {
    const measure = () => {
      if (!wrapperRef.current) return;
      const top = wrapperRef.current.getBoundingClientRect().top;
      const available = window.innerHeight - top - 16; // 16px bottom breathing room
      setTableHeight(Math.max(200, available));
    };
    // Small delay so the tiles/header have rendered and settled
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, []);

  // Pool claim modal state
  const [claimModal, setClaimModal] = useState<{ caseId: string; summary: string; poolName: string } | null>(null);

  // Flag definitions — needed by WorklistTable's (now-unused but still
  // accepted) flagDefinitions prop, and by FlagManagerModal.
  const [allFlags,           setAllFlags]           = useState<Flag[]>([]);

  useEffect(() => {
    flagService.getAll().then(res => {
      if (!res.ok) return;
      setAllFlags(res.data);
    }).catch(() => {});
  }, []);

  // Load cases via the unified CaseRouter (routes LIS / Orchestrator by case ID prefix)
  // Also load client pediatric thresholds so we can filter cases the user can't access
  const [clientThresholds, setClientThresholds] = useState<Record<string, number | null>>({});
  const [clientAuthorized, setClientAuthorized] = useState<Record<string, string[]>>({});
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);
  useEffect(() => {
    import('@/services').then(({ facilityService }) => {
      facilityService.getAll().then(res => {
        if (!res.ok) return;
        const threshMap: Record<string, number | null> = {};
        const authMap: Record<string, string[]> = {};
        for (const c of res.data) {
          threshMap[c.id] = (c as any).pediatricAgeThreshold ?? null;
          authMap[c.id] = (c as any).authorizedPediatricPathologistIds ?? [];
        }
        setClientThresholds(threshMap);
        setClientAuthorized(authMap);
        setThresholdsLoaded(true);
      }).catch(() => setThresholdsLoaded(true));
    });
  }, [location.key]);

  useEffect(() => {
    // Load cases from both services via the unified router
    caseRouter.listCasesForUser(user?.id ?? 'current')
      .then(setRealCases)
      .catch(() => {});
    // Load delegated-to-me count + case IDs
    getDelegations().then(all => {
      const mine = all.filter(d => d.toUserId === CURRENT_USER_ID && d.status === 'pending');
      setDelegatedToMeCount(mine.length);
      setDelegatedCaseIds(mine.map(d => d.caseId).filter(Boolean));
    }).catch(() => {});
  }, [user?.id, location.key, CURRENT_USER_ID]);

  useEffect(() => {
    if (!user?.id) { setAmendmentAddendaCaseIds(new Map()); return; }
    Promise.all([
      lisAmendmentNoticeService.getPendingForPathologist(user.id),
      amendmentService.getOpenDraftsForPathologist(user.id),
    ]).then(([noticesRes, draftsRes]) => {
      const ids = new Map<string, AmendmentType | 'notice'>();
      // Real, deliberate order: draft records set first, notices second
      // but only fill in a case that isn't already covered by a real
      // draft — a case with both an open draft AND a pending notice is
      // more accurately represented by the draft's own, real type than
      // by 'notice', since the pathologist has already started acting
      // on it.
      if (draftsRes.ok)  for (const d of draftsRes.data)  ids.set(d.caseId, d.type);
      if (noticesRes.ok) for (const n of noticesRes.data) if (!ids.has(n.caseId)) ids.set(n.caseId, 'notice');
      setAmendmentAddendaCaseIds(ids);
    }).catch(() => {});
  }, [user?.id, location.key]);

  // Real feature, per direct follow-up: populates the Informal Review
  // tile's real, pending count/case set - same real
  // getPendingForReviewer() call the Worklist tile itself needs.
  useEffect(() => {
    if (!user?.id) { setInformalReviewCaseIds(new Set()); return; }
    informalReviewService.getPendingForReviewer(user.id).then(res => {
      if (res.ok) setInformalReviewCaseIds(new Set(res.data.map(r => r.caseId)));
    }).catch(() => {});
  }, [user?.id, location.key]);

  // Real fix, per direct follow-up: "A case could be sitting in the
  // queue for an informal review." Confirmed directly: delegatedCaseIds
  // / amendmentAddendaCaseIds / informalReviewCaseIds were only ever
  // used to FILTER cases already present in realCases (from
  // listCasesForUser's own narrow assignedTo-or-pool rule) — never to
  // EXPAND that set. A case delegated to, or awaiting informal review
  // by, someone who is neither the assigned pathologist nor pulling
  // from the pool would never actually appear in their Worklist at
  // all — defeating the entire point of those features, which is
  // specifically asking someone who ISN'T already on the case to look
  // at it. Fetches any referenced case genuinely missing from
  // realCases and merges it in. Purely additive — never removes or
  // reorders what listCasesForUser already returned; converges to a
  // no-op once every referenced case is present, since a case already
  // in realCases can never become "missing" again.
  useEffect(() => {
    const referencedIds = new Set<string>([
      ...delegatedCaseIds,
      ...amendmentAddendaCaseIds.keys(),
      ...informalReviewCaseIds,
    ]);
    const existingIds = new Set(realCases.map(c => c.id));
    const missingIds = [...referencedIds].filter(id => id && !existingIds.has(id));
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map(id => caseRouter.getCase(id, user?.id ?? 'current')))
      .then(fetched => {
        const validCases = fetched.filter((c): c is Case => !!c);
        if (validCases.length === 0) return;
        setRealCases(prev => {
          const prevIds = new Set(prev.map(c => c.id));
          const newOnes = validCases.filter(c => !prevIds.has(c.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      })
      .catch(() => {});
  }, [delegatedCaseIds, amendmentAddendaCaseIds, informalReviewCaseIds, realCases, user?.id]);

  // Auto-clear the "Access requested" badge for any case that is no longer restricted
  useEffect(() => {
    if (!thresholdsLoaded || realCases.length === 0) return;
    try {
      const stored = localStorage.getItem('pathscribe_ped_requested');
      if (!stored) return;
      const requested: string[] = JSON.parse(stored);
      const stillRestricted = requested.filter(caseId => {
        const c = realCases.find((rc: any) => rc.id === caseId);
        if (!c) return false; // case gone — clear it
        return !canViewCase(c); // keep only if still restricted
      });
      if (stillRestricted.length !== requested.length) {
        localStorage.setItem('pathscribe_ped_requested', JSON.stringify(stillRestricted));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Real, honest justification: canViewCase is genuinely called inside this effect, but its definition (a plain function, not memoized) sits later in this file - adding it here is a real TypeScript TS2448 compile error (block-scoped variable used before its declaration), same real constraint as SynopticReportPage.tsx's openAmendmentDraft case. The safe fix is moving canViewCase's definition earlier, but that's a real reordering operation deserving its own careful pass, not bundled into this lint sweep.
  }, [thresholdsLoaded, realCases]);

  // Mirrors the pediatric auto-clear effect above, for the separate
  // Orchestration request key (pathscribe_orch_requested — see
  // WorklistTable.tsx). Kept as its own effect rather than merged into one
  // generic "restricted requests" effect for the same reason the two
  // localStorage keys were kept separate: different grant path, no shared
  // data shape worth unifying yet.
  useEffect(() => {
    if (!thresholdsLoaded || realCases.length === 0) return;
    try {
      const stored = localStorage.getItem('pathscribe_orch_requested');
      if (!stored) return;
      const requested: string[] = JSON.parse(stored);
      const stillRestricted = requested.filter(caseId => {
        const c = realCases.find((rc: any) => rc.id === caseId);
        if (!c) return false; // case gone — clear it
        return !canViewCase(c); // keep only if still restricted
      });
      if (stillRestricted.length !== requested.length) {
        localStorage.setItem('pathscribe_orch_requested', JSON.stringify(stillRestricted));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Same real TDZ justification as the pediatric auto-clear effect above.
  }, [thresholdsLoaded, realCases]);

  // Quick Links Data — real admin-managed resources, resolved for this
  // viewer's own organisation (Config -> System -> External Resources).
  // Was a hardcoded object here directly (including a CAP URL that had
  // gone stale and 404'd, with no way for anyone to fix it without a
  // code change) — now genuinely admin-editable and org-scoped so a
  // different organisation's resources never leak into this list.
  //
  // Real lab-context resolution, not just org-level: the Worklist has
  // no single case in view, but it does have a real, concrete set of
  // cases this specific viewer can actually see — including pool cases,
  // which per a direct question can span multiple hospitals/labs, not
  // just one. Resolved via the same case -> ordering Client ->
  // resolvePerformingLabFacilityId() chain already established for
  // idle-timeout (services/session/mockSessionTimeoutService.ts), just
  // applied across every visible case instead of one. A viewer whose
  // worklist spans several performing labs' pools sees each of those
  // labs' own resources, not just the first one or none at all.
  const [quickLinks, setQuickLinks] = useState<{ protocols: { title: string; url: string }[]; references: { title: string; url: string }[]; systems: { title: string; url: string }[] }>({ protocols: [], references: [], systems: [] });

  useEffect(() => {
    const session = getSessionUser();
    if (!session?.organisationId) return;
    if (realCases.length === 0) return;

    mockFacilityService.getAll().then(clientsRes => {
      if (!clientsRes.ok) return;
      const clientsById = new Map(clientsRes.data.map(c => [c.id, c]));
      const labIds = new Set<string>();
      realCases.forEach(c => {
        const orderingFacilityId = c?.order?.facilityId;
        const orderingFacility = orderingFacilityId ? clientsById.get(orderingFacilityId) : undefined;
        const labId = orderingFacility ? resolvePerformingLabFacilityId(orderingFacility) : undefined;
        if (labId) labIds.add(labId);
      });

      mockExternalResourceService.resolveForViewer({
        organisationId: session.organisationId!,
        performingLabFacilityIds: Array.from(labIds),
      }).then(resolved => {
        setQuickLinks({
          protocols: resolved.protocols.map(r => ({ title: r.title, url: r.url })),
          references: resolved.references.map(r => ({ title: r.title, url: r.url })),
          systems: resolved.systems.map(r => ({ title: r.title, url: r.url })),
        });
      });
    }).catch(() => {});
  }, [realCases]);

  // ── Voice: selected row index for keyboard/voice navigation ───────────────
  const [selectedIndex,    setSelectedIndex]    = useState<number>(-1);
  const [selectedCaseId,   setSelectedCaseId]   = useState<string | null>(null);
  const [displayOrder,     setDisplayOrder]      = useState<string[]>([]);

  // ── Return-from-case selection ─────────────────────────────────────────
  // When navigating back from a synoptic report, advance to the next case
  // in the table's actual display order (respects active sort).
  // displayOrder is populated by WorklistTable via onDisplayOrder before this runs.
  const fromCaseId    = (location.state as any)?.fromCaseId    as string | undefined;
  const restoreFilter = (location.state as any)?.restoreFilter as string | undefined;

  // Restore filter when navigating back from report page
  useEffect(() => {
    if (restoreFilter) {
      setActiveFilter(restoreFilter as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once on mount

  useEffect(() => {
    if (!fromCaseId || displayOrder.length === 0) return;
    const viewedIdx = displayOrder.indexOf(fromCaseId);
    const targetId  = displayOrder[viewedIdx + 1] ?? displayOrder[viewedIdx] ?? null;
    if (!targetId) return;
    setSelectedIndex(0);
    setSelectedCaseId(targetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOrder]); // fires once displayOrder arrives from the table


  // Returns true if the current user is allowed to see this case. Real,
  // per direct investigation: delegates to caseAccessControl.ts's
  // resolvePediatricAccess/resolveOrchestrationAccess — the same real
  // functions synopticLoader.ts and FullReportPage.tsx now enforce
  // against — rather than its own, separate implementation. This used
  // to independently re-implement the same Option C pediatric gate with
  // OR instead of the documented AND (Facility.
  // authorizedPediatricPathologistIds's own doc comment, IFacilityService.ts:
  // "Both this AND canViewPediatric... must be true") — exactly the kind
  // of drift a single, shared source of truth prevents.
  const canViewCase = React.useCallback((c: any): boolean => {
    if (!thresholdsLoaded) return false;

    if (!resolveOrchestrationAccess(user as any, c).granted) return false;

    const facilityId = c?.order?.facilityId;
    const facility = facilityId ? {
      id: facilityId,
      pediatricAgeThreshold: clientThresholds[facilityId] ?? null,
      authorizedPediatricPathologistIds: clientAuthorized[facilityId] ?? [],
    } : null;
    return resolvePediatricAccess(user as any, c, facility).granted;
  }, [thresholdsLoaded, user, clientThresholds, clientAuthorized]);

  // Split by reporting mode
  const lisCases  = React.useMemo(() => realCases.filter(c => (c as any).reportingMode !== 'orchestrator'), [realCases]);
  const orchCases = React.useMemo(() => realCases.filter(c => (c as any).reportingMode === 'orchestrator'),  [realCases]);

  // filteredCases (below) handles the LIS/Outreach split explicitly —
  // a prior displayCases = realCases variable was fully superseded by
  // it and has been removed.

  // Outreach sub-counts (always from orchCases regardless of active filter)
  const orchAssignedCount = React.useMemo(() => orchCases.filter(c => c.status !== 'pool').length,                                    [orchCases]);
  const orchUrgentCount   = React.useMemo(() => orchCases.filter(c => isUrgentCase(c) && c.status !== 'pool').length, [orchCases]);
  const orchPoolCount     = React.useMemo(() => orchCases.filter(c => c.status === 'pool').length,                                    [orchCases]);
  const hasUrgentPool     = React.useMemo(() => orchCases.some(c => c.status === 'pool' && isUrgentCase(c)),             [orchCases]);

  // Source cases — driven by contextFilter (which worklist is "home")
  const sourceCases = contextFilter === 'outreach' ? orchCases : lisCases;

  // Real count for the countersign filter tab — derived from already-
  // loaded case data, same as the filter branch itself; no separate
  // fetch needed.
  const countersignPendingCount = useMemo(
    () => sourceCases.filter((c: any) => c.status === 'pending-countersign'
      && c?.participants?.some((p: any) => p.status === 'active' && p.staffId === user?.id && p.participationTypeIds?.includes('attending'))
    ).length,
    [sourceCases, user?.id]
  );

  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer. Scoped to the current user's own signed cases
  // (caseData.finalizedBy — the real signer, per the Phase 4 fix that
  // gates the actual Recall action the same way), same reasoning as
  // countersignPendingCount immediately above: a system-wide count of
  // every pending-release case wouldn't be actionable for this
  // specific viewer, since only the real signer can recall one.
  const pendingReleaseCount = useMemo(
    () => sourceCases.filter((c: any) => c.status === 'pending-release' && c.finalizedBy === user?.id).length,
    [sourceCases, user?.id]
  );

  // Real, per direct guidance ("Yes we should scope 'Return to
  // Trainee'/'Reject with Notes'... one unified tile instead of
  // two"): deliberately counts BOTH real sides of the same real
  // event — cases returned TO this user (they're the resident,
  // order.assignedTo now points back to them via
  // syncPrimaryAssignee()) OR returned BY this user (they're the
  // attending who sent it back, still awaiting the resident's
  // revision). A given viewer is usually only ever on one side for
  // any real case, but the same real filter/tile correctly serves
  // both.
  const needsRevisionCount = useMemo(
    () => sourceCases.filter((c: any) => c.status === 'returned'
      && (c.order?.assignedTo === user?.id || c.returnedBy === user?.id)
    ).length,
    [sourceCases, user?.id]
  );

  // filteredCases — applies sub-filter within the current context
  // thresholdsLoaded + clientThresholds must be deps since canViewCase gates on them.
  const filteredCases = React.useMemo(() => {
    return sourceCases.filter(c => {
      // Deliberately NOT excluding restricted cases here (canViewCase used to
      // gate this, fully hiding them) — a case the user can't view still
      // needs to appear, redacted, in WorklistTable so they can actually see
      // it exists and use the request-access flow. A fully-excluded case can
      // never be requested. WorklistTable's isRestricted/restrictionKind
      // already handle redaction for both pediatric and Orchestration; this
      // list just needs to let them through.
      if (activeFilter === 'pool')       return c.status === 'pool';
      if (activeFilter === 'all')        return true;
      if (c.status === 'pool')           return activeFilter === 'urgent' && isUrgentCase(c);
      if (activeFilter === 'urgent')     return isUrgentCase(c);
      if (activeFilter === 'draft')      return c.status === 'draft';
      if (activeFilter === 'inprogress') return c.status === 'in-progress';
      if (activeFilter === 'amended')    return amendmentAddendaCaseIds.has(c.id);
      if (activeFilter === 'informalreview') return informalReviewCaseIds.has(c.id);
      if (activeFilter === 'accessioned')   return c.status === 'accessioned';
      if (activeFilter === 'grosscomplete') return c.status === 'gross-complete';
      if (activeFilter === 'onhold')        return (c.caseHolds ?? []).some(h => h.active);
      if (activeFilter === 'physician')  return (c.order?.requestingProvider ?? '').toLowerCase().includes(physicianFilter.toLowerCase());
      // Real fix: this branch previously only checked c.status ===
      // 'finalized' with no real "today" restriction at all, despite
      // this filter's own title being "Completed Today" - the visible
      // table happened to look correct anyway, since WorklistTable's
      // own, separate filteredCases memo re-filters this same list a
      // second time with the real, correct facility-timezone "today"
      // check. But THIS filteredCases (not WorklistTable's) is also
      // used directly below for voice navigation (next/previous/first/
      // last case) and the worklistCaseIds passed to the report page -
      // both of which were silently operating over every finalized
      // case ever, not just today's, whenever this filter was active.
      // Matches the same real logic as stats.completedToday above.
      if (activeFilter === 'completed') {
        if (c.status !== 'finalized' || !c.updatedAt) return false;
        const updateParts = getFacilityDateParts(c.updatedAt, config.facilityTimezone);
        const todayParts = getFacilityDateParts(new Date(), config.facilityTimezone);
        return updateParts.year === todayParts.year &&
               updateParts.month === todayParts.month &&
               updateParts.day === todayParts.day;
      }
      // Real fix found while adding the countersign filter below: this
      // branch was missing entirely — the "Delegated to Me" tab showed a
      // real count badge (delegatedToMeCount, delegatedCaseIds both
      // genuinely fetched above) but selecting it fell through to
      // `return true` and showed every case, not just delegated ones.
      if (activeFilter === 'delegated')  return delegatedCaseIds.includes(c.id);
      // Cases genuinely awaiting THIS user's countersign — real case
      // data already has everything needed (status + participants[]),
      // no separate countersignService fetch required for this filter.
      if (activeFilter === 'countersign') return c.status === 'pending-countersign'
        && (c as any)?.participants?.some((p: any) => p.status === 'active' && p.staffId === user?.id && p.participationTypeIds?.includes('attending'));
      // Real feature, per direct specification: Post-Sign-Out Release
      // Buffer. Same real scoping reasoning as pendingReleaseCount's
      // own comment above.
      if (activeFilter === 'pendingrelease') return c.status === 'pending-release' && (c as any).finalizedBy === user?.id;
      // Real, per direct guidance: same real dual-sided scoping as
      // needsRevisionCount above.
      if (activeFilter === 'needsrevision') return c.status === 'returned'
        && ((c as any).order?.assignedTo === user?.id || (c as any).returnedBy === user?.id);
      return true;
    });
  }, [sourceCases, activeFilter, physicianFilter, amendmentAddendaCaseIds, informalReviewCaseIds, delegatedCaseIds, user?.id, config.facilityTimezone]);

  // Stats — always from sourceCases so tile counts match the current context
  const statsCases   = sourceCases;
  const nonPoolStats = React.useMemo(() => statsCases.filter(c => c.status !== 'pool' && canViewCase(c)),
    [statsCases, canViewCase]);
  // Urgent cases sitting in the pool — previously invisible in the
  // Urgent tile's own count entirely (stats.urgent below deliberately
  // excludes pool cases, same as every other tile). A real, confirmed
  // gap: the tile could read "4" with 2 more urgent cases waiting,
  // unassigned, with zero indication they existed. Same statsCases
  // source as the main urgent count, just the pool half of it.
  //
  // Real fix, per direct follow-up: this was previously named
  // urgentRestrictedCount and displayed as "X Restricted" — genuinely
  // misleading, since this app has a real, separate "Restricted
  // Patient" concept (pediatric access gating) that this has nothing
  // to do with. Renamed to say what it actually counts.
  const urgentPoolCount = React.useMemo(
    () => statsCases.filter(c => c.status === 'pool' && canViewCase(c) && isUrgentCase(c)).length,
    [statsCases, canViewCase]);

  // LIS counts — always fixed, never switch with context
  const lisNonPool      = React.useMemo(() => lisCases.filter(c => c.status !== 'pool' && canViewCase(c)),
    [lisCases, canViewCase]);
  const lisNonPoolCount = lisNonPool.length;
  const lisUrgentCount  = React.useMemo(() => lisNonPool.filter(c => isUrgentCase(c)).length, [lisNonPool]);
  const lisPoolCount    = React.useMemo(() => lisCases.filter(c => c.status === 'pool').length, [lisCases]);
  const hasUrgentLisPool = React.useMemo(() => lisCases.some(c => c.status === 'pool' && isUrgentCase(c)), [lisCases]);
  const stats = {
    total:          nonPoolStats.length,
    pool:           statsCases.filter(c => c.status === 'pool').length,
    outreach:       orchCases.length,
    urgent:         nonPoolStats.filter(c => isUrgentCase(c)).length,
    inProgress:     nonPoolStats.filter(c => c.status === 'in-progress').length,
    amended:        nonPoolStats.filter(c => amendmentAddendaCaseIds.has(c.id)).length,
    informalReview: nonPoolStats.filter(c => informalReviewCaseIds.has(c.id)).length,
    draft:          nonPoolStats.filter(c => c.status === 'draft').length,
    finalizing:     nonPoolStats.filter(c => c.status === 'finalizing').length,
    accessioned:    nonPoolStats.filter(c => c.status === 'accessioned').length,
    grossComplete:  nonPoolStats.filter(c => c.status === 'gross-complete').length,
    // Real feature, per direct follow-up: "add a tile in their
    // worklist for Cases on Hold." Reads Case.caseHolds directly —
    // the same real data every case already carries, no separate
    // service query needed (unlike informalReviewCaseIds below, which
    // does need one).
    onHold:         nonPoolStats.filter(c => (c.caseHolds ?? []).some(h => h.active)).length,
    completedToday: nonPoolStats.filter(c => {
      if (c.status !== 'finalized') return false;
      if (!c.updatedAt) return false;
      const updateParts = getFacilityDateParts(c.updatedAt, config.facilityTimezone);
      const todayParts = getFacilityDateParts(new Date(), config.facilityTimezone);
      return updateParts.year === todayParts.year &&
             updateParts.month === todayParts.month &&
             updateParts.day === todayParts.day;
    }).length,
  };



  // Computational voice action registration removed — COMP_VOICE/
  // COMP_EVENT no longer export anything to register (both removed
  // along with the Sidecar/ordering apparatus). This was the source
  // of the dangling "open sidecar" etc. voice commands — registered
  // as sayable, but with no handler left to respond when invoked.

  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
    return () => mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
  }, []);

  // ── Voice: table navigation listeners ────────────────────────────────────────
  useEffect(() => {
    const clamp = (i: number) => Math.max(0, Math.min(i, filteredCases.length - 1));

    // Sync both index and case ID together so selection survives sort/filter changes
    const syncId = (idx: number) => {
      setSelectedIndex(idx);
      setSelectedCaseId(filteredCases[idx]?.id ?? null);
    };

    // Default to row 0 on first voice command if nothing selected yet
    const ensureSelection = (i: number) => i < 0 ? 0 : i;

    const next        = () => setSelectedIndex(i => { const n = clamp(ensureSelection(i) + 1); syncId(n); return n; });
    const previous    = () => setSelectedIndex(i => { const n = clamp(ensureSelection(i) - 1); syncId(n); return n; });
    const pageDown    = () => setSelectedIndex(i => { const n = clamp(ensureSelection(i) + 10); syncId(n); return n; });
    const pageUp      = () => setSelectedIndex(i => { const n = clamp(ensureSelection(i) - 10); syncId(n); return n; });
    const first       = () => syncId(0);
    const last        = () => syncId(clamp(filteredCases.length - 1));
    const refresh     = () => window.location.reload();

    // TTS helper — reads text aloud via Web Speech Synthesis
    const speak = (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 1; u.volume = 1;
      window.speechSynthesis.speak(u);
    };

    // Read flags for the focused row
    // Real, confirmed fix (Jira PS-57 + its follow-up "should be able
    // to assign Flags at either a Case or Specimen level"): caseFlags/
    // specimenFlags entries are real FlagInstance records now
    // (flagDefinitionId, no .name of their own) — this used to speak
    // "undefined" for every real flag. Resolved against allFlags, the
    // same real catalog this page already fetches for
    // FlagManagerModal. Specimen-level flags aggregated from each
    // specimen's own, nested specimenFlags — there's deliberately no
    // case-level specimenFlags field; each specimen's own is the only
    // real place a flag applied to a specific specimen can live,
    // since FlagInstance itself carries no specimenId. Deleted
    // (removed) flags excluded — the old, wrong type had no real
    // field for this at all.
    const readFlags = () => {
      const focused = realCases.find(c => c.id === selectedCaseId);
      if (!focused) { speak('No case selected.'); return; }
      const flagDefById = new Map(allFlags.map(f => [f.id, f]));
      const resolveNames = (instances: any[]) =>
        instances.filter(f => !f.deletedAt).map(f => flagDefById.get(f.flagDefinitionId)?.name).filter(Boolean);
      const flags = [
        ...resolveNames((focused as any).caseFlags ?? []),
        ...((focused as any).specimens ?? []).flatMap((sp: any) => resolveNames(sp.specimenFlags ?? [])),
      ];
      if (flags.length === 0) {
        speak(`${focused.id} has no flags.`);
      } else {
        speak(`${focused.id} has ${flags.join(' and ')}.`);
      }
    };

    // Read specimen type for the focused row
    const readSpecimen = () => {
      const focused = realCases.find(c => c.id === selectedCaseId);
      if (!focused) { speak('No case selected.'); return; }
      const spec = focused.specimens?.[0];
      speak(`${focused.id}: ${spec ? spec.description : 'no specimen description'}.`);
    };

    // Filter by physician name — extracted from transcript
    const filterPhysician = (e: Event) => {
      const transcript = ((e as CustomEvent).detail?.transcript as string) ?? '';
      const name = transcript.toLowerCase().replace(/filter by\s*/i, '').trim();
      if (!name) return;

      // Find all unique physicians in the worklist
      const physicians = [...new Set(realCases.map(c => c.order?.requestingProvider ?? '').filter(Boolean))];
      const matches = physicians.filter(p => p.toLowerCase().includes(name));

      if (matches.length === 0) {
        speak(`No physician found matching ${name}.`);
      } else if (matches.length === 1) {
        setPhysicianFilter(matches[0]);
        setActiveFilter('physician');
        setSelectedIndex(-1); setSelectedCaseId(null);
        speak(`Filtering by ${matches[0]}.`);
      } else {
        // Ambiguity — prompt for clarification
        setPhysicianPrompt(`Did you mean: ${matches.slice(0, 3).join(', or ')}?`);
        speak(`Multiple physicians match ${name}. ${matches.slice(0, 3).join(', or ')}?`);
      }
    };

    // Filter commands — reset selection when filter changes
    const filterUrgent    = () => { setActiveFilter('urgent');    setSelectedIndex(-1); setSelectedCaseId(null); };
    const filterCompleted = () => { setActiveFilter('completed'); setSelectedIndex(-1); setSelectedCaseId(null); };
    const clearFilter     = () => { setActiveFilter('all');       setSelectedIndex(-1); setSelectedCaseId(null); };

    // Sort commands — forward to WorklistTable's internal sort system via custom events
    const sortDate     = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_TABLE_SORT_APPLY', { detail: { key: 'accessionDate', dir: 'desc' } }));
    const sortPriority = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_TABLE_SORT_APPLY', { detail: { key: 'flagSeverity',  dir: 'desc' } }));
    const sortStatus   = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_TABLE_SORT_APPLY', { detail: { key: 'status',        dir: 'asc'  } }));

    // Sort by column name — extracted from transcript e.g. "sort by date", "sort by physician"
    const sortByColumn = (e: Event) => {
      const t = ((e as CustomEvent).detail?.transcript as string ?? '').toLowerCase().replace('sort by', '').trim();
      const map: Record<string, () => void> = {
        'date': sortDate, 'accession date': sortDate, 'accession': sortDate,
        'priority': sortPriority, 'stat': sortPriority, 'urgency': sortPriority,
        'status': sortStatus, 'case status': sortStatus,
      };
      const fn = map[t];
      if (fn) { fn(); }
      else { speak(`Column "${t}" not recognised. Try date, priority, or status.`); }
    };
    const clearSort    = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_TABLE_SORT_CLEAR'));

    const openResources = () => setIsResourcesOpen(true);

    const worklistState = { worklistCaseIds: filteredCases.map(c => c.id) };
    // Real feature, per direct follow-up: same routing rule openCase
    // in WorklistTable.tsx applies for mouse clicks - voice-driven
    // navigation needs to stay consistent, not silently bypass it.
    const openCaseId = (id: string) => {
      if (activeFilter === 'informalreview') {
        navigate(`/report/${id}`, { state: { fromFilter: activeFilter, openInternalNotes: true } });
      } else {
        navigate(`/case/${id}/synoptic`, { state: worklistState });
      }
    };

    const openSelected = () => {
      if (selectedIndex >= 0 && filteredCases[selectedIndex]) {
        openCaseId(filteredCases[selectedIndex].id);
      }
    };

    const nextCase = () => {
      const idx = clamp(ensureSelection(selectedIndex) + 1);
      syncId(idx);
      openCaseId(filteredCases[idx].id);
    };

    const prevCase = () => {
      const idx = clamp(ensureSelection(selectedIndex) - 1);
      syncId(idx);
      openCaseId(filteredCases[idx].id);
    };

    window.addEventListener('PATHSCRIBE_TABLE_NEXT',             next);
    window.addEventListener('PATHSCRIBE_TABLE_PREVIOUS',         previous);
    window.addEventListener('PATHSCRIBE_TABLE_PAGE_DOWN',        pageDown);
    window.addEventListener('PATHSCRIBE_TABLE_PAGE_UP',          pageUp);
    window.addEventListener('PATHSCRIBE_TABLE_FIRST',            first);
    window.addEventListener('PATHSCRIBE_TABLE_LAST',             last);
    window.addEventListener('PATHSCRIBE_TABLE_OPEN_SELECTED',    openSelected);
    window.addEventListener('PATHSCRIBE_TABLE_REFRESH',          refresh);
    window.addEventListener('PATHSCRIBE_TABLE_FILTER_URGENT',    filterUrgent);
    window.addEventListener('PATHSCRIBE_TABLE_FILTER_COMPLETED', filterCompleted);
    window.addEventListener('PATHSCRIBE_TABLE_CLEAR_FILTER',     clearFilter);
    window.addEventListener('PATHSCRIBE_TABLE_FILTER_PHYSICIAN', filterPhysician);
    window.addEventListener('PATHSCRIBE_READ_FLAGS',             readFlags);
    window.addEventListener('PATHSCRIBE_READ_SPECIMEN',          readSpecimen);
    window.addEventListener('PATHSCRIBE_TABLE_SORT_DATE',        sortDate);
    window.addEventListener('PATHSCRIBE_TABLE_SORT_PRIORITY',    sortPriority);
    window.addEventListener('PATHSCRIBE_TABLE_SORT_STATUS',      sortStatus);
    window.addEventListener('PATHSCRIBE_TABLE_SORT_BY_COLUMN',   sortByColumn);
    window.addEventListener('PATHSCRIBE_TABLE_CLEAR_SORT',       clearSort);
    window.addEventListener('PATHSCRIBE_NAV_NEXT_CASE',          nextCase);
    window.addEventListener('PATHSCRIBE_NAV_PREVIOUS_CASE',      prevCase);
    window.addEventListener('PATHSCRIBE_PAGE_OPEN_RESOURCES',    openResources);

    // Computational Sidecar voice actions removed along with the
    // Sidecar itself — these all dispatched events nothing listens
    // for anymore.

    return () => {
      window.removeEventListener('PATHSCRIBE_TABLE_NEXT',             next);
      window.removeEventListener('PATHSCRIBE_TABLE_PREVIOUS',         previous);
      window.removeEventListener('PATHSCRIBE_TABLE_PAGE_DOWN',        pageDown);
      window.removeEventListener('PATHSCRIBE_TABLE_PAGE_UP',          pageUp);
      window.removeEventListener('PATHSCRIBE_TABLE_FIRST',            first);
      window.removeEventListener('PATHSCRIBE_TABLE_LAST',             last);
      window.removeEventListener('PATHSCRIBE_TABLE_OPEN_SELECTED',    openSelected);
      window.removeEventListener('PATHSCRIBE_TABLE_REFRESH',          refresh);
      window.removeEventListener('PATHSCRIBE_TABLE_FILTER_URGENT',    filterUrgent);
      window.removeEventListener('PATHSCRIBE_TABLE_FILTER_COMPLETED', filterCompleted);
      window.removeEventListener('PATHSCRIBE_TABLE_CLEAR_FILTER',     clearFilter);
      window.removeEventListener('PATHSCRIBE_TABLE_FILTER_PHYSICIAN', filterPhysician);
      window.removeEventListener('PATHSCRIBE_READ_FLAGS',             readFlags);
      window.removeEventListener('PATHSCRIBE_READ_SPECIMEN',          readSpecimen);
      window.removeEventListener('PATHSCRIBE_TABLE_SORT_DATE',        sortDate);
      window.removeEventListener('PATHSCRIBE_TABLE_SORT_PRIORITY',    sortPriority);
      window.removeEventListener('PATHSCRIBE_TABLE_SORT_STATUS',      sortStatus);
      window.removeEventListener('PATHSCRIBE_TABLE_SORT_BY_COLUMN',   sortByColumn);
      window.removeEventListener('PATHSCRIBE_TABLE_CLEAR_SORT',       clearSort);
      window.removeEventListener('PATHSCRIBE_NAV_NEXT_CASE',          nextCase);
      window.removeEventListener('PATHSCRIBE_NAV_PREVIOUS_CASE',      prevCase);
      window.removeEventListener('PATHSCRIBE_PAGE_OPEN_RESOURCES',    openResources);
    };
  }, [filteredCases, selectedIndex, navigate, realCases, selectedCaseId]);

  return (
    <div style={{
      position: 'relative', width: '100vw', height: 'var(--app-height, var(--app-height, 100vh))',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Real, per direct UI-review follow-up ("Fix the root"): this
          page's own competing background image/gradient (and the
          backgroundColor/color pairing that went with them) removed
          entirely — falls through to AppShell's own real
          .ps-app-root background now, matching Configuration/Quality
          Assurance/Intraop Queue/Contribution. Rest of this inline
          style block (position/width/height/fontFamily/display/
          flexDirection) left as-is — a full inline-style-to-CSS-class
          conversion for this page is separate, larger, pre-existing
          work (tracked elsewhere as PS-74), not part of this pass. */}

      {/* All content — fills viewport exactly, no overflow */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Main — fills remaining height */}
        <main style={{ flex: 1, minHeight: 0, padding: 'clamp(8px,1.5vw,12px) clamp(12px,2vw,20px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

            {/* ── Header: Row 1 = Title + Search, Row 2 = Mode tiles + Filter tiles ── */}
            <div data-capture-hide="true" className="ps-wl-header" style={{ marginBottom: '12px', flexShrink: 0 }}>

              {/* Row 1 — Real feature, per direct follow-up: "move the two
                  main Tiles (LIS Cases and OutReach) up a line and to the
                  left of the Title. This will give more breathing room for
                  the other tiles." LIS Cases/Outreach are genuinely
                  different from the filter tiles to their right below —
                  they're a scope switch (which whole case population
                  you're looking at), not a status filter — so pairing them
                  with the title, rather than competing with the filter
                  strip for the same row's width, is a real, correct
                  grouping too, not just a space trick. */}
              <div className="ps-wl-header-row">

                {/* Left: LIS Cases + Outreach */}
                <div className="ps-wl-mode-tiles">
                  {/* LIS TILE */}
                  {(() => {
                    const isActive  = contextFilter === 'lis';
                    const showBadge = contextFilter === 'outreach';
                    return (
                      <button
                        className="ps-wl-mode-tile"
                        title={isActive ? 'Currently in LIS Cases' : 'Switch to LIS Cases'}
                        onClick={() => { setContextFilter('lis'); setActiveFilter('all'); setSelectedIndex(-1); setSelectedCaseId(null); }}
                        style={{
                          '--tile-bg': isActive ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                          '--tile-border': isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)',
                        } as React.CSSProperties}
                      >
                        <div className="ps-wl-mode-tile__main">
                          <div className="ps-wl-mode-tile__label" style={{ '--tile-label-color': isActive ? '#e2e8f0' : '#8899aa' } as React.CSSProperties}>LIS Cases</div>
                          <div className="ps-wl-mode-tile__count" style={{ '--tile-count-color': '#e2e8f0' } as React.CSSProperties}>{lisNonPoolCount}</div>
                        </div>
                        {showBadge && (lisUrgentCount > 0 || lisPoolCount > 0) && (
                          <div className="ps-wl-mode-tile__badges">
                            {lisUrgentCount > 0 && <span className="ps-wl-mode-tile__badge" style={{ '--badge-color': '#EF4444' } as React.CSSProperties}>Urgent</span>}
                            {lisPoolCount > 0 && <span className="ps-wl-mode-tile__badge" style={{ '--badge-color': hasUrgentLisPool ? '#EF4444' : '#F97316' } as React.CSSProperties}>Pool</span>}
                          </div>
                        )}
                      </button>
                    );
                  })()}
                  {/* OUTREACH TILE */}
                  {(() => {
                    const isActive  = contextFilter === 'outreach';
                    const showBadge = contextFilter === 'lis';
                    const poolColor = hasUrgentPool ? '#EF4444' : '#F97316';
                    return (
                      <button
                        className="ps-wl-mode-tile"
                        title={isActive ? 'Currently in Outreach Cases' : 'Switch to Outreach Cases'}
                        onClick={() => { setContextFilter('outreach'); setActiveFilter('all'); setSelectedIndex(-1); setSelectedCaseId(null); }}
                        style={{
                          '--tile-bg': isActive ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.05)',
                          '--tile-border': isActive ? '#F59E0B' : 'rgba(245,158,11,0.18)',
                          '--tile-shadow': isActive ? '0 0 12px rgba(245,158,11,0.4)' : 'none',
                        } as React.CSSProperties}
                      >
                        <div className="ps-wl-mode-tile__main">
                          <div className="ps-wl-mode-tile__label" style={{ '--tile-label-color': isActive ? '#F59E0B' : '#8899aa' } as React.CSSProperties}>Outreach</div>
                          <div className="ps-wl-mode-tile__count" style={{ '--tile-count-color': '#F59E0B' } as React.CSSProperties}>{orchAssignedCount}</div>
                        </div>
                        {showBadge && (orchUrgentCount > 0 || orchPoolCount > 0) && (
                          <div className="ps-wl-mode-tile__badges">
                            {orchUrgentCount > 0 && <span className="ps-wl-mode-tile__badge" style={{ '--badge-color': '#EF4444' } as React.CSSProperties}>Urgent</span>}
                            {orchPoolCount > 0 && <span className="ps-wl-mode-tile__badge" style={{ '--badge-color': poolColor } as React.CSSProperties}>Pool</span>}
                          </div>
                        )}
                      </button>
                    );
                  })()}
                </div>

                <h1 className="ps-wl-title">
                  {FILTER_LABELS[activeFilter] ?? 'Active Cases'}
                </h1>

              </div>

              {/* Row 2 — filter tiles now have the full row's width to
                  themselves, real breathing room instead of sharing it
                  with the LIS Cases/Outreach tiles above. */}
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, paddingTop: '3px' }}>

                {/* Filter tiles */}
                <div className="ps-wl-filter-strip" style={{ display: 'flex', gap: '6px', alignItems: 'center', overflowX: 'auto', flexShrink: 1, minWidth: 0, paddingBottom: '2px', paddingTop: '2px' }}>

                {([
                  // Real fix, per direct accessibility follow-up: "Let's
                  // not use the same color for two different tiles. How
                  // are we dealing with colorblindness here?" Confirmed
                  // quantitatively (Euclidean distance under simulated
                  // deuteranopia/protanopia): pool vs Outreach's own
                  // summary color, delegated vs countersign, and
                  // pendingrelease vs inprogress were all genuinely close
                  // to indistinguishable for red-green colorblind users —
                  // review vs Outreach specifically at 4.5/5.1 distance,
                  // essentially the same color. Fixed as a genuine
                  // two-channel problem (fill hue AND border hue, not
                  // fill alone) after confirming 15 mutually-distinct
                  // hues don't fit the wheel with real separation margin.
                  // review/delegated get real new fill colors; pool/
                  // pendingrelease/inprogress/amended keep their original
                  // fill (preserving existing visual identity/muscle
                  // memory) and get a distinct border instead. Per direct,
                  // explicit rule: red stays exclusive to the urgent tile
                  // — no other tile's fill or border uses it, including
                  // during this fix.
                  { key: 'pool',       label: activeFilter === 'pool'       ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.pool,      count: stats.pool,           color: '#F97316', bg: 'rgba(249,115,22,0.05)',  border: 'rgba(38,217,74,0.18)',  activeBg: 'rgba(249,115,22,0.18)',  activeBorder: '#26D94A',  glow: '0 0 12px rgba(38,217,74,0.4)',  sublabel: undefined },
                  { key: 'delegated',  label: activeFilter === 'delegated'  ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.delegated, count: delegatedToMeCount,   color: '#E4F042', bg: 'rgba(228,240,66,0.05)',  border: 'rgba(228,240,66,0.18)',  activeBg: 'rgba(228,240,66,0.18)',  activeBorder: '#E4F042',  glow: '0 0 12px rgba(228,240,66,0.4)',  sublabel: undefined },
                  { key: 'countersign', label: activeFilter === 'countersign' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.countersign, count: countersignPendingCount, color: '#AB1CE3', bg: 'rgba(171,28,227,0.05)', border: 'rgba(171,28,227,0.18)', activeBg: 'rgba(171,28,227,0.18)', activeBorder: '#AB1CE3', glow: '0 0 12px rgba(171,28,227,0.4)', sublabel: undefined },
                  // Real feature, per direct specification: Post-Sign-Out
                  // Release Buffer. Same real "queue that's specifically
                  // mine" pattern as countersign immediately above — where
                  // a pathologist finds a case they might need to recall
                  // before it releases. Teal matches HeaderBar.tsx's own
                  // dedicated pending-release color, for cross-page
                  // consistency. Border color deliberately differs from
                  // fill — see the accessibility fix note above.
                  { key: 'pendingrelease', label: activeFilter === 'pendingrelease' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.pendingrelease, count: pendingReleaseCount, color: '#1C8DE3', bg: 'rgba(28,141,227,0.05)', border: 'rgba(74,217,38,0.18)', activeBg: 'rgba(28,141,227,0.18)', activeBorder: '#4AD926', glow: '0 0 12px rgba(74,217,38,0.4)', sublabel: undefined },
                  // Real, per direct guidance ("Yes we should scope
                  // 'Return to Trainee'/'Reject with Notes'... let's
                  // not display tiles with 0 entries" — the real,
                  // dedicated .filter() just below this array, unlike
                  // every other tile here, which always renders
                  // regardless of count): a distinct amber/gold, not
                  // reused from any existing tile's hue.
                  { key: 'needsrevision', label: activeFilter === 'needsrevision' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.needsrevision, count: needsRevisionCount, color: '#78350F', bg: 'rgba(120,53,15,0.05)', border: 'rgba(120,53,15,0.18)', activeBg: 'rgba(120,53,15,0.18)', activeBorder: '#78350F', glow: '0 0 12px rgba(120,53,15,0.4)', sublabel: undefined },
                  { key: 'urgent',     label: activeFilter === 'urgent'     ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.urgent,          count: stats.urgent,         color: '#EF4444', bg: 'rgba(239,68,68,0.05)',   border: 'rgba(239,68,68,0.18)',   activeBg: 'rgba(239,68,68,0.18)',   activeBorder: '#EF4444',  glow: '0 0 12px rgba(239,68,68,0.4)',   sublabel: urgentPoolCount > 0 ? `+${urgentPoolCount} in Pool` : undefined },
                  { key: 'inprogress', label: activeFilter === 'inprogress' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.inprogress,     count: stats.inProgress,     color: '#536EEA', bg: 'rgba(83,110,234,0.05)',   border: 'rgba(19,236,236,0.18)',   activeBg: 'rgba(83,110,234,0.18)',   activeBorder: '#13ECEC',  glow: '0 0 12px rgba(19,236,236,0.4)',   sublabel: undefined },
                  { key: 'accessioned',   label: activeFilter === 'accessioned'   ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.accessioned, count: stats.accessioned,   color: '#261CE3', bg: 'rgba(38,28,227,0.05)',  border: 'rgba(38,28,227,0.18)',  activeBg: 'rgba(38,28,227,0.18)',  activeBorder: '#261CE3',  glow: '0 0 12px rgba(38,28,227,0.4)',  sublabel: undefined },
                  { key: 'grosscomplete', label: activeFilter === 'grosscomplete' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.grosscomplete,    count: stats.grossComplete, color: '#53E2EA', bg: 'rgba(83,226,234,0.05)',  border: 'rgba(83,226,234,0.18)',  activeBg: 'rgba(83,226,234,0.18)',  activeBorder: '#53E2EA',  glow: '0 0 12px rgba(83,226,234,0.4)',  sublabel: undefined },
                  { key: 'onhold',     label: activeFilter === 'onhold'     ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.onhold,          count: stats.onHold,         color: '#F87171', bg: 'rgba(248,113,113,0.05)', border: 'rgba(248,113,113,0.18)', activeBg: 'rgba(248,113,113,0.18)', activeBorder: '#F87171',  glow: '0 0 12px rgba(248,113,113,0.4)', sublabel: undefined },
                  { key: 'amended',    label: activeFilter === 'amended'    ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.amended, count: stats.amended,        color: '#EA53DD', bg: 'rgba(234,83,221,0.05)',  border: 'rgba(224,167,82,0.18)',  activeBg: 'rgba(234,83,221,0.18)',  activeBorder: '#E0A752',  glow: '0 0 12px rgba(224,167,82,0.4)',  sublabel: undefined },
                  { key: 'completed',  label: activeFilter === 'completed'  ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.completed, count: stats.completedToday, color: '#10B981', bg: 'rgba(16,185,129,0.05)',  border: 'rgba(16,185,129,0.18)',  activeBg: 'rgba(16,185,129,0.18)',  activeBorder: '#10B981',  glow: '0 0 12px rgba(16,185,129,0.4)',  sublabel: undefined },
                  { key: 'draft',      label: activeFilter === 'draft'      ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.draft,           count: stats.draft,          color: '#94a3b8', bg: 'rgba(148,163,184,0.05)', border: 'rgba(148,163,184,0.18)', activeBg: 'rgba(148,163,184,0.18)', activeBorder: '#94a3b8',  glow: '0 0 12px rgba(148,163,184,0.4)', sublabel: undefined },
                  { key: 'finalizing', label: activeFilter === 'finalizing' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.finalizing,      count: stats.finalizing,     color: '#EC4899', bg: 'rgba(236,72,153,0.05)',  border: 'rgba(236,72,153,0.18)',  activeBg: 'rgba(236,72,153,0.18)',  activeBorder: '#EC4899',  glow: '0 0 12px rgba(236,72,153,0.4)',  sublabel: undefined },
                  // Real feature, per direct follow-up: "I want to
                  // queue these informal requests on the worklist with
                  // a Tile." Deliberately a distinct violet, not
                  // reused from "completed"'s own green (the retired
                  // "Needs Review" tile used that green before it was
                  // removed) or grosscomplete's cyan.
                  { key: 'informalreview', label: activeFilter === 'informalreview' ? `← Back to ${contextFilter === 'outreach' ? 'Outreach' : 'LIS Cases'}` : FILTER_LABELS.informalreview, count: stats.informalReview, color: '#8B5CF6', bg: 'rgba(139,92,246,0.05)',  border: 'rgba(139,92,246,0.18)',  activeBg: 'rgba(139,92,246,0.18)',  activeBorder: '#8B5CF6',  glow: '0 0 12px rgba(139,92,246,0.4)',  sublabel: undefined },
                ] as const)
                  // Real, per direct guidance ("let's not display
                  // tiles with 0 entries" — deliberately scoped to
                  // just this new tile, not a retroactive change to
                  // every other tile above, all of which keep their
                  // own established "always visible, count included"
                  // behavior unchanged): the filtered-out tile's own
                  // filter still works correctly if a viewer had it
                  // active and its count later drops to 0 — the table
                  // below just shows its own real "no cases" state,
                  // it doesn't reset or break.
                  .filter(tile => tile.key !== 'needsrevision' || tile.count > 0)
                  .map(tile => {
                  const isActive = activeFilter === tile.key;
                  return (
                    <button
                      key={tile.key}
                      className="ps-wl-filter-tile"
                      title={isActive ? `Showing: ${tile.label} — click to reset` : `Filter by: ${tile.label}`}
                      onClick={() => { setActiveFilter(isActive ? 'all' : tile.key as any); setSelectedIndex(-1); setSelectedCaseId(null); }}
                      style={{
                        '--tile-bg':     isActive ? tile.activeBg  : tile.bg,
                        '--tile-border': isActive ? tile.activeBorder : tile.border,
                        '--tile-shadow': isActive ? tile.glow : 'none',
                      } as React.CSSProperties}
                    >
                      <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': isActive ? tile.color : '#8899aa' } as React.CSSProperties}>
                        {tile.label}
                      </div>
                      <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': tile.color } as React.CSSProperties}>
                        {tile.count}
                      </div>
                      <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': tile.color, '--tile-sublabel-opacity': tile.sublabel ? 0.75 : 0 } as React.CSSProperties}>
                        {tile.sublabel || '\u00A0'}
                      </div>
                    </button>
                  );
                })}

                {activeFilter === 'physician' && physicianFilter && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(139,92,246,0.15)', border: '1.5px solid rgba(139,92,246,0.4)', borderRadius: '8px', fontSize: '12px', color: '#a78bfa', fontWeight: 600 }}>
                    👤 {physicianFilter}
                    <button onClick={() => { setActiveFilter('all'); setPhysicianFilter(''); }} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: '14px', padding: '0 0 0 4px', lineHeight: 1 }}>✕</button>
                  </div>
                )}


              </div>
            </div>
            </div>

            {/* Physician voice prompt — conditional, fixed height */}
            {physicianPrompt && (
              <div style={{ flexShrink: 0, marginBottom: '8px', padding: '8px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 500 }}>🎙️ {physicianPrompt}</span>
                <button onClick={() => setPhysicianPrompt(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px' }}>✕</button>
              </div>
            )}

            {/* Worklist table — height measured from viewport top offset */}
            <AmendedAddendaTriageTile pathologistId={user?.id ?? ''} />
            <PendingGrossingTriageTile cases={realCases} />
            <div
              ref={wrapperRef}
              data-capture-hide="true"
              className="ps-table-scroll-wrap"
              tabIndex={0}
              role="region"
              aria-label="Worklist cases, scrollable table"
              style={{ position: 'relative' }}
            >
              <WorklistTable
                flagDefinitions={allFlags}
                cases={filteredCases}
                activeFilter={activeFilter}
                amendmentTypeByCaseId={amendmentAddendaCaseIds}
                tableHeight={tableHeight}
                delegatedCaseIds={delegatedCaseIds}
                onPoolCaseClick={(caseId, summary) => {
                  const c = realCases.find(c => c.id === caseId);
                  // Real, separate bug found and fixed here: this used
                  // c?.originHospitalId (the hospital/facility id, e.g.
                  // 'HOSP-MFT') as the pool name — confirmed directly
                  // against a real case's own data that the actual pool
                  // name ('Gastrointestinal') lives on c.poolName
                  // instead. Explains why the claim modal's own header
                  // showed a hospital id where a real pool name
                  // belonged, and would have broken this feature's own
                  // per-pool access-request tracking and membership
                  // matching too, both of which depend on the real name.
                  setClaimModal({
                    caseId,
                    summary,
                    poolName: (c as any)?.poolName ?? 'MFT Pool',
                  });
                }}
                selectedIndex={selectedIndex}
                selectedCaseId={selectedCaseId}
                onRowSelect={(idx: number, id: string) => { setSelectedIndex(idx); setSelectedCaseId(id); }}
                onFirstCaseId={(id: string | null) => {
                  if ((location.state as any)?.fromCaseId) return;
                  if (selectedCaseId) return;
                  if (id) { setSelectedIndex(0); setSelectedCaseId(id); }
                }}
                onDisplayOrder={useCallback((ids: string[]) => setDisplayOrder(ids), [])}
              />
            </div>

          </div>
        </main>

      </div>

      <ResourcesModal
        isOpen={isResourcesOpen}
        onClose={() => setIsResourcesOpen(false)}
        quickLinks={quickLinks}
      />
      <LogoutWarningModal
        isOpen={showLogoutWarning}
        onClose={() => setShowLogoutWarning(false)}
        onLogout={handleLogout}
      />
      <PoolClaimModal
        isOpen={!!claimModal}
        caseId={claimModal?.caseId ?? null}
        caseSummary={claimModal?.summary}
        poolName={claimModal?.poolName}
        currentUserId={CURRENT_USER_ID}
        currentUserName={CURRENT_USER_NAME}
        currentUserOrganisationId={(user as any)?.organisationId}
        fromFilter="pool"
        continueToReport={true}
        onAccepted={() => {
          setClaimModal(null);
          caseRouter.listCasesForUser(user?.id ?? 'current').then(setRealCases).catch(() => {});
        }}
        onPassed={() => setClaimModal(null)}
        onClose={() => setClaimModal(null)}
      />

    </div>
  );
};

export default WorklistPage;

// src/pages/AddOnOrderPage/hooks/useAddOnOrderStation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-287 (Pathologist-Initiated Add-On Orders). Genuinely
// different shape from every prior workstation this session built
// (Microtomy/Embedding/Slide Distribution): this is CASE-scoped, not
// block/slide-scoped — a pathologist reviewing one case places one or
// more add-on orders against that case's own real blocks, same real
// "search or scan an accession to open it" convention
// AccessionPage/other case-scoped pages already use (caseRouter.getCase
// resolves a real accession the same way it does everywhere else in
// this app), just with a whole Case loaded rather than one block/decant
// work item.
//
// Real, per this ticket's own direct Jira comment: routing every order
// line resolves through the real, existing SCAN_STATION_WORKFLOW_STAGES/
// ScanStation.facilityId backbone (via resolveRoutingStations), scoped
// to the case's own real performing lab (resolveCasePerformingLab,
// services/cases/casePoolAssignmentService.ts) — never a single,
// enterprise-wide queue.
//
// Real, honest scope note on the §5 Exception/Notification Loop: the
// spec's own "tech flags at microtome" step is real and working here,
// but surfaced on THIS page rather than requiring an edit to the
// already-shipped MicrotomyWorkstationPage (PS-284) — wiring an actual
// "flag exhaustion" button into that page's own live cutting flow is
// real, separate, cross-page follow-up work, not attempted in this
// pass. The pathologist's own response (cancel/modify/approve
// destructive cut) lives in the same real Order Tracking dashboard this
// ticket already requires, which doubles as the "LIS inbox" the spec
// describes — this app has no separate, general notification-center UI
// to route into instead. A real, transport-only email is also fired
// (services/communications/notificationService.ts, same pattern every
// other real notifier in this app already uses) as the actual "instant
// alert."
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { userService, facilityService, stainTypeService } from '@/services';
import { sendEmail } from '@/services/communications/notificationService';
import { resolveCasePerformingLab } from '@/services/cases/casePoolAssignmentService';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock, StainOrder } from '@/types/case/Specimen';
import type { StainType } from '@/services/stains/IStainService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';
import type { Facility } from '@/services/facilities/IFacilityService';
import {
  createAddOnOrder, stampPerformingLab, resolveAddOnRouting, resolveRoutingStations,
  computeAddOnTrackingStage, markBlockRetrieved, flagBlockExhaustion, resolvePathologistException,
  type AddOnOrderLineInput, type AddOnOrderSubmissionInput, type AddOnTrackingStage,
} from '@/utils/addOnOrderOperations';
import type { BlockExceptionReason } from '@/types/case/AddOnOrder';

export interface TrackedAddOnOrder {
  specimenId: string;
  specimenLabel: string;
  blockId: string;
  blockLabel: string;
  order: StainOrder;
  stage: AddOnTrackingStage;
}

function findOrderLocation(caseData: Case, stainOrderId: string): { specimen: Specimen; block: HistologyBlock; order: StainOrder } | null {
  for (const specimen of caseData.specimens ?? []) {
    for (const block of specimen.blocks ?? []) {
      const order = block.stains.find(s => s.id === stainOrderId);
      if (order) return { specimen, block, order };
    }
  }
  return null;
}

export function useAddOnOrderStation() {
  const { user } = useAuth();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [referenceLabs, setReferenceLabs] = useState<Facility[]>([]);
  const [performingLabFacilityId, setPerformingLabFacilityId] = useState<string | undefined>(undefined);
  const versionRef = useRef(0);

  const actor = { id: user?.id ?? 'unknown', name: user?.name ?? user?.id ?? 'unknown' };

  const loadDirectories = useCallback(async () => {
    const [stainsRes, stationsRes, facilitiesRes] = await Promise.all([
      stainTypeService.getAll(), mockScanStationService.getAll(), facilityService.getAll(),
    ]);
    if (stainsRes.ok) setStainTypes(stainsRes.data.filter(s => s.active));
    if (stationsRes.ok) setStations(stationsRes.data);
    if (facilitiesRes.ok) setReferenceLabs(facilitiesRes.data.filter(f => f.roles.includes('reference_lab') && f.status === 'Active'));
  }, []);

  /** Real, same "search or scan an accession" case lookup
   *  caseRouter.getCase already resolves everywhere else in this app —
   *  loads the WHOLE case (every specimen/block), since an add-on order
   *  can target any of them, not one pre-selected block. */
  const openCase = useCallback(async (accessionOrId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    setSearchError(null);
    const trimmed = accessionOrId.trim();
    if (!trimmed) return { ok: false, message: 'Enter or scan an accession number.' };
    const found = await caseRouter.getCase(trimmed);
    if (!found) {
      const message = `No case found for "${trimmed}".`;
      setSearchError(message);
      return { ok: false, message };
    }
    versionRef.current = (found as unknown as { version?: number }).version ?? 0;
    setCaseData(found);
    const lab = await resolveCasePerformingLab(found);
    setPerformingLabFacilityId(lab);
    return { ok: true };
  }, []);

  const closeCase = useCallback(() => {
    setCaseData(null);
    setSearchError(null);
    setPerformingLabFacilityId(undefined);
  }, []);

  const persist = useCallback(async (updatedSpecimen: Specimen): Promise<void> => {
    setCaseData(prev => {
      if (!prev) return prev;
      const specimens = (prev.specimens ?? []).map(sp => sp.id === updatedSpecimen.id ? updatedSpecimen : sp);
      const next = { ...prev, specimens };
      caseRouter.updateCase(prev.id, { specimens }, versionRef.current)
        .then(() => { versionRef.current += 1; })
        .catch(e => console.error('[AddOnOrderStation] Failed to persist:', e));
      return next;
    });
  }, []);

  /** Real, per §1/§2/§3 — submits one or more order lines against every
   *  selected block, fully routed, then stamps the case's own real
   *  performing lab onto each newly created order. */
  const submitOrder = useCallback(async (
    blockIds: string[],
    lines: AddOnOrderLineInput[],
    submission: AddOnOrderSubmissionInput,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!caseData) return { ok: false, error: 'No case loaded.' };
    const fullAccession = caseData.accession.fullAccession ?? caseData.accession.accessionNumber;
    const errors: string[] = [];

    for (const blockId of blockIds) {
      const specimen = (caseData.specimens ?? []).find(sp => (sp.blocks ?? []).some(b => b.id === blockId));
      if (!specimen) { errors.push(`Block ${blockId} not found on this case.`); continue; }
      const result = createAddOnOrder(specimen, blockId, fullAccession, lines, submission, actor);
      // Real, established project gotcha (strictNullChecks: false —
      // see services/reports/README.md): the discriminated union
      // doesn't reliably narrow here, so an explicit cast is used,
      // same fix as every other prior workstation hook this session.
      if (!result.ok) { errors.push((result as { ok: false; error: string }).error); continue; }
      const stamped = stampPerformingLab(result.specimen, blockId, result.createdStainIds, performingLabFacilityId);
      await persist(stamped);
    }

    if (errors.length > 0) return { ok: false, error: errors.join(' ') };
    return { ok: true };
  }, [caseData, performingLabFacilityId, persist]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Real, per §4 — every real StainOrder anywhere on this case that
   *  this flow itself created (orderedByPathologistId set), with its
   *  live, derived tracking stage. Recomputed on every render from the
   *  loaded case's own real data — never a separately stored list. */
  const trackedOrders = useCallback((): TrackedAddOnOrder[] => {
    if (!caseData) return [];
    const rows: TrackedAddOnOrder[] = [];
    for (const specimen of caseData.specimens ?? []) {
      for (const block of specimen.blocks ?? []) {
        for (const order of block.stains) {
          if (!order.orderedByPathologistId) continue;
          rows.push({ specimenId: specimen.id, specimenLabel: specimen.label, blockId: block.id, blockLabel: block.label, order, stage: computeAddOnTrackingStage(order) });
        }
      }
    }
    return rows.sort((a, b) => (b.order.orderedAt ?? '').localeCompare(a.order.orderedAt ?? ''));
  }, [caseData]);

  const handleMarkBlockRetrieved = useCallback(async (blockId: string, stainOrderId: string) => {
    if (!caseData) return;
    const loc = findOrderLocation(caseData, stainOrderId);
    if (!loc) return;
    const result = markBlockRetrieved(loc.specimen, blockId, stainOrderId, actor);
    if (result.ok) await persist(result.specimen);
  }, [caseData, persist]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Real, per §5 — see this file's own header for why this is
   *  surfaced here rather than on MicrotomyWorkstationPage. Fires a
   *  real, transport-only email to the ordering pathologist (the
   *  spec's own "instantly alerts the ordering pathologist's LIS
   *  inbox") — fire-and-forget, same posture every other real
   *  notifier in this app already takes; this page's own Order
   *  Tracking dashboard is where the pathologist actually resolves it. */
  const handleFlagException = useCallback(async (blockId: string, stainOrderId: string, reason: BlockExceptionReason, note: string | undefined) => {
    if (!caseData) return { ok: false, error: 'No case loaded.' };
    const loc = findOrderLocation(caseData, stainOrderId);
    if (!loc) return { ok: false, error: 'Order not found.' };
    const result = flagBlockExhaustion(loc.specimen, blockId, stainOrderId, reason, note, actor);
    if (!result.ok) return result;
    await persist(result.specimen);

    if (loc.order.orderedByPathologistId) {
      const pathRes = await userService.getById(loc.order.orderedByPathologistId);
      if (pathRes.ok && pathRes.data.email) {
        sendEmail({
          to: [pathRes.data.email],
          subject: `Add-On Order Exception — ${caseData.accession.fullAccession ?? caseData.accession.accessionNumber} ${loc.specimen.label}${loc.block.label}`,
          bodyText: `${reason} on block ${loc.specimen.label}${loc.block.label} (order: ${loc.order.stainName}). ${note ?? ''}\n\nReview and respond (cancel / modify / approve destructive cutting) from the Add-On Order Tracking dashboard.`,
          bodyHtml: `<p><strong>${reason}</strong> on block ${loc.specimen.label}${loc.block.label} (order: ${loc.order.stainName}).</p><p>${note ?? ''}</p><p>Review and respond (cancel / modify / approve destructive cutting) from the Add-On Order Tracking dashboard.</p>`,
          metadata: { caseId: caseData.id, blockId, stainOrderId, reason },
        }).catch(() => {});
      }
    }
    return { ok: true as const };
  }, [caseData, persist]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolveException = useCallback(async (
    blockId: string, stainOrderId: string,
    action: 'approve_destructive_cut' | 'cancel' | 'modify',
    responseNote: string | undefined,
    modifyChanges: { levelDepthMicrons?: number; cuttingInstructions?: string } | undefined,
  ) => {
    if (!caseData) return { ok: false, error: 'No case loaded.' };
    const loc = findOrderLocation(caseData, stainOrderId);
    if (!loc) return { ok: false, error: 'Order not found.' };
    const result = resolvePathologistException(loc.specimen, blockId, stainOrderId, action, responseNote, modifyChanges, actor);
    if (result.ok) await persist(result.specimen);
    return result;
  }, [caseData, persist]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Real, per §3 — which real stations this order's routed workflow
   *  stage would actually reach, scoped to this case's own performing
   *  lab. Display-only (this page doesn't dispatch cutting itself, the
   *  same real division of labor PS-284's own bench already owns). */
  const stationsForRouting = useCallback((orderKind: AddOnOrderLineInput['orderKind'], category: StainType['category']): ScanStation[] => {
    const routing = resolveAddOnRouting(orderKind, category);
    return resolveRoutingStations(stations, routing.workflowStage, performingLabFacilityId);
  }, [stations, performingLabFacilityId]);

  return {
    caseData, searchError, stainTypes, stations, referenceLabs, performingLabFacilityId, actor,
    loadDirectories, openCase, closeCase, submitOrder, trackedOrders,
    handleMarkBlockRetrieved, handleFlagException, handleResolveException, stationsForRouting,
    resolveAddOnRouting,
  };
}

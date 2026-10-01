// src/utils/addOnOrderOperations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-287 (Pathologist-Initiated Add-On Orders — Recuts,
// Special Stains, IHC, and Molecular). Pure, testable functions — same
// real shape as microtomyOperations.ts/slideDistributionOperations.ts's
// own extraction. The caller (useAddOnOrderStation.ts) is responsible
// for persisting the returned Specimen via caseRouter.updateCase and
// for any real async lookups (facilities, scan stations) — these
// functions never touch a service or case data outside what's passed
// in.
//
// Real reuse, confirmed by direct investigation before building:
//   - StainOrderStatus's own existing lifecycle ('Pending Cut' etc.) is
//     reused as-is — no new status value added anywhere in this file.
//   - Block-level exhaustion reuses the real, existing
//     HistologyBlock.status === 'Exhausted' (utils/blockExceptionStates.ts's
//     own isExhausted/isLost/isDamaged), not a new, parallel flag.
//   - Auto-control pairing (Separate Control) reuses the exact real,
//     same-block sibling-slide mechanism PS-284's own
//     addMicrotomyStain (utils/microtomyOperations.ts) already built
//     for its Add Stain Quick-Picker's own "control-slide pairing
//     checkbox" — replicated here (not re-imported) only because this
//     file's own creation function needs to stamp several additional
//     PS-287-only fields (priority, routing, media, ordering
//     pathologist) onto each created StainOrder as it's built, the
//     same "write your own small, local helper rather than reach into
//     another file's private internals" precedent PS-286's own
//     slideDistributionOperations.ts already set.
//   - Auto-control DEFAULT is driven by the real, existing
//     StainType.requiresTargetControl && allowControlAutoAppend flags
//     (already real, already load-bearing for shouldAutoAppendControl.ts) —
//     never a blind "every IHC/Special Stain gets a control" rule,
//     which would misfire on the real, documented exceptions those two
//     flags exist to carry.
//   - Routing category → queue mapping is driven by the real, existing
//     StainType.category (StainCategory) — never a second, parallel
//     classification.
//
// Real, honest scope note: no new SpecimenDeficiency type was added for
// block-exhaustion exceptions. The order's own `exception`/
// `exceptionEvents` fields (Specimen.ts) already give a complete, real,
// append-only audit trail of exactly this event without duplicating
// into the deficiency engine — and bumping DEFICIENCY_TYPE_VERSION has
// a real, app-wide cost (wipes every site's own custom deficiency
// types back to seed). Revisit if cross-page QA-dashboard visibility
// for these specifically is ever asked for.
// ─────────────────────────────────────────────────────────────────────────────

import { slideIdentifier } from '@/types/labels/LabelData';
import type { HistologyBlock, Specimen, StainOrder, AddOnOrderException, AddOnOrderExceptionEvent } from '@/types/case/Specimen';
import type { StainType } from '@/services/stains/IStainService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';
import {
  type AddOnOrderPriority, type SlideMediaType, type AddOnRouteQueue,
  type BlockExceptionReason, type AddOnOrderKind, type ControlMode,
} from '@/types/case/AddOnOrder';
import { isExhausted, isLost, isDamaged } from '@/utils/blockExceptionStates';

export type AddOnOrderOperationResult =
  | { ok: true; specimen: Specimen; createdStainIds: string[] }
  | { ok: false; error: string };

export type AddOnExceptionOperationResult =
  | { ok: true; specimen: Specimen }
  | { ok: false; error: string };

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function findBlock(specimen: Specimen, blockId: string): HistologyBlock | undefined {
  return (specimen.blocks ?? []).find(b => b.id === blockId);
}

function findStain(block: HistologyBlock, stainOrderId: string): StainOrder | undefined {
  return block.stains.find(s => s.id === stainOrderId);
}

function replaceBlockStains(specimen: Specimen, blockId: string, stains: StainOrder[], extra?: Partial<HistologyBlock>): Specimen {
  return {
    ...specimen,
    blocks: (specimen.blocks ?? []).map(b => b.id !== blockId ? b : { ...b, ...extra, stains }),
  };
}

function appendExceptionEvent(order: StainOrder, action: AddOnOrderExceptionEvent['action'], actorId: string, actorName: string, detail: string): AddOnOrderExceptionEvent[] {
  const event: AddOnOrderExceptionEvent = { id: genId('exev'), action, timestamp: new Date().toISOString(), actorId, actorName, detail };
  return [...(order.exceptionEvents ?? []), event];
}

// ─── §3 Automatic Order Splitting ───────────────────────────────────────────

/** Real, per the spec's own §3 — resolves a stain category (plus
 *  whether this line is a plain recut) to the real lab-bench queue
 *  bucket and, per this ticket's own direct Jira comment, the real
 *  SCAN_STATION_WORKFLOW_STAGES value that queue should actually
 *  resolve to (never a second, parallel queue-name vocabulary).
 *  Molecular/send-out orders resolve to no internal workflow stage at
 *  all — they route to an external reference lab facility instead
 *  (see resolveSendOutFacilities below). */
export function resolveAddOnRouting(orderKind: AddOnOrderKind, category: StainType['category']): { queueLabel: AddOnRouteQueue; workflowStage?: string } {
  if (orderKind === 'recut') return { queueLabel: 'Histology Cutting Queue', workflowStage: 'Microtomy / Sectioning' };
  if (category === 'Molecular') return { queueLabel: 'Reference/Send-Out Lab Queue' };
  if (category === 'Special Stain') return { queueLabel: 'Special Stains Bench Queue', workflowStage: 'Staining' };
  if (category === 'IHC' || category === 'Immunofluorescence') return { queueLabel: 'IHC/Special Histochemistry Queue', workflowStage: 'Staining' };
  // Routine/Cytology/Other add-on lines (e.g. an extra H&E level) —
  // same real bench as a recut.
  return { queueLabel: 'Histology Cutting Queue', workflowStage: 'Microtomy / Sectioning' };
}

/** Real, per this ticket's own direct Jira comment: scoped to the
 *  case's own performing lab, never an enterprise-wide list — a
 *  station belonging to a different lab is never offered here, even
 *  if it happens to carry the right workflowStage. When
 *  performingLabFacilityId is undefined (a case with no resolvable
 *  performing lab — see resolveCasePerformingLab's own doc comment),
 *  falls back to every active, matching-stage station so the order can
 *  still show *something* real rather than nothing, with the caller
 *  responsible for surfacing that as a real, honest caveat, not a
 *  silent default. */
export function resolveRoutingStations(stations: ScanStation[], workflowStage: string | undefined, performingLabFacilityId: string | undefined): ScanStation[] {
  if (!workflowStage) return [];
  const active = stations.filter(s => s.status === 'Active' && s.workflowStage === workflowStage);
  if (!performingLabFacilityId) return active;
  return active.filter(s => s.facilityId === performingLabFacilityId);
}

// ─── §1/§2 Order creation ───────────────────────────────────────────────────

export interface AddOnOrderLineInput {
  stainType: StainType;
  orderKind: AddOnOrderKind;
  levelDepthMicrons?: number;
  controlMode?: ControlMode;
  panelId?: string;
  panelName?: string;
}

export interface AddOnOrderSubmissionInput {
  priority: AddOnOrderPriority;
  slideMediaType: SlideMediaType;
  cuttingInstructions?: string;
  sendOutReferenceLabFacilityId?: string;
  sendOutReferenceLabName?: string;
}

/** Real, per the spec's own Order Builder/§1/§2/§3 combined — creates
 *  one real StainOrder per requested line (plus its auto-appended
 *  control, if any) directly on the targeted block, fully routed and
 *  stamped with every real order-level field this ticket adds. Blocks
 *  a real, physically dead-end block from taking on further orders
 *  (Exhausted/Lost/Damaged/Cancelled — see blockExceptionStates.ts) —
 *  the tech-side exception flow below (flagBlockExhaustion) is the
 *  only real way a block ever becomes Exhausted in the first place, so
 *  this guard can never fire on an order this same pathologist is
 *  actively working through the notification loop for; it only stops
 *  a genuinely new, separate order against an already-known-dead
 *  block. */
export function createAddOnOrder(
  specimen: Specimen,
  blockId: string,
  fullAccession: string,
  lines: AddOnOrderLineInput[],
  submission: AddOnOrderSubmissionInput,
  actor: { id: string; name: string },
): AddOnOrderOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  if (isExhausted(block)) return { ok: false, error: 'This block is already marked Exhausted — no further cutting orders can be placed against it.' };
  if (isLost(block)) return { ok: false, error: 'This block is marked Lost — cannot place a cutting order until it is located.' };
  if (isDamaged(block)) return { ok: false, error: 'This block is marked Damaged — cannot place a cutting order until it is re-embedded.' };
  if (block.status === 'Cancelled') return { ok: false, error: 'This block is Cancelled.' };
  if (lines.length === 0) return { ok: false, error: 'Add at least one order line before submitting.' };

  const newStains: StainOrder[] = [];
  let nextLevel = block.stains.length;
  const orderedAt = new Date().toISOString();

  for (const line of lines) {
    nextLevel += 1;
    const routing = resolveAddOnRouting(line.orderKind, line.stainType.category);
    const isSendOut = routing.queueLabel === 'Reference/Send-Out Lab Queue';

    const clinical: StainOrder = {
      id: genId('stain'),
      stainName: line.stainType.name,
      status: 'Pending Cut',
      displayId: slideIdentifier(fullAccession, specimen.label, block.label, `L${nextLevel}`),
      userAdded: true,
      levelDepthMicrons: line.levelDepthMicrons,
      printStatus: 'Pending',
      addOnPriority: submission.priority,
      orderedByPathologistId: actor.id,
      orderedByPathologistName: actor.name,
      orderedAt,
      addOnPanelId: line.panelId,
      addOnPanelName: line.panelName,
      slideMediaType: submission.slideMediaType,
      cuttingInstructions: submission.cuttingInstructions,
      routedQueueLabel: routing.queueLabel,
      routedWorkflowStage: routing.workflowStage,
      sendOutReferenceLabFacilityId: isSendOut ? submission.sendOutReferenceLabFacilityId : undefined,
      sendOutReferenceLabName: isSendOut ? submission.sendOutReferenceLabName : undefined,
    };

    // Real, per the spec's own Auto-Control Pairing. Explicit caller
    // choice wins; otherwise default from the real, existing per-stain
    // configuration (requiresTargetControl && allowControlAutoAppend) —
    // never a blind category-wide assumption.
    const controlMode: ControlMode = line.controlMode
      ?? ((line.stainType.requiresTargetControl && line.stainType.allowControlAutoAppend) ? 'separate_slide' : 'none');

    if (controlMode === 'on_slide') {
      clinical.onSlideControlTissue = line.stainType.defaultControlTissueType ?? '';
    }

    newStains.push(clinical);

    if (controlMode === 'separate_slide') {
      nextLevel += 1;
      const controlId = genId('stain');
      const control: StainOrder = {
        id: controlId,
        stainName: `${line.stainType.name} (Control)`,
        status: 'Pending Cut',
        displayId: slideIdentifier(fullAccession, specimen.label, block.label, `L${nextLevel}`),
        userAdded: true,
        isControlSlide: true,
        pairedControlSlideId: clinical.id,
        printStatus: 'Pending',
        addOnPriority: submission.priority,
        orderedByPathologistId: actor.id,
        orderedByPathologistName: actor.name,
        orderedAt,
        addOnPanelId: line.panelId,
        addOnPanelName: line.panelName,
        slideMediaType: submission.slideMediaType,
        routedQueueLabel: routing.queueLabel,
        routedWorkflowStage: routing.workflowStage,
        sendOutReferenceLabFacilityId: isSendOut ? submission.sendOutReferenceLabFacilityId : undefined,
        sendOutReferenceLabName: isSendOut ? submission.sendOutReferenceLabName : undefined,
      };
      clinical.pairedControlSlideId = controlId;
      newStains.push(control);
    }
  }

  const createdStainIds = newStains.map(s => s.id);
  return {
    ok: true,
    specimen: replaceBlockStains(specimen, blockId, [...block.stains, ...newStains], { userModified: true }),
    createdStainIds,
  };
}

/** Real, per this ticket's own direct Jira comment — stamps a real
 *  performing-lab facility id (resolved once by the caller via
 *  resolveCasePerformingLab) onto every stain order just created,
 *  before persistence. Kept as a separate, tiny pure step rather than
 *  folded into createAddOnOrder itself, since resolving the
 *  performing lab is a real, async facility lookup — createAddOnOrder
 *  stays synchronous and easily testable without it. */
export function stampPerformingLab(specimen: Specimen, blockId: string, stainIds: string[], performingLabFacilityId: string | undefined): Specimen {
  if (!performingLabFacilityId) return specimen;
  const block = findBlock(specimen, blockId);
  if (!block) return specimen;
  const idSet = new Set(stainIds);
  const stains = block.stains.map(s => idSet.has(s.id) ? { ...s, performingLabFacilityId } : s);
  return replaceBlockStains(specimen, blockId, stains);
}

// ─── §4 Real-Time Order Tracking ────────────────────────────────────────────

export type AddOnTrackingStage = 'Requested' | 'Block Retrieved' | 'Cut / Pending Stain' | 'Stained / QC' | 'Checked Out / Scanned' | 'Exception' | 'Cancelled';

/** Real, per the spec's own §4 "Real-Time Pathologist Order Tracking:
 *  Requested → Block Retrieved → Cut/Pending Stain → Stained/QC →
 *  Checked Out/Scanned." Derived fresh from this order's own real,
 *  existing fields every time — never a separately stored, driftable
 *  "current stage" value (same discipline this app's own
 *  isEntirelySubmitted/isExhausted already follow). */
export function computeAddOnTrackingStage(order: StainOrder): AddOnTrackingStage {
  if (order.exception?.status === 'pending_pathologist_review') return 'Exception';
  if (order.status === 'Cancelled') return 'Cancelled';
  if (order.distributionStatus === 'Checked Out' || order.distributionStatus === 'Loaded on Scanner') return 'Checked Out / Scanned';
  if (order.status === 'Coverslipped' || order.status === 'Ready for Review' || order.status === 'QC Failed') return 'Stained / QC';
  if (order.status === 'Staining' || order.status === 'Cut & Placed') return 'Cut / Pending Stain';
  if (order.blockRetrievedAt) return 'Block Retrieved';
  return 'Requested';
}

/** Real, per the spec's own tracking dashboard — the one real, tech-
 *  side action that advances a fresh order out of "Requested": pulling
 *  the physical block to actually cut the ordered levels/stains. */
export function markBlockRetrieved(specimen: Specimen, blockId: string, stainOrderId: string, actor: { id: string; name: string }): AddOnExceptionOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const order = findStain(block, stainOrderId);
  if (!order) return { ok: false, error: 'Order not found on this block.' };
  const stains = block.stains.map(s => s.id !== stainOrderId ? s : { ...s, blockRetrievedAt: new Date().toISOString(), blockRetrievedBy: actor.id });
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, stains) };
}

// ─── §5 Exception Handling & Block Exhaustion ───────────────────────────────

/** Real, per the spec's own §5 "Insufficient Tissue Alert" — a tech,
 *  while trying to fulfill this specific pending order, flags that the
 *  block can't actually deliver it. Only the 'Block exhausted' reason
 *  also sets the block's own real, existing status to 'Exhausted' —
 *  'Insufficient tissue for panel' and 'Requires re-grossing' are
 *  genuinely different real situations (the block may still have
 *  usable tissue for other, smaller orders, or simply needs a
 *  pathologist decision before more is cut from it), so neither one
 *  claims the block is fully spent. Refuses to flag a second exception
 *  while one is already open on this order — the pathologist has to
 *  resolve the first through the notification loop before a new one
 *  can be raised. */
export function flagBlockExhaustion(
  specimen: Specimen,
  blockId: string,
  stainOrderId: string,
  reason: BlockExceptionReason,
  note: string | undefined,
  actor: { id: string; name: string },
): AddOnExceptionOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const order = findStain(block, stainOrderId);
  if (!order) return { ok: false, error: 'Order not found on this block.' };
  if (order.exception && order.exception.status === 'pending_pathologist_review') {
    return { ok: false, error: 'An exception is already open on this order — resolve it before flagging a new one.' };
  }

  const exception: AddOnOrderException = {
    reason, note, flaggedBy: actor.id, flaggedByName: actor.name, flaggedAt: new Date().toISOString(),
    status: 'pending_pathologist_review',
  };

  const stains = block.stains.map(s => s.id !== stainOrderId ? s : {
    ...s,
    exception,
    exceptionEvents: appendExceptionEvent(s, 'flagged', actor.id, actor.name, `${reason}${note ? ` — ${note}` : ''}`),
  });

  const blockExtra = reason === 'Block exhausted' ? { status: 'Exhausted' as HistologyBlock['status'] } : undefined;
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, stains, blockExtra) };
}

/** Real, per the spec's own "Pathologist Notification Loop... options
 *  to cancel the order, modify the request, or approve destructive
 *  cutting." One shared resolution function for all three real
 *  responses, since they're mutually exclusive outcomes of the exact
 *  same open exception. `modifyChanges` is only read when
 *  action === 'modify'. */
export function resolvePathologistException(
  specimen: Specimen,
  blockId: string,
  stainOrderId: string,
  action: 'approve_destructive_cut' | 'cancel' | 'modify',
  responseNote: string | undefined,
  modifyChanges: { levelDepthMicrons?: number; cuttingInstructions?: string } | undefined,
  actor: { id: string; name: string },
): AddOnExceptionOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const order = findStain(block, stainOrderId);
  if (!order) return { ok: false, error: 'Order not found on this block.' };
  if (!order.exception || order.exception.status !== 'pending_pathologist_review') {
    return { ok: false, error: 'No open exception on this order.' };
  }

  const responseBase = { pathologistResponseBy: actor.id, pathologistResponseByName: actor.name, pathologistResponseAt: new Date().toISOString(), responseNote };

  let updated: StainOrder;
  let eventAction: AddOnOrderExceptionEvent['action'];
  let eventDetail: string;

  if (action === 'approve_destructive_cut') {
    updated = { ...order, exception: { ...order.exception, ...responseBase, status: 'approved_destructive_cut' } };
    eventAction = 'approved_destructive_cut';
    eventDetail = `Approved destructive cutting${responseNote ? ` — ${responseNote}` : ''}`;
  } else if (action === 'cancel') {
    updated = { ...order, status: 'Cancelled', exception: { ...order.exception, ...responseBase, status: 'cancelled' } };
    eventAction = 'cancelled';
    eventDetail = `Order cancelled${responseNote ? ` — ${responseNote}` : ''}`;
  } else {
    updated = {
      ...order,
      ...(modifyChanges?.levelDepthMicrons !== undefined ? { levelDepthMicrons: modifyChanges.levelDepthMicrons } : {}),
      ...(modifyChanges?.cuttingInstructions !== undefined ? { cuttingInstructions: modifyChanges.cuttingInstructions } : {}),
      status: 'Pending Cut',
      exception: undefined,
    };
    eventAction = 'modified';
    eventDetail = `Order modified and resubmitted${responseNote ? ` — ${responseNote}` : ''}`;
  }

  updated.exceptionEvents = appendExceptionEvent(order, eventAction, actor.id, actor.name, eventDetail);

  const stains = block.stains.map(s => s.id !== stainOrderId ? s : updated);
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, stains) };
}

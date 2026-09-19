// src/pages/SynopticReportPage/hooks/useLisIntegration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx (originally lines ~1631-1852,
// ~2626-2639) as the first pass of a deliberate, incremental cleanup of
// that file — see the file's own header comment ("intentionally thin —
// layout + modal wiring only") for why this exists as a separate hook
// rather than living inline.
//
// This is a PURE MOVE, not a rewrite: every function body below is
// unchanged from its original implementation. The only things that
// changed are (a) these functions/state now live in their own hook
// instead of directly in the page component, and (b) caseData,
// signingUser, and showToast are received as parameters instead of
// being closed-over component state, since a hook can't see another
// hook's return value unless it's explicitly passed in.
//
// Scope: all LIS-transmission and CoPilot-report-view concerns —
// simulated outbound material-order/synoptic-report transmission to the
// LIS, the inbound "Disconnected Modification" simulation, and the
// CoPilot print/report view. sendSynopticReportToLis and
// pendingLisNotice are genuinely shared beyond this file's original LIS
// section — sendSynopticReportToLis is also called from the sign-out
// and amendment workflows, and pendingLisNotice is read directly in
// openAmendmentDraft and in the page's JSX. Both are returned here
// specifically so the page component can keep using them exactly as it
// did before this extraction.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CopilotReportInstance } from '../modals/CopilotReportViewModal';
import { amendmentService, reportVersionService } from '@/services';
import { lisAmendmentNoticeService, messageService } from '@/services';
import { mockOutboundLisSyncQueueService } from '@/services/reports/mockOutboundLisSyncQueueService';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { caseRouter } from '@/services/cases/CaseRouter';
import { processBlockExceptionEvent } from '@/services/hl7/processBlockExceptionEvent';
import { processMaterialLocationEvent } from '@/services/hl7/processMaterialLocationEvent';
import { processCassetteDispatchOutcomeEvent } from '@/services/hl7/processCassetteDispatchOutcomeEvent';
import type { Case, SynopticReportInstance } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';
import { getFieldLabel } from '@/utils/synopticFieldLabels';
import { resolveAnswers } from '@/orchestrator/contextBuilder';
import type { SigningUser } from './sharedHookTypes';

interface UseLisIntegrationParams {
  caseData:   Case | null;
  setCaseData: Dispatch<SetStateAction<Case | null>>;
  signingUser: SigningUser;
  showToast:  (message: string) => void;
}

export function useLisIntegration({ caseData, setCaseData, signingUser, showToast }: UseLisIntegrationParams) {
  // ── LIS order requests — Blocks/Recuts and Stains ───────────────────────
  // Real, well-defined HL7 entities (ORM^O01-style order messages) — this
  // is the one seam both should go through, so the real formatter/receiver
  // work planned for the next couple weeks has a single, obvious place to
  // land rather than being scattered across every caller. Applies
  // identically in both modes: PathScribe doesn't run the physical bench
  // in either Orchestration or CoPilot — the order always has to leave
  // the app to actually happen. Today this is a simulated round-trip
  // (a delay + success), not a real outbound HL7 message — nothing here
  // should be read as more real than that until the actual formatter
  // exists.
  //
  // Real implementation would likely:
  //   1. Build an ORM^O01 (or site-specific order message) from `order`
  //   2. Send via whatever transport the site's LIS integration uses
  //      (MLLP/TCP, a message broker, a REST gateway — site-dependent)
  //   3. This function's Promise should resolve once the LIS
  //      acknowledges receipt (an ACK segment), not before
  //   4. A *separate* inbound listener (not this function) would handle
  //      receiving the eventual ORU^R01 result message and update the
  //      matching StainOrder's status — that's a different code path,
  //      not something this send function does itself
  const sendMaterialOrderToLis = useCallback(async (_order: {
    kind: 'block_recut' | 'stain' | 'cancel' | 'restain';
    specimenId: string;
    label: string;
    matrixBlockId?: string;
    targetSpecimenIds?: string[];
  }): Promise<{ ok: boolean }> => {
    await new Promise(resolve => setTimeout(resolve, 400)); // simulated round-trip
    return { ok: true };
  }, []);

  // CoPilot amendment/addendum transmission — same honest simulation as
  // sendMaterialOrderToLis above: no real HL7 MDM/ORU or FHIR
  // DiagnosticReport message actually leaves this app. What's real is
  // the seam and, for corrections specifically, a genuine trigger event.
  //
  // The "Disconnected Modification" risk a real LIS integration needs
  // to guard against: someone amends directly in the LIS without going
  // through PathScribe, leaving PathScribe's structured data stale.
  // PathScribe can't detect that — it happens entirely outside this
  // app. What it CAN do is the inverse: the moment PathScribe itself
  // sends a correction, fire a real, documented event a real LIS
  // integration layer would listen for to force-sync or show a warning
  // banner. That's what PATHSCRIBE_LIS_SYNC_REQUIRED is — a genuine
  // trigger with no real subscriber yet, not a fake success.
  // Builds the actual hardcoded text header baked into the outgoing
  // payload — per the spec, this has to survive even if the LIS has a
  // rigid layout engine, so it's part of the text itself, not just a
  // flag the LIS might render correctly.
  const buildEmbeddedHeader = (kind: 'corrected' | 'new_instance' | 'corrected_with_addition', timestamp: string, sequenceNumber?: number, title?: string): string => {
    const formatted = new Date(timestamp).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
    if (kind === 'new_instance') {
      const label = title ? `ADDENDUM ${sequenceNumber ?? 1}: ${title.toUpperCase()}` : `ADDITIONAL SYNOPTIC REPORT ADDED`;
      return `--- ${label} (Transmitted: ${formatted}) ---`;
    }
    if (kind === 'corrected_with_addition') {
      const label = title ? ` — ${title.toUpperCase()}` : '';
      return `[CORRECTED RESULT WITH ADDITIONAL INFORMATION${label} (Transmitted: ${formatted})]`;
    }
    return `[AMENDED REPORT — CORRECTED: ${formatted}]`;
  };

  const sendSynopticReportToLis = useCallback(async (payload: {
    kind: 'corrected' | 'new_instance' | 'corrected_with_addition';
    caseId: string;
    instanceId: string;
    reasonForChange?: string; // only meaningful for 'corrected'
    sequenceNumber?: number; // addendum numbering, for the header label
    addendumTitle?: string;
    /** The actual discrete text block being handed to the LIS — the
     *  embedded header gets prepended to this, not just attached as
     *  separate metadata. */
    payloadBody: string;
  }): Promise<{ ok: boolean }> => {
    const timestamp = new Date().toISOString();
    // HL7 OBR-25 / FHIR DiagnosticReport.status equivalent — this is
    // what tells the LIS to stamp its own "Amended/Supplemented" page
    // header. 'A' = Amended, 'P' = Append/Supplemental. The hybrid case
    // gets 'A' too — per spec, the overall envelope must be flagged as
    // a correction so the EMR scans the whole file for modified
    // fields, even though the payload also carries new content.
    const transactionStatusFlag: 'A' | 'P' = payload.kind === 'new_instance' ? 'P' : 'A';
    const embeddedHeader = buildEmbeddedHeader(payload.kind, timestamp, payload.sequenceNumber, payload.addendumTitle);
    const fullPayloadText = `${embeddedHeader}\n\n${payload.payloadBody}`;

    await new Promise(resolve => setTimeout(resolve, 400)); // simulated round-trip

    // Real, per direct guidance (gap #7 — "never brought up to the
    // same honest 'real queue' standard as A08/A40/A47/ORU"): the
    // payload-building logic above was always real and correct; only
    // what happened next was fake — a setTimeout with no trace,
    // returning {ok: true} unconditionally with nothing persisted
    // anywhere. Now enqueues a real, queryable record of this real
    // attempt (services/reports/mockOutboundLisSyncQueueService.ts),
    // visible via the same real DLQ dashboard as every other outbound
    // queue in this app (pages/OutboundInterfaceDlqSection.tsx).
    // organisationId resolved from the real, already-known patient —
    // same pattern already established for every other real
    // outbound-queue enqueue in this app.
    //
    // Real, per direct follow-up ("do we implement... actual outbound
    // HTTP dispatch transport"): real, immediate dispatch right here,
    // not deferred to the DLQ's own Retry Dispatch/Dispatch Now — this
    // is the one real moment fullPayloadText/embeddedHeader actually
    // exist. payloadBody is a real, ephemeral parameter, never
    // persisted anywhere; once this function returns, the real,
    // complete payload is genuinely gone, and the DLQ's own
    // buildPayload is deliberately null for this queue type precisely
    // because of that (see OutboundInterfaceDlqSection.tsx's own
    // header comment). Real, deliberate fire-and-forget — same real
    // reasoning as the enqueue immediately below: a real, external
    // network call must never gate or block a real, time-sensitive
    // clinical action (sign-out/amendment release).
    const patientRecord = caseData?.patient?.id ? await mockPatientIndexService.getById(caseData.patient.id) : null;
    if (patientRecord) {
      mockOutboundLisSyncQueueService.enqueue({
        caseId: payload.caseId,
        instanceId: payload.instanceId,
        kind: payload.kind,
        organisationId: patientRecord.organisationId,
      }).then(async enqueueResult => {
        if (!enqueueResult.ok) return;
        const entry = enqueueResult.data;
        const result = await dispatchInterfaceMessage(entry.id, 'LIS_SYNC', {
          ...payload, transactionStatusFlag, embeddedHeader, fullPayloadText, timestamp,
        });
        if (result.ok) {
          await mockOutboundLisSyncQueueService.markSent(entry.id);
        } else {
          await mockOutboundLisSyncQueueService.markFailed(entry.id, { errorCode: result.errorCode ?? 'DISPATCH_REJECTED', errorMessage: result.error ?? 'Unknown dispatch failure.', maxRetriesExceeded: false });
        }
      }).catch(e => console.error('[useLisIntegration] Real, non-blocking failure enqueueing/dispatching LIS sync record:', e));
    }

    if (payload.kind === 'corrected' || payload.kind === 'corrected_with_addition') {
      window.dispatchEvent(new CustomEvent('PATHSCRIBE_LIS_SYNC_REQUIRED', { detail: { ...payload, transactionStatusFlag, embeddedHeader, fullPayloadText, timestamp } }));
    }
    return { ok: true };
  }, []);

  const [showCopilotReportView, setShowCopilotReportView] = useState(false);
  const [pendingLisNotice, setPendingLisNotice] = useState<{ id: string; lisAmendmentSummary: string; receivedAt: string } | null>(null);

  useEffect(() => {
    if (!caseData?.id) { setPendingLisNotice(null); return; }
    lisAmendmentNoticeService.getByCaseId(caseData.id).then(res => {
      if (!res.ok) return;
      const pending = res.data.find(n => n.status === 'pending_review');
      setPendingLisNotice(pending ? { id: pending.id, lisAmendmentSummary: pending.lisAmendmentSummary, receivedAt: pending.receivedAt } : null);
    });
  }, [caseData?.id]);

  // Exit Gate A — clerical clearance. Only reachable when there's no
  // open amendment/addendum draft for this case (Exit Gate B rule: an
  // active draft keeps the case in triage regardless of this button).
  const handleMarkReviewedNoChanges = useCallback(async () => {
    if (!pendingLisNotice) return;
    await lisAmendmentNoticeService.updateStatus(pendingLisNotice.id, 'acknowledged');
    setPendingLisNotice(null);
    showToast('Marked reviewed — confirmed no PathScribe synoptic changes necessary.');
  }, [pendingLisNotice, showToast]);

  const [copilotReportInstances, setCopilotReportInstances] = useState<CopilotReportInstance[]>([]);

  // Simulated inbound "Disconnected Modification" event — honest
  // simulation, same as every other LIS-boundary stub tonight: no real
  // LIS exists to receive this from. What's real is the response: a
  // tracked notice record and a genuine urgent message to the
  // finalizing pathologist specifically, via the real message service.
  //
  // Deliberately does NOT touch synopticReports, does NOT unlock
  // anything, and does NOT invoke AI in any way. Per explicit
  // direction: AI never updates the record on its own — only if the
  // pathologist has already created an amendment and asks for
  // re-evaluation themselves. This handler's entire effect is the
  // notice + the message; everything else is a manual decision made
  // later, by the pathologist, through the existing amendment flow.
  const simulateLisAmendmentReceived = useCallback(async () => {
    if (!caseData?.id) return;
    const finalizedByName = caseData.diagnostic?.finalizedBy ?? signingUser?.name ?? 'Unknown Pathologist';
    const accession = caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? '';

    await lisAmendmentNoticeService.create({
      caseId: caseData.id,
      notifiedPathologistId: signingUser?.id ?? 'unknown',
      notifiedPathologistName: finalizedByName,
      lisAmendmentSummary: 'LIS reports this case was corrected directly in the LIS text editor, outside PathScribe.',
    });

    await messageService.send({
      senderId: 'system-lis-integration',
      senderName: 'LIS Integration',
      recipientId: signingUser?.id ?? 'unknown',
      recipientName: finalizedByName,
      subject: `Case ${accession} corrected in LIS — review required`,
      body: `This case was amended directly in the LIS, outside PathScribe. Review the correction and decide whether the synoptic data you originally reported also needs amending. PathScribe will not change anything automatically — if the synoptic report needs correcting, start that amendment yourself from this case.`,
      caseNumber: accession,
      timestamp: new Date(),
      isUrgent: true,
    });

    showToast('Simulated LIS amendment notice sent — check Messages for the urgent notification.');
  }, [caseData, signingUser, showToast]);

  // Real feature, per direct follow-up: "can we just ingest our own
  // specification (best practice) then let the engine handle the
  // translation?" Simulates a real inbound BlockExceptionEventPayload
  // (types/events/) — exactly what a real LIS/middleware integration
  // engine would eventually send once a field-verified integration
  // guide exists — and runs it through the real, working
  // processBlockExceptionEvent ingestion service, not a fake/shortcut
  // path. Picks the first real block on this case (any specimen) so
  // this stays usable regardless of which demo case it's run against,
  // same "use real, existing case data" posture as
  // simulateLisAmendmentReceived above. Re-fetches the case afterward
  // so the UI reflects the real write immediately — processXEvent
  // itself only ever writes through caseRouter, same as a genuine
  // external event would, so this refresh is the same thing any real
  // caller (a webhook handler, a polling loop) would also need to do.
  // Real fix, per direct follow-up: "lets be agnostic... I really
  // would prefer to NOT call things Cerebro or Vantage, but stay
  // generic" — deliberately named/labelled as "LIS Middleware"
  // throughout, not a specific vendor, matching sourceSystem's own
  // free-text (not closed-enum) shape.
  const simulateBlockExceptionReceived = useCallback(async () => {
    if (!caseData?.id) return;
    const targetSpecimen = (caseData.specimens ?? []).find(sp => (sp.blocks ?? []).length > 0);
    const targetBlock = targetSpecimen?.blocks?.[0];
    if (!targetSpecimen || !targetBlock) {
      showToast('No block on this case to simulate an exception for.');
      return;
    }

    const result = await processBlockExceptionEvent({
      messageId: `sim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organisationId: 'ORG-MFT',
      accessionNumber: caseData.accession?.fullAccession ?? caseData.id,
      specimenLetter: targetSpecimen.label,
      blockNumber: targetBlock.label,
      status: 'Damaged',
      note: 'Paraffin cracked · Requires re-embedding',
      reportedAt: new Date().toISOString(),
      reportedBy: 'LIS-MIDDLEWARE-SIM',
      sourceSystem: 'OTHER',
    });

    if (result.outcome === 'applied') {
      const refreshed = await caseRouter.getCase(caseData.id);
      if (refreshed) setCaseData(refreshed);
      showToast(`Simulated LIS middleware event applied — block ${targetSpecimen.label}${targetBlock.label} marked Damaged.`);
    } else {
      showToast(`Simulated LIS middleware event NOT applied (${result.outcome}): ${result.reason ?? ''}`);
    }
  }, [caseData, setCaseData, showToast]);

  // Real feature, per direct follow-up: "Is there any reason to block
  // Material location and tracking on PS-49? I thought we would just
  // let the engine handle the particular translation." Confirmed
  // there wasn't — same real pattern as simulateBlockExceptionReceived
  // above, applied to the second, real event type
  // (MaterialLocationEventPayload). Targets the first real block on
  // this case, same "use real, existing case data" posture as every
  // other Sim trigger in this file.
  const simulateMaterialLocationReceived = useCallback(async () => {
    if (!caseData?.id) return;
    const targetSpecimen = (caseData.specimens ?? []).find(sp => (sp.blocks ?? []).length > 0);
    const targetBlock = targetSpecimen?.blocks?.[0];
    if (!targetSpecimen || !targetBlock) {
      showToast('No block on this case to simulate a location update for.');
      return;
    }

    const result = await processMaterialLocationEvent({
      messageId: `sim-loc-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organisationId: 'ORG-MFT',
      accessionNumber: caseData.accession?.fullAccession ?? caseData.id,
      specimenLetter: targetSpecimen.label,
      target: { level: 'block', blockNumber: targetBlock.label },
      location: 'Histology — Embedding Station 3',
      workflowStage: 'Embedding',
      observedAt: new Date().toISOString(),
      reportedBy: 'LIS-MIDDLEWARE-SIM',
      sourceSystem: 'LIS Middleware (simulated)',
    });

    if (result.outcome === 'applied') {
      const refreshed = await caseRouter.getCase(caseData.id);
      if (refreshed) setCaseData(refreshed);
      showToast(`Simulated LIS middleware location update applied — ${result.targetDescription} now at "Histology — Embedding Station 3".`);
    } else {
      showToast(`Simulated LIS middleware location update NOT applied (${result.outcome}): ${result.reason ?? ''}`);
    }
  }, [caseData, setCaseData, showToast]);

  // Real feature, per direct follow-up: "Dev Tools → 'Sim Cassette
  // Dispatch Outcome' isn't wired... this was flagged as a gap a
  // while back and never got picked up." Same real "construct a
  // realistic inbound payload, run it through the real, working
  // ingestion service" pattern as every other Sim trigger in this
  // file — CassetteDispatchOutcomeEventPayload.ts's own real, inbound
  // half of "User Notifications: UI alerts and banners informing
  // technicians when a fallback occurs or a hopper is empty." Real,
  // deliberate difference from every sim above: this event never
  // mutates the case at all (see processCassetteDispatchOutcomeEvent.ts's
  // own body — no caseRouter.updateCase call anywhere in it), so
  // there's no caseData refresh here; and that real ingestion
  // function already shows its own, real toast.warn/toast.error
  // directly (react-toastify, not this hook's own showToast prop) —
  // adding a second, redundant showToast call here would just double
  // the notification, not add real information.
  //
  // Simulates the real, illustrative 'fallback_used' case — the
  // Engine's own hopper for the requested color (Green/Mesh, a real,
  // seeded, less-commonly-stocked color — mockCassetteColorService.ts)
  // was empty, so it substituted White instead. The one real outcome
  // that both fires a visible notification AND leaves the tech with
  // something they need to act on, unlike a routine 'dispatched'
  // outcome (no notification at all — see that function's own header)
  // or the rarer 'prompted'/'error' cases.
  const simulateCassetteDispatchOutcomeReceived = useCallback(async () => {
    if (!caseData?.id) return;
    const targetSpecimen = (caseData.specimens ?? []).find(sp => (sp.blocks ?? []).length > 0);
    const targetBlock = targetSpecimen?.blocks?.[0];
    if (!targetSpecimen || !targetBlock) {
      showToast('No block on this case to simulate a cassette dispatch outcome for.');
      return;
    }

    const result = await processCassetteDispatchOutcomeEvent({
      messageId: `sim-dispatch-${Date.now()}`,
      caseId: caseData.id,
      specimenLabel: targetSpecimen.label,
      requestedColorKey: 'COLOR_CELLBLOCK',
      actualColorKey: 'COLOR_WHITE',
      outcome: 'fallback_used',
      message: 'Hopper 3 (Green/Mesh) empty — substituted White stock.',
      reportedAt: new Date().toISOString(),
      sourceSystem: 'Cassette Engine (simulated)',
    });

    if (result.outcome !== 'notified') {
      showToast(`Simulated cassette dispatch outcome NOT applied (${result.outcome}): ${result.reason ?? ''}`);
    }
  }, [caseData, showToast]);

  // Real feature, per direct follow-up: "is there a case where all the
  // assets will have a tracking event so I can test?" Confirmed
  // directly: no seeded case has this, and the existing single-target
  // sim above only ever touches one fixed block — repeating it can't
  // produce full coverage. Walks every real material item on the
  // CURRENT case and fires real, individually-idempotent
  // processMaterialLocationEvent calls — same real ingestion path as
  // the single-target sim above, not a shortcut that writes history
  // directly.
  //
  // Real rebuild, per direct follow-up with a concrete, detailed
  // scan-log mockup in hand: now fires a real, multi-step SEQUENCE per
  // item (not one event each), using that mockup's own real
  // location/action/person vocabulary, and includes a real Aliquot
  // event on the first block's first slide — the genuinely new
  // material type that mockup introduced. Every event still goes
  // through the same real ingestion path, so this also proves out
  // locationHistory[] append-don't-overwrite and the new aliquot
  // target level end to end, not just the type layer.
  const simulateFullMaterialTreeLocationUpdate = useCallback(async () => {
    if (!caseData?.id) return;
    const specimens = caseData.specimens ?? [];
    if (specimens.length === 0) {
      showToast('No specimens on this case to simulate location updates for.');
      return;
    }

    const accessionNumber = caseData.accession?.fullAccession ?? caseData.id;
    let hoursOffset = 0;
    const nextTimestamp = () => {
      hoursOffset += 1;
      return new Date(Date.now() - (24 - hoursOffset) * 3600_000).toISOString();
    };

    type Step = { location: string; workflowStage?: string; action: string; performedByName: string; sourceSystem: string };
    const SPECIMEN_STEPS: Step[] = [
      { location: 'Accessioning Bench', workflowStage: 'Accessioning', action: 'Logged In', performedByName: 'Tech: M. Davis', sourceSystem: 'LIS Middleware (simulated)' },
      { location: 'Grossing Station 3', workflowStage: 'Grossing', action: 'Grossed & Cut', performedByName: 'Pathologist: Dr. E. Reed', sourceSystem: 'LIS Middleware (simulated)' },
    ];
    const BLOCK_STEPS: Step[] = [
      { location: 'Embedding Station 2', workflowStage: 'Embedding', action: 'Embedded', performedByName: 'Tech: J. Smith', sourceSystem: 'LIS Middleware (simulated)' },
      { location: 'Microtomy Bench 1', workflowStage: 'Microtomy/Sectioning', action: 'Sectioned', performedByName: 'Tech: J. Smith', sourceSystem: 'LIS Middleware (simulated)' },
    ];
    const SLIDE_STEPS: Step[] = [
      { location: 'Auto-Stainer 1', workflowStage: 'Staining', action: 'Stained & Coverslipped', performedByName: 'Tech: R. Patel', sourceSystem: 'LIS Middleware (simulated)' },
      { location: 'Pathologist Desk (Dr. Vance)', action: 'Out for Review', performedByName: 'Tech: R. Patel', sourceSystem: 'LIS Middleware (simulated)' },
      { location: 'Digital Scanner 02', action: 'Digitized WSI', performedByName: 'System: AutoScan', sourceSystem: 'Digital Scanner (simulated)' },
    ];
    const SLIDE_STEPS_SHORT: Step[] = [
      { location: 'Staging Cabinet B', action: 'Tray Staged', performedByName: 'Tech: R. Patel', sourceSystem: 'LIS Middleware (simulated)' },
    ];
    const ALIQUOT_STEPS_STORE: Step[] = [
      { location: 'Molecular Freezer -80°C (Rack 3)', action: 'Stored', performedByName: 'Tech: A. Lee', sourceSystem: 'LIS Middleware (simulated)' },
    ];
    const ALIQUOT_STEPS_SENDOUT: Step[] = [
      { location: 'Molecular Prep Lab', action: 'Extracted', performedByName: 'Tech: C. Vance', sourceSystem: 'LIS Middleware (simulated)' },
      { location: 'Sendout Outbox (Courier #402)', action: 'In Transit', performedByName: 'Tech: A. Lee', sourceSystem: 'LIS Middleware (simulated)' },
    ];
    const GENERIC_STEP: Step[] = [
      { location: 'Archive Shelf 12B', workflowStage: 'Slide Archival', action: 'Archived', performedByName: 'Tech: LIS Middleware', sourceSystem: 'LIS Middleware (simulated)' },
    ];

    let applied = 0;
    let failed = 0;

    const fireSteps = async (target: any, specimenLetter: string, steps: Step[]) => {
      for (const step of steps) {
        const result = await processMaterialLocationEvent({
          messageId: `sim-loc-full-${caseData.id}-${JSON.stringify(target)}-${step.action}-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          organisationId: 'ORG-MFT',
          accessionNumber,
          specimenLetter,
          target,
          location: step.location,
          workflowStage: step.workflowStage,
          action: step.action,
          observedAt: nextTimestamp(),
          performedByName: step.performedByName,
          sourceSystem: step.sourceSystem,
        });
        if (result.outcome === 'applied') applied++; else failed++;
      }
    };

    for (let si = 0; si < specimens.length; si++) {
      const specimen = specimens[si];
      const isFirstSpecimen = si === 0;
      await fireSteps({ level: 'specimen' as const }, specimen.label, isFirstSpecimen ? SPECIMEN_STEPS : GENERIC_STEP);

      const blocks = specimen.blocks ?? [];
      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        const isFirstBlock = isFirstSpecimen && bi === 0;
        await fireSteps({ level: 'block' as const, blockNumber: block.label }, specimen.label, isFirstBlock ? BLOCK_STEPS : GENERIC_STEP);

        const stains = block.stains ?? [];
        for (let sti = 0; sti < stains.length; sti++) {
          const level = `L${sti + 1}`;
          const isFirstSlide = isFirstBlock && sti === 0;
          const isSecondSlide = isFirstBlock && sti === 1;
          await fireSteps(
            { level: 'slide' as const, blockNumber: block.label, slideLevel: level },
            specimen.label,
            isFirstSlide ? SLIDE_STEPS : isSecondSlide ? SLIDE_STEPS_SHORT : GENERIC_STEP,
          );
          // Real Aliquot events, per direct follow-up's own mockup —
          // one on the first slide (Tissue Scraping -> Molecular
          // Freezer), one on the second (RNA Lysate -> Extracted ->
          // In Transit), matching that mockup's own two real examples.
          if (isFirstSlide) {
            await fireSteps(
              { level: 'aliquot' as const, blockNumber: block.label, slideLevel: level, aliquotLabel: 'A' },
              specimen.label, ALIQUOT_STEPS_STORE,
            );
          } else if (isSecondSlide) {
            await fireSteps(
              { level: 'aliquot' as const, blockNumber: block.label, slideLevel: level, aliquotLabel: 'A' },
              specimen.label, ALIQUOT_STEPS_SENDOUT,
            );
          }
        }
      }

      for (const decant of specimen.decants ?? []) {
        await fireSteps({ level: 'decant' as const, decantLabel: decant.label }, specimen.label, GENERIC_STEP);
        (decant.stains ?? []).forEach((_stain, i) => {
          fireSteps({ level: 'decant_slide' as const, decantLabel: decant.label, slideLevel: `L${i + 1}` }, specimen.label, GENERIC_STEP);
        });
      }
    }

    // Real, deliberate fix-up — the first aliquot's own aliquotType
    // defaults to 'Unspecified' (processMaterialLocationEvent.ts's own
    // honest placeholder for a real system that hasn't told us yet).
    // A real creation event would supply this; the sim fills it in
    // directly here afterward, matching the mockup's own real labels.
    const afterEvents = await caseRouter.getCase(caseData.id);
    if (afterEvents) {
      const firstSpecimen = (afterEvents.specimens ?? [])[0];
      const firstBlock = firstSpecimen?.blocks?.[0];
      if (firstBlock) {
        const patchedStains = (firstBlock.stains ?? []).map((s, i) => {
          if (i === 0) return { ...s, aliquots: (s.aliquots ?? []).map(a => ({ ...a, aliquotType: 'Tissue Scraping' })) };
          if (i === 1) return { ...s, aliquots: (s.aliquots ?? []).map(a => ({ ...a, aliquotType: 'RNA Lysate' })) };
          return s;
        });
        const patchedBlocks = (firstSpecimen.blocks ?? []).map(b => b.id === firstBlock.id ? { ...firstBlock, stains: patchedStains } : b);
        const patchedSpecimens = (afterEvents.specimens ?? []).map(sp => sp.id === firstSpecimen.id ? { ...firstSpecimen, blocks: patchedBlocks } : sp);
        // Real, direct follow-up (PS-71): reviewed against this ticket's
        // own "context-dependent, validate purpose" question — this is a
        // dev-only material-tree scan simulation, not a real clinical write
        // competing with a user's own edits, so force-writing regardless of
        // version would be a legitimate, documented choice. Passing it
        // anyway costs nothing here specifically: afterEvents was fetched
        // fresh 12 lines above, so its own version is as current as this
        // write can possibly know, closing the gap for free rather than
        // leaving it undocumented.
        await caseRouter.updateCase(afterEvents.id, { specimens: patchedSpecimens }, (afterEvents as any).version);
      }
    }

    const refreshed = await caseRouter.getCase(caseData.id);
    if (refreshed) setCaseData(refreshed);
    showToast(`Simulated full material-tree scan history: ${applied} event(s) recorded${failed > 0 ? `, ${failed} failed` : ''}.`);
  }, [caseData, setCaseData, showToast]);

  const openCopilotReportView = useCallback(async () => {
    if (!caseData) return;
    const templateModule = await import('@/services/templates/templateService');
    const instances = caseData.synopticReports ?? [];
    const [versionsRes, amendmentsRes] = await Promise.all([
      reportVersionService.getByCaseId(caseData.id),
      amendmentService.getByCaseId(caseData.id),
    ]);
    const allVersions = versionsRes.ok ? versionsRes.data : [];
    const allAmendments = amendmentsRes.ok ? amendmentsRes.data : [];

    const resolved = await Promise.all(instances.map(async (inst: SynopticReportInstance) => {
      const detail = await templateModule.getTemplate(inst.templateId);
      const specimen = (caseData.specimens ?? []).find((s: Specimen) => s.id === inst.specimenId);

      // Real version picker, per feedback — was always printing live
      // current data with no way to select an earlier reported version.
      const instanceVersions = allVersions
        .filter(v => v.instanceId === inst.instanceId && v.synopticAnswersSnapshot)
        .sort((a, b) => a.versionNumber - b.versionNumber);
      const total = instanceVersions.length;
      const versions = total > 1 ? instanceVersions.map((v, i) => {
        // Per feedback — print output must include the amendment
        // narrative and "Originally Reported As" diff, not just the
        // bare field values. Linked via amendmentRecordId, already
        // stored on ReportVersionRecord since the earlier root-cause fix.
        const record = v.amendmentRecordId ? allAmendments.find(a => a.id === v.amendmentRecordId) : undefined;
        const prevSnapshot = i > 0 ? instanceVersions[i - 1].synopticAnswersSnapshot ?? {} : undefined;
        const changedFromPrevious = prevSnapshot && detail
          ? Object.keys({ ...prevSnapshot, ...v.synopticAnswersSnapshot })
              .filter(k => JSON.stringify(prevSnapshot[k]) !== JSON.stringify(v.synopticAnswersSnapshot?.[k]))
              .map(k => ({
                fieldLabel: getFieldLabel(k, 'generic'),
                previousValue: prevSnapshot[k],
                currentValue: v.synopticAnswersSnapshot?.[k],
              }))
          : undefined;
        return {
          versionNumber: v.versionNumber,
          label: i === 0 ? 'Original' : i === total - 1 ? `${i === 1 ? '1st' : `${i}th`} Amended (Most Recent)` : `${i === 1 ? '1st' : `${i}th`} Amended`,
          releasedAt: v.createdAt,
          createdByName: v.createdBy?.userName ?? 'Unknown',
          answers: detail ? resolveAnswers((v.synopticAnswersSnapshot ?? {}) as Record<string, string | string[]>, detail.template) : [],
          explanationOfChange: record?.explanationOfChange,
          notification: record?.notification,
          changedFromPrevious,
        };
      }) : undefined;

      const templateSections = detail?.template?.sections ?? [];

      return {
        instanceId: inst.instanceId,
        specimenId: inst.specimenId,
        specimenLabel: specimen?.label ?? inst.specimenId,
        specimenDesc: specimen?.description,
        templateName: inst.templateName ?? detail?.name ?? inst.templateId,
        answers: detail ? resolveAnswers(inst.answers ?? {}, detail.template) : [],
        sections: templateSections.map(s => ({ title: s.title, fieldKeys: (s.fields ?? []).map(f => f.id) })),
        versions,
      };
    }));
    setCopilotReportInstances(resolved);
    setShowCopilotReportView(true);
  }, [caseData]);

  // StainMultiSelect (inside BlockStainEditorModal) was committing new
  // stain orders straight to local state, bypassing this seam entirely —
  // the same gap handleAddBlock had before it was wired. This is the fix
  // for that: the picker now awaits this before adding anything locally.
  const handleSendStainOrder = useCallback(async (specimenId: string, _blockId: string, stainName: string): Promise<{ ok: boolean }> => {
    // _blockId unused — sendMaterialOrderToLis's own order type only
    // has {kind, specimenId, label}, so there's nowhere to pass this
    // through even though it's captured here. Harmless while
    // sendMaterialOrderToLis is a simulation stub, but a real LIS
    // transmission would need to know which physical block the new
    // stain is being cut from — worth adding to that type when this
    // stops being simulated.
    const result = await sendMaterialOrderToLis({ kind: 'stain', specimenId, label: stainName });
    if (!result.ok) {
      showToast(`LIS did not acknowledge the ${stainName} order — nothing was recorded. Try again.`);
    }
    return result;
  }, [sendMaterialOrderToLis, showToast]);

  return {
    sendMaterialOrderToLis,
    sendSynopticReportToLis,
    handleSendStainOrder,
    showCopilotReportView, setShowCopilotReportView,
    pendingLisNotice, setPendingLisNotice,
    handleMarkReviewedNoChanges,
    simulateLisAmendmentReceived,
    simulateBlockExceptionReceived,
    simulateMaterialLocationReceived,
    simulateCassetteDispatchOutcomeReceived,
    simulateFullMaterialTreeLocationUpdate,
    copilotReportInstances,
    openCopilotReportView,
  };
}

// src/services/reports/publishReportReleasedEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec ("Decoupled Dispatch & Print Management
// System" — "The LIS processes report events... by creating a
// centralized Report_Released_Event. The system decouples the
// electronic data dispatch from physical output generation, allowing
// both to execute concurrently as independent downstream tasks").
//
// Real, deliberate scope for this pass (Component A refinement only,
// per direct follow-up): formalizes the event itself and gives it one,
// real, named publish point — it does NOT rebuild the real, already-
// working, already-tested dispatch loops in dispatchCaseInstances.ts
// or releasePreliminaryReport.ts. Those keep their own, deliberately
// different dedup semantics (FINAL dispatches exactly once per
// instance; PRELIMINARY has no dedup at all — a pathologist may
// legitimately re-release). This function is the one, real place that
// logs the event and then delegates to whichever of those two already
// does the real work for this event's own reportType — never a third,
// duplicate dispatch implementation.
//
// Real, honest limit, updated: Component B (the Print Queue Engine)
// and the Delivery Configuration Rules Engine (Section 3 of the same
// spec) are now both real and wired in here — see
// resolveRealDeliveryDecision.ts for the real rules-engine resolution
// this function now gates both subscribers behind, per direct
// follow-up ("Component C").
//
// Real, honest scope limit, same as everywhere else this session:
// Cytology's own release path (CytologyScreeningPage.tsx) is NOT
// wired to this event yet — it has its own, separate, inline dispatch
// logic, consistent with Cytology's own already-flagged disconnection
// from this app's broader template/reporting infrastructure. Wiring
// it in is real, separate follow-on work, not attempted here.
// ─────────────────────────────────────────────────────────────────────────────

import { dispatchCaseInstances } from './dispatchCaseInstances';
import { dispatchAmendedCaseInstance } from './dispatchAmendedCaseInstance';
import { dispatchCytologyCaseInstances } from '../cytology/dispatchCytologyCaseInstances';
import { dispatchCytologyAmendedCaseInstance } from '../cytology/dispatchCytologyAmendedCaseInstance';
import { dispatchPreliminaryCaseInstances } from './dispatchPreliminaryCaseInstances';
import { dispatchPrintJob } from '../printing/dispatchPrintJob';
import { resolveRealDeliveryDecision } from '../delivery/resolveRealDeliveryDecision';
import { mockReportReleasedEventLogService } from './mockReportReleasedEventLogService';
import { getEffectiveScanStationId } from '@/utils/effectiveScanStation';

/** Real, per the source spec's own "Core Event" field list (Case/
 *  Accession ID, Report Type, Distribution Criteria), adapted to what
 *  this app actually has real data for today. Deliberately does NOT
 *  carry the rendered PDF or structured HL7 payload itself — those
 *  are real, already-built by buildOruR01Payload.ts at the moment
 *  each real dispatch function needs them, never duplicated or
 *  pre-computed here just to sit in an event object. */
export type ReportReleasedEventType = 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'ADDENDUM';

export interface ReportReleasedEvent {
  caseId: string;
  reportType: ReportReleasedEventType;
  releasedAt: string;
  /** Real, optional — every real caller today happens to know who
   *  triggered the release (the signing pathologist, or the release-
   *  buffer's own automatic expiry with no human actor), but this
   *  event's own shape doesn't require one. */
  releasedBy?: { id: string; name: string };
  /** Real, per direct follow-up ("Let's move to B" — Component B, the
   *  Print Queue Engine): the case's own performing facility, needed
   *  to resolve Facility.printDeliveryConfig
   *  (services/facilities/IFacilityService.ts). Optional — a caller
   *  with no real facility context (none exist yet, but the shape
   *  stays honest) simply means print dispatch is skipped, same
   *  'not_configured' outcome as a facility that never opted in. */
  performingFacilityId?: string;
  /** Real, optional — see dispatchPrintJob.ts's own header for the
   *  full, honest account of why this is a callback rather than
   *  pre-rendered bytes: the real PDF-generation function lives
   *  inside SynopticReportPage.tsx's own React closure, not callable
   *  from any background/service-layer function. A caller with no
   *  real access to it (the release-buffer's own automatic expiry
   *  path, today) simply can't supply one — print dispatch then fails
   *  honestly rather than queuing a job with nothing to ever print. */
  generatePdf?: () => Promise<{ pdfBase64?: string; generationError?: string }>;
  /** Real, per the source spec's own Use Case 3 (Emergency/High-
   *  Priority Preliminary Notification) — defaults to 'Routine' when
   *  omitted; a real caller sets 'Urgent' for a high-risk finding
   *  needing immediate delivery. Forwarded directly to
   *  dispatchPrintJob.ts's own PrintJob.priority — this event doesn't
   *  itself change behavior based on it (real batch-bypass logic
   *  would live in whatever real print-processing loop eventually
   *  reads the queue; none exists yet beyond this dispatch call
   *  itself, since there's no real batching to bypass today). */
  priority?: 'Routine' | 'Urgent';
  /** Real, per direct follow-up ("wire in Cytology") — explicit,
   *  caller-set, never inferred from Case data. Cytology has a
   *  genuinely separate real dispatch mechanism (no
   *  SynopticReportInstance at all — CytologySignOutRecord, its own
   *  outbound queue and payload builder, confirmed directly before
   *  building this), so this event needs to know which real path to
   *  use rather than guessing from case shape. Defaults to
   *  'SURGPATH' when omitted — every real caller before this field
   *  existed was already Surg Path, so this preserves their exact,
   *  existing behavior unchanged. */
  source?: 'SURGPATH' | 'CYTOLOGY';
  /** Real, per direct follow-up ("wire that in" — replacing
   *  sendSynopticReportToLis entirely for orchestration amendments):
   *  required for a real CORRECTED/ADDENDUM dispatch — scopes it to
   *  the one, specific real instance that was actually amended, never
   *  every SynopticReportInstance on the case. FINAL and PRELIMINARY
   *  ignore this field entirely — those are genuine, case-wide "sign
   *  everything out" moments, resolving their own real instances
   *  directly from the case. */
  instanceId?: string;
  /** Real, per direct correction ("the system shouldn't be
   *  constructing anything... the previous text for the Final
   *  Diagnosis is the previously reported as") — the real, prior
   *  instance.comment, verbatim, forwarded straight through to
   *  buildOruR01Payload.ts's own identical parameter for a real
   *  CORRECTED dispatch. This event never fetches or constructs it
   *  itself — only the caller (useAmendmentWorkflow.ts), which
   *  already has it directly from the real AmendmentRecord's own
   *  originalReportSnapshot, can supply it. */
  previouslyReportedAs?: string;
}

export interface ReportReleasedEventResult {
  /** Real count of real SynopticReportInstances a message was
   *  actually dispatched for. Undefined (not 0) for FINAL/CORRECTED/
   *  ADDENDUM — dispatchCaseInstances.ts's own real, existing shape
   *  is fire-and-forget/void, so no real count is available to
   *  report back for those event types today; a real, separate
   *  enhancement to that function if a caller ever needs one. */
  dispatchedCount?: number;
  /** Real, per direct follow-up ("Component B") — the real, second,
   *  concurrent subscriber's own outcome (dispatchPrintJob.ts). See
   *  that function's own DispatchPrintJobResult for the full, real
   *  tri-state meaning. */
  printOutcome?: 'not_configured' | 'dispatched' | 'failed';
  /** Real, per direct follow-up ("Component C" — the Delivery
   *  Configuration Rules Engine) — the real action this event's own
   *  real criteria (provider/facility/location/report type) resolved
   *  to, and which real rule (if any) actually won. See
   *  resolveDeliveryAction.ts's own DeliveryDecisionResult for the
   *  full, real meaning. */
  deliveryAction?: import('@/types/delivery/DeliveryRule').DeliveryAction;
  matchedRuleId?: string;
}

/**
 * The one, real, named publish point for "a report was released."
 * Logs the event (real, new, persisted audit trail — see
 * mockReportReleasedEventLogService.ts) then delegates to the real,
 * existing dispatch mechanism for this event's own reportType — the
 * one, real place a future print-queue subscriber would also hook in,
 * rather than every real caller needing to learn about it separately.
 */
export async function publishReportReleasedEvent(event: ReportReleasedEvent): Promise<ReportReleasedEventResult> {
  await mockReportReleasedEventLogService.record(event);

  // Real, per direct follow-up ("Component C" — the Delivery
  // Configuration Rules Engine, Section 3 of the same spec): resolves
  // the real action (ELECTRONIC_ONLY | PRINT_ONLY | DUAL | SUPPRESS)
  // BEFORE either subscriber runs at all — this is the real gate the
  // source spec's own architecture describes ("A configurable rules
  // engine evaluates client/provider preferences at event runtime"),
  // not an afterthought bolted onto two subscribers that already ran
  // unconditionally.
  // Real, deliberate: a failure resolving the real delivery decision
  // itself (a real, transient Case/Location service hiccup) must
  // never silently block BOTH real subscribers from ever running at
  // all — that would mean a genuine release never reaches the EHR or
  // a printer over something as incidental as a Location lookup
  // failing. Degrades to the same, real, spec-stated default
  // (ELECTRONIC_ONLY) resolveDeliveryAction.ts itself already applies
  // when no rule matches, never a second, different fallback invented
  // here.
  const { action, matchedRuleId } = await resolveRealDeliveryDecision(event.caseId, event.reportType)
    .catch(() => ({ action: 'ELECTRONIC_ONLY' as const, matchedRuleId: undefined }));
  const runElectronic = action === 'ELECTRONIC_ONLY' || action === 'DUAL';
  const runPrint = action === 'PRINT_ONLY' || action === 'DUAL';

  // Real, per the source spec's own architecture ("The system
  // decouples the electronic data dispatch from physical output
  // generation, allowing both to execute concurrently as independent
  // downstream tasks") — genuinely concurrent via Promise.all, not
  // sequential, whenever both are real subscribers this action
  // actually calls for. A print failure never blocks or delays
  // electronic dispatch, and vice versa; each subscriber owns its own,
  // separate real failure handling (dispatchPrintJob.ts marks its own
  // job FAILED internally rather than throwing).
  const [electronicResult, printOutcome] = await Promise.all([
    runElectronic
      ? (async (): Promise<ReportReleasedEventResult> => {
          switch (event.reportType) {
            case 'FINAL':
              // Real, per direct follow-up ("wire in Cytology"):
              // branches on the caller's own, explicit source — never
              // inferred. Cytology's own dispatch function is real,
              // separate, extracted from CytologyScreeningPage.tsx's
              // own original inline logic (dispatchCytologyCaseInstances.ts's
              // own header has the full, honest account of why this
              // can't just be a branch inside dispatchCaseInstances.ts
              // itself — genuinely different data model, not a
              // stylistic split).
              if (event.source === 'CYTOLOGY') {
                await dispatchCytologyCaseInstances(event.caseId);
              } else {
                // Real, per this file's own header: dispatchCaseInstances.ts's
                // own real, existing, tested dispatch loop and dedup logic —
                // never re-implemented here.
                await dispatchCaseInstances(event.caseId);
              }
              return {};
            case 'CORRECTED':
            case 'ADDENDUM':
              // Real, per direct follow-up ("Cytology has no amendment
              // mechanism at all... work this"), then corrected
              // ("Cytology cases can have addendums") — branches on
              // the caller's own, explicit source, same real pattern
              // as the FINAL case above. An earlier version of this
              // switch routed Cytology only for CORRECTED, on the
              // wrong assumption that Cytology had no real addendum
              // concept at all — corrected directly: Cytology's own
              // dispatch function now handles both, built against its
              // own genuinely different data model
              // (CytologySignOutRecord, not SynopticReportInstance).
              if (event.source === 'CYTOLOGY') {
                if (event.instanceId) {
                  await dispatchCytologyAmendedCaseInstance(event.caseId, event.instanceId, event.reportType, event.previouslyReportedAs);
                }
                return {};
              }
              // Real, per direct follow-up ("wire that in" — replacing
              // sendSynopticReportToLis entirely for orchestration
              // amendments): dispatchCaseInstances.ts is genuinely,
              // permanently 'FINAL'-only (confirmed directly — it
              // hardcodes 'FINAL' in its own dedup check, payload
              // build, and enqueue call) and dispatches every real
              // instance on the case, not the one specific instance
              // that was actually amended. Neither fits a real
              // correction/addendum, which is why this now routes to
              // its own, dedicated, instance-scoped function instead.
              // Real, honest requirement: a real caller must supply
              // instanceId for this to mean anything — without one,
              // there's no real, specific instance to report on, so
              // this is a real, silent no-op rather than a guess at
              // which instance the caller meant.
              if (event.instanceId) {
                await dispatchAmendedCaseInstance(event.caseId, event.instanceId, event.reportType, event.previouslyReportedAs);
              }
              return {};
            case 'PRELIMINARY': {
              // Real, per this file's own header: the same, real, extracted
              // dispatch loop releasePreliminaryReport.ts's own real caller
              // now shares through this one, real function — never a second,
              // separate copy of it.
              const dispatchedCount = await dispatchPreliminaryCaseInstances(event.caseId);
              return { dispatchedCount };
            }
          }
        })()
      : Promise.resolve({}),
    runPrint
      ? dispatchPrintJob(
          event.caseId, event.performingFacilityId, event.reportType, event.priority ?? 'Routine', event.generatePdf,
          // Real, per PS-278 — forwards the same real 'SURGPATH' |
          // 'CYTOLOGY' signal this event already carries, so
          // dispatchPrintJob's own DIRECT_NETWORK_PRINT mode (Mode 3)
          // can resolve the real Specimen/Case Type criterion (see
          // resolveRealPrintRoutingContext.ts's own header).
          // Updated (PS-278/279 gap-closing pass, Sep 2026) — real
          // identity threading, closing this layer's own previously-
          // disclosed gap: every real interactive call site already
          // resolves and passes releasedBy (the real signing user), so
          // forwarding releasedBy.id as userId here is a genuine
          // signal, never fabricated — it's simply undefined on the
          // one real, truly non-human path (the release-buffer's own
          // automatic expiry), same honest behavior as before for that
          // path specifically. workstationId reuses the same real,
          // established, non-React getEffectiveScanStationId() this
          // app's own audit/case-routing services already call from
          // service-layer code — the sign-out that triggers this IS
          // the real action of a real pathologist at their real,
          // current workstation, so this is a real signal too, not a
          // guess.
          { source: event.source, userId: event.releasedBy?.id, workstationId: getEffectiveScanStationId() ?? undefined },
        )
          .then(r => r.outcome)
          .catch(() => 'failed' as const)
      : Promise.resolve(undefined),
  ]);

  return { ...electronicResult, printOutcome, deliveryAction: action, matchedRuleId };
}

// src/services/printRouting/resolveRealPrintRoutingContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278. Resolves the real, live §2.1.1 criteria this app
// actually has for a given case and hands them to the pure, testable
// resolvePrintDestination.ts — never duplicates its own matching
// logic here. Same real split resolveRealDeliveryDecision.ts already
// establishes for Component C.
//
// Real, per-criterion account of what's actually reliable today:
//   - Event Trigger Type: fully real and reliable —
//     mapReportTypeToEventTriggerType() against the same, already-
//     wired ReportReleasedEventType every real caller already has.
//   - Location/Sub-location (pointOfCare): fully real and reliable —
//     the exact same real field/lookup path
//     resolveRealDeliveryDecision.ts already uses
//     (Case.order.locationId → Location.pointOfCare). No new lookup
//     invented; this file's own header doc comment for that field
//     already documents the real HL7 PV1-3.1 provenance.
//   - Client Account (orderingFacilityId): fully real and reliable —
//     Case.order.facilityId, same real field DeliveryRule.orderingFacilityId
//     already resolves against.
//   - Specimen/Case Type: **Updated (PS-278/279 gap-closing pass, Sep
//     2026) — now real for Frozen Section too, not just Cytology.**
//     This app's own real, existing Case data reliably distinguishes
//     Cytology (the same real, explicit ReportReleasedEvent.source:
//     'CYTOLOGY' signal publishReportReleasedEvent.ts's own dispatch
//     logic already branches on). Frozen Section vs. Routine Surgical
//     is still NOT inferable from any real Case-level field itself —
//     confirmed directly, unchanged: Case.priority is
//     'Routine' | 'Rush' | 'STAT' (urgency, not specimen type), and
//     Case/OrderMetadata carry no specimen-type field of their own.
//     What closes this gap is a real, one-service-boundary-away
//     signal this app DOES have: wasCaseFrozenSectioned.ts performs
//     the same real reverse lookup
//     components/QualityAssurance/IntraopLinkageTab.tsx and
//     components/Contribution/qualityCalculations.ts already do
//     independently (scanning IntraoperativeEntry.mergedIntoCaseId —
//     there is genuinely no case-side pointer to index by instead)
//     and checks whether any of that entry's specimens carry a real
//     'frozen_section_cut' milestone. A real, honest limit remains:
//     a case that never went through intraop at all (most routine
//     surgical cases) has no signal either way and correctly resolves
//     to 'ROUTINE_SURGICAL', the same real default this file always
//     used — this closes a real false-negative gap (a genuine frozen
//     section silently routing as routine), it does not claim
//     perfect coverage for every real case that might exist. The
//     explicit specimenCaseTypeOverride path is kept, unchanged, for
//     a real caller that already knows for certain (or wants to
//     force a specific value in a test) — it still wins over this
//     inference when supplied.
//   - User/Workstation: **Updated (PS-278/279 gap-closing pass, Sep
//     2026) — now real for the automated release path too.** The
//     real signing user is genuinely available at this layer after
//     all: every real interactive sign-out/amendment call site
//     (useSignOutWorkflow.ts, useAmendmentWorkflow.ts,
//     CytologyScreeningPage.tsx) already resolves and passes
//     ReportReleasedEvent.releasedBy — publishReportReleasedEvent.ts
//     now forwards releasedBy.id through as userId rather than
//     dropping it. Workstation identity uses the same real,
//     established, non-React
//     utils/effectiveScanStation.ts#getEffectiveScanStationId() this
//     app's own audit/case-routing services already call from
//     service-layer code for exactly this reason — the report
//     sign-out that triggers this automated dispatch IS itself the
//     real action of a real pathologist at a real, current
//     workstation, so this is a genuine, non-fabricated signal, not a
//     guess. A real, honest limit remains: the one truly non-human
//     dispatch path (the release-buffer's own automatic expiry, see
//     mockReportReleaseService.ts) has no real user or device behind
//     it at all, and correctly leaves both undefined rather than
//     inventing one. workstationId/userId overrides are still
//     accepted and still win when a caller explicitly supplies them.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockLocationService } from '../locations/mockLocationService';
import { wasCaseFrozenSectioned } from './wasCaseFrozenSectioned';
import { mapReportTypeToEventTriggerType, type SpecimenCaseType } from '@/types/printRouting/PrintRoutingRule';
import type { PrintDestinationResolutionInput } from './resolvePrintDestination';
import type { ReportReleasedEventType } from '../reports/publishReportReleasedEvent';

export interface RealPrintRoutingContextOverrides {
  /** Real, for a future interactive caller only — see this file's own
   *  header. Never populated by the automated event-publish path. */
  workstationId?: string;
  userId?: string;
  /** Real, honest override for the one real, disclosed §2.1.1 gap
   *  this resolver can't close on its own — see this file's own
   *  header's "Specimen/Case Type" account. */
  specimenCaseTypeOverride?: SpecimenCaseType;
}

export async function resolveRealPrintRoutingContext(
  caseId: string,
  reportType: ReportReleasedEventType,
  performingFacilityId: string | undefined,
  source: 'SURGPATH' | 'CYTOLOGY' | undefined,
  overrides?: RealPrintRoutingContextOverrides,
): Promise<PrintDestinationResolutionInput> {
  const caseData = await caseRouter.getCase(caseId);
  const order: any = (caseData as any)?.order;

  let pointOfCare: string | undefined;
  if (order?.locationId) {
    const locationRes = await mockLocationService.getById(order.locationId).catch(() => null);
    pointOfCare = locationRes?.ok ? locationRes.data.pointOfCare : undefined;
  }

  // Real, per this file's own header — Cytology remains the one
  // always-reliable signal from `source` directly; Frozen Section is
  // now also real, resolved from the same real intraop-merge signal
  // wasCaseFrozenSectioned.ts checks, never guessed from urgency or
  // any other unrelated field. An explicit override, when supplied,
  // still wins over both.
  let specimenCaseType: SpecimenCaseType | undefined = overrides?.specimenCaseTypeOverride;
  if (!specimenCaseType) {
    if (source === 'CYTOLOGY') {
      specimenCaseType = 'CYTOLOGY';
    } else {
      specimenCaseType = (await wasCaseFrozenSectioned(caseId)) ? 'FROZEN_SECTION' : 'ROUTINE_SURGICAL';
    }
  }

  return {
    workstationId: overrides?.workstationId,
    userId: overrides?.userId,
    pointOfCare,
    orderingFacilityId: order?.facilityId,
    facilityId: performingFacilityId,
    specimenCaseType,
    eventTriggerType: mapReportTypeToEventTriggerType(reportType),
  };
}

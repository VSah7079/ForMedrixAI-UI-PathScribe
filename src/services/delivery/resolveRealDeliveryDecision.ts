// src/services/delivery/resolveRealDeliveryDecision.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec (Section 3 — Delivery Configuration Rules
// Engine): resolves the real, live criteria this app actually has for
// a given case (Provider ID, Ordering Facility, Patient Location,
// Report Type — see DeliveryRule.ts's own header for exactly where
// each one comes from) and hands them to the pure, testable
// resolveDeliveryAction.ts. Never duplicates that function's own
// matching logic here.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockLocationService } from '../locations/mockLocationService';
import { mockDeliveryRuleService } from './mockDeliveryRuleService';
import { resolveDeliveryAction, type DeliveryDecisionResult } from './resolveDeliveryAction';
import type { ReportReleasedEventType } from '../reports/publishReportReleasedEvent';

export async function resolveRealDeliveryDecision(
  caseId: string,
  reportType: ReportReleasedEventType,
): Promise<DeliveryDecisionResult> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return { action: 'ELECTRONIC_ONLY' };

  const order: any = (caseData as any).order;
  let pointOfCare: string | undefined;
  if (order?.locationId) {
    const locationRes = await mockLocationService.getById(order.locationId).catch(() => null);
    pointOfCare = locationRes?.ok ? locationRes.data.pointOfCare : undefined;
  }

  const rulesRes = await mockDeliveryRuleService.getActive();
  const rules = rulesRes.ok ? rulesRes.data : [];

  return resolveDeliveryAction({
    providerId: order?.orderingPhysicianId,
    orderingFacilityId: order?.facilityId,
    pointOfCare,
    reportType,
  }, rules);
}

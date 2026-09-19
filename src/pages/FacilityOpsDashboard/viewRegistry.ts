// src/pages/FacilityOpsDashboard/viewRegistry.ts
// One real, shared registry mapping each of the five real
// DashboardViewId values to its own compute function and a real
// i18n key for its title — the single place that has to change if a
// sixth view is ever added, rather than a switch statement repeated
// in several files.
import { computeGrossingIntakeSummary } from '@/services/facilityOpsDashboard/computeGrossingIntakeSummary';
import { computeEmbeddingMicrotomySummary } from '@/services/facilityOpsDashboard/computeEmbeddingMicrotomySummary';
import { computeStainingIhcSummary } from '@/services/facilityOpsDashboard/computeStainingIhcSummary';
import { computeSendOutReferenceSummary } from '@/services/facilityOpsDashboard/computeSendOutReferenceSummary';
import { computeDiagnosticSignOutSummary } from '@/services/facilityOpsDashboard/computeDiagnosticSignOutSummary';
import type { DashboardViewId } from '@/services/facilityOpsDashboard/IDisplayProfileService';
import type { DashboardSummary } from '@/services/facilityOpsDashboard/IFacilityOpsDashboardTypes';

export interface DashboardViewMeta {
  id: DashboardViewId;
  titleKey: string;
  compute: (facilityId: string | undefined) => Promise<DashboardSummary>;
}

export const DASHBOARD_VIEW_REGISTRY: Record<DashboardViewId, DashboardViewMeta> = {
  grossing_intake: { id: 'grossing_intake', titleKey: 'facilityOpsDashboard.views.grossingIntake', compute: computeGrossingIntakeSummary },
  embedding_microtomy: { id: 'embedding_microtomy', titleKey: 'facilityOpsDashboard.views.embeddingMicrotomy', compute: computeEmbeddingMicrotomySummary },
  staining_ihc: { id: 'staining_ihc', titleKey: 'facilityOpsDashboard.views.stainingIhc', compute: computeStainingIhcSummary },
  sendout_reference: { id: 'sendout_reference', titleKey: 'facilityOpsDashboard.views.sendoutReference', compute: computeSendOutReferenceSummary },
  diagnostic_signout: { id: 'diagnostic_signout', titleKey: 'facilityOpsDashboard.views.diagnosticSignout', compute: computeDiagnosticSignOutSummary },
};

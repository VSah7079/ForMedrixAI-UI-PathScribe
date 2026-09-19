// src/services/facilityOpsDashboard/IFacilityOpsDashboardTypes.ts
// Shared shapes for every one of PS-288's five department dashboard
// summaries — kept in one file since every view's own compute
// function returns the same real building blocks (stat tiles, an
// SLA/age state, and a real alert list), rather than five, slightly
// different, independently-invented shapes for the same real ideas.

/** Real, honest three-state coloring — the same real semantics as
 *  DecalBatch.ts's own DecalTimerStatus, reused as the shared name
 *  every dashboard view's SLA/countdown badge renders against. */
export type SlaState = 'normal' | 'warning' | 'overdue';

/** One real, glanceable number on a dashboard (e.g. "Pending Intake:
 *  14"). `state` is optional — a plain count (e.g. "Active Batches:
 *  6") carries no real breach semantics and stays uncolored. */
export interface DashboardStatTile {
  id: string;
  label: string;
  value: number;
  state?: SlaState;
}

/** A real, individual row worth a pathologist/tech's attention on a
 *  wall display — STAT priority, a cold-chain excursion, a QC
 *  failure, a block exception. Deliberately generic across all five
 *  views rather than five separate alert shapes, since every one of
 *  them is really the same real thing: "this specific item needs a
 *  human, now." */
export interface DashboardAlert {
  id: string;
  severity: 'critical' | 'warning';
  /** Real, human-facing label for what kind of alert this is, e.g.
   *  "STAT", "Cold-Chain Excursion", "QC Failed" — shown as a badge. */
  kind: string;
  title: string;
  detail?: string;
  /** Real elapsed age in minutes since the alert-worthy event, when
   *  known — lets the UI show "12m ago" without a second lookup. */
  ageMinutes?: number;
}

/** A real, individual queue/work-item row. `ageMinutes` is only set
 *  when a real, per-item timestamp exists to measure it from (a
 *  batch's own createdAt, a referral's own lastUpdatedAt) — some real
 *  queue rows (e.g. a pending block/slide, which carries no creation
 *  timestamp of its own anywhere in this app's data model) honestly
 *  have none, and the UI shows the row without an age rather than
 *  inventing one. `slaState`/`remainingMinutes` are only populated
 *  when a real target duration was actually resolved (a decal batch's
 *  own targetDurationMinutes, a real TAT entry) — never a fabricated
 *  target. */
export interface DashboardQueueItem {
  id: string;
  label: string;
  detail?: string;
  ageMinutes?: number;
  slaState?: SlaState;
  remainingMinutes?: number;
  isStat?: boolean;
}

/** The one, shared summary shape every compute*Summary function
 *  returns — a real "as of" timestamp (so the UI can show a real,
 *  honest freshness indicator even before the polling layer's own
 *  offline/stale detection kicks in), the stat tiles, the queue, and
 *  any alerts. */
export interface DashboardSummary {
  asOf: string;
  facilityId: string | undefined;
  stats: DashboardStatTile[];
  queue: DashboardQueueItem[];
  alerts: DashboardAlert[];
}

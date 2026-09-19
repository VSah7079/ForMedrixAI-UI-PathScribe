// src/services/facilityOpsDashboard/IDisplayProfileService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-288, Enterprise Laboratory Operations Dashboard Engine — the
// "Display Profile" / device registry, per direct scope confirmation
// (data-only: no physical kiosk hardware is reachable from this
// environment to bind against for real).
//
// Same real, established shape as OrSuiteTerminal
// (services/intraopDashboard/IOrSuiteTerminalService.ts) — a real,
// admin-managed record a physical wall display "logs in as," rather
// than a per-user login — reused directly rather than reinvented,
// for a genuinely analogous real entity: an OR terminal is bound to
// one Location; a Display Profile is bound to one performing lab
// (facilityId) and one or more of the five department dashboard
// views. `deviceToken` is honestly informational only (a real admin
// can record the wall unit's own MAC/IP/asset tag for their own
// physical bookkeeping) — this app has no way to verify or enforce a
// real binding to actual hardware, and never claims to.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

/** The five real department dashboard views this Epic scopes, per
 *  direct confirmation. One id per view — never a free-text label,
 *  so a profile's own assignedViews stays a real, closed set the UI
 *  can switch on exhaustively. */
export type DashboardViewId =
  | 'grossing_intake'
  | 'embedding_microtomy'
  | 'staining_ihc'
  | 'sendout_reference'
  | 'diagnostic_signout';

export const DASHBOARD_VIEW_IDS: readonly DashboardViewId[] = [
  'grossing_intake', 'embedding_microtomy', 'staining_ihc', 'sendout_reference', 'diagnostic_signout',
];

export interface DisplayProfile {
  id: ID;
  /** e.g. "Histology Bench 3 — Wall Display" — the real, human-facing
   *  identity an admin picks at bind time (TerminalSetup's own
   *  proven pattern), same real role as OrSuiteTerminal.name. */
  name: string;
  /** The real performing lab (services/facilities/, 'performing_lab'
   *  role) this display's own data is scoped to — never an
   *  enterprise-wide, unscoped feed. */
  facilityId: string;
  /** One or more of the five real views. More than one means this
   *  profile carousels between them (see carouselIntervalSeconds) —
   *  a real, common wall-display need (one screen covering both
   *  Grossing & Intake and Embedding & Microtomy in a shared bench
   *  area) rather than a forced one-view-per-screen limit. */
  assignedViews: DashboardViewId[];
  /** Only meaningful when assignedViews.length > 1 — how long each
   *  view holds before advancing to the next. Undefined with more
   *  than one assigned view falls back to a real, sane UI default
   *  (see FacilityOpsDashboardPage.tsx), never a silent 0/instant
   *  flip. */
  carouselIntervalSeconds?: number;
  /** Honest, informational only — see this file's own header. Never
   *  validated against, or used to authenticate, an actual device. */
  deviceToken?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export type NewDisplayProfile = Omit<DisplayProfile, 'id' | 'createdAt'>;

export interface IDisplayProfileService {
  getAll(): Promise<ServiceResult<DisplayProfile[]>>;
  getActive(): Promise<ServiceResult<DisplayProfile[]>>;
  getById(id: ID): Promise<ServiceResult<DisplayProfile>>;
  add(entry: NewDisplayProfile): Promise<ServiceResult<DisplayProfile>>;
  update(id: ID, changes: Partial<NewDisplayProfile>): Promise<ServiceResult<DisplayProfile>>;
  deactivate(id: ID): Promise<ServiceResult<DisplayProfile>>;
}

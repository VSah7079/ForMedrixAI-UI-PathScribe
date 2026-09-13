// src/services/intraopDashboard/IOrSuiteTerminalService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
// Intraoperative/Frozen Section Dashboard: "design the primary
// dashboard login around the Location / OR Suite Terminal ID... The
// display unit or terminal in a specific OR logs in as a Station
// Identity (e.g., OR-Suite-04)." Same real, established shape as
// services/scanStations/IScanStationService.ts (facility-scoped,
// Active/Inactive lifecycle, a stable barcode/code for binding) —
// reusing that proven pattern for a genuinely different real entity:
// a scan station is where a TECH scans a SPECIMEN; an OR suite
// terminal is a wall-mounted display bound to a real Location (the
// specific OR/suite itself, services/locations/), not a bench.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface OrSuiteTerminal {
  id: ID;
  /** e.g. "OR-Suite-04" — the real Station Identity a physical
   *  display/monitor "logs in as," per the given design brief. */
  name: string;
  /** The real Location (services/locations/) this terminal's own
   *  default view is scoped to — the one, specific OR/suite. Every
   *  Location is already facility-scoped, so a customer with many
   *  institutions each having their own "OR 1" is genuinely safe
   *  here: two different real Location records, two different real
   *  ids, regardless of how many share the same human-facing name. */
  locationId: string;
  facilityId: string;
  /** Real, per the given design brief's own "Multi/Suite Overview...
   *  for an OR charge nurse, lab liaison, or roving circulator" —
   *  gates whether this terminal can switch into the multi-suite view
   *  at all, rather than every terminal defaulting to it. */
  canViewMultiSuite: boolean;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export type NewOrSuiteTerminal = Omit<OrSuiteTerminal, 'id' | 'createdAt'>;

export interface IOrSuiteTerminalService {
  getAll(): Promise<ServiceResult<OrSuiteTerminal[]>>;
  getActive(): Promise<ServiceResult<OrSuiteTerminal[]>>;
  getById(id: ID): Promise<ServiceResult<OrSuiteTerminal>>;
  add(entry: NewOrSuiteTerminal): Promise<ServiceResult<OrSuiteTerminal>>;
  update(id: ID, changes: Partial<NewOrSuiteTerminal>): Promise<ServiceResult<OrSuiteTerminal>>;
  deactivate(id: ID): Promise<ServiceResult<OrSuiteTerminal>>;
}

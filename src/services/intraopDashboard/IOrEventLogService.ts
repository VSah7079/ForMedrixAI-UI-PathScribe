// src/services/intraopDashboard/IOrEventLogService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section
// Dashboard's own "Dual-Signoff & OR Communication Bridge" ask:
// "Time-stamped logging of verbal report delivery, including surgeon
// name, receiving staff, and exact timestamp," plus the given design
// brief's own worked example: "Event: Verbal Report Logged | Location:
// OR-04 | User: J. Doe, RN." One real, shared event log covering
// every real quick action the ambient terminal needs attributed to a
// specific real person via resolveStaffByQuickAuthPin.ts, not a
// separate log per action type.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type OrEventType = 'verbal_report_logged' | 'stat_alert_acknowledged' | 'case_dismissed';

export interface OrEvent {
  id: string;
  locationId: string;
  /** The real, existing IntraoperativeEntry this event is about, when
   *  one exists — undefined for a genuinely location-level action
   *  (e.g. a stat alert acknowledged before any specific specimen is
   *  named). */
  intraopEntryId?: string;
  eventType: OrEventType;
  /** Resolved via resolveStaffByQuickAuthPin.ts at the moment of the
   *  real action — never the ambient terminal's own identity, which
   *  isn't a real person. */
  staffUserId: string;
  staffUserName: string;
  /** Required when eventType === 'verbal_report_logged', per the
   *  RFP's own explicit ask ("including surgeon name"); undefined
   *  otherwise. */
  surgeonName?: string;
  note?: string;
  occurredAt: string;
  /** Real, per the OR Suite Live Board's own dismissal workflow spec's
   *  audit-log field list — required (and only meaningful) when
   *  eventType === 'case_dismissed'. `occurredAt` above already IS
   *  the real dismissal timestamp; these are the rest of that same
   *  spec's own required fields. A real, immutable, self-contained
   *  audit record — every field a real auditor would need is captured
   *  here directly, not left to a later join against the specimen
   *  record (which real records can, and do, keep changing after this
   *  moment). */
  accessionNumber?: string;
  orRoom?: string;
  pathologistSignOffTime?: string;
  dwellTimeOnBoardSeconds?: number;
  surgeonReadbackConfirmed?: boolean;
  finalPreliminaryText?: string;
  totalTurnaroundMinutes?: number;
}

export type NewOrEvent = Omit<OrEvent, 'id' | 'occurredAt'>;

export interface IOrEventLogService {
  getAll(): Promise<ServiceResult<OrEvent[]>>;
  getByLocationId(locationId: string): Promise<ServiceResult<OrEvent[]>>;
  getByIntraopEntryId(intraopEntryId: string): Promise<ServiceResult<OrEvent[]>>;
  record(event: NewOrEvent): Promise<ServiceResult<OrEvent>>;
}

// src/services/reportChangeLog/IReportChangeLogService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 368 (PS-353): the report change log. One entry per save of a case:
// who saved, when, from which workstation, and every field that changed,
// old → new. Append-only: there is no update or delete.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** Where in the report a change is (Pete, 2026-09-28: all of them are logged). */
export type ReportChangeArea = 'synoptic' | 'narrative' | 'codes' | 'specimens' | 'case';

export interface ReportFieldChange {
  area: ReportChangeArea;
  /** Readable path: record labels where the data has them (a specimen's
   *  label, a template's name), field keys otherwise. */
  path: string[];
  kind: 'changed' | 'added' | 'removed';
  /** Plain text for display and export: the value itself for text and
   *  numbers, a list joined with ", ", a record's label when a whole record
   *  was added or removed. Null when there was no value. */
  before: string | null;
  after: string | null;
}

export interface ReportChangeEntry {
  id: string;
  caseId: string;
  at: string;
  userId: string;
  userName: string;
  /** The workstation (scan station) the save came from, when known. */
  stationId: string | null;
  changes: ReportFieldChange[];
}

export interface IReportChangeLogService {
  /** Appends one entry. */
  record(entry: Omit<ReportChangeEntry, 'id'>): Promise<ServiceResult<ReportChangeEntry>>;
  /** Every entry for a case, oldest first. */
  listForCase(caseId: string): Promise<ServiceResult<ReportChangeEntry[]>>;
}

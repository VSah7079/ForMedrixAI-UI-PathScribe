// src/services/reportChangeLog/mockReportChangeLogService.ts
// Batch 368 (PS-353): the browser store for the report change log
// (`report_change_log`, cleared by Demo Reset). Append-only. In production
// the API server writes the entry in the same transaction as the case save
// (docs/architecture/REPORT_CHANGE_LOG_API.md).

import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IReportChangeLogService, ReportChangeEntry } from './IReportChangeLogService';

const STORAGE_KEY = 'report_change_log';
/** Fired after an entry is recorded, so an open report page can refresh. */
export const REPORT_CHANGE_LOGGED_EVENT = 'pathscribe:report-change-logged';
const load = () => storageGet<ReportChangeEntry[]>(STORAGE_KEY, []);

export const mockReportChangeLogService: IReportChangeLogService = {
  async record(entry): Promise<ServiceResult<ReportChangeEntry>> {
    const saved: ReportChangeEntry = { ...entry, id: `RCL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
    storageSet(STORAGE_KEY, [...load(), saved]);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REPORT_CHANGE_LOGGED_EVENT, { detail: { caseId: saved.caseId } }));
    return { ok: true, data: saved };
  },
  async listForCase(caseId): Promise<ServiceResult<ReportChangeEntry[]>> {
    return { ok: true, data: load().filter(e => e.caseId === caseId).sort((a, b) => a.at.localeCompare(b.at)) };
  },
};

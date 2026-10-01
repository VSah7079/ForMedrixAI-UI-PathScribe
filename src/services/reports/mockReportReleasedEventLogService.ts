// src/services/reports/mockReportReleasedEventLogService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Component A refinement") — the real,
// tangible, immediate value of formalizing ReportReleasedEvent even
// before any second real subscriber (a future print queue) exists: a
// real, persisted, unified audit trail of every report release
// (Preliminary and Final alike), in one place. Before this, the only
// trace of a Preliminary release was DiagnosticMetadata.
// preliminaryRecordedAt — a single, case-level timestamp, overwritten
// on each new release, not a real history of every release event.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ReportReleasedEvent } from './publishReportReleasedEvent';

export interface ReportReleasedEventLogEntry extends ReportReleasedEvent {
  id: string;
  recordedAt: string;
}

const STORAGE_KEY = 'reportReleasedEventLog';

const load    = (): ReportReleasedEventLogEntry[] => storageGet<ReportReleasedEventLogEntry[]>(STORAGE_KEY, []);
const persist = (data: ReportReleasedEventLogEntry[]) => storageSet(STORAGE_KEY, data);

export const mockReportReleasedEventLogService = {
  async record(event: ReportReleasedEvent): Promise<ReportReleasedEventLogEntry> {
    const entry: ReportReleasedEventLogEntry = {
      ...event,
      id: 'rre-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      recordedAt: new Date().toISOString(),
    };
    persist([...load(), entry]);
    return entry;
  },

  async getByCaseId(caseId: string): Promise<ReportReleasedEventLogEntry[]> {
    return load().filter(e => e.caseId === caseId).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  },
};

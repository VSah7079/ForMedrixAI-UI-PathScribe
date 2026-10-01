// src/services/intraopDashboard/mockOrEventLogService.ts
import type { IOrEventLogService, OrEvent, NewOrEvent } from './IOrEventLogService';
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { mockAuditService } from '../auditlog/mockAuditService';

const STORAGE_KEY = 'orEventLog';

const load = (): OrEvent[] => storageGet(STORAGE_KEY, []);
const persist = (data: OrEvent[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockOrEventLogService: IOrEventLogService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByLocationId(locationId: string) {
    await delay();
    return ok(load().filter(e => e.locationId === locationId));
  },

  async getByIntraopEntryId(intraopEntryId: string) {
    await delay();
    return ok(load().filter(e => e.intraopEntryId === intraopEntryId));
  },

  async record(event: NewOrEvent) {
    await delay();
    const created: OrEvent = { ...event, id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
    persist([...load(), created]);
    // Real, per the given design brief's own worked audit example —
    // this real event also lands in this app's own, already-
    // established, cross-module audit log, not a second, siloed
    // record only this dashboard can see.
    mockAuditService.logEvent({
      type: 'user',
      event: created.eventType === 'verbal_report_logged' ? 'OR Verbal Report Logged'
        : created.eventType === 'case_dismissed' ? 'OR Live Board Case Dismissed'
        : 'OR Stat Alert Acknowledged',
      detail: created.eventType === 'case_dismissed'
        ? `Location ${created.locationId}: case dismissed by ${created.staffUserName}. Accession ${created.accessionNumber}, ${created.orRoom ?? 'OR unknown'}. Surgeon read-back confirmed: ${created.surgeonReadbackConfirmed}. Turnaround: ${created.totalTurnaroundMinutes}m. Dwell on board: ${created.dwellTimeOnBoardSeconds}s.`
        : `Location ${created.locationId}: ${created.eventType} by ${created.staffUserName}${created.surgeonName ? ` (surgeon: ${created.surgeonName})` : ''}.${created.note ? ` ${created.note}` : ''}`,
      user: created.staffUserName, caseId: created.intraopEntryId ?? null, confidence: null,
    }).catch(() => {});
    return ok(created);
  },
};

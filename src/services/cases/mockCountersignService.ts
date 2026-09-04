// src/services/cases/mockCountersignService.ts
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { CountersignRecord } from '@/types/case/CountersignRecord';
import type { ICountersignService } from './ICountersignService';
import { mockAuditService } from '../auditlog/mockAuditService';

const STORAGE_KEY = 'countersign_records';

// Realistic seed batch — Oliver Pemberton (resident) drafting, Paul
// Carter (attending) countersigning, across a mix of subspecialties.
// Deliberately covers cases with NO frozen section at all — the exact
// gap this whole feature exists to close, since ReconciliationRecord's
// teaching data only ever fires for frozen-section cases.
const SEED_COUNTERSIGN_RECORDS: CountersignRecord[] = Array.from({ length: 12 }, (_, i) => {
  const daysAgo = 4 + i * 11;
  const releasedAt = new Date(Date.now() - (daysAgo + 0.25) * 86400000);
  const countersignedAt = new Date(Date.now() - daysAgo * 86400000);
  const subspecialties = ['derm', 'gyn', 'uro', 'heme'];
  const changedFieldCount = i % 4; // varies 0-3, not an engineered trend
  return {
    id: `cs-seed-${i + 1}`,
    caseId: `MFT26-${9500 + i}`,
    subspecialtyId: subspecialties[i % subspecialties.length],
    residentId: 'PATH-UK-002',
    residentName: 'Oliver Pemberton',
    attendingId: 'PATH-UK-001',
    attendingName: 'Paul Carter',
    releasedAt: releasedAt.toISOString(),
    countersignedAt: countersignedAt.toISOString(),
    releasedAnswersSnapshot: {},
    changedFieldCount,
    attendingFeedback: i === 11 ? 'Nice synoptic completeness on this one — margins section was thorough and well-organized.' : undefined,
    status: 'countersigned',
  } as CountersignRecord;
});

const load    = (): CountersignRecord[] => storageGet<CountersignRecord[]>(STORAGE_KEY, SEED_COUNTERSIGN_RECORDS);
const persist = (data: CountersignRecord[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(message: string): ServiceResult<T> => ({ ok: false, error: message });

/** Counts fields that differ between the resident's released snapshot and
 *  what the attending actually signed out — a real, simple delta, not a
 *  full field-by-field diff. Compares per-instance, per-field values;
 *  array-valued answers compared by joined string (matches the same
 *  comparison approach used elsewhere in this app, e.g. the override
 *  detection in RightSynopticPanel.tsx). */
function countChangedFields(
  released: Record<string, Record<string, string | string[]>>,
  current: Record<string, Record<string, string | string[]>>,
): number {
  let changed = 0;
  const norm = (v: string | string[] | undefined) => Array.isArray(v) ? v.join(',') : (v ?? '');
  Object.keys(current).forEach(instanceId => {
    const releasedAnswers = released[instanceId] ?? {};
    const currentAnswers = current[instanceId] ?? {};
    const allFieldIds = new Set([...Object.keys(releasedAnswers), ...Object.keys(currentAnswers)]);
    allFieldIds.forEach(fieldId => {
      if (norm(releasedAnswers[fieldId]) !== norm(currentAnswers[fieldId])) changed++;
    });
  });
  return changed;
}

export const mockCountersignService: ICountersignService = {
  async getAll() {
    return ok([...load()]);
  },

  async getForCase(caseId: string) {
    // Real, per direct guidance ("Continue" — closing the gap where a
    // rejection's own real attendingFeedback was captured but never
    // actually shown to the resident anywhere): now also matches
    // 'returned', not just 'pending' — see this method's own real,
    // updated contract in ICountersignService.ts.
    const record = load().find(r => r.caseId === caseId && (r.status === 'pending' || r.status === 'returned'));
    return ok(record ?? null);
  },

  async release(input) {
    const records = load();
    // Only one pending release per case at a time — if one already
    // exists (e.g. resident re-triggers sign-out before the attending
    // has acted), replace rather than duplicate.
    const filtered = records.filter(r => !(r.caseId === input.caseId && r.status === 'pending'));
    const newRecord: CountersignRecord = {
      id: `cs-${Date.now().toString(36)}`,
      caseId: input.caseId,
      subspecialtyId: input.subspecialtyId,
      residentId: input.residentId,
      residentName: input.residentName,
      releasedAt: new Date().toISOString(),
      releasedAnswersSnapshot: input.releasedAnswersSnapshot,
      status: 'pending',
    };
    persist([newRecord, ...filtered]);

    await mockAuditService.logEvent({
      type: 'user',
      event: 'Case Released for Countersign',
      detail: `Case ${input.caseId} released by resident ${input.residentName} — pending attending countersign`,
      user: input.residentName,
      caseId: input.caseId,
      confidence: null,
    }).catch(() => {});

    return ok(newRecord);
  },

  async countersign(input) {
    const records = load();
    const idx = records.findIndex(r => r.caseId === input.caseId && r.status === 'pending');
    if (idx === -1) return err(`No pending countersign record found for case ${input.caseId}`);

    const changedFieldCount = countChangedFields(records[idx].releasedAnswersSnapshot, input.currentAnswersByInstance);
    const updated: CountersignRecord = {
      ...records[idx],
      attendingId: input.attendingId,
      attendingName: input.attendingName,
      countersignedAt: new Date().toISOString(),
      changedFieldCount,
      attendingFeedback: input.attendingFeedback?.trim() || undefined,
      status: 'countersigned',
    };
    records[idx] = updated;
    persist(records);

    await mockAuditService.logEvent({
      type: 'user',
      event: 'Case Countersigned',
      detail: `Case ${input.caseId} countersigned by ${input.attendingName} — ${changedFieldCount} field(s) changed from the resident's release` +
        (input.attendingFeedback ? ' — feedback provided' : ''),
      user: input.attendingName,
      caseId: input.caseId,
      confidence: null,
    }).catch(() => {});

    return ok(updated);
  },

  async reject(input) {
    // Real, per direct guidance: attendingFeedback is required here —
    // a rejection with no explanation gives the resident nothing to
    // act on. Same real "don't silently accept malformed input"
    // posture this session's other new service methods already use.
    const trimmedFeedback = input.attendingFeedback?.trim();
    if (!trimmedFeedback) {
      return err('reject() requires real attendingFeedback — the resident needs to know why this was returned.');
    }

    const records = load();
    const idx = records.findIndex(r => r.caseId === input.caseId && r.status === 'pending');
    if (idx === -1) return err(`No pending countersign record found for case ${input.caseId}`);

    const updated: CountersignRecord = {
      ...records[idx],
      attendingId: input.attendingId,
      attendingName: input.attendingName,
      returnedAt: new Date().toISOString(),
      attendingFeedback: trimmedFeedback,
      status: 'returned',
    };
    records[idx] = updated;
    persist(records);

    await mockAuditService.logEvent({
      type: 'user',
      event: 'Case Returned for Revision',
      detail: `Case ${input.caseId} returned to resident ${records[idx].residentName} by ${input.attendingName} — feedback: ${trimmedFeedback}`,
      user: input.attendingName,
      caseId: input.caseId,
      confidence: null,
    }).catch(() => {});

    return ok(updated);
  },
};

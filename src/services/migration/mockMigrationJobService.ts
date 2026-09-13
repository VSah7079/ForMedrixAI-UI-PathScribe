// src/services/migration/mockMigrationJobService.ts
import type { IMigrationJobService, MigrationJob, NewMigrationJob } from './IMigrationJobService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { mockAuditService } from '../auditlog/mockAuditService';

const STORAGE_KEY = 'migrationJobs';

const load = (): MigrationJob[] => storageGet(STORAGE_KEY, []);
const persist = (data: MigrationJob[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockMigrationJobService: IMigrationJobService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getById(id: ID) {
    await delay();
    const found = load().find(j => j.id === id);
    return found ? ok(found) : err(`MigrationJob ${id} not found`);
  },

  async create(entry: NewMigrationJob) {
    await delay();
    const created: MigrationJob = {
      ...entry, id: 'migjob-' + Date.now(), status: 'pending',
      totalRecordsProcessed: 0, succeededCount: 0, failedCount: 0, needsReviewCount: 0,
      createdAt: new Date().toISOString(),
    };
    persist([...load(), created]);
    mockAuditService.logEvent({
      type: 'system', event: 'Migration Job Created',
      detail: `Migration job created for source system "${created.sourceSystemName}".`,
      user: created.createdByUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return ok(created);
  },

  async start(id: ID) {
    await delay();
    const data = load();
    const job = data.find(j => j.id === id);
    if (!job) return err(`MigrationJob ${id} not found`);
    if (job.status !== 'pending') return err(`Job is "${job.status}", not "pending".`);
    const updated = { ...job, status: 'running' as const, startedAt: new Date().toISOString() };
    persist(data.map(j => j.id === id ? updated : j));
    return ok(updated);
  },

  async recordOutcome(id: ID, outcome: 'succeeded' | 'failed' | 'needs_review') {
    await delay();
    const data = load();
    const job = data.find(j => j.id === id);
    if (!job) return err(`MigrationJob ${id} not found`);
    const updated: MigrationJob = {
      ...job,
      totalRecordsProcessed: job.totalRecordsProcessed + 1,
      succeededCount: job.succeededCount + (outcome === 'succeeded' ? 1 : 0),
      failedCount: job.failedCount + (outcome === 'failed' ? 1 : 0),
      needsReviewCount: job.needsReviewCount + (outcome === 'needs_review' ? 1 : 0),
    };
    persist(data.map(j => j.id === id ? updated : j));
    return ok(updated);
  },

  async complete(id: ID) {
    await delay();
    const data = load();
    const job = data.find(j => j.id === id);
    if (!job) return err(`MigrationJob ${id} not found`);
    const status = job.failedCount > 0 ? 'completed_with_errors' : 'completed';
    const updated: MigrationJob = { ...job, status, completedAt: new Date().toISOString() };
    persist(data.map(j => j.id === id ? updated : j));
    mockAuditService.logEvent({
      type: 'system', event: 'Migration Job Completed',
      detail: `Migration job for "${job.sourceSystemName}" completed: ${updated.succeededCount} succeeded, ${updated.failedCount} failed, ${updated.needsReviewCount} need review (of ${updated.totalRecordsProcessed} processed).`,
      user: job.createdByUserName, caseId: null, confidence: null,
    }).catch(() => {});
    return ok(updated);
  },
};

// src/services/cytologyQc/mockCytologyQcCaseAssignmentService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of ICytologyQcCaseAssignmentService. Real,
// honest state-machine enforcement — every transition method checks
// the assignment's own current, real state before acting, and
// refuses with a real error rather than silently allowing an
// out-of-order transition (e.g. recording a discrepancy on a case
// still sitting in QC_PENDING, never yet assigned a reviewer).
// ─────────────────────────────────────────────────────────────────────────────

import type { ICytologyQcCaseAssignmentService, NewCytologyQcCaseAssignment } from './ICytologyQcCaseAssignmentService';
import type { CytologyQcCaseAssignment } from '@/types/cytologyQc/CytologyQcRule';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { resolveQcReviewerEligibility } from './resolveQcReviewerEligibility';
import { sortQcQueueByPriority } from './sortQcQueueByPriority';
import { resolveQcSlaStatus } from './resolveQcSlaStatus';
import { mockAuditService } from '../auditlog/mockAuditService';

const STORAGE_KEY = 'cytologyQcCaseAssignments';

const load = (): CytologyQcCaseAssignment[] => storageGet(STORAGE_KEY, []);
const persist = (data: CytologyQcCaseAssignment[]) => storageSet(STORAGE_KEY, data);
let _cache: CytologyQcCaseAssignment[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockCytologyQcCaseAssignmentService: ICytologyQcCaseAssignmentService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(a => a.id === id);
    return found ? ok({ ...found }) : err(`CytologyQcCaseAssignment ${id} not found`);
  },

  async getByCaseId(caseId: string) {
    await delay();
    return ok(_cache.filter(a => a.caseId === caseId));
  },

  async getUnifiedQueue() {
    await delay();
    const active = _cache.filter(a => a.state === 'QC_PENDING' || a.state === 'QC_IN_REVIEW');
    return ok(sortQcQueueByPriority(active));
  },

  async create(assignment: NewCytologyQcCaseAssignment) {
    await delay();
    const created: CytologyQcCaseAssignment = { ...assignment, id: 'qc-assign-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async assignReviewer(id: ID, reviewerId: string) {
    await delay();
    const idx = _cache.findIndex(a => a.id === id);
    if (idx === -1) return err(`CytologyQcCaseAssignment ${id} not found`);
    const current = _cache[idx];
    if (current.state !== 'QC_PENDING') {
      return err(`Cannot assign a reviewer to assignment ${id} — it is genuinely in state "${current.state}", not QC_PENDING.`);
    }
    if (!resolveQcReviewerEligibility(reviewerId, current.primarySignOutProviderId)) {
      return err('Self-review is not permitted: the assigned reviewer cannot be the case\'s own primary sign-out provider.');
    }
    const updated: CytologyQcCaseAssignment = { ...current, state: 'QC_IN_REVIEW', assignedReviewerId: reviewerId };
    _cache = [..._cache.slice(0, idx), updated, ..._cache.slice(idx + 1)];
    persist(_cache);
    return ok({ ...updated });
  },

  async recordConcurrence(id: ID, reviewerCommentary?: string) {
    await delay();
    const idx = _cache.findIndex(a => a.id === id);
    if (idx === -1) return err(`CytologyQcCaseAssignment ${id} not found`);
    const current = _cache[idx];
    if (current.state !== 'QC_IN_REVIEW') {
      return err(`Cannot record concurrence for assignment ${id} — it is genuinely in state "${current.state}", not QC_IN_REVIEW.`);
    }
    const updated: CytologyQcCaseAssignment = {
      ...current,
      state: 'FINAL_APPROVED',
      resolvedAt: new Date().toISOString(),
      concurrenceCommentary: reviewerCommentary,
    };
    _cache = [..._cache.slice(0, idx), updated, ..._cache.slice(idx + 1)];
    persist(_cache);
    return ok({ ...updated });
  },

  async recordDiscrepancy(id: ID, discrepancy) {
    await delay();
    const idx = _cache.findIndex(a => a.id === id);
    if (idx === -1) return err(`CytologyQcCaseAssignment ${id} not found`);
    const current = _cache[idx];
    if (current.state !== 'QC_IN_REVIEW') {
      return err(`Cannot record a discrepancy for assignment ${id} — it is genuinely in state "${current.state}", not QC_IN_REVIEW.`);
    }
    const updated: CytologyQcCaseAssignment = {
      ...current,
      state: 'QC_DISCREPANCY_REVISE',
      resolvedAt: new Date().toISOString(),
      discrepancy: { ...discrepancy, loggedAt: new Date().toISOString() },
    };
    _cache = [..._cache.slice(0, idx), updated, ..._cache.slice(idx + 1)];
    persist(_cache);
    return ok({ ...updated });
  },

  async escalateForSlaBreach(id: ID, now: string, reason: string) {
    await delay();
    const idx = _cache.findIndex(a => a.id === id);
    if (idx === -1) return err(`CytologyQcCaseAssignment ${id} not found`);
    const current = _cache[idx];
    if (current.state !== 'QC_IN_REVIEW') {
      return err(`Cannot escalate assignment ${id} — it is genuinely in state "${current.state}", not QC_IN_REVIEW.`);
    }
    const slaStatus = resolveQcSlaStatus(current.createdAt, current.slaDeadline, now);
    if (slaStatus !== 'breached') {
      return err(`Cannot escalate assignment ${id} — it has not genuinely breached its own real SLA deadline yet (real status: "${slaStatus}").`);
    }
    const updated: CytologyQcCaseAssignment = {
      ...current,
      state: 'QC_PENDING',
      assignedReviewerId: undefined,
      slaEscalationCount: current.slaEscalationCount + 1,
    };
    _cache = [..._cache.slice(0, idx), updated, ..._cache.slice(idx + 1)];
    persist(_cache);
    await mockAuditService.logEvent({
      type: 'system', event: 'Cytology QC SLA Breach — Case Escalated', caseId: current.caseId, user: 'system', confidence: null,
      detail: `Assignment ${id} released back to the unified queue after breaching its own SLA deadline (${current.slaDeadline}). Reason: ${reason}.`,
    }).catch(() => {});
    return ok({ ...updated });
  },

  async supervisorBypass(id: ID, supervisorId: string, justification: string) {
    await delay();
    const idx = _cache.findIndex(a => a.id === id);
    if (idx === -1) return err(`CytologyQcCaseAssignment ${id} not found`);
    const current = _cache[idx];
    if (current.state === 'FINAL_APPROVED' || current.state === 'QC_DISCREPANCY_REVISE') {
      return err(`Cannot bypass assignment ${id} — it is genuinely already in a terminal state ("${current.state}").`);
    }
    const updated: CytologyQcCaseAssignment = {
      ...current,
      state: 'FINAL_APPROVED',
      resolvedAt: new Date().toISOString(),
      supervisorBypass: { supervisorId, justification, bypassedAt: new Date().toISOString() },
    };
    _cache = [..._cache.slice(0, idx), updated, ..._cache.slice(idx + 1)];
    persist(_cache);
    await mockAuditService.logEvent({
      type: 'user', event: 'Cytology QC Supervisor Bypass', caseId: current.caseId, user: supervisorId, confidence: null,
      detail: `Assignment ${id} force-approved by supervisor ${supervisorId} to prevent clinical delay. Justification: ${justification}.`,
    }).catch(() => {});
    return ok({ ...updated });
  },
};

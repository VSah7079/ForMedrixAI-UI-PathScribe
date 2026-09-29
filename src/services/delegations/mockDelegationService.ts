// src/services/delegations/mockDelegationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: this build's delegation service. Records live in the browser
// (delegationStore.ts). delegate() updates the demo case the way the
// delegation type requires, through the demo case service's delegateCase /
// assignSynoptic, which also record the delegation.
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';
import type { DelegationError, DelegationRecord, IDelegationService } from './IDelegationService';
import { loadDelegations, saveDelegations } from './delegationStore';
import { planDelegation } from './delegationRules';
import { assignSynoptic, delegateCase } from '../cases/mockCaseService';
import { authorizationService } from '../authorization/defaultAuthorizationService';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const fail = (error: DelegationError) => ({ ok: false as const, error });

export const mockDelegationService: IDelegationService = {
  async list(filter): Promise<ServiceResult<DelegationRecord[]>> {
    await delay(100);
    const all = loadDelegations();
    return { ok: true, data: filter?.caseId ? all.filter(d => d.caseId === filter.caseId) : all };
  },

  async delegate(request) {
    // Batch 381 (Pete: "Add, keep today's users"): delegating a case needs
    // case:delegation:create, seeded to every role that could before.
    const decision = await authorizationService.enforce('case:delegation:create', { caseId: request.caseId });
    if (!decision.allowed) return fail('notPermitted');
    const plan = planDelegation(request);
    if (plan.kind === 'assignSynoptic') {
      const record = await assignSynoptic(
        plan.caseId, plan.instanceId, plan.assignedTo, plan.assignedToName, plan.assignedBy, plan.requiresCountersign, plan.note,
      );
      return record ? { ok: true, data: record } : fail('caseNotFound');
    }
    return { ok: true, data: await delegateCase(plan.payload) };
  },

  async complete(id) {
    await delay(150);
    const records = loadDelegations();
    const idx = records.findIndex(d => d.id === id);
    if (idx < 0) return fail('notFound');
    if (records[idx].status === 'completed') return { ok: true, data: records[idx] };
    records[idx] = { ...records[idx], status: 'completed', completedAt: new Date().toISOString() };
    saveDelegations(records);
    return { ok: true, data: records[idx] };
  },
};

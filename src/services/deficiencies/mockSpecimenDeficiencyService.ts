// src/services/deficiencies/mockSpecimenDeficiencyService.ts

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { SpecimenDeficiency, ISpecimenDeficiencyService } from './IDeficiencyService';

// Deficiencies are events, not configuration — this service itself
// still writes nothing ahead of time. The four below are seeded
// directly into storage's fallback default purely so the Deficiencies
// page (src/pages/QualityAssurancePage.tsx) has real, representative
// examples across all three lifecycle stages to show immediately,
// rather than looking like an empty, unproven shell. All four
// reference real existing seed cases.
const load    = () => storageGet<SpecimenDeficiency[]>('pathscribe_specimen_deficiencies', [
  {
    id: 'def-demo-001', caseId: 'S26-4402-COLON-RES',
    deficiencyTypeId: 'def-missing-requisition',
    comment: 'Specimen arrived at 7:40am; requisition paperwork never accompanied it — called Riverside Medical Center, they\u2019re re-sending.',
    status: 'open', raisedBy: 'PATH-001', raisedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'def-demo-002', caseId: 'S26-4403', specimenId: 'S26-4403-SP-2', specimenLabel: 'B',
    deficiencyTypeId: 'def-label-mismatch',
    comment: 'Container labeled "Station 4L" but requisition specifies Station 4R — confirming with OR before proceeding.',
    status: 'open', raisedBy: 'PATH-001', raisedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'def-demo-003', caseId: 'S26-4401-BX-001', specimenId: 'S26-4401-SP-1', specimenLabel: 'A',
    deficiencyTypeId: 'def-no-dict-match',
    comment: 'Order text: "Left breast core biopsy, outside consult" did not exactly match any active Specimen Dictionary entry.',
    status: 'closed', raisedBy: 'system', raisedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    resolutionTypeId: 'res-matched-existing', resolvedBy: 'PATH-001', resolvedAt: new Date(Date.now() - 5 * 86400000 + 3600000).toISOString(),
  },
  {
    // Demonstrates the pending-verification stage specifically — a
    // corrective action has been taken but not yet checked for
    // effectiveness. Due date deliberately in the past, so this also
    // shows up as overdue wherever that gets surfaced.
    id: 'def-demo-004', caseId: 'S26-4403', specimenId: 'S26-4403-SP-1', specimenLabel: 'A',
    deficiencyTypeId: 'def-container-damaged',
    comment: 'Specimen container arrived with a hairline crack in the lid — fixative had not visibly leaked, but flagged for review.',
    status: 'pending-verification', raisedBy: 'PATH-001', raisedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    resolutionTypeId: 'res-resolved-accessioner',
    correctiveAction: 'Specimen re-containerized in a new, verified-intact container; fixative level and tissue integrity confirmed adequate on transfer.',
    preventiveAction: 'Flagged the container batch lot to Purchasing for a supplier quality check.',
    resolvedBy: 'PATH-001', resolvedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    verificationDueDate: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
]);
const persist = (data: SpecimenDeficiency[]) => storageSet('pathscribe_specimen_deficiencies', data);
let DEFICIENCIES: SpecimenDeficiency[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockSpecimenDeficiencyService: ISpecimenDeficiencyService = {
  async getAll() { await delay(); return ok([...DEFICIENCIES]); },

  async getByCaseId(caseId) {
    await delay();
    return ok(DEFICIENCIES.filter(d => d.caseId === caseId));
  },

  async getBySpecimenId(specimenId) {
    await delay();
    return ok(DEFICIENCIES.filter(d => d.specimenId === specimenId));
  },

  async raise(deficiency) {
    await delay();
    const newD: SpecimenDeficiency = {
      ...deficiency,
      id: 'sdef-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      status: 'open',
      raisedAt: new Date().toISOString(),
    };
    DEFICIENCIES = [...DEFICIENCIES, newD];
    persist(DEFICIENCIES);
    return ok({ ...newD });
  },

  async resolve(id, resolution) {
    await delay();
    const idx = DEFICIENCIES.findIndex(d => d.id === id);
    if (idx === -1) return err(`Deficiency ${id} not found`);
    // Moves to pending-verification, NOT closed — see this method's
    // own doc comment on the interface for why. Actually closing
    // happens in verifyEffectiveness() below.
    const updated: SpecimenDeficiency = {
      ...DEFICIENCIES[idx],
      status: 'pending-verification',
      resolutionTypeId: resolution.resolutionTypeId,
      correctiveAction: resolution.correctiveAction,
      preventiveAction: resolution.preventiveAction,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: new Date().toISOString(),
      verificationDueDate: resolution.verificationDueDate,
    };
    DEFICIENCIES = DEFICIENCIES.map(d => d.id === id ? updated : d);
    persist(DEFICIENCIES);
    return ok({ ...updated });
  },

  async verifyEffectiveness(id, verification) {
    await delay();
    const idx = DEFICIENCIES.findIndex(d => d.id === id);
    if (idx === -1) return err(`Deficiency ${id} not found`);
    const current = DEFICIENCIES[idx];
    const updated: SpecimenDeficiency = verification.outcome === 'effective'
      ? {
          ...current, status: 'closed',
          verifiedBy: verification.verifiedBy, verifiedAt: new Date().toISOString(),
          verificationOutcome: 'effective', verificationComment: verification.comment,
        }
      : {
          // Recurred — back to open, same corrective-action treatment a
          // fresh issue gets, not a distinct fourth status. Previous
          // corrective/preventive action and due date stay on the
          // record as history rather than being cleared, since they're
          // exactly the "what was tried and didn't work" context the
          // next attempt needs.
          ...current, status: 'open',
          verifiedBy: verification.verifiedBy, verifiedAt: new Date().toISOString(),
          verificationOutcome: 'recurred', verificationComment: verification.comment,
          reopenCount: (current.reopenCount ?? 0) + 1,
        };
    DEFICIENCIES = DEFICIENCIES.map(d => d.id === id ? updated : d);
    persist(DEFICIENCIES);
    return ok({ ...updated });
  },

  async raiseAndResolve(deficiency, resolution) {
    await delay();
    const nowIso = new Date().toISOString();
    // Straight to 'closed' — deliberately skips pending-verification.
    // See ISpecimenDeficiencyService.raiseAndResolve's own doc comment
    // for why: nothing meaningful to verify later for these instant-fix
    // flows.
    const newD: SpecimenDeficiency = {
      ...deficiency,
      id: 'sdef-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      status: 'closed',
      raisedAt: nowIso,
      resolutionTypeId: resolution.resolutionTypeId,
      resolutionComment: resolution.resolutionComment,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: nowIso,
    };
    DEFICIENCIES = [...DEFICIENCIES, newD];
    persist(DEFICIENCIES);
    return ok({ ...newD });
  },

  async markReviewed(deficiencyIds, managementReviewId) {
    await delay();
    const idSet = new Set(deficiencyIds);
    DEFICIENCIES = DEFICIENCIES.map(d => idSet.has(d.id) ? { ...d, managementReviewId } : d);
    persist(DEFICIENCIES);
    return ok(undefined);
  },
};

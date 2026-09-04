// src/services/grossingRoutingOverrides/IGrossingRoutingOverrideService.ts
// ─────────────────────────────────────────────────────────────
// Admin-managed dictionary for Grossing Route overrides (S0-CF-12) —
// per-client exceptions to a Department's own default Grossing
// Template. The evaluation function this feeds
// (evaluateGrossingTemplateAssignment, in mockCaseService.ts) already
// had a real, working input contract for this
// (GrossingRoutingOverride in services/grossing/IGrossingEvaluationService.ts,
// shape: {clientId, specimenType, grossingTemplateId}) — AccessionPage.tsx
// was just always passing an empty array, since there was never an
// admin screen to actually create one. This is that screen's real data
// layer, not a new design.
//
// This service's own record type is deliberately richer than the
// lightweight evaluation-input shape (carries an id, active flag, and
// timestamps, matching every other admin dictionary in this app) —
// AccessionPage.tsx maps the active ones down to the simpler shape the
// evaluation function already expects, rather than that function's
// contract changing to match this one.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface GrossingRoutingOverrideEntry {
  id: ID;
  clientId: string;
  /**
   * Free text, matched by exact string equality against
   * GrossingEvaluationSpecimen.specimenType (sp._entry?.type from the
   * Specimen Dictionary — e.g. "Kidney") in the real Pass G0 matching
   * logic in mockCaseService.ts. Deliberately NOT a Department
   * (a coarser, 4-value dictionary) — checked the actual matching
   * code directly rather than assume; a category-keyed override would
   * have silently never matched anything, since the real comparison
   * is against this specific, finer-grained field.
   */
  specimenType: string;
  /** One of the three Gold Standard routes — same id space as
   *  Department.defaultGrossingTemplateId and
   *  GROSSING_TEMPLATES in DepartmentsSection.tsx. */
  grossingTemplateId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GrossingRoutingOverrideInput = Omit<GrossingRoutingOverrideEntry, 'id' | 'createdAt' | 'updatedAt'>;

export interface IGrossingRoutingOverrideService {
  getAll(): Promise<ServiceResult<GrossingRoutingOverrideEntry[]>>;
  add(entry: GrossingRoutingOverrideInput): Promise<ServiceResult<GrossingRoutingOverrideEntry>>;
  update(id: ID, changes: Partial<GrossingRoutingOverrideInput>): Promise<ServiceResult<GrossingRoutingOverrideEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}

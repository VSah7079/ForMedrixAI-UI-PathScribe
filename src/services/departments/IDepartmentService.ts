// src/services/departments/IDepartmentService.ts
// ─────────────────────────────────────────────────────────────
// Department Dictionary — the coarse-grained classification that
// controls specimen workflow at Accession. Deliberately separate from the
// Specimen Dictionary (useSpecimenDictionary's SpecimenEntry) — that's the
// fine-grained "Breast core needle biopsy" level; a Department is
// the level above it ("Surgical Tissue") that determines HOW a specimen
// is processed, not WHAT it specifically is.
//
// A SpecimenEntry (Specimen Dictionary) should reference a
// departmentId — added to specimenTypes.ts separately. This lets
// an incoming order resolve to a known department (and therefore a known
// workflow) even before the specific dictionary entry is resolved, which
// is what keeps accessioning unblocked per the auto-create-pending model.
//
// Follows IPhysicianService's exact governance shape — status/autoCreated/
// findOrCreate/verify — rather than inventing a new pattern. Same reason
// physicians already work this way: an unrecognized incoming code
// shouldn't block the workflow, it should create a pending record and
// notify an admin to reconcile it later.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { RetentionOverrideDays } from '../retentionPolicy/RetentionPolicy';

export interface Department {
  id: ID;

  /** Display name — e.g. "Surgical Tissue", "Fluid / Cytology", "Histology-Only / Consultation" */
  name: string;
  description?: string;

  /**
   * The Grossing Template a specimen in this department gets by default at
   * accession, before any AI evaluation runs. evaluateGrossingTemplateAssignment
   * still does its own per-specimen reasoning — this is the department-level
   * default it falls back to, and what a Pass G0 client override ultimately
   * targets instead of a raw template id.
   */
  defaultGrossingTemplateId: string;

  status: 'Active' | 'Inactive' | 'Unverified';
  /** True if this department was auto-created by order-intake resolution
   *  rather than configured by an admin. */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /** Free-text note left by whatever created a pending department — e.g. the
   *  raw order code/description that didn't match anything, so the admin
   *  reviewing it has context without digging through the source order. */
  autoCreatedNote?: string;

  /**
   * Real, optional per-department retention-days override — any
   * material type omitted here falls back to the live GoverningBody
   * default for the current jurisdiction (resolveRetentionEligibility.ts's
   * own resolveDepartmentOverride() walks Specimen ->
   * SpecimenEntry.departmentId -> this field, feeding real
   * disposal-queue and scan-based disposal eligibility calculations).
   * See services/retentionPolicy/RetentionPolicy.ts's own doc comment
   * on RetentionOverrideDays for the full, canonical account — this
   * field was always the real, intended attachment point that comment
   * names, just missing here until now.
   */
  retentionOverrideDays?: RetentionOverrideDays;
}

export interface IDepartmentService {
  getAll(): Promise<ServiceResult<Department[]>>;
  getById(id: ID): Promise<ServiceResult<Department>>;
  add(department: Omit<Department, 'id'>): Promise<ServiceResult<Department>>;
  update(id: ID, changes: Partial<Omit<Department, 'id'>>): Promise<ServiceResult<Department>>;
  verify(id: ID): Promise<ServiceResult<Department>>;
  deactivate(id: ID): Promise<ServiceResult<Department>>;

  /**
   * Called by order-intake / crosswalk resolution. No exact crosswalk
   * match → creates an Unverified, autoCreated department so processing can
   * continue immediately, defaulting to the standard-tissue Grossing
   * Template until an admin reconciles it. Mirrors
   * IPhysicianService.findOrCreateByNpi exactly.
   */
  findOrCreateByName(name: string, note?: string): Promise<ServiceResult<Department>>;
}

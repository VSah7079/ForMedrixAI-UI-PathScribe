// src/services/specimenCategories/ISpecimenCategoryService.ts
// ─────────────────────────────────────────────────────────────
// Specimen Category Dictionary — the coarse-grained classification that
// controls specimen workflow at Accession. Deliberately separate from the
// Specimen Dictionary (useSpecimenDictionary's SpecimenEntry) — that's the
// fine-grained "Breast core needle biopsy" level; a SpecimenCategory is
// the level above it ("Surgical Tissue") that determines HOW a specimen
// is processed, not WHAT it specifically is.
//
// A SpecimenEntry (Specimen Dictionary) should reference a
// specimenCategoryId — added to specimenTypes.ts separately. This lets
// an incoming order resolve to a known category (and therefore a known
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

export interface SpecimenCategory {
  id: ID;

  /** Display name — e.g. "Surgical Tissue", "Fluid / Cytology", "Histology-Only / Consultation" */
  name: string;
  description?: string;

  /**
   * The Grossing Template a specimen in this category gets by default at
   * accession, before any AI evaluation runs. evaluateGrossingTemplateAssignment
   * still does its own per-specimen reasoning — this is the category-level
   * default it falls back to, and what a Pass G0 client override ultimately
   * targets instead of a raw template id.
   */
  defaultGrossingTemplateId: string;

  /**
   * Accession numbering. `accessionPrefix` is the letter(s) that start the
   * case id (mirrors the existing Case.accession.accessionPrefix field —
   * today every Orchestration case hardcodes 'O'). `numberSeries` is an
   * optional name for a category's own independent counter; omit to share
   * the institution-wide series for that prefix. Both optional and
   * non-breaking — existing O26- numbering keeps working unchanged unless
   * a category explicitly opts into its own series.
   */
  accessionPrefix?: string;
  numberSeries?: string;

  status: 'Active' | 'Inactive' | 'Unverified';
  /** True if this category was auto-created by order-intake resolution
   *  rather than configured by an admin. */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /** Free-text note left by whatever created a pending category — e.g. the
   *  raw order code/description that didn't match anything, so the admin
   *  reviewing it has context without digging through the source order. */
  autoCreatedNote?: string;
}

export interface ISpecimenCategoryService {
  getAll(): Promise<ServiceResult<SpecimenCategory[]>>;
  getById(id: ID): Promise<ServiceResult<SpecimenCategory>>;
  add(category: Omit<SpecimenCategory, 'id'>): Promise<ServiceResult<SpecimenCategory>>;
  update(id: ID, changes: Partial<Omit<SpecimenCategory, 'id'>>): Promise<ServiceResult<SpecimenCategory>>;
  verify(id: ID): Promise<ServiceResult<SpecimenCategory>>;
  deactivate(id: ID): Promise<ServiceResult<SpecimenCategory>>;

  /**
   * Called by order-intake / crosswalk resolution. No exact crosswalk
   * match → creates an Unverified, autoCreated category so processing can
   * continue immediately, defaulting to the standard-tissue Grossing
   * Template until an admin reconciles it. Mirrors
   * IPhysicianService.findOrCreateByNpi exactly.
   */
  findOrCreateByName(name: string, note?: string): Promise<ServiceResult<SpecimenCategory>>;
}

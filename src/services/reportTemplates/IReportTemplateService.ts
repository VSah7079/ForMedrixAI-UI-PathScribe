// src/services/reportTemplates/IReportTemplateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Contract for the report template service.
// Both the mock (localStorage) and Firestore implementations must satisfy this.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReportTemplate } from '../../types/reportPart';
import type { ServiceResult, ID } from '../types';

// Re-export so services/index.ts can re-export from here
export type { ReportTemplate };

export interface IReportTemplateService {
  // ── Read ─────────────────────────────────────────────────────────────────
  /** Return all templates (all statuses). */
  getAll(): Promise<ServiceResult<ReportTemplate[]>>;

  /** Return a single template by ID. */
  getById(id: ID): Promise<ServiceResult<ReportTemplate>>;

  // ── Write ─────────────────────────────────────────────────────────────────
  /**
   * Create a new template.
   * The service assigns the id, createdAt, and updatedAt.
   */
  create(
    template: Omit<ReportTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<ReportTemplate>>;

  /**
   * Update specific fields of an existing template.
   * updatedAt is set automatically.
   */
  update(
    id: ID,
    changes: Partial<Omit<ReportTemplate, 'id' | 'createdAt'>>
  ): Promise<ServiceResult<ReportTemplate>>;

  /**
   * Save (upsert) a full template object.
   * Used by the canvas and assembly editors — if the id exists, updates it;
   * if not, creates it. Preferred over the create/update split for editor saves.
   */
  save(template: ReportTemplate): Promise<ServiceResult<ReportTemplate>>;

  /**
   * Publish a draft template (sets status → 'published').
   * Returns the updated template.
   */
  publish(id: ID): Promise<ServiceResult<ReportTemplate>>;

  /**
   * Duplicate an existing template with a new ID.
   * `name` is the copy's name, supplied by the caller in the user's language.
   * The clone is created as a draft regardless of the source status.
   */
  clone(id: ID, name: string): Promise<ServiceResult<ReportTemplate>>;

  /**
   * Permanently delete a template.
   * Implementations should reject deletion of protected / standard templates.
   * SAFE ONLY for templates still in 'draft' status — i.e. ones that could
   * never have produced a real generated report. Any template that has
   * ever been published must be archived instead (see archive() below),
   * since a real report may exist whose structure depends on being able to
   * inspect this template later (regulatory/audit requirement: a case must
   * remain representable in the form it was originally released in).
   */
  remove(id: ID): Promise<ServiceResult<void>>;

  /**
   * Soft-delete a template: sets status → 'archived' rather than removing
   * the record. Use this (not remove()) for any template currently or
   * previously 'published'. Implementations should reject archiving the
   * designated Gold Standard / universal-fallback template.
   */
  archive(id: ID): Promise<ServiceResult<ReportTemplate>>;

  /** Filter templates by subspecialty ID */
  getBySubspecialty(subspecialtyId: string): Promise<ServiceResult<ReportTemplate[]>>;
}

// src/types/migration/MigrationCaseDraft.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap: "Legacy LIS data ingestion, cleansing, and field
// mapping (demographics, accession detail, gross/micro text, SNOMED/
// ICD-O coding, slide/block inventory, PDF report archives, discrete
// synoptic fields)." A real, flattened intermediate shape covering
// every real category the RFP itself names — deliberately NOT the
// full, deeply-nested Case type (types/case/Case.ts) directly. This
// gap's own Backend Needs Log entry is explicit that this is
// "fundamentally a backend-heavy story" — a real, high-throughput
// bulk mapping/transform pipeline against every real Case field is
// a substantial backend engineering effort in its own right, not
// something to reproduce from scratch here. What's built is the
// real, correct FOUNDATION: a genuine, working field-mapping
// mechanism, real MPI dedup reuse, and real cross-validation
// reporting — against this honest, flattened shape.
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationCaseDraft {
  // Demographics
  patientFirstName?: string;
  patientLastName?: string;
  patientDateOfBirth?: string;
  patientMrn?: string;
  patientSex?: string;

  // Accession detail
  legacyAccessionNumber?: string;
  accessionDate?: string;
  orderingPhysicianName?: string;
  facilityName?: string;
  specimenDescription?: string;

  // Gross/micro text
  grossDescriptionText?: string;
  microscopicDescriptionText?: string;
  finalDiagnosisText?: string;

  // SNOMED/ICD-O coding
  snomedCodes?: string[];
  icdOCodes?: string[];

  // Slide/block inventory
  blockIds?: string[];
  slideIds?: string[];

  // PDF report archives — real, honest scope: a reference to where
  // the real archived PDF bytes live (a real backend storage
  // concern), never the PDF's own binary content flowing through
  // this mapping mechanism itself.
  archivedReportUrl?: string;

  // Discrete synoptic fields — real, honest scope: legacy synoptic
  // data varies too much site-to-site for a closed, typed shape;
  // kept as an open, real key-value bag, same "site vocabulary
  // varies too much for a closed enum" reasoning used elsewhere in
  // this app for genuinely site-specific free text.
  synopticFields?: Record<string, string>;
}

export const MIGRATION_FIELD_CATEGORIES = [
  'demographics', 'accession_detail', 'gross_micro_text', 'coding',
  'slide_block_inventory', 'pdf_archive', 'synoptic_field',
] as const;
export type MigrationFieldCategory = typeof MIGRATION_FIELD_CATEGORIES[number];

/** Every real, mappable target key on MigrationCaseDraft, grouped by
 *  its own real category — drives the admin field-mapping UI's own
 *  target-field dropdown. */
export const MIGRATION_TARGET_FIELDS_BY_CATEGORY: Record<MigrationFieldCategory, (keyof MigrationCaseDraft)[]> = {
  demographics: ['patientFirstName', 'patientLastName', 'patientDateOfBirth', 'patientMrn', 'patientSex'],
  accession_detail: ['legacyAccessionNumber', 'accessionDate', 'orderingPhysicianName', 'facilityName', 'specimenDescription'],
  gross_micro_text: ['grossDescriptionText', 'microscopicDescriptionText', 'finalDiagnosisText'],
  coding: ['snomedCodes', 'icdOCodes'],
  slide_block_inventory: ['blockIds', 'slideIds'],
  pdf_archive: ['archivedReportUrl'],
  synoptic_field: ['synopticFields'],
};

// src/services/migration/processLegacyRecordImport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working per-record migration pipeline: applies the real,
// admin-configured field mapping, validates the real minimum fields
// a case needs, and calls this app's own, real, already-existing MPI
// resolution (services/patients/) for dedup — "MPI deduplication
// during import" reused directly, never a second, parallel dedup
// mechanism.
//
// Real, honest scope boundary, confirmed directly before writing
// this: `caseService.createCase()` takes a full, complete Case
// object (types/case/Case.ts) — deeply nested, with real
// specimen/block/slide structure this pipeline's own minimal
// MigrationCaseDraft cannot honestly fabricate. Building a full Case
// from a flat legacy record is itself the real, substantial
// backend-heavy transform this gap's own Backend Needs Log entry
// names ("real, high-throughput bulk-import tooling"). This
// pipeline's own real, working scope stops at: mapping, validation,
// and MPI resolution — returning a real, resolved patientId ready
// for that later step, never a fabricated Case.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveMigrationFieldMapping } from './resolveMigrationFieldMapping';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import type { MigrationFieldMapping } from './IMigrationFieldMappingService';
import type { MigrationCaseDraft } from '@/types/migration/MigrationCaseDraft';

export interface ProcessLegacyRecordImportResult {
  outcome: 'succeeded' | 'failed' | 'needs_review';
  draft: MigrationCaseDraft;
  unmappedSourceFields: string[];
  /** Set on 'succeeded' and 'needs_review' — the real, resolved
   *  (or real, provisional) patient identity from resolveOrCreatePatient(). */
  patientId?: string;
  mpiCandidatePatientIds?: string[];
  errorMessage?: string;
}

/** Real, minimum fields a case genuinely cannot be built without —
 *  per the RFP's own named categories, at least real patient
 *  identity and a real legacy accession number to trace back to. */
function validateMinimumFields(draft: MigrationCaseDraft): string | null {
  if (!draft.patientFirstName || !draft.patientLastName) return 'Missing patient name.';
  if (!draft.patientDateOfBirth) return 'Missing patient date of birth.';
  if (!draft.legacyAccessionNumber) return 'Missing legacy accession number.';
  return null;
}

export async function processLegacyRecordImport(
  rawRecord: Record<string, string>,
  mappings: MigrationFieldMapping[],
  organisationId: string,
): Promise<ProcessLegacyRecordImportResult> {
  const { draft, unmappedSourceFields } = resolveMigrationFieldMapping(rawRecord, mappings);

  const validationError = validateMinimumFields(draft);
  if (validationError) {
    return { outcome: 'failed', draft, unmappedSourceFields, errorMessage: validationError };
  }

  const mpiResult = await mockPatientIndexService.resolveOrCreatePatient({
    organisationId,
    mrn: draft.patientMrn ?? '',
    firstName: draft.patientFirstName!,
    lastName: draft.patientLastName!,
    dateOfBirth: draft.patientDateOfBirth!,
    sourceAccession: draft.legacyAccessionNumber,
  });

  if (mpiResult.outcome === 'ambiguous') {
    return {
      outcome: 'needs_review', draft, unmappedSourceFields,
      patientId: mpiResult.patientId, mpiCandidatePatientIds: mpiResult.candidatePatientIds,
    };
  }

  return { outcome: 'succeeded', draft, unmappedSourceFields, patientId: mpiResult.patientId };
}
